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
  // Feature toggles
  subtitles_enabled?: boolean;
  sponsorblock_enabled?: boolean;
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
  id: string; // Uuid
  url: string;
  stream_url?: string | null;
  is_playlist: boolean;
  title: string | null;
  uploader: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  filesize_bytes: number | null;
  playlist_title: string | null;
  playlist_count_hint: number | null;
  available_qualities: VideoQualityOption[];
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

// Preview playlist video entry
export interface PlaylistVideoPreview {
  id: string;
  url: string;
  title: string | null;
  uploader: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
}

// Preview playlist result (without adding to queue)
export interface PreviewPlaylistResult {
  playlist_title: string | null;
  videos: PlaylistVideoPreview[];
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
  transcription: TranscriptionSettings;
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

export type TranscriptionProvider = "groq" | "open_a_i" | "gemini";

export const TRANSCRIPTION_PROVIDERS: { id: TranscriptionProvider; label: string; note: string; keyLabel: string; keyLink: string }[] = [
  { id: "groq",   label: "Groq (Free)",    note: "Fast, free tier · Whisper large-v3", keyLabel: "console.groq.com → API Keys",             keyLink: "https://console.groq.com/keys" },
  { id: "open_a_i", label: "OpenAI",         note: "Paid · whisper-1 · $0.006/min",      keyLabel: "platform.openai.com → API Keys",          keyLink: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Google Gemini",   note: "Free tier · Gemini 1.5 Flash",       keyLabel: "aistudio.google.com → Get API key",       keyLink: "https://aistudio.google.com/app/apikey" },
];

export interface TranscriptionSettings {
  provider: TranscriptionProvider;
  api_key: string;
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
  | "ToolUpdateFailed"
  | "FetchProgress";

export interface FetchProgressEvent {
  event: "FetchProgress";
  data: {
    url: string;
    hint: string;
  };
}

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
  | FetchProgressEvent
  | { event: DownlinkEventType; data: unknown };

// A discrete quality option from yt-dlp's format list
export interface VideoQualityOption {
  height: number | null;
  label: string;            // "4K", "1080p", "720p", "Audio Only"
  filesize_approx: number | null;
  format_string: string;    // yt-dlp -f argument, or "custom:<fmt>" for preset_id
  is_audio_only: boolean;
}

// Per-URL preview data (used by multi-preview panel)
export interface UrlPreviewItem {
  url: string;
  loading: boolean;
  data: FetchMetadataResult | null;
  error: string | null;
  qualitiesLoading?: boolean;  // true while background yt-dlp quality fetch is running
  fetchHint?: string;          // real-time tier status hint from backend ("Scanning page…" etc.)
}

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

// ============================================================================
// URL Normalization
// ============================================================================

/**
 * Prepends `https://` to tokens that look like bare domain URLs (no scheme).
 *
 * Examples that get normalized:
 *   "youtube.com/watch?v=abc"          → "https://youtube.com/watch?v=abc"
 *   "luciferdonghua.in/episode-21/v/4" → "https://luciferdonghua.in/episode-21/v/4"
 *
 * Tokens that already have http(s):// or don't look like URLs are left alone.
 * Whitespace between tokens is preserved.
 */
export function normalizeBareUrls(text: string): string {
  // Split on whitespace (including newlines) while preserving the delimiters
  // so we can rejoin without altering the user's formatting.
  return text
    .split(/(\s+)/)
    .map((part) => {
      // Preserve whitespace tokens unchanged
      if (!part || /^\s+$/.test(part)) return part;
      // Already has a valid scheme — leave as-is
      if (/^https?:\/\//i.test(part)) return part;
      // Conservative bare-URL heuristic:
      //   - Starts with a hostname-like token (letter/digit, optional hyphens)
      //   - Contains at least one dot followed by a 2+ char TLD
      //   - Optionally followed by a path starting with /
      //   - No scheme characters (colons) before the dot
      if (
        /^[a-zA-Z0-9][a-zA-Z0-9\-]*(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/.test(
          part
        ) &&
        !part.includes(":")
      ) {
        return `https://${part}`;
      }
      return part;
    })
    .join("");
}

// ============================================================================
// URL Range Pattern Expansion
// ============================================================================

/**
 * Expands a single URL containing a [start-end] range pattern into multiple URLs.
 *
 * Examples:
 *   "https://site.com/ep-[21-24]/watch"  → 4 URLs (ep-21 … ep-24)
 *   "https://site.com/ep-[01-09]/watch"  → 9 URLs (ep-01 … ep-09, zero-padded)
 *   "https://site.com/page"              → [original url] (no pattern, passthrough)
 *
 * Only the FIRST [N-M] occurrence in the URL is expanded.
 * Capped at 500 items to prevent accidents.
 */
export function expandUrlPattern(url: string): string[] {
  const match = /\[(\d+)-(\d+)\]/.exec(url);
  if (!match) return [url];

  const raw1 = match[1];
  const raw2 = match[2];
  const start = parseInt(raw1, 10);
  const end = parseInt(raw2, 10);

  if (isNaN(start) || isNaN(end) || start > end || end - start >= 500) {
    // Pattern present but invalid or too large — pass through unchanged
    return [url];
  }

  // Preserve zero-padding if either bound has a leading zero
  const padLen =
    raw1.startsWith("0") ? raw1.length
      : raw2.startsWith("0") ? raw2.length
        : 0;

  return Array.from({ length: end - start + 1 }, (_, k) => {
    const i = start + k;
    const num = padLen > 0 ? String(i).padStart(padLen, "0") : String(i);
    return url.replace(/\[\d+-\d+\]/, num);
  });
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
