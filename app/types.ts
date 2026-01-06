// ============================================================================
// Downlink Frontend Types
// ============================================================================

// App update info
export interface AppUpdateInfo {
  available: boolean;
  current_version: string;
  latest_version: string | null;
  release_notes: string | null;
  download_url: string | null;
}

// Queue item status
export type DownloadStatus =
  | "queued"
  | "fetching"
  | "ready"
  | "downloading"
  | "postprocessing"
  | "stopped"
  | "done"
  | "failed"
  | "canceled";

// Source kind for downloads
export type SourceKind = "single" | "playlist_parent" | "playlist_item";

// Queue item from backend
export interface QueueItem {
  id: string;
  source_url: string;
  title: string | null;
  uploader: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  status: DownloadStatus;
  phase: string | null;
  progress_percent: number | null;
  bytes_downloaded: number | null;
  bytes_total: number | null;
  speed_bps: number | null;
  eta_seconds: number | null;
  preset_id: string;
  output_dir: string;
  final_path: string | null;
  error_message: string | null;
}

// Preset info
export interface PresetInfo {
  id: string;
  name: string;
}

// Preset with hints for UI
export interface PresetWithHint extends PresetInfo {
  hint: string;
}

// Add URLs options
export interface AddUrlsOptions {
  preset_id: string;
  output_dir: string;
  parent_id: string | null;
  source_kind: SourceKind;
  // Optional metadata from preview (to avoid re-fetching)
  title?: string | null;
  uploader?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
}

// Add URLs result
export interface AddUrlsResult {
  ids: string[];
  urls: string[];
}

// Fetch metadata options
export interface FetchMetadataOptions {
  preset_id: string;
  output_dir: string;
}

// Fetch metadata result
export interface FetchMetadataResult {
  id: string;
  url: string;
  is_playlist: boolean;
  title: string | null;
  uploader: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  filesize_bytes: number | null;
  playlist_title: string | null;
  playlist_count_hint: number | null;
}

// Expand playlist options
export interface ExpandPlaylistOptions {
  preset_id: string;
  output_dir: string;
}

// Expand playlist result
export interface ExpandPlaylistResult {
  parent_id: string;
  item_ids: string[];
  count: number;
}

// Tool status
export type ToolStatus = "ok" | "outdated" | "missing" | "broken";

// Tool info
export interface ToolInfo {
  tool: string;
  path: string;
  version: string | null;
  status: ToolStatus;
  is_bundled: boolean;
  last_checked: string | null;
}

// Toolchain status
export interface ToolchainStatus {
  yt_dlp: ToolInfo | null;
  ffmpeg: ToolInfo | null;
  ffprobe: ToolInfo | null;
  overall_status: ToolStatus;
}

// User settings
export interface UserSettings {
  general: GeneralSettings;
  formats: FormatSettings;
  sponsorblock: SponsorBlockSettings;
  subtitles: SubtitleSettings;
  updates: UpdateSettings;
  privacy: PrivacySettings;
  network: NetworkSettings;
}

export interface GeneralSettings {
  download_folder: string;
  default_preset: string;
  concurrency: number;
  auto_start: boolean;
  notify_on_complete: boolean;
  minimize_to_tray: boolean;
  start_minimized: boolean;
  remember_window_state: boolean;
  show_advanced_by_default: boolean;
}

export interface FormatSettings {
  prefer_mp4: boolean;
  max_video_height: number;
  preferred_video_codec: string;
  preferred_audio_codec: string;
  embed_metadata: boolean;
  embed_thumbnail: boolean;
  write_info_json: boolean;
  filename_template: string;
}

export interface SponsorBlockSettings {
  enabled_by_default: boolean;
  mode: string;
  categories: string[];
}

export interface SubtitleSettings {
  enabled_by_default: boolean;
  default_language: string;
  include_auto_captions: boolean;
  embed_subtitles: boolean;
  preferred_format: string;
}

export interface UpdateSettings {
  auto_update_app: boolean;
  auto_update_ytdlp: boolean;
  auto_update_ffmpeg: boolean;
  check_interval_hours: number;
  last_checked: string | null;
}

export interface PrivacySettings {
  cookie_mode: string;
  cookies_path: string | null;
  clear_cookies_on_exit: boolean;
  keep_history: boolean;
  max_history_entries: number;
}

export interface NetworkSettings {
  use_proxy: boolean;
  proxy_url: string;
  rate_limit_bps: number;
  retries: number;
  concurrent_fragments: number;
  socket_timeout: number;
}

// Window state
export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  is_maximized: boolean;
}

// Event types from backend
export type DownlinkEventType =
  | "AppReady"
  | "ClipboardUrlDetected"
  | "MetadataStarted"
  | "MetadataReady"
  | "PlaylistExpanded"
  | "DownloadQueued"
  | "DownloadStarted"
  | "DownloadProgress"
  | "DownloadPostProcessing"
  | "DownloadStopped"
  | "DownloadCanceled"
  | "DownloadCompleted"
  | "DownloadFailed"
  | "ToolUpdateAvailable"
  | "ToolUpdateProgress"
  | "ToolUpdateCompleted"
  | "ToolUpdateFailed";

// Event payloads
export interface AppReadyEvent {
  event: "AppReady";
  data: {
    versions: {
      app_version: string;
      yt_dlp_version: string | null;
      ffmpeg_version: string | null;
    };
  };
}

export interface DownloadProgressEvent {
  event: "DownloadProgress";
  data: {
    id: string;
    status: string;
    progress: {
      percent: number | null;
      bytes_downloaded: number | null;
      bytes_total: number | null;
      speed_bps: number | null;
      eta_seconds: number | null;
      phase: {
        name: string;
        detail: string | null;
      } | null;
    };
  };
}

export interface DownloadCompletedEvent {
  event: "DownloadCompleted";
  data: {
    id: string;
    final_path: string;
  };
}

export interface DownloadFailedEvent {
  event: "DownloadFailed";
  data: {
    id: string;
    error_code: string;
    user_message: string;
    actions: Array<{
      kind: string;
      label: string;
    }>;
  };
}

export type DownlinkEvent =
  | AppReadyEvent
  | DownloadProgressEvent
  | DownloadCompletedEvent
  | DownloadFailedEvent
  | { event: DownlinkEventType; data: unknown };

// UI state types
export interface PreviewState {
  loading: boolean;
  url: string | null;
  metadata: FetchMetadataResult | null;
  error: string | null;
}

export interface SettingsModalState {
  isOpen: boolean;
  activeTab: "general" | "formats" | "sponsorblock" | "subtitles" | "updates" | "privacy" | "network";
}

// Helper functions for formatting
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s left`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins}m left`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m left`;
}

export function getStatusColor(status: DownloadStatus): string {
  switch (status) {
    case "queued":
    case "ready":
      return "text-zinc-500";
    case "fetching":
    case "downloading":
    case "postprocessing":
      return "text-blue-500";
    case "stopped":
      return "text-yellow-500";
    case "done":
      return "text-green-500";
    case "failed":
      return "text-red-500";
    case "canceled":
      return "text-zinc-400";
    default:
      return "text-zinc-500";
  }
}

export function getStatusLabel(status: DownloadStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "fetching":
      return "Fetching info…";
    case "ready":
      return "Ready";
    case "downloading":
      return "Downloading";
    case "postprocessing":
      return "Processing…";
    case "stopped":
      return "Stopped";
    case "done":
      return "Completed";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    default:
      return status;
  }
}
