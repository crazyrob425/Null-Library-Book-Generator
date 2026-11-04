use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

const SECRET_SERVICE: &str = "com.fraudrob.kdpebookgenerator";
const SETTINGS_FILE: &str = "desktop-menu-settings.json";
const SECRET_INDEX_FILE: &str = "secure-secret-index.json";
const MENU_EVENT_CHANNEL: &str = "native-menu-action";

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum WindowAction {
    Minimize,
    Maximize,
    Close,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
struct GeneralPreferences {
    auto_save_frequency_seconds: u32,
    undo_step_history: u32,
    saved_books_dir: String,
    drafts_dir: String,
    favorite_printer: String,
}

impl Default for GeneralPreferences {
    fn default() -> Self {
        Self {
            auto_save_frequency_seconds: 30,
            undo_step_history: 100,
            saved_books_dir: String::new(),
            drafts_dir: String::new(),
            favorite_printer: String::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
struct SafetyPreferences {
    censorship_enabled: bool,
    ai_personality: String,
}

impl Default for SafetyPreferences {
    fn default() -> Self {
        Self {
            censorship_enabled: true,
            ai_personality: "balanced".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
struct ClipboardPreferences {
    persistent_history_enabled: bool,
    history_limit: u32,
}

impl Default for ClipboardPreferences {
    fn default() -> Self {
        Self {
            persistent_history_enabled: true,
            history_limit: 200,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
struct AuthorshipPreferences {
    standard_book_size: String,
    default_chapter_count: u32,
    default_image_style: String,
    description_input_mode: String,
    auto_publish_marketplace: String,
}

impl Default for AuthorshipPreferences {
    fn default() -> Self {
        Self {
            standard_book_size: "6x9".to_string(),
            default_chapter_count: 10,
            default_image_style: "cinematic".to_string(),
            description_input_mode: "few-sentences".to_string(),
            auto_publish_marketplace: "kdp".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
struct CloudSyncPreferences {
    enabled: bool,
    google_account_email: String,
    backup_frequency_hours: u32,
}

impl Default for CloudSyncPreferences {
    fn default() -> Self {
        Self {
            enabled: false,
            google_account_email: String::new(),
            backup_frequency_hours: 24,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
struct DesktopPreferences {
    general: GeneralPreferences,
    safety: SafetyPreferences,
    clipboard: ClipboardPreferences,
    authorship: AuthorshipPreferences,
    cloud_sync: CloudSyncPreferences,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct SecretDescriptor {
    key: String,
    label: String,
    category: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
struct SecretIndex {
    descriptors: Vec<SecretDescriptor>,
}

#[derive(Clone, Serialize)]
struct MenuActionPayload {
    id: String,
}

fn config_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("Could not resolve app config directory: {e}"))
}

fn settings_file_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(SETTINGS_FILE))
}

fn secret_index_file_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(SECRET_INDEX_FILE))
}

fn ensure_config_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let dir = config_dir(app)?;
    fs::create_dir_all(dir).map_err(|e| format!("Could not create config directory: {e}"))
}

fn read_preferences<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<DesktopPreferences, String> {
    ensure_config_dir(app)?;
    let path = settings_file_path(app)?;
    if !path.exists() {
        return Ok(DesktopPreferences::default());
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("Could not read settings file: {e}"))?;
    serde_json::from_str::<DesktopPreferences>(&raw)
        .map_err(|e| format!("Could not parse settings file: {e}"))
}

fn write_preferences<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    preferences: &DesktopPreferences,
) -> Result<(), String> {
    ensure_config_dir(app)?;
    let path = settings_file_path(app)?;
    let raw = serde_json::to_string_pretty(preferences)
        .map_err(|e| format!("Could not serialize settings: {e}"))?;
    fs::write(path, raw).map_err(|e| format!("Could not write settings file: {e}"))
}

fn read_secret_index<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<SecretIndex, String> {
    ensure_config_dir(app)?;
    let path = secret_index_file_path(app)?;
    if !path.exists() {
        return Ok(SecretIndex::default());
    }
    let raw =
        fs::read_to_string(path).map_err(|e| format!("Could not read secret index file: {e}"))?;
    serde_json::from_str::<SecretIndex>(&raw)
        .map_err(|e| format!("Could not parse secret index: {e}"))
}

fn write_secret_index<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    index: &SecretIndex,
) -> Result<(), String> {
    ensure_config_dir(app)?;
    let path = secret_index_file_path(app)?;
    let raw = serde_json::to_string_pretty(index)
        .map_err(|e| format!("Could not serialize secret index: {e}"))?;
    fs::write(path, raw).map_err(|e| format!("Could not write secret index file: {e}"))
}

fn keyring_entry(secret_key: &str) -> Result<Entry, String> {
    Entry::new(SECRET_SERVICE, secret_key)
        .map_err(|e| format!("Could not create keyring entry: {e}"))
}

fn default_secret_descriptors() -> Vec<SecretDescriptor> {
    vec![
        SecretDescriptor {
            key: "kdp.login".to_string(),
            label: "KDP Login Credentials".to_string(),
            category: "marketplaces".to_string(),
        },
        SecretDescriptor {
            key: "marketplace.other".to_string(),
            label: "Other Ebook Marketplace Credentials".to_string(),
            category: "marketplaces".to_string(),
        },
        SecretDescriptor {
            key: "social.accounts".to_string(),
            label: "Social Media Credentials".to_string(),
            category: "marketing".to_string(),
        },
        SecretDescriptor {
            key: "gemini.api.key".to_string(),
            label: "Gemini API Key".to_string(),
            category: "api-keys".to_string(),
        },
        SecretDescriptor {
            key: "cloud.google.drive".to_string(),
            label: "Google Drive Backup Access Token".to_string(),
            category: "cloud-sync".to_string(),
        },
    ]
}

fn ensure_default_secret_descriptors<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<SecretIndex, String> {
    let mut index = read_secret_index(app)?;
    let mut existing = index
        .descriptors
        .iter()
        .map(|d| d.key.clone())
        .collect::<std::collections::HashSet<_>>();

    for descriptor in default_secret_descriptors() {
        if !existing.contains(&descriptor.key) {
            existing.insert(descriptor.key.clone());
            index.descriptors.push(descriptor);
        }
    }

    write_secret_index(app, &index)?;
    Ok(index)
}

fn build_native_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<tauri::menu::Menu<R>> {
    let file_menu = SubmenuBuilder::new(app, "File")
        .text("file_new", "New")
        .text("file_open", "Open")
        .text("file_save", "Save")
        .text("file_export", "Export")
        .separator()
        .item(&MenuItemBuilder::with_id("file_accounts", "Account Manager").build(app)?)
        .build()?;

    let clipboard_menu = SubmenuBuilder::new(app, "Multi-Clipboard")
        .text("edit_clipboard_copy", "Copy")
        .text("edit_clipboard_paste", "Paste")
        .text("edit_clipboard_find", "Find")
        .text("edit_clipboard_replace", "Replace")
        .separator()
        .text(
            "edit_clipboard_persistent_history",
            "Toggle Persistent History",
        )
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .text("edit_undo", "Undo")
        .text("edit_redo", "Redo")
        .separator()
        .item(&clipboard_menu)
        .separator()
        .text("edit_preferences", "Preferences")
        .build()?;

    let authorship_menu = SubmenuBuilder::new(app, "Authorship")
        .text("authorship_defaults", "Book Generation Defaults")
        .text(
            "authorship_marketplace",
            "Marketplace Auto-Publish Settings",
        )
        .build()?;

    MenuBuilder::new(app)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&authorship_menu)
        .build()
}

#[tauri::command]
fn window_control(window: tauri::Window, action: WindowAction) -> Result<(), String> {
    match action {
        WindowAction::Minimize => window.minimize().map_err(|e| e.to_string()),
        WindowAction::Maximize => {
            let is_max = window.is_maximized().map_err(|e| e.to_string())?;
            if is_max {
                window.unmaximize().map_err(|e| e.to_string())
            } else {
                window.maximize().map_err(|e| e.to_string())
            }
        }
        WindowAction::Close => window.close().map_err(|e| e.to_string()),
    }
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("Invalid path".to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, data: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Invalid path".to_string());
    }
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn fetch_google_trends(_keyword: String) -> Option<serde_json::Value> {
    None
}

#[tauri::command]
fn fetch_amazon_competitors(_keyword: String) -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
fn fetch_amazon_suggestions(_keyword: String) -> Vec<String> {
    Vec::new()
}

#[tauri::command]
fn start_automation(_payload: serde_json::Value) -> Result<(), String> {
    Err("Automation command not implemented in Tauri yet. Use Electron/backend mode.".to_string())
}

#[tauri::command]
fn captcha_solution(_solution: String) -> Result<(), String> {
    Err("Automation command not implemented in Tauri yet. Use Electron/backend mode.".to_string())
}

#[tauri::command]
fn stop_automation() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn load_desktop_preferences(app: tauri::AppHandle) -> Result<DesktopPreferences, String> {
    read_preferences(&app)
}

#[tauri::command]
fn save_desktop_preferences(
    app: tauri::AppHandle,
    preferences: DesktopPreferences,
) -> Result<(), String> {
    write_preferences(&app, &preferences)
}

#[tauri::command]
fn list_secure_descriptors(app: tauri::AppHandle) -> Result<Vec<SecretDescriptor>, String> {
    let index = ensure_default_secret_descriptors(&app)?;
    Ok(index.descriptors)
}

#[tauri::command]
fn set_secure_secret(
    app: tauri::AppHandle,
    descriptor: SecretDescriptor,
    value: String,
) -> Result<(), String> {
    let entry = keyring_entry(&descriptor.key)?;
    entry
        .set_password(&value)
        .map_err(|e| format!("Could not store secret in system keyring: {e}"))?;

    let mut index = ensure_default_secret_descriptors(&app)?;
    if !index.descriptors.iter().any(|d| d.key == descriptor.key) {
        index.descriptors.push(descriptor);
        write_secret_index(&app, &index)?;
    }
    Ok(())
}

#[tauri::command]
fn get_secure_secret(secret_key: String) -> Result<Option<String>, String> {
    let entry = keyring_entry(&secret_key)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Could not read secret from system keyring: {e}")),
    }
}

#[tauri::command]
fn delete_secure_secret(app: tauri::AppHandle, secret_key: String) -> Result<(), String> {
    let entry = keyring_entry(&secret_key)?;
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(format!("Could not delete secret from system keyring: {e}")),
    }

    let mut index = read_secret_index(&app)?;
    index.descriptors.retain(|d| d.key != secret_key);
    write_secret_index(&app, &index)
}

#[tauri::command]
fn get_menu_blueprint() -> HashMap<String, Vec<String>> {
    HashMap::from([
        (
            "file".to_string(),
            vec![
                "new".to_string(),
                "open".to_string(),
                "save".to_string(),
                "export".to_string(),
                "account_manager".to_string(),
            ],
        ),
        (
            "edit".to_string(),
            vec![
                "undo".to_string(),
                "redo".to_string(),
                "multi_clipboard".to_string(),
                "preferences".to_string(),
            ],
        ),
        (
            "authorship".to_string(),
            vec!["defaults".to_string(), "auto_publish".to_string()],
        ),
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .menu(|app| build_native_menu(app))
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str().to_string();
            let _ = app.emit(MENU_EVENT_CHANNEL, MenuActionPayload { id });
        })
        .setup(|app| {
            ensure_default_secret_descriptors(&app.handle())?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window_control,
            read_file,
            write_file,
            fetch_google_trends,
            fetch_amazon_competitors,
            fetch_amazon_suggestions,
            start_automation,
            captcha_solution,
            stop_automation,
            load_desktop_preferences,
            save_desktop_preferences,
            list_secure_descriptors,
            set_secure_secret,
            get_secure_secret,
            delete_secure_secret,
            get_menu_blueprint,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
