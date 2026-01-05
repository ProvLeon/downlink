use serde::Serialize;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// Tauri event name used for all backend -> UI events.
/// The UI should subscribe once and switch on `event` to update state.
pub const DOWNLINK_EVENT_NAME: &str = "downlink://event";

/// A UI-friendly action the frontend can render as a button.
/// `kind` should be stable; the UI can map it to behavior.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ActionKind {
    ImportCookies,
    UpdateYtDlp,
    UpdateFfmpeg,
    OpenSettingsProxy,
    RetryRecommended,
    Retry,
    OpenLogs,
}

#[derive(Debug, Clone, Serialize)]
pub struct Action {
    pub kind: ActionKind,
    pub label: String,
}

/// Stable error codes to allow UX mapping and analytics (if added later).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    Unknown,
    InvalidUrl,
    Network,
    GeoRestricted,
    LoginRequired,
    BotCheck,
    ExtractorOutdated,
    FormatUnavailable,
    ToolMissing,
    ToolUnhealthy,
    PostProcessingFailed,
    Canceled,
}

/// Download status reflected in the UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Queued,
    Fetching,
    Ready,
    Downloading,
    PostProcessing,
    Stopped,
    Done,
    Failed,
    Canceled,
}

/// High-level phases shown in the UI. Keep short and human readable.
#[derive(Debug, Clone, Serialize)]
pub struct Phase {
    pub name: String,           // e.g. "Downloading", "Merging streams"
    pub detail: Option<String>, // optional extra detail
}

/// Minimal metadata for preview and queue display.
#[derive(Debug, Clone, Serialize)]
pub struct MediaInfo {
    pub title: Option<String>,
    pub uploader: Option<String>,
    pub duration_seconds: Option<u64>,
    pub thumbnail_url: Option<String>,
    pub webpage_url: Option<String>,
}

/// Progress values are best-effort; any field may be None depending on what yt-dlp reports.
#[derive(Debug, Clone, Serialize)]
pub struct Progress {
    /// 0..=100 if known.
    pub percent: Option<f64>,
    pub bytes_downloaded: Option<u64>,
    pub bytes_total: Option<u64>,
    pub speed_bps: Option<u64>,
    pub eta_seconds: Option<u64>,
    pub phase: Option<Phase>,
}

/// Tool update status and versions.
#[derive(Debug, Clone, Serialize)]
pub struct ToolVersions {
    pub app_version: String,
    pub yt_dlp_version: Option<String>,
    pub ffmpeg_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolUpdateInfo {
    pub tool: String, // "yt-dlp" | "ffmpeg"
    pub current: Option<String>,
    pub latest: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolUpdateProgressInfo {
    pub tool: String,
    pub percent: f64, // 0..=100
}

/// Backend -> UI events. Emit through `emit_event(app, ...)`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownlinkEvent {
    // Lifecycle
    AppReady {
        versions: ToolVersions,
    },

    // URL/clipboard (optional; safe to ignore in UI)
    ClipboardUrlDetected {
        url: String,
    },

    // Metadata / preview
    MetadataStarted {
        id: Uuid,
        url: String,
    },
    MetadataReady {
        id: Uuid,
        info: MediaInfo,
    },

    // Playlist expansion
    PlaylistExpanded {
        parent_id: Uuid,
        item_ids: Vec<Uuid>,
        count: usize,
    },

    // Queue / execution
    DownloadQueued {
        id: Uuid,
    },
    DownloadStarted {
        id: Uuid,
    },
    DownloadProgress {
        id: Uuid,
        status: DownloadStatus,
        progress: Progress,
    },
    DownloadPostProcessing {
        id: Uuid,
        step: String,
        detail: Option<String>,
    },
    DownloadStopped {
        id: Uuid,
    },
    DownloadCanceled {
        id: Uuid,
    },
    DownloadCompleted {
        id: Uuid,
        final_path: String,
    },

    // Failure with remediation actions
    DownloadFailed {
        id: Uuid,
        error_code: ErrorCode,
        user_message: String,
        actions: Vec<Action>,
    },

    // Tools
    ToolUpdateAvailable {
        info: ToolUpdateInfo,
    },
    ToolUpdateProgress {
        info: ToolUpdateProgressInfo,
    },
    ToolUpdateCompleted {
        tool: String,
        version: String,
    },
    ToolUpdateFailed {
        tool: String,
        user_message: String,
    },
}

/// Emit a `DownlinkEvent` to the UI.
/// The frontend should subscribe to `DOWNLINK_EVENT_NAME`.
pub fn emit_event(app: &AppHandle, event: DownlinkEvent) -> Result<(), tauri::Error> {
    app.emit(DOWNLINK_EVENT_NAME, event)
}

/// Convenience functions for common failure cases.
/// These keep error mapping consistent while the backend grows.
pub mod helpers {
    use super::*;

    pub fn action(kind: ActionKind, label: impl Into<String>) -> Action {
        Action {
            kind,
            label: label.into(),
        }
    }

    pub fn fail_login_required(id: Uuid) -> DownlinkEvent {
        DownlinkEvent::DownloadFailed {
            id,
            error_code: ErrorCode::LoginRequired,
            user_message:
                "This site requires sign-in to proceed. Import cookies from your browser and retry."
                    .to_string(),
            actions: vec![action(
                ActionKind::ImportCookies,
                "Import cookies from browser",
            )],
        }
    }

    pub fn fail_extractor_outdated(id: Uuid) -> DownlinkEvent {
        DownlinkEvent::DownloadFailed {
            id,
            error_code: ErrorCode::ExtractorOutdated,
            user_message: "Downloader engine is outdated for this site. Update yt-dlp and retry."
                .to_string(),
            actions: vec![
                action(ActionKind::UpdateYtDlp, "Update yt-dlp"),
                action(ActionKind::Retry, "Retry"),
            ],
        }
    }

    pub fn fail_format_unavailable(id: Uuid) -> DownlinkEvent {
        DownlinkEvent::DownloadFailed {
            id,
            error_code: ErrorCode::FormatUnavailable,
            user_message:
                "That quality/format isn't available for this media. Try the recommended preset."
                    .to_string(),
            actions: vec![action(
                ActionKind::RetryRecommended,
                "Use Recommended preset",
            )],
        }
    }

    pub fn fail_unknown(id: Uuid, message: impl Into<String>) -> DownlinkEvent {
        DownlinkEvent::DownloadFailed {
            id,
            error_code: ErrorCode::Unknown,
            user_message: message.into(),
            actions: vec![action(ActionKind::OpenLogs, "View logs")],
        }
    }
}
