use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

/// High-level kind of a download node in the queue.
/// - `Single`: a standalone URL (video, short, etc.)
/// - `PlaylistParent`: a logical parent representing a playlist; children are `PlaylistItem`
/// - `PlaylistItem`: an individual item expanded from a playlist
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    Single,
    PlaylistParent,
    PlaylistItem,
}

/// Persistent lifecycle status for a download row.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Queued,
    Fetching,
    Ready,
    Downloading,
    PostProcessing,
    /// "Stopped but resumable" semantic. We avoid calling this Pause unless we truly pause IO.
    Stopped,
    Done,
    Failed,
    Canceled,
}

/// A more granular phase label (shown in the UI) that can change within a status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PhaseLabel(pub String);

impl PhaseLabel {
    pub fn new<S: Into<String>>(s: S) -> Self {
        Self(s.into())
    }
}

/// Normalized download progress.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Progress {
    /// 0..=100
    pub percent: Option<f64>,
    pub bytes_downloaded: Option<u64>,
    pub bytes_total: Option<u64>,
    pub speed_bps: Option<u64>,
    pub eta_seconds: Option<u64>,
}

impl Progress {
    pub fn empty() -> Self {
        Self {
            percent: None,
            bytes_downloaded: None,
            bytes_total: None,
            speed_bps: None,
            eta_seconds: None,
        }
    }
}

/// Common error codes we surface to the UI for remediation.
/// This should remain stable for UI logic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    Unknown,
    Network,
    ExtractorOutdated,
    SignInRequired,
    BotCheck,
    GeoRestricted,
    FormatUnavailable,
    ToolMissing,
    ToolFailed,
    OutputWriteFailed,
    Canceled,
}

/// Actions the UI can present as buttons when a failure occurs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RemediationAction {
    ImportCookies { label: String },
    UpdateYtDlp { label: String },
    OpenSettingsProxy { label: String },
    RetryRecommended { label: String },
    Retry { label: String },
}

impl RemediationAction {
    pub fn import_cookies() -> Self {
        Self::ImportCookies {
            label: "Import cookies from browser".to_string(),
        }
    }
    pub fn update_ytdlp() -> Self {
        Self::UpdateYtDlp {
            label: "Update yt-dlp and retry".to_string(),
        }
    }
    pub fn open_proxy_settings() -> Self {
        Self::OpenSettingsProxy {
            label: "Configure proxy…".to_string(),
        }
    }
    pub fn retry_recommended() -> Self {
        Self::RetryRecommended {
            label: "Download Recommended instead".to_string(),
        }
    }
    pub fn retry() -> Self {
        Self::Retry {
            label: "Retry".to_string(),
        }
    }
}

/// A user-facing failure that can be shown directly in UI.
///
/// Note: keep `user_message` short and actionable. Details belong in logs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UserFacingError {
    pub error_code: ErrorCode,
    pub user_message: String,
    #[serde(default)]
    pub actions: Vec<RemediationAction>,
}

/// Core persisted download record (one row in Queue/History).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: Uuid,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,

    pub source_url: String,
    pub source_kind: SourceKind,

    /// For playlist items, points to the playlist parent id.
    pub parent_id: Option<Uuid>,

    // Cached metadata for UX
    pub title: Option<String>,
    pub uploader: Option<String>,
    pub duration_seconds: Option<u64>,
    pub thumbnail_url: Option<String>,

    pub status: DownloadStatus,
    pub phase: Option<PhaseLabel>,
    pub progress: Progress,

    pub preset_id: String,
    pub output_dir: PathBuf,
    pub final_path: Option<PathBuf>,

    /// Optional temp directory used by the engine / post-processing.
    pub temp_dir: Option<PathBuf>,

    pub last_error: Option<UserFacingError>,

    /// Tool versions used for this job (best-effort snapshot)
    pub yt_dlp_version: Option<String>,
    pub ffmpeg_version: Option<String>,
}

impl DownloadItem {
    pub fn new_single<S1: Into<String>, S2: Into<String>>(
        url: S1,
        preset_id: S2,
        output_dir: PathBuf,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            created_at: now,
            updated_at: now,
            source_url: url.into(),
            source_kind: SourceKind::Single,
            parent_id: None,
            title: None,
            uploader: None,
            duration_seconds: None,
            thumbnail_url: None,
            status: DownloadStatus::Queued,
            phase: Some(PhaseLabel::new("Queued")),
            progress: Progress::empty(),
            preset_id: preset_id.into(),
            output_dir,
            final_path: None,
            temp_dir: None,
            last_error: None,
            yt_dlp_version: None,
            ffmpeg_version: None,
        }
    }

    pub fn new_playlist_parent<S1: Into<String>, S2: Into<String>>(
        playlist_url: S1,
        preset_id: S2,
        output_dir: PathBuf,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            created_at: now,
            updated_at: now,
            source_url: playlist_url.into(),
            source_kind: SourceKind::PlaylistParent,
            parent_id: None,
            title: None,
            uploader: None,
            duration_seconds: None,
            thumbnail_url: None,
            status: DownloadStatus::Fetching,
            phase: Some(PhaseLabel::new("Fetching playlist…")),
            progress: Progress::empty(),
            preset_id: preset_id.into(),
            output_dir,
            final_path: None,
            temp_dir: None,
            last_error: None,
            yt_dlp_version: None,
            ffmpeg_version: None,
        }
    }

    pub fn new_playlist_item<S: Into<String>>(
        parent_id: Uuid,
        item_url: S,
        preset_id: String,
        output_dir: PathBuf,
        title_hint: Option<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            created_at: now,
            updated_at: now,
            source_url: item_url.into(),
            source_kind: SourceKind::PlaylistItem,
            parent_id: Some(parent_id),
            title: title_hint,
            uploader: None,
            duration_seconds: None,
            thumbnail_url: None,
            status: DownloadStatus::Queued,
            phase: Some(PhaseLabel::new("Queued")),
            progress: Progress::empty(),
            preset_id,
            output_dir,
            final_path: None,
            temp_dir: None,
            last_error: None,
            yt_dlp_version: None,
            ffmpeg_version: None,
        }
    }

    pub fn set_status(&mut self, status: DownloadStatus, phase: Option<PhaseLabel>) {
        self.status = status;
        self.phase = phase;
        self.updated_at = Utc::now();
    }

    pub fn set_error(&mut self, err: UserFacingError) {
        self.last_error = Some(err);
        self.status = DownloadStatus::Failed;
        self.phase = Some(PhaseLabel::new("Failed"));
        self.updated_at = Utc::now();
    }

    pub fn mark_done(&mut self, final_path: PathBuf) {
        self.final_path = Some(final_path);
        self.status = DownloadStatus::Done;
        self.phase = Some(PhaseLabel::new("Completed"));
        self.progress.percent = Some(100.0);
        self.updated_at = Utc::now();
    }
}

/// Preset definition used to map UX choices to engine args.
///
/// v1: we store args as arrays of strings so they can be passed safely to subprocess calls.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub description: String,

    /// yt-dlp arguments for this preset. Ex: ["-f", "bv*+ba/b", "--merge-output-format", "mp4"]
    #[serde(default)]
    pub yt_dlp_args: Vec<String>,

    /// ffmpeg arguments for this preset (used when we run ffmpeg explicitly).
    #[serde(default)]
    pub ffmpeg_args: Vec<String>,
}

/// User toggles that can be applied to any preset without creating a new preset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureToggles {
    pub sponsorblock_enabled: bool,
    /// SponsorBlock categories (e.g. "sponsor", "intro")
    #[serde(default)]
    pub sponsorblock_categories: Vec<String>,
    /// "cut" or "chapters" (or future values)
    pub sponsorblock_mode: Option<String>,

    pub subtitles_enabled: bool,
    pub subtitles_language: Option<String>,
    pub subtitles_embed: bool,
    pub subtitles_auto_captions: bool,

    pub embed_metadata: bool,
    pub embed_thumbnail: bool,
}

impl Default for FeatureToggles {
    fn default() -> Self {
        Self {
            sponsorblock_enabled: false,
            sponsorblock_categories: vec![],
            sponsorblock_mode: None,
            subtitles_enabled: false,
            subtitles_language: Some("en".to_string()),
            subtitles_embed: false,
            subtitles_auto_captions: false,
            embed_metadata: true,
            embed_thumbnail: true,
        }
    }
}

/// Tool identifiers managed by Downlink.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tool {
    YtDlp,
    Ffmpeg,
    Ffprobe,
}

/// An installed tool instance (bundled or updated) with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInstall {
    pub tool: Tool,
    pub version: Option<String>,
    pub path: PathBuf,

    /// If this tool is the bundled tool shipped with the app.
    pub is_bundled: bool,

    /// Last time we verified it via a health check.
    pub last_checked_at: Option<DateTime<Utc>>,
}

/// Simple health status for tools.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolStatus {
    Ok,
    Outdated,
    Missing,
    Broken,
}

/// Current toolchain snapshot shown to UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolchainStatus {
    pub yt_dlp: Option<ToolInstall>,
    pub ffmpeg: Option<ToolInstall>,
    pub ffprobe: Option<ToolInstall>,
    pub status: ToolStatus,
}

/// Metadata returned by `yt-dlp --dump-json` for preview.
/// Keep this intentionally small; store raw JSON in logs if needed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewMetadata {
    pub url: String,
    pub title: Option<String>,
    pub uploader: Option<String>,
    pub duration_seconds: Option<u64>,
    pub thumbnail_url: Option<String>,

    /// If the URL or metadata indicates a playlist. When present, we will expand.
    pub is_playlist: bool,
    pub playlist_title: Option<String>,
    pub playlist_count_hint: Option<u64>,
}

/// A single expanded playlist entry returned during enumeration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistEntry {
    pub url: String,
    pub title: Option<String>,
    pub uploader: Option<String>,
    pub duration_seconds: Option<u64>,
    pub thumbnail_url: Option<String>,
}
