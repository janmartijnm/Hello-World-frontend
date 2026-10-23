# NetBox Explorer (desktop)

A desktop app for **macOS** with a modern, read-only interface to **any NetBox
server** (NetBox 4.5 or newer). It uses only NetBox's REST API: nothing has to
be installed or configured on the NetBox side.

It is the desktop version of the NetBox Explorer that runs in a container next
to NetBox in [hello-world](https://github.com/janmartijnm/hello-world)
(`netbox/frontend/`): the same screens, plus a choice of server at login.

## What it does

- **Log in to any NetBox**: type the server address (`netbox.example.com` or
  `https://netbox.example.com:8443`) with your NetBox username and password.
  Recently used servers are listed for one click.
- **Per instance: how to sign in, and how to reach it.** On the login screen
  each NetBox instance gets its own settings, remembered under *Saved NetBox
  instances*:
  - **Password**: NetBox username and password (read-only API token, see
    Security).
  - **Single sign-on** (e.g. Keycloak): NetBox's own login page opens in a
    separate window; sign in there as usual (click your SSO button, e.g.
    *Keycloak*). The window closes by itself when you are signed in.
  - **SOCKS5 proxy** (optional, `host:port`): for a NetBox that is only
    reachable through a proxy. *Everything* for that instance then goes
    through the proxy: the sign-in window (NetBox and Keycloak pages) and all
    data. Host names are resolved by the proxy, so names that only exist
    behind it work.
- **Several NetBox instances at once**: the box at the top of the sidebar shows
  the NetBox you are looking at (with a colour per server). Click it to switch
  to another one you are logged in to (no password needed), to sign out of one,
  or to **Add NetBox…**. Each server keeps its own login and its own data;
  switching keeps you in the same section (e.g. Sites). When a login expires,
  the app asks to log in to that server again or to continue with another.
- **Search everything** (Ctrl+K / ⌘K or `/`): sites, devices, interfaces,
  assets, IP addresses, services, prefixes and circuits.
- **Sites** with filters, table or map; **Devices** with interfaces, IPs,
  connections and services; **Interfaces** of all devices (with IPs,
  connections, VLAN, VRF and service); **Services** (Service Management plugin);
  **Inventory** (netbox-inventory plugin assets).
- **Export CSV** of any filtered list, saved with the Mac "Save as" dialog
  (`;`-separated so Excel with Dutch settings opens it in columns).
- **Open in NetBox** opens the object in your normal browser, for changes.
- Light and dark theme.

Sections for plugins that a server doesn't have, or that you may not see, are
hidden.

## Install (macOS 14 Sonoma or newer, Apple Silicon or Intel)

1. Download the `.dmg`:
   - a released version: the repository's **Releases** page, or
   - the latest build: **Actions** → *Build macOS app* → the newest run →
     artifact **NetBox-Explorer-macOS** (a zip with the `.dmg`).
2. Open the `.dmg` and drag **NetBox Explorer** to **Applications**.
3. First start of an unsigned build: macOS says it can't check the app.
   Open it once via **System Settings → Privacy & Security → Open Anyway**
   (or right-click the app → **Open**). After that it opens normally.
   Builds signed and notarized with an Apple Developer ID (see below) open
   without this step.

## Security

- **Read-only**:
  - *Password login*: the app asks NetBox for a personal API token that can
    only read (`write_enabled: false`) and expires after 8 hours. NetBox
    itself refuses any change made with it.
  - *Single sign-on*: there is no password to get such a token with, so the
    app uses the NetBox session from the sign-in window. NetBox would allow
    changes with a session, so the app makes them impossible itself: the
    session cookie is only used by the app's native code
    (`src-tauri/src/sso.rs`), which can only send GET requests to that
    NetBox's API; the app's pages can't send the cookie anywhere (browsers and
    Tauri's HTTP client refuse a Cookie header). The app forgets the session
    after 8 hours, and **Sign out** also ends it in NetBox.

  Nothing can be changed through the app, also not by administrators.
- **Your NetBox permissions apply**: you see exactly what your NetBox account
  may see.
- The password is only sent to NetBox to get the token and is not stored. The
  tokens (one per server you are logged in to) and the list of recent servers
  are kept in the app's own storage on your Mac. **Sign out** forgets the
  token; NetBox keeps it until it expires (a
  read-only token can't delete itself). It is listed in NetBox as "NetBox
  Explorer login" under the user's API tokens, where an administrator can
  remove it.
- **Certificates**: HTTPS certificates are checked against the macOS
  Keychain, so certificates of your own CA that are trusted there work.
  *Allow a self-signed certificate* (on the login screen, remembered per
  server) skips that check for one server: use it only for a server you trust,
  on a network you trust. Plain `http://` also works, but then the password and
  token travel unencrypted.
- **Single sign-on window**: a private window (nothing is kept after it
  closes). It shows the real NetBox and Keycloak pages, so it can't check
  certificates more loosely: a self-signed certificate must be trusted in the
  macOS Keychain for single sign-on (the *Allow a self-signed certificate*
  option only applies to the app's data requests).
- **Limitations**: one login per NetBox address at a time (signing in again,
  with another method, replaces it). *Open in NetBox* opens your normal
  browser, which does not use the instance's proxy: for a NetBox behind a
  proxy, set the proxy in that browser (or a browser profile) as well.
- The app only asks macOS for what it needs: network requests, opening links
  in the browser, and writing the CSV file you choose
  (`src-tauri/capabilities/default.json`).

## How it is built

- `src/`: the screens (React + TypeScript, built with Vite).
- `src-tauri/`: the app shell ([Tauri 2](https://tauri.app), Rust). It shows
  the screens in macOS's own WebKit, and its HTTP client makes the requests to
  NetBox (through the instance's SOCKS5 proxy, if set), so NetBox needs no CORS
  settings. `src-tauri/src/sso.rs` has the single sign-on window and the
  read-only session requests. macOS 14 is needed for proxies in the sign-in
  window.
- `.github/workflows/build.yml`: builds a universal `.dmg` on GitHub's Mac
  runners for every push to `main`; a tag like `v0.2.0` also publishes a
  release.

### Build on a Mac yourself

Needs Xcode Command Line Tools (`xcode-select --install`), Node.js 22 and Rust
(`curl https://sh.rustup.rs -sSf | sh`).

```sh
npm ci
npm run tauri dev            # run with live reload
npm run tauri build          # .app and .dmg in src-tauri/target/release/bundle/
```

### Try the screens in a browser

`NETBOX_UPSTREAM=http://<netbox>:8000 npm run dev`, then open
<http://localhost:1420>. The dev server forwards `/api` to that NetBox; the
server field on the login screen is ignored in this mode.

### Signing and notarization (optional)

Without an Apple Developer ID the build is ad-hoc signed, which runs fine
after the one-time *Open Anyway* step. To sign and notarize, add these
repository secrets (Settings → Secrets and variables → Actions); the workflow
uses them when present:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | Developer ID Application certificate (.p12), base64-encoded |
| `APPLE_CERTIFICATE_PASSWORD` | Password of that .p12 |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | For notarization (`APPLE_PASSWORD` is an app-specific password) |

### Releasing a new version

Set the version in `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json`, commit, then tag and push: `git tag v0.2.0 && git
push origin v0.2.0`.
