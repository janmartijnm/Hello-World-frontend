/// NetBox Explorer. The app is the web frontend in ../src; the plugins give it what a web page can't do:
/// - http: requests to any NetBox server, without CORS (allowed hosts: capabilities/default.json)
/// - opener: "Open in NetBox" links in the default browser
/// - dialog + fs: saving CSV exports with the "Save as" dialog
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running NetBox Explorer");
}
