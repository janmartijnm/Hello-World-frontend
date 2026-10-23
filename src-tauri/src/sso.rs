//! Single sign-on (e.g. Keycloak) for NetBox instances.
//!
//! NetBox's single sign-on happens in its web pages, so the app opens NetBox's login page in a separate, private
//! window (through the instance's SOCKS5 proxy, if it has one). When the user has signed in and NetBox shows their
//! profile page, the app takes NetBox's session cookie from that window and closes it.
//!
//! The session is then only used through `session_get` below, which can only read (GET): with a session, unlike
//! with the read-only API tokens of a password login, NetBox itself would allow changes, so the app makes that
//! impossible here. The web pages of the app cannot send the cookie anywhere else (browsers, and Tauri's HTTP
//! plugin, refuse to set a Cookie header).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tokio::sync::oneshot;
use url::Url;

/// The page NetBox shows after login; reaching it means the sign-in is complete.
const DONE_PATH: &str = "/user/profile/";

/// A page in the sign-in window that hasn't loaded after this long has failed (macOS shows nothing then).
const LOAD_TIMEOUT: Duration = Duration::from_secs(25);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SsoSession {
    /// The Cookie header for NetBox (session and CSRF cookies)
    cookie: String,
    /// The NetBox username, from the profile page (None if it could not be read)
    username: Option<String>,
}

#[derive(Serialize)]
pub struct HttpAnswer {
    status: u16,
    body: String,
}

fn parse_server(server: &str) -> Result<Url, String> {
    let url = Url::parse(server).map_err(|e| format!("Invalid server address: {e}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        _ => Err("The server address must start with http:// or https://".into()),
    }
}

/// "127.0.0.1:1080" -> socks5://127.0.0.1:1080 for the sign-in window (WebKit resolves names through the proxy).
fn window_proxy(proxy: &Option<String>) -> Result<Option<Url>, String> {
    match proxy.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        None => Ok(None),
        Some(p) => Url::parse(&format!("socks5://{p}")).map(Some).map_err(|e| format!("Invalid proxy address: {e}")),
    }
}

/// Opens NetBox's login page in a private window and waits until the user has signed in.
#[tauri::command]
pub async fn sso_login(
    app: AppHandle,
    server: String,
    proxy: Option<String>,
    allow_self_signed: bool,
) -> Result<SsoSession, String> {
    let base = parse_server(&server)?;
    let mut start = base.join("/login/").map_err(|e| e.to_string())?;
    start.set_query(Some(&format!("next={DONE_PATH}")));
    // The window can't tell why a page doesn't load (macOS then just shows an empty window): check first
    precheck(&start, &proxy).await?;

    let (tx, rx) = oneshot::channel::<Result<SsoSession, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let label = format!("sso-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(start.clone()))
        .title(format!("Sign in to {}", base.host_str().unwrap_or("NetBox")))
        .inner_size(560.0, 760.0)
        // A fresh, private cookie store: nothing is kept after the window closes
        .incognito(true);
    if let Some(p) = window_proxy(&proxy)? {
        builder = builder.proxy_url(p);
    }

    let done_tx = tx.clone();
    let done_base = base.clone();
    // Whether the first page has loaded (for the "doesn't load" message)
    let loaded = Arc::new(AtomicBool::new(false));
    let page_loaded = loaded.clone();
    builder = builder.on_page_load(move |window, payload| {
        if payload.event() != tauri::webview::PageLoadEvent::Finished {
            return;
        }
        page_loaded.store(true, Ordering::Relaxed);
        let url = payload.url();
        if url.origin() != done_base.origin() || !url.path().starts_with(DONE_PATH) {
            return;
        }
        // Signed in: read NetBox's cookies (on a separate task, as the docs advise) and close the window
        let tx = done_tx.clone();
        let base = done_base.clone();
        tauri::async_runtime::spawn(async move {
            let result = window
                .cookies_for_url(base)
                .map_err(|e| format!("Could not read the session: {e}"))
                .and_then(|cookies| {
                    let header = cookies
                        .iter()
                        .map(|c| format!("{}={}", c.name(), c.value()))
                        .collect::<Vec<_>>()
                        .join("; ");
                    if cookies.iter().any(|c| c.name() == "sessionid") {
                        Ok(SsoSession { cookie: header, username: None })
                    } else {
                        Err("Signed in, but NetBox gave no session cookie.".into())
                    }
                });
            if let Some(tx) = tx.lock().unwrap().take() {
                let _ = tx.send(result);
            }
            let _ = window.close();
        });
    });

    let window = builder.build().map_err(|e| format!("Could not open the sign-in window: {e}"))?;
    // macOS shows an empty window when a page can't be loaded: explain it instead
    let waiting = window.clone();
    let via = proxy.as_deref().map(str::trim).filter(|p| !p.is_empty()).map(str::to_owned);
    let first = start.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(LOAD_TIMEOUT).await;
        if !loaded.load(Ordering::Relaxed) {
            if let Ok(page) = not_loading_page(&first, &via) {
                let _ = waiting.navigate(page);
            }
        }
    });
    let closed_tx = tx.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            if let Some(tx) = closed_tx.lock().unwrap().take() {
                let _ = tx.send(Err("Sign-in cancelled.".into()));
            }
        }
    });

    let result = rx.await.unwrap_or_else(|_| Err("Sign-in cancelled.".into()));
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }
    let mut session = result?;
    session.username = profile_username(&base, &session.cookie, &proxy, allow_self_signed).await;
    Ok(session)
}

/// Checks, before the sign-in window opens, that NetBox's login page and the single sign-on server (e.g. Keycloak)
/// can be reached the way the window will reach them: through the proxy, and with certificates trusted by the
/// operating system. Only connection and certificate problems are reported; anything else is left to the window.
async fn precheck(login: &Url, proxy: &Option<String>) -> Result<(), String> {
    let via = match proxy.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(p) => format!(" through the proxy {p}"),
        None => String::new(),
    };
    let client = client(proxy, false, false)?;
    let host = login.host_str().unwrap_or("NetBox").to_owned();
    let page = client.get(login.clone()).send().await.map_err(|e| unreachable("NetBox", &host, &via, &e))?;
    let cookie = cookies(&page);
    let Ok(html) = page.text().await else { return Ok(()) };

    // The single sign-on buttons: <form action="/oauth/begin/keycloak/" method="post"> with a CSRF token
    let Some(token) = between(&html, "name=\"csrfmiddlewaretoken\" value=\"", "\"") else { return Ok(()) };
    let mut rest = html.as_str();
    while let Some(at) = rest.find("action=\"/oauth/begin/") {
        rest = &rest[at + 8..];
        let Some(action) = between(rest, "", "\"") else { break };
        let Ok(begin) = login.join(action) else { continue };
        // Starting the sign-on gives the address of the sign-on server (not followed: that is the next check)
        let Ok(answer) = client
            .post(begin)
            .header(reqwest::header::COOKIE, &cookie)
            .header(reqwest::header::REFERER, login.as_str())
            .form(&[("csrfmiddlewaretoken", token), ("next", DONE_PATH)])
            .send()
            .await
        else {
            continue;
        };
        let Some(Ok(target)) = answer.headers().get(reqwest::header::LOCATION).map(|l| l.to_str().map(|l| login.join(l)))
        else {
            continue;
        };
        let Ok(target) = target else { continue };
        if target.origin() == login.origin() {
            continue;
        }
        let sso_host = target.host_str().unwrap_or("").to_owned();
        client
            .get(target)
            .send()
            .await
            .map_err(|e| unreachable("The single sign-on server", &sso_host, &via, &e))?;
    }
    Ok(())
}

/// "NetBox (netbox.example.com) can't be reached through the proxy …: <cause>", with a hint for certificates
fn unreachable(what: &str, host: &str, via: &str, err: &reqwest::Error) -> String {
    // The innermost cause ("certificate verify failed", "Connection refused", …), without the URL
    let mut cause = if err.is_timeout() { "no answer".to_owned() } else { err.to_string() };
    let mut source = std::error::Error::source(err);
    while let Some(s) = source {
        if !err.is_timeout() {
            cause = s.to_string();
        }
        source = s.source();
    }
    let lower = cause.to_lowercase();
    if lower.contains("certificate") || lower.contains("trust") || cause.contains("-9813") || cause.contains("-67843") {
        return format!(
            "The certificate of {host} is not trusted by macOS. The sign-in window can't skip that check (the \
             \"self-signed\" option only applies to the app's data requests): trust the certificate, or its CA, in \
             Keychain Access."
        );
    }
    let hint = if !via.is_empty() && lower.contains("socks") {
        " Check the proxy address, and that it is a SOCKS5 proxy (not an HTTP proxy)."
    } else {
        ""
    };
    format!("{what} ({host}) can't be reached{via}: {cause}.{hint}")
}

/// The cookies a response sets, as a Cookie header
fn cookies(response: &reqwest::Response) -> String {
    response
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok()?.split(';').next().map(str::to_owned))
        .collect::<Vec<_>>()
        .join("; ")
}

/// The text between `start` and the next `end`
fn between<'a>(text: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let from = text.find(start)? + start.len();
    let to = text[from..].find(end)? + from;
    Some(&text[from..to])
}

/// A page that explains an empty sign-in window (macOS shows nothing when a page can't be loaded), as a data: URL.
fn not_loading_page(url: &Url, via: &Option<String>) -> Result<Url, url::ParseError> {
    let escape = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let host = escape(url.host_str().unwrap_or(""));
    let via = via.as_deref().map(|p| format!(" through the proxy {}", escape(p))).unwrap_or_default();
    let html = format!(
        "<!doctype html><meta charset=utf-8><title>Sign-in page doesn't load</title>\
         <body style=\"font: 14px -apple-system, sans-serif; padding: 24px; line-height: 1.5\">\
         <h3>The sign-in page doesn't load</h3>\
         <p>{host} doesn't answer{via}, or its certificate is not trusted by macOS.</p>\
         <ul><li>A self-signed certificate must be trusted in Keychain Access for this window.</li>\
         <li>A host name that only exists behind a proxy needs the proxy set for this NetBox.</li></ul>\
         <p>Close this window to go back to the app.</p>"
    );
    let encoded: String = html
        .bytes()
        .map(|b| if b.is_ascii_alphanumeric() { (b as char).to_string() } else { format!("%{b:02X}") })
        .collect();
    Url::parse(&format!("data:text/html;charset=utf-8,{encoded}"))
}

/// The username on NetBox's profile page ("Username" row), to show who is signed in.
async fn profile_username(base: &Url, cookie: &str, proxy: &Option<String>, allow_self_signed: bool) -> Option<String> {
    let url = base.join(DONE_PATH).ok()?;
    let html = client(proxy, allow_self_signed, true)
        .ok()?
        .get(url)
        .header(reqwest::header::COOKIE, cookie)
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;
    let after = &html[html.find(">Username</th>")?..];
    let start = after.find("<td>")? + 4;
    let end = after[start..].find("</td>")? + start;
    let name = after[start..end]
        .trim()
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'");
    (!name.is_empty() && name.len() < 200).then_some(name)
}

fn client(proxy: &Option<String>, allow_self_signed: bool, follow_redirects: bool) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(if follow_redirects { 120 } else { 30 }))
        .danger_accept_invalid_certs(allow_self_signed);
    if !follow_redirects {
        builder = builder.redirect(reqwest::redirect::Policy::none());
    }
    if let Some(p) = proxy.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        // socks5h: host names are resolved by the proxy (they often exist only behind it)
        let proxy = reqwest::Proxy::all(format!("socks5h://{p}")).map_err(|e| format!("Invalid proxy address: {e}"))?;
        builder = builder.proxy(proxy);
    }
    builder.build().map_err(|e| e.to_string())
}

/// A read-only (GET) request to NetBox's API with a single sign-on session.
#[tauri::command]
pub async fn session_get(
    server: String,
    path: String,
    cookie: String,
    proxy: Option<String>,
    allow_self_signed: bool,
) -> Result<HttpAnswer, String> {
    let base = parse_server(&server)?;
    if !path.starts_with("api/") {
        return Err("Only NetBox API requests are allowed.".into());
    }
    let url = base.join(&format!("/{path}")).map_err(|e| e.to_string())?;
    if url.origin() != base.origin() {
        return Err("Request outside the NetBox server.".into());
    }
    let response = client(&proxy, allow_self_signed, true)?
        .get(url)
        .header(reqwest::header::COOKIE, cookie)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|e| format!("{e}"))?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(HttpAnswer { status, body })
}

/// Ends the single sign-on session in NetBox (sign out). Errors are ignored: the app forgets the session anyway.
#[tauri::command]
pub async fn session_logout(server: String, cookie: String, proxy: Option<String>, allow_self_signed: bool) {
    if let (Ok(base), Ok(client)) = (parse_server(&server), client(&proxy, allow_self_signed, true)) {
        if let Ok(url) = base.join("/logout/") {
            let _ = client.get(url).header(reqwest::header::COOKIE, cookie).send().await;
        }
    }
}
