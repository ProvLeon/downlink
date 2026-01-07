//! Download Manager
//!
//! Handles the execution of downloads using yt-dlp, progress tracking, concurrency control,
//! and lifecycle management (start, stop, cancel, retry).

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows flag to prevent console window from appearing when spawning processes.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use anyhow::{anyhow, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{broadcast, mpsc, Mutex, RwLock};
use uuid::Uuid;

use crate::db::{Db, DownloadStatus};
use crate::events::{
    self, Action, ActionKind, DownlinkEvent, ErrorCode, MediaInfo, Phase, Progress,
};

/// Configuration for download execution.
#[derive(Debug, Clone)]
pub struct DownloadConfig {
    pub yt_dlp_path: PathBuf,
    pub ffmpeg_path: Option<PathBuf>,
    pub max_concurrent: usize,
    pub default_output_template: String,
}

/// Find yt-dlp binary by checking bundled sidecar first, then common installation paths.
/// This is needed because bundled macOS apps don't have access to the user's PATH.
pub fn find_ytdlp_binary() -> PathBuf {
    // First, check for bundled sidecar binary next to the executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // In macOS .app bundle, binaries are in Contents/MacOS/
            let sidecar_path = exe_dir.join("yt-dlp");
            if sidecar_path.exists() {
                log::info!("Found bundled yt-dlp sidecar at: {:?}", sidecar_path);
                return sidecar_path;
            }

            // Also check parent directories for different bundle structures
            if let Some(parent) = exe_dir.parent() {
                let resources_path = parent.join("Resources").join("yt-dlp");
                if resources_path.exists() {
                    log::info!("Found bundled yt-dlp in Resources at: {:?}", resources_path);
                    return resources_path;
                }
            }
        }
    }

    // Common paths where yt-dlp might be installed
    let common_paths = [
        // Homebrew on Apple Silicon
        "/opt/homebrew/bin/yt-dlp",
        // Homebrew on Intel Mac
        "/usr/local/bin/yt-dlp",
        // pip install --user
        "$HOME/.local/bin/yt-dlp",
        // System-wide pip
        "/usr/bin/yt-dlp",
        // pipx
        "$HOME/.local/pipx/venvs/yt-dlp/bin/yt-dlp",
        // MacPorts
        "/opt/local/bin/yt-dlp",
    ];

    for path_template in &common_paths {
        // Expand $HOME
        let expanded = if path_template.starts_with("$HOME") {
            if let Some(home) = std::env::var_os("HOME") {
                path_template.replace("$HOME", &home.to_string_lossy())
            } else {
                continue;
            }
        } else {
            path_template.to_string()
        };

        let path = PathBuf::from(&expanded);
        if path.exists() {
            log::info!("Found yt-dlp at: {:?}", path);
            return path;
        }
    }

    // Try which command as fallback (works in dev mode)
    #[cfg(not(windows))]
    if let Ok(output) = std::process::Command::new("which").arg("yt-dlp").output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                let path = PathBuf::from(&path_str);
                if path.exists() {
                    log::info!("Found yt-dlp via which: {:?}", path);
                    return path;
                }
            }
        }
    }

    // Last resort - hope it's in PATH
    log::warn!("Could not find yt-dlp in common paths, falling back to PATH lookup");
    PathBuf::from("yt-dlp")
}

/// Metadata fetched for a URL
#[derive(Debug, Clone)]
pub struct FetchedMetadata {
    pub title: Option<String>,
    pub uploader: Option<String>,
    pub duration_seconds: Option<u64>,
    pub thumbnail_url: Option<String>,
}

/// Fetch metadata for a single URL using yt-dlp --dump-json
async fn fetch_metadata_for_url(yt_dlp_path: &PathBuf, url: &str) -> Option<FetchedMetadata> {
    use tokio::process::Command;

    let mut cmd = Command::new(yt_dlp_path);
    cmd.args([
        "--dump-json",
        "--no-warnings",
        "--no-call-home",
        "--no-playlist",
        url,
    ]);

    // Hide console window on Windows
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = tokio::time::timeout(Duration::from_secs(15), cmd.output()).await;

    match output {
        Ok(Ok(output)) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Parse first line as JSON
            if let Some(line) = stdout.lines().next() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                    return Some(FetchedMetadata {
                        title: json
                            .get("title")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        uploader: json
                            .get("uploader")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        duration_seconds: json.get("duration").and_then(|v| v.as_u64()).or_else(
                            || {
                                json.get("duration")
                                    .and_then(|v| v.as_f64())
                                    .map(|f| f as u64)
                            },
                        ),
                        thumbnail_url: json
                            .get("thumbnail")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                    });
                }
            }
            None
        }
        Ok(Ok(_)) => {
            log::warn!("yt-dlp metadata fetch failed for {}", url);
            None
        }
        Ok(Err(e)) => {
            log::warn!("Failed to run yt-dlp for metadata: {}", e);
            None
        }
        Err(_) => {
            log::warn!("Metadata fetch timed out for {}", url);
            None
        }
    }
}

/// Find ffmpeg binary by checking bundled sidecar first, then common installation paths.
pub fn find_ffmpeg_binary() -> Option<PathBuf> {
    // First, check for bundled sidecar binary next to the executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let sidecar_path = exe_dir.join("ffmpeg");
            if sidecar_path.exists() {
                log::info!("Found bundled ffmpeg sidecar at: {:?}", sidecar_path);
                return Some(sidecar_path);
            }

            if let Some(parent) = exe_dir.parent() {
                let resources_path = parent.join("Resources").join("ffmpeg");
                if resources_path.exists() {
                    log::info!("Found bundled ffmpeg in Resources at: {:?}", resources_path);
                    return Some(resources_path);
                }
            }
        }
    }

    // Common paths where ffmpeg might be installed
    let common_paths = [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
        "/opt/local/bin/ffmpeg",
    ];

    for path_str in &common_paths {
        let path = PathBuf::from(path_str);
        if path.exists() {
            log::info!("Found ffmpeg at: {:?}", path);
            return Some(path);
        }
    }

    // Try which command as fallback (Unix only)
    #[cfg(not(windows))]
    if let Ok(output) = std::process::Command::new("which").arg("ffmpeg").output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                let path = PathBuf::from(&path_str);
                if path.exists() {
                    log::info!("Found ffmpeg via which: {:?}", path);
                    return Some(path);
                }
            }
        }
    }

    log::warn!("Could not find ffmpeg");
    None
}

impl Default for DownloadConfig {
    fn default() -> Self {
        Self {
            yt_dlp_path: find_ytdlp_binary(),
            ffmpeg_path: find_ffmpeg_binary(),
            max_concurrent: 2,
            default_output_template: "%(title)s [%(id)s].%(ext)s".to_string(),
        }
    }
}

/// Preset definitions with yt-dlp arguments.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub yt_dlp_args: Vec<String>,
}

impl Preset {
    pub fn builtin_presets() -> Vec<Preset> {
        vec![
            Preset {
                id: "recommended_best".to_string(),
                name: "Recommended (Best)".to_string(),
                yt_dlp_args: vec![
                    "-f".to_string(),
                    "bv*+ba/b".to_string(),
                    "--merge-output-format".to_string(),
                    "mp4".to_string(),
                ],
            },
            Preset {
                id: "mp4_1080p".to_string(),
                name: "1080p MP4".to_string(),
                yt_dlp_args: vec![
                    "-f".to_string(),
                    "bv*[height<=1080]+ba/b[height<=1080]".to_string(),
                    "--merge-output-format".to_string(),
                    "mp4".to_string(),
                ],
            },
            Preset {
                id: "mp4_best".to_string(),
                name: "Best MP4".to_string(),
                yt_dlp_args: vec![
                    "-f".to_string(),
                    "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]".to_string(),
                    "--merge-output-format".to_string(),
                    "mp4".to_string(),
                ],
            },
            Preset {
                id: "audio_m4a".to_string(),
                name: "Audio M4A".to_string(),
                yt_dlp_args: vec![
                    "-f".to_string(),
                    "ba[ext=m4a]/ba".to_string(),
                    "-x".to_string(),
                    "--audio-format".to_string(),
                    "m4a".to_string(),
                ],
            },
            Preset {
                id: "audio_mp3_320".to_string(),
                name: "Audio MP3 320".to_string(),
                yt_dlp_args: vec![
                    "-f".to_string(),
                    "ba".to_string(),
                    "-x".to_string(),
                    "--audio-format".to_string(),
                    "mp3".to_string(),
                    "--audio-quality".to_string(),
                    "320K".to_string(),
                ],
            },
        ]
    }

    pub fn get_by_id(id: &str) -> Option<Preset> {
        Self::builtin_presets().into_iter().find(|p| p.id == id)
    }
}

/// Progress parsed from yt-dlp output.
#[derive(Debug, Clone, Default)]
pub struct ParsedProgress {
    pub percent: Option<f64>,
    pub bytes_downloaded: Option<u64>,
    pub bytes_total: Option<u64>,
    pub speed_bps: Option<u64>,
    pub eta_seconds: Option<u64>,
    pub phase: Option<String>,
}

/// Download Manager handles scheduling and execution of downloads.
/// Uses lazy initialization to avoid spawning tasks before runtime is ready.
pub struct DownloadManager {
    config: DownloadConfig,
    db: Arc<Mutex<Db>>,
    event_tx: mpsc::Sender<DownlinkEvent>,
    active_downloads: Arc<RwLock<HashMap<Uuid, broadcast::Sender<()>>>>,
}

impl DownloadManager {
    /// Create a new download manager.
    /// This does NOT spawn any background tasks - all operations are on-demand.
    pub fn new(
        config: DownloadConfig,
        db: Arc<Mutex<Db>>,
        event_tx: mpsc::Sender<DownlinkEvent>,
    ) -> Self {
        Self {
            config,
            db,
            event_tx,
            active_downloads: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Start a download by ID.
    pub async fn start(&self, id: Uuid) -> Result<()> {
        // Check concurrency limit
        let active_count = self.active_downloads.read().await.len();
        if active_count >= self.config.max_concurrent {
            log::info!(
                "Concurrency limit reached ({}/{}), download {} will wait",
                active_count,
                self.config.max_concurrent,
                id
            );
            return Ok(());
        }

        // Check if already active
        if self.active_downloads.read().await.contains_key(&id) {
            log::warn!("Download {} is already active", id);
            return Ok(());
        }

        // Get download info from DB
        let mut download_info = {
            let mut db = self.db.lock().await;
            match db.get_download(id) {
                Ok(Some(row)) => row,
                Ok(None) => {
                    log::error!("Download {} not found in database", id);
                    return Err(anyhow!("Download not found"));
                }
                Err(e) => {
                    log::error!("Failed to get download {}: {}", id, e);
                    return Err(anyhow!("Database error: {}", e));
                }
            }
        };

        // Skip if not in a startable state
        match download_info.status {
            DownloadStatus::Queued | DownloadStatus::Ready | DownloadStatus::Stopped => {}
            _ => {
                log::info!(
                    "Download {} is in state {:?}, not starting",
                    id,
                    download_info.status
                );
                return Ok(());
            }
        }

        // If the download doesn't have a title, fetch metadata first
        if download_info.title.is_none() {
            log::info!("Download {} has no title, fetching metadata first", id);

            // Update status to Fetching
            {
                let mut db = self.db.lock().await;
                let _ = db.set_status(id, DownloadStatus::Fetching, Some("Fetching metadata…"));
            }

            // Emit progress event for fetching phase
            let _ = self
                .event_tx
                .send(DownlinkEvent::DownloadProgress {
                    id,
                    status: events::DownloadStatus::Fetching,
                    progress: Progress {
                        percent: None,
                        bytes_downloaded: None,
                        bytes_total: None,
                        speed_bps: None,
                        eta_seconds: None,
                        phase: Some(Phase {
                            name: "Fetching metadata…".to_string(),
                            detail: None,
                        }),
                    },
                })
                .await;

            // Fetch metadata using yt-dlp
            if let Some(metadata) =
                fetch_metadata_for_url(&self.config.yt_dlp_path, &download_info.source_url).await
            {
                log::info!("Fetched metadata for {}: title={:?}", id, metadata.title);

                // Update the database with fetched metadata
                {
                    let mut db = self.db.lock().await;
                    let _ = db.update_metadata(
                        id,
                        metadata.title.as_deref(),
                        metadata.uploader.as_deref(),
                        metadata.duration_seconds.map(|d| d as i64),
                        metadata.thumbnail_url.as_deref(),
                    );
                }

                // Update local download_info for the progress event
                download_info.title = metadata.title.clone();
                download_info.uploader = metadata.uploader.clone();
                download_info.thumbnail_url = metadata.thumbnail_url.clone();
                download_info.duration_seconds = metadata.duration_seconds.map(|d| d as i64);

                // Emit MetadataReady event so UI can update the queue display
                let _ = self
                    .event_tx
                    .send(DownlinkEvent::MetadataReady {
                        id,
                        info: MediaInfo {
                            title: metadata.title,
                            uploader: metadata.uploader,
                            duration_seconds: metadata.duration_seconds,
                            thumbnail_url: metadata.thumbnail_url,
                            webpage_url: Some(download_info.source_url.clone()),
                        },
                    })
                    .await;
            } else {
                log::warn!("Failed to fetch metadata for {}, proceeding anyway", id);
            }
        }

        // Create cancel channel
        let (cancel_tx, _) = broadcast::channel::<()>(1);
        self.active_downloads
            .write()
            .await
            .insert(id, cancel_tx.clone());

        // Update status to Downloading
        {
            let mut db = self.db.lock().await;
            let _ = db.set_status(id, DownloadStatus::Downloading, Some("Starting…"));
        }

        let _ = self
            .event_tx
            .send(DownlinkEvent::DownloadStarted { id })
            .await;

        // Spawn the download task
        let config = self.config.clone();
        let db = self.db.clone();
        let event_tx = self.event_tx.clone();
        let active_downloads = self.active_downloads.clone();
        let source_url = download_info.source_url.clone();
        let preset_id = download_info.preset_id.clone();
        let output_dir = download_info.output_dir.clone();

        tokio::spawn(async move {
            let result = execute_download(
                id,
                &source_url,
                &preset_id,
                &output_dir,
                &config,
                cancel_tx.subscribe(),
                event_tx.clone(),
            )
            .await;

            // Remove from active downloads
            active_downloads.write().await.remove(&id);

            // Update DB based on result
            let mut db_guard = db.lock().await;
            match result {
                Ok(final_path) => {
                    let _ = db_guard.set_status(id, DownloadStatus::Done, Some("Completed"));
                    let _ = event_tx
                        .send(DownlinkEvent::DownloadCompleted {
                            id,
                            final_path: final_path.unwrap_or_default(),
                        })
                        .await;
                }
                Err(DownloadError::Canceled) => {
                    let _ = db_guard.set_status(id, DownloadStatus::Canceled, Some("Canceled"));
                    let _ = event_tx.send(DownlinkEvent::DownloadCanceled { id }).await;
                }
                Err(DownloadError::Stopped) => {
                    let _ = db_guard.set_status(id, DownloadStatus::Stopped, Some("Stopped"));
                    let _ = event_tx.send(DownlinkEvent::DownloadStopped { id }).await;
                }
                Err(DownloadError::Failed {
                    code,
                    message,
                    actions,
                }) => {
                    let _ = db_guard.set_status(id, DownloadStatus::Failed, Some("Failed"));
                    let _ = event_tx
                        .send(DownlinkEvent::DownloadFailed {
                            id,
                            error_code: code,
                            user_message: message,
                            actions,
                        })
                        .await;
                }
            }
        });

        Ok(())
    }

    /// Stop a download (resumable).
    pub async fn stop(&self, id: Uuid) -> Result<()> {
        if let Some(cancel_tx) = self.active_downloads.read().await.get(&id) {
            let _ = cancel_tx.send(());
            log::info!("Sent stop signal to download {}", id);
        }
        Ok(())
    }

    /// Cancel a download (non-resumable, cleans up temp files).
    pub async fn cancel(&self, id: Uuid) -> Result<()> {
        // Stop the download first
        self.stop(id).await?;

        // Update status to canceled
        let mut db = self.db.lock().await;
        let _ = db.set_status(id, DownloadStatus::Canceled, Some("Canceled"));
        Ok(())
    }

    /// Retry a failed download.
    pub async fn retry(&self, id: Uuid) -> Result<()> {
        // Reset status to Queued and start
        {
            let mut db = self.db.lock().await;
            let _ = db.set_status(id, DownloadStatus::Queued, Some("Queued"));
        }
        self.start(id).await
    }

    /// Check if a download is currently active.
    pub async fn is_active(&self, id: Uuid) -> bool {
        self.active_downloads.read().await.contains_key(&id)
    }

    /// Get count of active downloads.
    pub async fn active_count(&self) -> usize {
        self.active_downloads.read().await.len()
    }

    /// Shutdown the download manager - stops all active downloads.
    pub async fn shutdown(&self) -> Result<()> {
        let ids: Vec<Uuid> = self.active_downloads.read().await.keys().cloned().collect();
        for id in ids {
            self.stop(id).await?;
        }
        Ok(())
    }
}

/// Error types for download execution.
#[derive(Debug)]
enum DownloadError {
    Canceled,
    Stopped,
    Failed {
        code: ErrorCode,
        message: String,
        actions: Vec<Action>,
    },
}

/// Execute a single download.
async fn execute_download(
    id: Uuid,
    url: &str,
    preset_id: &str,
    output_dir: &str,
    config: &DownloadConfig,
    mut cancel_rx: broadcast::Receiver<()>,
    event_tx: mpsc::Sender<DownlinkEvent>,
) -> Result<Option<String>, DownloadError> {
    let preset =
        Preset::get_by_id(preset_id).unwrap_or_else(|| Preset::builtin_presets()[0].clone());

    // Build yt-dlp command
    let mut args = vec![
        "--newline".to_string(),
        "--no-warnings".to_string(),
        "--no-call-home".to_string(),
        "--progress".to_string(),
        "--progress-template".to_string(),
        "download:[downlink] %(progress._percent_str)s %(progress._speed_str)s %(progress._eta_str)s %(progress._total_bytes_str)s".to_string(),
        "-o".to_string(),
        format!("{}/%(title)s [%(id)s].%(ext)s", output_dir),
    ];

    // Add preset args
    args.extend(preset.yt_dlp_args.clone());

    // Add ffmpeg location if configured
    if let Some(ref ffmpeg_path) = config.ffmpeg_path {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg_path.to_string_lossy().to_string());
    }

    // Add URL last
    args.push(url.to_string());

    log::info!("Starting download {} with args: {:?}", id, args);

    let mut cmd = Command::new(&config.yt_dlp_path);
    cmd.args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Hide console window on Windows
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| DownloadError::Failed {
        code: ErrorCode::ToolMissing,
        message: format!("Failed to start yt-dlp: {}", e),
        actions: vec![],
    })?;

    let stdout = child.stdout.take().ok_or_else(|| DownloadError::Failed {
        code: ErrorCode::Unknown,
        message: "Failed to capture stdout".to_string(),
        actions: vec![],
    })?;

    let stderr = child.stderr.take().ok_or_else(|| DownloadError::Failed {
        code: ErrorCode::Unknown,
        message: "Failed to capture stderr".to_string(),
        actions: vec![],
    })?;

    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    let mut stderr_lines: Vec<String> = Vec::new();
    let mut final_path: Option<String> = None;
    let mut last_percent: f64 = 0.0;

    // Progress regex for our custom template: [downlink] 50.5% 1.5MiB/s 00:30 100MiB
    let progress_re = Regex::new(r"\[downlink\]\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)").ok();
    // Fallback: standard yt-dlp progress line: [download]  50.5% of 100.00MiB at 1.50MiB/s ETA 00:30
    let fallback_progress_re =
        Regex::new(r"\[download\]\s+(\d+\.?\d*)%\s+of\s+(\S+)\s+at\s+(\S+)\s+ETA\s+(\S+)").ok();
    // Also match: [download]  50.5% of ~100.00MiB at 1.50MiB/s ETA 00:30
    let fallback_progress_re2 = Regex::new(r"\[download\]\s+(\d+\.?\d*)%").ok();
    let merge_re = Regex::new(r"\[Merger\]|Merging formats|\[ffmpeg\]").ok();
    let dest_re = Regex::new(r#"\[download\] Destination: (.+)"#).ok();
    let already_re = Regex::new(r#"\[download\] (.+) has already been downloaded"#).ok();
    let finished_re = Regex::new(r#"\[download\] 100%"#).ok();

    loop {
        tokio::select! {
            _ = cancel_rx.recv() => {
                log::info!("Download {} received cancel signal", id);
                let _ = child.kill().await;
                return Err(DownloadError::Stopped);
            }
            line = stdout_reader.next_line() => {
                match line {
                    Ok(Some(l)) => {
                        log::info!("yt-dlp stdout: {}", l);

                        // Try to parse progress from various formats
                        let mut parsed: Option<ParsedProgress> = None;

                        // Try our custom template first
                        if let Some(ref re) = progress_re {
                            if let Some(caps) = re.captures(&l) {
                                parsed = Some(parse_progress_line(&caps));
                            }
                        }

                        // Fallback to standard yt-dlp progress format
                        if parsed.is_none() {
                            if let Some(ref re) = fallback_progress_re {
                                if let Some(caps) = re.captures(&l) {
                                    let percent = caps.get(1).and_then(|m| m.as_str().parse::<f64>().ok());
                                    let total = caps.get(2).map(|m| m.as_str().to_string());
                                    let speed = caps.get(3).and_then(|m| parse_speed(m.as_str()));
                                    let eta = caps.get(4).and_then(|m| parse_eta(m.as_str()));
                                    parsed = Some(ParsedProgress {
                                        percent,
                                        bytes_total: total.as_deref().and_then(parse_bytes),
                                        bytes_downloaded: None,
                                        speed_bps: speed,
                                        eta_seconds: eta,
                                        phase: Some("Downloading".to_string()),
                                    });
                                }
                            }
                        }

                        // Simple fallback - just get percent
                        if parsed.is_none() {
                            if let Some(ref re) = fallback_progress_re2 {
                                if let Some(caps) = re.captures(&l) {
                                    let percent = caps.get(1).and_then(|m| m.as_str().parse::<f64>().ok());
                                    if percent.is_some() {
                                        parsed = Some(ParsedProgress {
                                            percent,
                                            bytes_total: None,
                                            bytes_downloaded: None,
                                            speed_bps: None,
                                            eta_seconds: None,
                                            phase: Some("Downloading".to_string()),
                                        });
                                    }
                                }
                            }
                        }

                        // Send progress event if we parsed something
                        if let Some(p) = parsed {
                            // Only send if percent changed significantly (avoid flooding)
                            let current_percent = p.percent.unwrap_or(0.0);
                            if (current_percent - last_percent).abs() >= 0.5 || current_percent >= 99.9 {
                                last_percent = current_percent;
                                log::info!("Progress: {}%", current_percent);
                                let _ = event_tx.send(DownlinkEvent::DownloadProgress {
                                    id,
                                    status: events::DownloadStatus::Downloading,
                                    progress: Progress {
                                        percent: p.percent,
                                        bytes_downloaded: p.bytes_downloaded,
                                        bytes_total: p.bytes_total,
                                        speed_bps: p.speed_bps,
                                        eta_seconds: p.eta_seconds,
                                        phase: Some(Phase {
                                            name: p.phase.clone().unwrap_or_else(|| "Downloading".to_string()),
                                            detail: None,
                                        }),
                                    },
                                }).await;
                            }
                        }

                        // Check for merge phase
                        if let Some(ref re) = merge_re {
                            if re.is_match(&l) {
                                log::info!("Post-processing: merging streams");
                                let _ = event_tx.send(DownlinkEvent::DownloadPostProcessing {
                                    id,
                                    step: "Merging streams".to_string(),
                                    detail: None,
                                }).await;
                            }
                        }

                        // Check for 100% complete
                        if let Some(ref re) = finished_re {
                            if re.is_match(&l) {
                                log::info!("Download complete, post-processing...");
                                let _ = event_tx.send(DownlinkEvent::DownloadProgress {
                                    id,
                                    status: events::DownloadStatus::Downloading,
                                    progress: Progress {
                                        percent: Some(100.0),
                                        bytes_downloaded: None,
                                        bytes_total: None,
                                        speed_bps: None,
                                        eta_seconds: None,
                                        phase: Some(Phase {
                                            name: "Finishing...".to_string(),
                                            detail: None,
                                        }),
                                    },
                                }).await;
                            }
                        }

                        // Capture destination path
                        if let Some(ref re) = dest_re {
                            if let Some(caps) = re.captures(&l) {
                                final_path = caps.get(1).map(|m| m.as_str().to_string());
                            }
                        }

                        // Check for already downloaded
                        if let Some(ref re) = already_re {
                            if let Some(caps) = re.captures(&l) {
                                final_path = caps.get(1).map(|m| m.as_str().to_string());
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(e) => {
                        log::error!("Error reading stdout: {}", e);
                        break;
                    }
                }
            }
            line = stderr_reader.next_line() => {
                match line {
                    Ok(Some(l)) => {
                        log::debug!("yt-dlp stderr: {}", l);
                        stderr_lines.push(l);
                    }
                    Ok(None) => {}
                    Err(e) => {
                        log::error!("Error reading stderr: {}", e);
                    }
                }
            }
        }
    }

    // Wait for process to exit
    let status = child.wait().await.map_err(|e| DownloadError::Failed {
        code: ErrorCode::Unknown,
        message: format!("Failed to wait for yt-dlp: {}", e),
        actions: vec![],
    })?;

    if !status.success() {
        let stderr_text = stderr_lines.join("\n");
        let (code, message, actions) = classify_error(&stderr_text);
        return Err(DownloadError::Failed {
            code,
            message,
            actions,
        });
    }

    Ok(final_path)
}

/// Parse progress from our custom template output.
fn parse_progress_line(caps: &regex::Captures) -> ParsedProgress {
    let percent_str = caps.get(1).map(|m| m.as_str()).unwrap_or("");
    let speed_str = caps.get(2).map(|m| m.as_str()).unwrap_or("");
    let eta_str = caps.get(3).map(|m| m.as_str()).unwrap_or("");
    let total_str = caps.get(4).map(|m| m.as_str()).unwrap_or("");

    ParsedProgress {
        percent: parse_percent(percent_str),
        speed_bps: parse_speed(speed_str),
        eta_seconds: parse_eta(eta_str),
        bytes_total: parse_bytes(total_str),
        bytes_downloaded: None, // We can calculate from percent * total if needed
        phase: Some("Downloading".to_string()),
    }
}

fn parse_percent(s: &str) -> Option<f64> {
    let cleaned = s.trim_end_matches('%').trim();
    cleaned.parse::<f64>().ok()
}

fn parse_speed(s: &str) -> Option<u64> {
    // Format: "1.5MiB/s" or "500KiB/s"
    let s = s.trim();
    if s == "N/A" || s.is_empty() {
        return None;
    }

    let re = Regex::new(r"([\d.]+)\s*(Ki?B|Mi?B|Gi?B|B)").ok()?;
    let caps = re.captures(s)?;
    let num: f64 = caps.get(1)?.as_str().parse().ok()?;
    let unit = caps.get(2)?.as_str();

    let multiplier: f64 = match unit {
        "B" => 1.0,
        "KB" | "KiB" => 1024.0,
        "MB" | "MiB" => 1024.0 * 1024.0,
        "GB" | "GiB" => 1024.0 * 1024.0 * 1024.0,
        _ => 1.0,
    };

    Some((num * multiplier) as u64)
}

fn parse_eta(s: &str) -> Option<u64> {
    // Format: "00:05:30" or "05:30" or "30" or "N/A"
    let s = s.trim();
    if s == "N/A" || s.is_empty() {
        return None;
    }

    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        1 => parts[0].parse::<u64>().ok(),
        2 => {
            let mins: u64 = parts[0].parse().ok()?;
            let secs: u64 = parts[1].parse().ok()?;
            Some(mins * 60 + secs)
        }
        3 => {
            let hours: u64 = parts[0].parse().ok()?;
            let mins: u64 = parts[1].parse().ok()?;
            let secs: u64 = parts[2].parse().ok()?;
            Some(hours * 3600 + mins * 60 + secs)
        }
        _ => None,
    }
}

fn parse_bytes(s: &str) -> Option<u64> {
    // Format: "1.5GiB" or "500MiB" or "N/A"
    let s = s.trim();
    if s == "N/A" || s.is_empty() {
        return None;
    }

    let re = Regex::new(r"([\d.]+)\s*(Ki?B|Mi?B|Gi?B|B)").ok()?;
    let caps = re.captures(s)?;
    let num: f64 = caps.get(1)?.as_str().parse().ok()?;
    let unit = caps.get(2)?.as_str();

    let multiplier: f64 = match unit {
        "B" => 1.0,
        "KB" | "KiB" => 1024.0,
        "MB" | "MiB" => 1024.0 * 1024.0,
        "GB" | "GiB" => 1024.0 * 1024.0 * 1024.0,
        _ => 1.0,
    };

    Some((num * multiplier) as u64)
}

/// Classify yt-dlp errors into user-friendly categories with remediation actions.
fn classify_error(stderr: &str) -> (ErrorCode, String, Vec<Action>) {
    let stderr_lower = stderr.to_lowercase();

    // Sign-in / cookies required
    if stderr_lower.contains("sign in")
        || stderr_lower.contains("login")
        || stderr_lower.contains("cookies")
        || stderr_lower.contains("age-restricted")
    {
        return (
            ErrorCode::LoginRequired,
            "This content requires sign-in. Import cookies from your browser and retry."
                .to_string(),
            vec![Action {
                kind: ActionKind::ImportCookies,
                label: "Import cookies from browser".to_string(),
            }],
        );
    }

    // Bot check / CAPTCHA
    if stderr_lower.contains("bot")
        || stderr_lower.contains("captcha")
        || stderr_lower.contains("confirm you're not")
    {
        return (
            ErrorCode::BotCheck,
            "The site requires verification. Import cookies from a logged-in browser session."
                .to_string(),
            vec![Action {
                kind: ActionKind::ImportCookies,
                label: "Import cookies from browser".to_string(),
            }],
        );
    }

    // Geo-restriction
    if stderr_lower.contains("not available in your country")
        || stderr_lower.contains("geo")
        || stderr_lower.contains("blocked")
    {
        return (
            ErrorCode::GeoRestricted,
            "This content is not available in your region.".to_string(),
            vec![Action {
                kind: ActionKind::OpenSettingsProxy,
                label: "Configure proxy".to_string(),
            }],
        );
    }

    // Extractor outdated
    if stderr_lower.contains("unsupported url")
        || stderr_lower.contains("no video formats")
        || stderr_lower.contains("extractor")
    {
        return (
            ErrorCode::ExtractorOutdated,
            "The downloader engine may be outdated for this site.".to_string(),
            vec![
                Action {
                    kind: ActionKind::UpdateYtDlp,
                    label: "Update yt-dlp".to_string(),
                },
                Action {
                    kind: ActionKind::Retry,
                    label: "Retry".to_string(),
                },
            ],
        );
    }

    // Format unavailable
    if stderr_lower.contains("requested format") || stderr_lower.contains("format not available") {
        return (
            ErrorCode::FormatUnavailable,
            "The requested format is not available for this content.".to_string(),
            vec![Action {
                kind: ActionKind::RetryRecommended,
                label: "Use Recommended preset".to_string(),
            }],
        );
    }

    // Network errors
    if stderr_lower.contains("network")
        || stderr_lower.contains("connection")
        || stderr_lower.contains("timeout")
        || stderr_lower.contains("timed out")
    {
        return (
            ErrorCode::Network,
            "Network error occurred. Check your connection and retry.".to_string(),
            vec![Action {
                kind: ActionKind::Retry,
                label: "Retry".to_string(),
            }],
        );
    }

    // Default: unknown error
    let message = if stderr.len() > 200 {
        format!("Download failed: {}…", &stderr[..200])
    } else if stderr.is_empty() {
        "Download failed with unknown error.".to_string()
    } else {
        format!("Download failed: {}", stderr)
    };

    (
        ErrorCode::Unknown,
        message,
        vec![
            Action {
                kind: ActionKind::Retry,
                label: "Retry".to_string(),
            },
            Action {
                kind: ActionKind::OpenLogs,
                label: "View logs".to_string(),
            },
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_percent() {
        assert_eq!(parse_percent("50.5%"), Some(50.5));
        assert_eq!(parse_percent("100%"), Some(100.0));
        assert_eq!(parse_percent("N/A"), None);
    }

    #[test]
    fn test_parse_speed() {
        assert_eq!(parse_speed("1.5MiB/s"), Some(1572864));
        assert_eq!(parse_speed("500KiB/s"), Some(512000));
        assert_eq!(parse_speed("N/A"), None);
    }

    #[test]
    fn test_parse_eta() {
        assert_eq!(parse_eta("30"), Some(30));
        assert_eq!(parse_eta("05:30"), Some(330));
        assert_eq!(parse_eta("01:05:30"), Some(3930));
        assert_eq!(parse_eta("N/A"), None);
    }

    #[test]
    fn test_classify_error_login() {
        let (code, _, _) = classify_error("Sign in to confirm your age");
        assert!(matches!(code, ErrorCode::LoginRequired));
    }

    #[test]
    fn test_classify_error_geo() {
        let (code, _, _) = classify_error("Video not available in your country");
        assert!(matches!(code, ErrorCode::GeoRestricted));
    }
}
