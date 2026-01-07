use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Deserializer, Serialize};

/// Helper to deserialize null as None for optional fields
fn deserialize_null_as_none<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Option::<T>::deserialize(deserializer).unwrap_or(None))
}
use tauri::{AppHandle, Manager, State};
use tokio::sync::{mpsc, Mutex, RwLock};
use uuid::Uuid;

mod db;
mod download_manager;
mod events;
mod models;
mod settings;
mod tool_manager;
mod url_utils;
mod ytdlp;

use download_manager::{DownloadConfig, DownloadManager, Preset};
use events::DownlinkEvent;
use settings::{SettingsManager, UserSettings, WindowState};
use tool_manager::{ToolManager, ToolManagerConfig, ToolchainStatus};

/// Shared application state.
/// Uses lazy initialization for components that need the async runtime.
pub struct AppState {
    db: Arc<Mutex<db::Db>>,
    download_manager: RwLock<Option<Arc<DownloadManager>>>,
    tool_manager: RwLock<Option<Arc<ToolManager>>>,
    event_tx: Arc<Mutex<Option<mpsc::Sender<DownlinkEvent>>>>,
}

/// Helper to get or create the download manager lazily.
async fn get_or_init_download_manager(
    state: &State<'_, AppState>,
    app: &AppHandle,
) -> Arc<DownloadManager> {
    // Check if already initialized
    {
        let dm = state.download_manager.read().await;
        if let Some(ref manager) = *dm {
            return manager.clone();
        }
    }

    // Initialize if not present
    let mut dm = state.download_manager.write().await;
    if let Some(ref manager) = *dm {
        return manager.clone();
    }

    // Create event channel
    let (event_tx, mut event_rx) = mpsc::channel::<DownlinkEvent>(256);

    // Store event_tx for later use
    {
        let mut tx_guard = state.event_tx.lock().await;
        *tx_guard = Some(event_tx.clone());
    }

    // Set up event forwarding to frontend
    let app_handle = app.clone();
    tokio::spawn(async move {
        log::info!("Event forwarding task started");
        while let Some(event) = event_rx.recv().await {
            log::info!("Forwarding event to frontend: {:?}", event);
            match events::emit_event(&app_handle, event) {
                Ok(_) => log::debug!("Event emitted successfully"),
                Err(e) => log::error!("Failed to emit event: {:?}", e),
            }
        }
        log::warn!("Event forwarding task ended");
    });

    // Create download manager
    let config = DownloadConfig::default();
    let manager = Arc::new(DownloadManager::new(config, state.db.clone(), event_tx));

    *dm = Some(manager.clone());
    manager
}

// ============================================================================
// Tauri Command Payloads
// ============================================================================

/// Payload returned to the UI when adding URLs.
#[derive(Debug, Serialize)]
pub struct AddUrlsResult {
    ids: Vec<Uuid>,
    urls: Vec<String>,
}

/// Options for adding URLs.
#[derive(Debug, Deserialize)]
pub struct AddUrlsOptions {
    preset_id: String,
    output_dir: String,
    /// If present, create all children under this playlist parent id.
    #[serde(default, deserialize_with = "deserialize_null_as_none")]
    parent_id: Option<Uuid>,
    /// Source kind hint. If absent, defaults to `single`.
    #[serde(default, deserialize_with = "deserialize_null_as_none")]
    source_kind: Option<String>,
    /// Optional metadata from preview (to avoid re-fetching).
    #[serde(default, deserialize_with = "deserialize_null_as_none")]
    title: Option<String>,
    #[serde(default, deserialize_with = "deserialize_null_as_none")]
    uploader: Option<String>,
    #[serde(default, deserialize_with = "deserialize_null_as_none")]
    thumbnail_url: Option<String>,
    #[serde(default, deserialize_with = "deserialize_null_as_none")]
    duration_seconds: Option<i64>,
}

/// Options for fetching metadata.
#[derive(Debug, Deserialize)]
pub struct FetchMetadataOptions {
    preset_id: String,
    output_dir: String,
}

/// Result from fetching metadata.
#[derive(Debug, Serialize)]
pub struct FetchMetadataResult {
    id: Uuid,
    url: String,
    is_playlist: bool,
    title: Option<String>,
    uploader: Option<String>,
    duration_seconds: Option<u64>,
    thumbnail_url: Option<String>,
    filesize_bytes: Option<u64>,
    playlist_title: Option<String>,
    playlist_count_hint: Option<u64>,
}

/// Result from expanding a playlist.
#[derive(Debug, Serialize)]
pub struct ExpandPlaylistResult {
    parent_id: Uuid,
    item_ids: Vec<Uuid>,
    count: usize,
}

/// Options for expanding a playlist.
#[derive(Debug, Deserialize)]
pub struct ExpandPlaylistOptions {
    preset_id: String,
    output_dir: String,
}

/// Queue item for UI display.
#[derive(Debug, Serialize)]
pub struct QueueItem {
    id: Uuid,
    source_url: String,
    title: Option<String>,
    uploader: Option<String>,
    thumbnail_url: Option<String>,
    status: String,
    phase: Option<String>,
    progress_percent: Option<f64>,
    speed_bps: Option<i64>,
    eta_seconds: Option<i64>,
    preset_id: String,
    output_dir: String,
    final_path: Option<String>,
    error_message: Option<String>,
}

/// Preset info for UI.
#[derive(Debug, Serialize)]
pub struct PresetInfo {
    id: String,
    name: String,
}

// ============================================================================
// Tauri Commands - URL and Queue Management
// ============================================================================

#[tauri::command]
fn add_urls(
    state: State<'_, AppState>,
    urls_text: String,
    options: AddUrlsOptions,
) -> Result<AddUrlsResult, String> {
    log::info!("add_urls called with urls_text: {:?}", urls_text);
    log::info!("add_urls options: {:?}", options);

    let urls = url_utils::extract_urls(&urls_text);
    if urls.is_empty() {
        return Err("No valid http(s) URLs found.".to_string());
    }

    let source_kind = match options.source_kind.as_deref() {
        Some("playlist_parent") => db::SourceKind::PlaylistParent,
        Some("playlist_item") => db::SourceKind::PlaylistItem,
        Some("single") | None => db::SourceKind::Single,
        Some(_) => db::SourceKind::Single,
    };

    let mut db = state.db.blocking_lock();

    let mut ids = Vec::with_capacity(urls.len());
    for u in &urls {
        let id = db
            .insert_download(
                u,
                source_kind,
                options.parent_id,
                &options.preset_id,
                &options.output_dir,
            )
            .map_err(|e| format!("Failed to insert download: {e}"))?;

        // If we have metadata from preview, update the row
        if options.title.is_some() || options.uploader.is_some() || options.thumbnail_url.is_some()
        {
            let _ = db.update_metadata(
                id,
                options.title.as_deref(),
                options.uploader.as_deref(),
                options.duration_seconds,
                options.thumbnail_url.as_deref(),
            );
        }

        ids.push(id);
    }

    Ok(AddUrlsResult { ids, urls })
}

#[tauri::command]
async fn fetch_metadata(
    _app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    _options: FetchMetadataOptions,
) -> Result<FetchMetadataResult, String> {
    let urls = url_utils::extract_urls(&url);
    let first = urls
        .into_iter()
        .next()
        .ok_or_else(|| "No valid http(s) URL found.".to_string())?;

    // Just fetch metadata - do NOT insert into database
    // The item will only be added to the queue when the user clicks "Download"
    let runner = build_ytdlp_runner(&state).await;
    let (meta, _output) = runner
        .fetch_metadata(&first)
        .await
        .map_err(|e| format!("yt-dlp metadata failed: {e}"))?;

    // Return a placeholder ID (empty UUID) since we're not storing in DB yet
    // The real ID will be created when add_urls is called
    Ok(FetchMetadataResult {
        id: Uuid::nil(),
        url: meta.url,
        is_playlist: meta.is_playlist,
        title: meta.title,
        uploader: meta.uploader,
        duration_seconds: meta.duration_seconds,
        thumbnail_url: meta.thumbnail_url,
        filesize_bytes: meta.filesize_bytes,
        playlist_title: meta.playlist_title,
        playlist_count_hint: meta.playlist_count_hint,
    })
}

#[tauri::command]
async fn expand_playlist(
    app: AppHandle,
    state: State<'_, AppState>,
    playlist_url: String,
    options: ExpandPlaylistOptions,
) -> Result<ExpandPlaylistResult, String> {
    let urls = url_utils::extract_urls(&playlist_url);
    let playlist = urls
        .into_iter()
        .next()
        .ok_or_else(|| "No valid http(s) playlist URL found.".to_string())?;

    // Create parent row
    let parent_id = {
        let mut db = state.db.lock().await;
        let parent_id = db
            .insert_download(
                &playlist,
                db::SourceKind::PlaylistParent,
                None,
                &options.preset_id,
                &options.output_dir,
            )
            .map_err(|e| format!("Failed to insert playlist parent: {e}"))?;

        db.set_status(
            parent_id,
            db::DownloadStatus::Fetching,
            Some("Fetching playlist…"),
        )
        .map_err(|e| format!("Failed to update playlist status: {e}"))?;
        parent_id
    };

    let runner = build_ytdlp_runner(&state).await;
    let (entries, _output) = runner
        .enumerate_playlist(&playlist)
        .await
        .map_err(|e| format!("yt-dlp playlist enumeration failed: {e}"))?;

    let item_ids = {
        let mut db = state.db.lock().await;
        let mut item_ids = Vec::with_capacity(entries.len());
        for entry in &entries {
            let item_id = db
                .insert_download(
                    &entry.url,
                    db::SourceKind::PlaylistItem,
                    Some(parent_id),
                    &options.preset_id,
                    &options.output_dir,
                )
                .map_err(|e| format!("Failed to insert playlist item: {e}"))?;

            // Update metadata for the item if available
            let _ = db.update_metadata(
                item_id,
                entry.title.as_deref(),
                entry.uploader.as_deref(),
                entry.duration_seconds.map(|d| d as i64),
                entry.thumbnail_url.as_deref(),
            );

            item_ids.push(item_id);
        }

        db.set_status(parent_id, db::DownloadStatus::Ready, Some("Ready"))
            .map_err(|e| format!("Failed to update playlist status: {e}"))?;
        item_ids
    };

    let _ = events::emit_event(
        &app,
        events::DownlinkEvent::PlaylistExpanded {
            parent_id,
            item_ids: item_ids.clone(),
            count: item_ids.len(),
        },
    );

    Ok(ExpandPlaylistResult {
        parent_id,
        item_ids: item_ids.clone(),
        count: item_ids.len(),
    })
}

// ============================================================================
// Tauri Commands - Download Control
// ============================================================================

#[tauri::command]
async fn start_download(
    app: AppHandle,
    state: State<'_, AppState>,
    id: Uuid,
) -> Result<(), String> {
    let manager = get_or_init_download_manager(&state, &app).await;
    manager
        .start(id)
        .await
        .map_err(|e| format!("Failed to start download: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn stop_download(app: AppHandle, state: State<'_, AppState>, id: Uuid) -> Result<(), String> {
    let manager = get_or_init_download_manager(&state, &app).await;
    manager
        .stop(id)
        .await
        .map_err(|e| format!("Failed to stop download: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn cancel_download(
    app: AppHandle,
    state: State<'_, AppState>,
    id: Uuid,
) -> Result<(), String> {
    let manager = get_or_init_download_manager(&state, &app).await;
    manager
        .cancel(id)
        .await
        .map_err(|e| format!("Failed to cancel download: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn retry_download(
    app: AppHandle,
    state: State<'_, AppState>,
    id: Uuid,
) -> Result<(), String> {
    let manager = get_or_init_download_manager(&state, &app).await;
    manager
        .retry(id)
        .await
        .map_err(|e| format!("Failed to retry download: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn start_all_downloads(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let ids = {
        let mut db = state.db.lock().await;
        db.get_queued_download_ids()
            .map_err(|e| format!("Failed to get queued downloads: {e}"))?
    };

    let manager = get_or_init_download_manager(&state, &app).await;
    for id in ids {
        let _ = manager.start(id).await;
    }
    Ok(())
}

#[tauri::command]
async fn stop_all_downloads(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let manager = get_or_init_download_manager(&state, &app).await;
    let _ = manager.shutdown().await;
    Ok(())
}

// ============================================================================
// Tauri Commands - Queue and History
// ============================================================================

#[tauri::command]
async fn get_queue(state: State<'_, AppState>) -> Result<Vec<QueueItem>, String> {
    let mut db = state.db.lock().await;
    let rows = db
        .get_active_downloads()
        .map_err(|e| format!("Failed to get queue: {e}"))?;

    let items: Vec<QueueItem> = rows
        .into_iter()
        .map(|row| QueueItem {
            id: row.id,
            source_url: row.source_url,
            title: row.title,
            uploader: row.uploader,
            thumbnail_url: row.thumbnail_url,
            status: row.status.as_str().to_string(),
            phase: row.phase,
            progress_percent: row.progress_percent,
            speed_bps: row.speed_bps,
            eta_seconds: row.eta_seconds,
            preset_id: row.preset_id,
            output_dir: row.output_dir,
            final_path: row.final_path,
            error_message: row.error_message,
        })
        .collect();

    Ok(items)
}

#[tauri::command]
async fn get_history(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<QueueItem>, String> {
    let mut db = state.db.lock().await;
    let rows = db
        .get_completed_downloads(limit.unwrap_or(100))
        .map_err(|e| format!("Failed to get history: {e}"))?;

    let items: Vec<QueueItem> = rows
        .into_iter()
        .map(|row| QueueItem {
            id: row.id,
            source_url: row.source_url,
            title: row.title,
            uploader: row.uploader,
            thumbnail_url: row.thumbnail_url,
            status: row.status.as_str().to_string(),
            phase: row.phase,
            progress_percent: row.progress_percent,
            speed_bps: row.speed_bps,
            eta_seconds: row.eta_seconds,
            preset_id: row.preset_id,
            output_dir: row.output_dir,
            final_path: row.final_path,
            error_message: row.error_message,
        })
        .collect();

    Ok(items)
}

#[tauri::command]
async fn clear_queue(state: State<'_, AppState>) -> Result<(), String> {
    let mut db = state.db.lock().await;
    db.clear_queued_downloads()
        .map_err(|e| format!("Failed to clear queue: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    let mut db = state.db.lock().await;
    db.clear_completed_downloads()
        .map_err(|e| format!("Failed to clear history: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn remove_download(state: State<'_, AppState>, id: Uuid) -> Result<(), String> {
    // First try to cancel if active
    {
        let dm = state.download_manager.read().await;
        if let Some(ref manager) = *dm {
            let _ = manager.cancel(id).await;
        }
    }

    // Then remove from DB
    let mut db = state.db.lock().await;
    db.delete_download(id)
        .map_err(|e| format!("Failed to remove download: {e}"))?;
    Ok(())
}

// ============================================================================
// Tauri Commands - Settings
// ============================================================================

#[tauri::command]
async fn get_settings(state: State<'_, AppState>) -> Result<UserSettings, String> {
    let db = state.db.lock().await;
    let manager = SettingsManager::new(db.conn());
    manager
        .get_user_settings()
        .map_err(|e| format!("Failed to get settings: {e}"))
}

#[tauri::command]
async fn save_settings(state: State<'_, AppState>, settings: UserSettings) -> Result<(), String> {
    let db = state.db.lock().await;
    let manager = SettingsManager::new(db.conn());
    manager
        .save_user_settings(&settings)
        .map_err(|e| format!("Failed to save settings: {e}"))
}

#[tauri::command]
async fn get_window_state(state: State<'_, AppState>) -> Result<WindowState, String> {
    let db = state.db.lock().await;
    let manager = SettingsManager::new(db.conn());
    manager
        .get_window_state()
        .map_err(|e| format!("Failed to get window state: {e}"))
}

#[tauri::command]
async fn save_window_state(
    state: State<'_, AppState>,
    window_state: WindowState,
) -> Result<(), String> {
    let db = state.db.lock().await;
    let manager = SettingsManager::new(db.conn());
    manager
        .save_window_state(&window_state)
        .map_err(|e| format!("Failed to save window state: {e}"))
}

// ============================================================================
// Tauri Commands - Tools
// ============================================================================

#[tauri::command]
async fn get_toolchain_status(state: State<'_, AppState>) -> Result<ToolchainStatus, String> {
    let tm = state.tool_manager.read().await;
    if let Some(ref manager) = *tm {
        Ok(manager.get_toolchain_status().await)
    } else {
        Err("Tool manager not initialized".to_string())
    }
}

#[tauri::command]
async fn check_for_updates(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let tm = state.tool_manager.read().await;
    if let Some(ref manager) = *tm {
        let updates = manager
            .check_for_updates()
            .await
            .map_err(|e| format!("Failed to check for updates: {e}"))?;
        Ok(updates.into_iter().map(|u| u.tool).collect())
    } else {
        Err("Tool manager not initialized".to_string())
    }
}

#[tauri::command]
async fn update_tool(
    app: AppHandle,
    state: State<'_, AppState>,
    tool_name: String,
) -> Result<String, String> {
    let tm = state.tool_manager.read().await;
    if let Some(ref manager) = *tm {
        let updates = manager
            .check_for_updates()
            .await
            .map_err(|e| format!("Failed to check for updates: {e}"))?;

        let entry = updates
            .into_iter()
            .find(|u| u.tool == tool_name)
            .ok_or_else(|| format!("No update available for {}", tool_name))?;

        let app_handle = app.clone();
        let tool_name_clone = tool_name.clone();
        let path = manager
            .update_tool(&entry, move |progress| {
                let _ = events::emit_event(
                    &app_handle,
                    DownlinkEvent::ToolUpdateProgress {
                        info: events::ToolUpdateProgressInfo {
                            tool: tool_name_clone.clone(),
                            percent: progress,
                        },
                    },
                );
            })
            .await
            .map_err(|e| format!("Failed to update {}: {e}", tool_name))?;

        let _ = events::emit_event(
            &app,
            DownlinkEvent::ToolUpdateCompleted {
                tool: tool_name.clone(),
                version: entry.version.clone(),
            },
        );

        Ok(path.to_string_lossy().to_string())
    } else {
        Err("Tool manager not initialized".to_string())
    }
}

// ============================================================================
// Tauri Commands - Presets
// ============================================================================

#[tauri::command]
fn get_presets() -> Vec<PresetInfo> {
    Preset::builtin_presets()
        .into_iter()
        .map(|p| PresetInfo {
            id: p.id,
            name: p.name,
        })
        .collect()
}

// ============================================================================
// Tauri Commands - Utilities
// ============================================================================

#[tauri::command]
fn get_app_data_dir() -> Result<String, String> {
    db::app_data_dir()
        .map(|p: PathBuf| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_default_download_dir() -> String {
    dirs::download_dir()
        .unwrap_or_else(|| PathBuf::from("~/Downloads"))
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn extract_urls_from_text(text: String) -> Vec<String> {
    url_utils::extract_urls(&text)
}

#[tauri::command]
async fn open_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);

    // Check if file exists
    if !path.exists() {
        return Err(format!("File does not exist: {}", path.display()));
    }

    #[cfg(target_os = "macos")]
    {
        // On macOS, use 'open' command directly for better Unicode support
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {e}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        open::that(&path).map_err(|e| format!("Failed to open file: {e}"))
    }
}

#[tauri::command]
async fn open_folder(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);

    // Determine the folder to open
    let folder = if path.is_file() {
        path.parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| path.clone())
    } else if path.exists() {
        path.clone()
    } else {
        // If path doesn't exist, try to open the parent directory
        path.parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| dirs::download_dir().unwrap_or_else(|| PathBuf::from("/")))
    };

    #[cfg(target_os = "macos")]
    {
        // On macOS, use 'open' command for folders, or 'open -R' to reveal file in Finder
        if path.is_file() && path.exists() {
            // Reveal the file in Finder
            std::process::Command::new("open")
                .arg("-R")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to reveal in Finder: {e}"))?;
        } else {
            // Just open the folder
            std::process::Command::new("open")
                .arg(&folder)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {e}"))?;
        }
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        if path.is_file() && path.exists() {
            // On Windows, use explorer /select to reveal the file
            std::process::Command::new("explorer")
                .arg("/select,")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to reveal in Explorer: {e}"))?;
        } else {
            std::process::Command::new("explorer")
                .arg(&folder)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {e}"))?;
        }
        Ok(())
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        // Linux and others - just open the folder
        open::that(&folder).map_err(|e| format!("Failed to open folder: {e}"))
    }
}

// ============================================================================
// App Update Commands
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct AppUpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub release_notes: Option<String>,
    pub download_url: Option<String>,
}

#[tauri::command]
async fn check_app_update(app: AppHandle) -> Result<AppUpdateInfo, String> {
    use tauri_plugin_updater::UpdaterExt;

    let current_version = env!("CARGO_PKG_VERSION").to_string();

    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => Ok(AppUpdateInfo {
                    available: true,
                    current_version,
                    latest_version: Some(update.version.clone()),
                    release_notes: update.body.clone(),
                    download_url: None,
                }),
                Ok(None) => Ok(AppUpdateInfo {
                    available: false,
                    current_version,
                    latest_version: None,
                    release_notes: None,
                    download_url: None,
                }),
                Err(e) => {
                    // Log the error but return a "no update" response instead of failing
                    // This handles the case where no release exists yet
                    log::warn!(
                        "Failed to check for updates (this is normal if no release exists yet): {}",
                        e
                    );
                    Ok(AppUpdateInfo {
                        available: false,
                        current_version,
                        latest_version: None,
                        release_notes: None,
                        download_url: None,
                    })
                }
            }
        }
        Err(e) => {
            // Updater plugin not configured properly - return no update available
            log::warn!("Updater not available: {}", e);
            Ok(AppUpdateInfo {
                available: false,
                current_version: current_version.clone(),
                latest_version: None,
                release_notes: None,
                download_url: None,
            })
        }
    }
}

#[tauri::command]
async fn install_app_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    let updater = app
        .updater()
        .map_err(|e| format!("Updater not available: {}", e))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?
        .ok_or_else(|| "No update available".to_string())?;

    log::info!(
        "Downloading and installing update to version {}",
        update.version
    );

    // Download and install the update
    let mut downloaded = 0;
    let mut total = 0;

    update
        .download_and_install(
            |chunk_length, content_length| {
                downloaded += chunk_length;
                total = content_length.unwrap_or(0);
                log::info!("Downloaded {} of {} bytes", downloaded, total);
            },
            || {
                log::info!("Download complete, installing...");
            },
        )
        .await
        .map_err(|e| format!("Failed to download/install update: {}", e))?;

    log::info!("Update installed successfully. Restart required.");

    Ok(())
}

#[tauri::command]
async fn restart_app(app: AppHandle) -> Result<(), String> {
    app.restart();
}

// ============================================================================
// Helper Functions
// ============================================================================

async fn build_ytdlp_runner(state: &State<'_, AppState>) -> ytdlp::YtDlpRunner {
    let yt_dlp_path = {
        let tm = state.tool_manager.read().await;
        if let Some(ref manager) = *tm {
            manager.yt_dlp_path().await
        } else {
            None
        }
    }
    .unwrap_or_else(download_manager::find_ytdlp_binary);

    let cfg = ytdlp::YtDlpConfig::new(yt_dlp_path);
    ytdlp::YtDlpRunner::new(cfg)
}

fn emit_app_ready(app: &AppHandle, yt_dlp_version: Option<String>, ffmpeg_version: Option<String>) {
    let _ = events::emit_event(
        app,
        events::DownlinkEvent::AppReady {
            versions: events::ToolVersions {
                app_version: env!("CARGO_PKG_VERSION").to_string(),
                yt_dlp_version,
                ffmpeg_version,
            },
        },
    );
}

// ============================================================================
// App Entry Point
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Enable logging in both debug and release modes
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            // Initialize per-user dirs + SQLite
            let db = db::Db::open().map_err(|e| tauri::Error::Anyhow(e))?;

            // Initialize tool manager with bundled_dir set to executable directory
            // In production, Tauri places sidecar binaries next to the executable
            let bundled_dir = std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(|p| p.to_path_buf()));

            let tool_config = if let Some(dir) = bundled_dir {
                log::info!("Setting bundled_dir to: {:?}", dir);
                tool_manager::ToolManagerConfigBuilder::new()
                    .bundled_dir(dir)
                    .build()
            } else {
                log::warn!("Could not determine executable directory, using default config");
                ToolManagerConfig::default()
            };
            let tool_manager = ToolManager::new(tool_config).ok().map(Arc::new);

            // Store state - download manager will be lazily initialized on first use
            app.manage(AppState {
                db: Arc::new(Mutex::new(db)),
                download_manager: RwLock::new(None),
                tool_manager: RwLock::new(tool_manager),
                event_tx: Arc::new(Mutex::new(None)),
            });

            // Emit ready event synchronously
            emit_app_ready(&app.handle(), None, None);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // URL and queue management
            add_urls,
            fetch_metadata,
            expand_playlist,
            extract_urls_from_text,
            // Download control
            start_download,
            stop_download,
            cancel_download,
            retry_download,
            start_all_downloads,
            stop_all_downloads,
            // Queue and history
            get_queue,
            get_history,
            clear_queue,
            clear_history,
            remove_download,
            // Settings
            get_settings,
            save_settings,
            get_window_state,
            save_window_state,
            // Tools
            get_toolchain_status,
            check_for_updates,
            update_tool,
            // Presets
            get_presets,
            // Utilities
            get_app_data_dir,
            get_app_version,
            get_default_download_dir,
            open_file,
            open_folder,
            // App updates
            check_app_update,
            install_app_update,
            restart_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
