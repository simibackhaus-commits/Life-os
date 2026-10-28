#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // HTTP aus Rust (ohne CORS) – nur für die freigegebenen KI-Adressen, siehe capabilities/default.json
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von LIFE OS");
}
