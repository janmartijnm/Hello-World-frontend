mod sso;

/// NetBox Explorer. The app is the web frontend in ../src; the plugins and commands give it what a web page can't do:
/// - http: requests to any NetBox server, without CORS, optionally through a SOCKS5 proxy
///   (allowed hosts: capabilities/default.json)
/// - sso: single sign-on in a NetBox login window, and read-only requests with that session (src/sso.rs)
/// - opener: "Open in NetBox" links in the default browser
/// - dialog + fs: saving CSV exports with the "Save as" dialog
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![sso::sso_login, sso::session_get, sso::session_logout])
        .run(tauri::generate_context!())
        .expect("error while running NetBox Explorer");
}
