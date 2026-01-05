//! Settings Manager
//!
//! Handles persistence and retrieval of user preferences using SQLite.
//! Settings are stored as JSON values keyed by setting name.

use std::path::PathBuf;

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

/// User settings structure with all configurable options.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    /// General settings
    #[serde(default)]
    pub general: GeneralSettings,

    /// Format/preset settings
    #[serde(default)]
    pub formats: FormatSettings,

    /// SponsorBlock settings
    #[serde(default)]
    pub sponsorblock: SponsorBlockSettings,

    /// Subtitle settings
    #[serde(default)]
    pub subtitles: SubtitleSettings,

    /// Update settings
    #[serde(default)]
    pub updates: UpdateSettings,

    /// Privacy settings
    #[serde(default)]
    pub privacy: PrivacySettings,

    /// Network settings
    #[serde(default)]
    pub network: NetworkSettings,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            general: GeneralSettings::default(),
            formats: FormatSettings::default(),
            sponsorblock: SponsorBlockSettings::default(),
            subtitles: SubtitleSettings::default(),
            updates: UpdateSettings::default(),
            privacy: PrivacySettings::default(),
            network: NetworkSettings::default(),
        }
    }
}

/// General application settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneralSettings {
    /// Default download folder path.
    #[serde(default = "default_download_folder")]
    pub download_folder: PathBuf,

    /// Default preset ID to use.
    #[serde(default = "default_preset_id")]
    pub default_preset: String,

    /// Maximum concurrent downloads.
    #[serde(default = "default_concurrency")]
    pub concurrency: u32,

    /// Auto-start downloads when added to queue.
    #[serde(default = "default_true")]
    pub auto_start: bool,

    /// Show notification when download completes.
    #[serde(default = "default_true")]
    pub notify_on_complete: bool,

    /// Minimize to system tray on close.
    #[serde(default)]
    pub minimize_to_tray: bool,

    /// Start minimized.
    #[serde(default)]
    pub start_minimized: bool,

    /// Remember window position and size.
    #[serde(default = "default_true")]
    pub remember_window_state: bool,

    /// Show advanced options by default.
    #[serde(default)]
    pub show_advanced_by_default: bool,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            download_folder: default_download_folder(),
            default_preset: default_preset_id(),
            concurrency: default_concurrency(),
            auto_start: true,
            notify_on_complete: true,
            minimize_to_tray: false,
            start_minimized: false,
            remember_window_state: true,
            show_advanced_by_default: false,
        }
    }
}

/// Format and quality settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatSettings {
    /// Prefer MP4 container when possible.
    #[serde(default = "default_true")]
    pub prefer_mp4: bool,

    /// Maximum video height (0 = no limit).
    #[serde(default)]
    pub max_video_height: u32,

    /// Preferred video codec (empty = any).
    #[serde(default)]
    pub preferred_video_codec: String,

    /// Preferred audio codec (empty = any).
    #[serde(default)]
    pub preferred_audio_codec: String,

    /// Embed metadata in downloaded files.
    #[serde(default = "default_true")]
    pub embed_metadata: bool,

    /// Embed thumbnail in downloaded files.
    #[serde(default = "default_true")]
    pub embed_thumbnail: bool,

    /// Write metadata to separate file.
    #[serde(default)]
    pub write_info_json: bool,

    /// Output filename template.
    #[serde(default = "default_filename_template")]
    pub filename_template: String,
}

impl Default for FormatSettings {
    fn default() -> Self {
        Self {
            prefer_mp4: true,
            max_video_height: 0,
            preferred_video_codec: String::new(),
            preferred_audio_codec: String::new(),
            embed_metadata: true,
            embed_thumbnail: true,
            write_info_json: false,
            filename_template: default_filename_template(),
        }
    }
}

/// SponsorBlock integration settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SponsorBlockSettings {
    /// Enable SponsorBlock by default.
    #[serde(default)]
    pub enabled_by_default: bool,

    /// SponsorBlock mode: "remove" or "mark" (chapters).
    #[serde(default = "default_sponsorblock_mode")]
    pub mode: String,

    /// Categories to process.
    #[serde(default = "default_sponsorblock_categories")]
    pub categories: Vec<String>,
}

impl Default for SponsorBlockSettings {
    fn default() -> Self {
        Self {
            enabled_by_default: false,
            mode: default_sponsorblock_mode(),
            categories: default_sponsorblock_categories(),
        }
    }
}

/// Subtitle settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleSettings {
    /// Enable subtitle download by default.
    #[serde(default)]
    pub enabled_by_default: bool,

    /// Default subtitle language (ISO 639-1 code).
    #[serde(default = "default_subtitle_language")]
    pub default_language: String,

    /// Also download auto-generated captions.
    #[serde(default)]
    pub include_auto_captions: bool,

    /// Embed subtitles in video file when possible.
    #[serde(default)]
    pub embed_subtitles: bool,

    /// Preferred subtitle format.
    #[serde(default = "default_subtitle_format")]
    pub preferred_format: String,
}

impl Default for SubtitleSettings {
    fn default() -> Self {
        Self {
            enabled_by_default: false,
            default_language: default_subtitle_language(),
            include_auto_captions: false,
            embed_subtitles: false,
            preferred_format: default_subtitle_format(),
        }
    }
}

/// Update settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSettings {
    /// Auto-update the application.
    #[serde(default = "default_true")]
    pub auto_update_app: bool,

    /// Auto-update yt-dlp.
    #[serde(default = "default_true")]
    pub auto_update_ytdlp: bool,

    /// Auto-update ffmpeg.
    #[serde(default)]
    pub auto_update_ffmpeg: bool,

    /// Check interval in hours.
    #[serde(default = "default_update_interval")]
    pub check_interval_hours: u32,

    /// Last time updates were checked.
    #[serde(default)]
    pub last_checked: Option<String>,
}

impl Default for UpdateSettings {
    fn default() -> Self {
        Self {
            auto_update_app: true,
            auto_update_ytdlp: true,
            auto_update_ffmpeg: false,
            check_interval_hours: default_update_interval(),
            last_checked: None,
        }
    }
}

/// Privacy settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacySettings {
    /// Cookie storage mode: "on_demand", "always", "never".
    #[serde(default = "default_cookie_mode")]
    pub cookie_mode: String,

    /// Path to stored cookies file.
    #[serde(default)]
    pub cookies_path: Option<PathBuf>,

    /// Clear cookies on app exit.
    #[serde(default)]
    pub clear_cookies_on_exit: bool,

    /// Keep download history.
    #[serde(default = "default_true")]
    pub keep_history: bool,

    /// Maximum history entries (0 = unlimited).
    #[serde(default = "default_max_history")]
    pub max_history_entries: u32,
}

impl Default for PrivacySettings {
    fn default() -> Self {
        Self {
            cookie_mode: default_cookie_mode(),
            cookies_path: None,
            clear_cookies_on_exit: false,
            keep_history: true,
            max_history_entries: default_max_history(),
        }
    }
}

/// Network settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkSettings {
    /// Use proxy.
    #[serde(default)]
    pub use_proxy: bool,

    /// Proxy URL (e.g., "socks5://127.0.0.1:9050").
    #[serde(default)]
    pub proxy_url: String,

    /// Rate limit in bytes per second (0 = no limit).
    #[serde(default)]
    pub rate_limit_bps: u64,

    /// Number of retries on failure.
    #[serde(default = "default_retries")]
    pub retries: u32,

    /// Number of concurrent fragments for fragmented downloads.
    #[serde(default = "default_concurrent_fragments")]
    pub concurrent_fragments: u32,

    /// Socket timeout in seconds.
    #[serde(default = "default_socket_timeout")]
    pub socket_timeout: u32,
}

impl Default for NetworkSettings {
    fn default() -> Self {
        Self {
            use_proxy: false,
            proxy_url: String::new(),
            rate_limit_bps: 0,
            retries: default_retries(),
            concurrent_fragments: default_concurrent_fragments(),
            socket_timeout: default_socket_timeout(),
        }
    }
}

// Default value functions
fn default_download_folder() -> PathBuf {
    dirs::download_dir().unwrap_or_else(|| PathBuf::from("~/Downloads"))
}

fn default_preset_id() -> String {
    "recommended_best".to_string()
}

fn default_concurrency() -> u32 {
    2
}

fn default_true() -> bool {
    true
}

fn default_filename_template() -> String {
    "%(title)s [%(id)s].%(ext)s".to_string()
}

fn default_sponsorblock_mode() -> String {
    "remove".to_string()
}

fn default_sponsorblock_categories() -> Vec<String> {
    vec!["sponsor".to_string()]
}

fn default_subtitle_language() -> String {
    "en".to_string()
}

fn default_subtitle_format() -> String {
    "srt".to_string()
}

fn default_update_interval() -> u32 {
    24
}

fn default_cookie_mode() -> String {
    "on_demand".to_string()
}

fn default_max_history() -> u32 {
    1000
}

fn default_retries() -> u32 {
    3
}

fn default_concurrent_fragments() -> u32 {
    1
}

fn default_socket_timeout() -> u32 {
    30
}

/// Settings keys used in the database.
pub mod keys {
    pub const USER_SETTINGS: &str = "user_settings";
    pub const WINDOW_STATE: &str = "window_state";
    pub const LAST_PRESET: &str = "last_preset";
    pub const LAST_DESTINATION: &str = "last_destination";
    pub const COOKIES_IMPORTED: &str = "cookies_imported";
}

/// Window state for persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            x: 100,
            y: 100,
            width: 1200,
            height: 800,
            is_maximized: false,
        }
    }
}

/// Settings manager for reading and writing settings to the database.
pub struct SettingsManager<'a> {
    conn: &'a Connection,
}

impl<'a> SettingsManager<'a> {
    /// Create a new settings manager with a database connection.
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    /// Get a setting value by key.
    pub fn get<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>> {
        let result: Option<String> = self
            .conn
            .query_row(
                "SELECT value_json FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .context("Failed to query settings")?;

        match result {
            Some(json) => {
                let value: T =
                    serde_json::from_str(&json).context("Failed to deserialize setting")?;
                Ok(Some(value))
            }
            None => Ok(None),
        }
    }

    /// Set a setting value by key.
    pub fn set<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        let json = serde_json::to_string(value).context("Failed to serialize setting")?;

        self.conn
            .execute(
                "INSERT INTO settings (key, value_json) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
                params![key, json],
            )
            .context("Failed to save setting")?;

        Ok(())
    }

    /// Delete a setting by key.
    pub fn delete(&self, key: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM settings WHERE key = ?1", params![key])
            .context("Failed to delete setting")?;
        Ok(())
    }

    /// Get the user settings, returning defaults if not set.
    pub fn get_user_settings(&self) -> Result<UserSettings> {
        self.get::<UserSettings>(keys::USER_SETTINGS)
            .map(|opt| opt.unwrap_or_default())
    }

    /// Save user settings.
    pub fn save_user_settings(&self, settings: &UserSettings) -> Result<()> {
        self.set(keys::USER_SETTINGS, settings)
    }

    /// Get window state.
    pub fn get_window_state(&self) -> Result<WindowState> {
        self.get::<WindowState>(keys::WINDOW_STATE)
            .map(|opt| opt.unwrap_or_default())
    }

    /// Save window state.
    pub fn save_window_state(&self, state: &WindowState) -> Result<()> {
        self.set(keys::WINDOW_STATE, state)
    }

    /// Get the last used preset ID.
    pub fn get_last_preset(&self) -> Result<Option<String>> {
        self.get::<String>(keys::LAST_PRESET)
    }

    /// Save the last used preset ID.
    pub fn save_last_preset(&self, preset_id: &str) -> Result<()> {
        self.set(keys::LAST_PRESET, &preset_id.to_string())
    }

    /// Get the last used destination folder.
    pub fn get_last_destination(&self) -> Result<Option<PathBuf>> {
        self.get::<PathBuf>(keys::LAST_DESTINATION)
    }

    /// Save the last used destination folder.
    pub fn save_last_destination(&self, path: &PathBuf) -> Result<()> {
        self.set(keys::LAST_DESTINATION, path)
    }

    /// Check if cookies have been imported.
    pub fn are_cookies_imported(&self) -> Result<bool> {
        self.get::<bool>(keys::COOKIES_IMPORTED)
            .map(|opt| opt.unwrap_or(false))
    }

    /// Set cookies imported flag.
    pub fn set_cookies_imported(&self, imported: bool) -> Result<()> {
        self.set(keys::COOKIES_IMPORTED, &imported)
    }
}

/// Merge partial settings into existing settings.
impl UserSettings {
    /// Update general settings.
    pub fn with_general(mut self, general: GeneralSettings) -> Self {
        self.general = general;
        self
    }

    /// Update format settings.
    pub fn with_formats(mut self, formats: FormatSettings) -> Self {
        self.formats = formats;
        self
    }

    /// Update sponsorblock settings.
    pub fn with_sponsorblock(mut self, sponsorblock: SponsorBlockSettings) -> Self {
        self.sponsorblock = sponsorblock;
        self
    }

    /// Update subtitle settings.
    pub fn with_subtitles(mut self, subtitles: SubtitleSettings) -> Self {
        self.subtitles = subtitles;
        self
    }

    /// Update update settings.
    pub fn with_updates(mut self, updates: UpdateSettings) -> Self {
        self.updates = updates;
        self
    }

    /// Update privacy settings.
    pub fn with_privacy(mut self, privacy: PrivacySettings) -> Self {
        self.privacy = privacy;
        self
    }

    /// Update network settings.
    pub fn with_network(mut self, network: NetworkSettings) -> Self {
        self.network = network;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL
            )",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_default_settings() {
        let settings = UserSettings::default();
        assert_eq!(settings.general.concurrency, 2);
        assert!(settings.general.auto_start);
        assert!(settings.formats.prefer_mp4);
        assert!(!settings.sponsorblock.enabled_by_default);
    }

    #[test]
    fn test_settings_roundtrip() {
        let conn = setup_test_db();
        let manager = SettingsManager::new(&conn);

        let mut settings = UserSettings::default();
        settings.general.concurrency = 4;
        settings.general.download_folder = PathBuf::from("/custom/path");

        manager.save_user_settings(&settings).unwrap();
        let loaded = manager.get_user_settings().unwrap();

        assert_eq!(loaded.general.concurrency, 4);
        assert_eq!(loaded.general.download_folder, PathBuf::from("/custom/path"));
    }

    #[test]
    fn test_window_state_persistence() {
        let conn = setup_test_db();
        let manager = SettingsManager::new(&conn);

        let state = WindowState {
            x: 200,
            y: 150,
            width: 1400,
            height: 900,
            is_maximized: true,
        };

        manager.save_window_state(&state).unwrap();
        let loaded = manager.get_window_state().unwrap();

        assert_eq!(loaded.x, 200);
        assert_eq!(loaded.y, 150);
        assert_eq!(loaded.width, 1400);
        assert_eq!(loaded.height, 900);
        assert!(loaded.is_maximized);
    }

    #[test]
    fn test_last_preset() {
        let conn = setup_test_db();
        let manager = SettingsManager::new(&conn);

        assert!(manager.get_last_preset().unwrap().is_none());

        manager.save_last_preset("audio_m4a").unwrap();
        assert_eq!(
            manager.get_last_preset().unwrap(),
            Some("audio_m4a".to_string())
        );
    }

    #[test]
    fn test_delete_setting() {
        let conn = setup_test_db();
        let manager = SettingsManager::new(&conn);

        manager.save_last_preset("test").unwrap();
        assert!(manager.get_last_preset().unwrap().is_some());

        manager.delete(keys::LAST_PRESET).unwrap();
        assert!(manager.get_last_preset().unwrap().is_none());
    }
}
