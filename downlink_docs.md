# Downlink — Product & Technical Design Document (v1)

**Document owner:** Engineering  
**Audience:** Product, Engineering, Design, QA, Release  
**Last updated:** 2026-01-05

---

## 1. Executive Summary

Downlink is a **cross-platform, lightweight, standalone desktop application** for downloading online media using **yt-dlp** as the extraction/downloading engine and **ffmpeg** for post-processing. Downlink prioritizes:

- **Best-in-class UX**: paste → preview → download, minimal friction
- **Performance**: fast perceived UI, robust concurrent downloads, scalable queue
- **Reliability**: structured progress/events, actionable errors, strong update strategy
- **Cross-platform standalone packaging**: macOS/Windows/Linux, bundling `yt-dlp` + `ffmpeg`
- **Power features without clutter**: playlists with per-item entries, subtitles, SponsorBlock, metadata embedding, template filenames, cookies import

This document defines the v1 product scope, interaction model, architecture, data model, event contract, packaging, auto-update design, security/privacy posture, test plan, and delivery milestones.

---

## 2. Goals & Non-Goals

### 2.1 Goals
1. **Desktop-only**, cross-platform: macOS, Windows, Linux.
2. **Standalone**: ships with `yt-dlp` + `ffmpeg` (no external dependency installs required).
3. **Single-window** experience with:
   - URL entry + preview
   - Quick presets
   - Queue + history
   - Advanced panel/drawer for expert options
4. **Best UX**:
   - Multi-URL paste (batch queue creation)
   - Playlists expand to per-video queue entries (better UX)
   - Clear phases: fetching, downloading, merging, embedding, sponsorblock processing
   - Friendly, actionable error messages
5. **Performance & correctness**:
   - Responsive UI at all times
   - Concurrent downloads with deterministic queue behavior
   - Robust parsing of progress and media items
6. **Auto-update**:
   - App updates
   - Tool updates (`yt-dlp`, `ffmpeg`) independently, safely, atomically
7. Must-have features:
   - **Playlists** (expanded per item)
   - **SponsorBlock**
   - **Subtitles** (download + embed)
   - **Metadata** (embed tags, thumbnail)
   - **Cookies/login** (import from browser, on-demand)

### 2.2 Non-Goals (v1)
- Mobile apps (iOS/Android).
- Cloud sync of settings or history.
- Account systems.
- Built-in browsing of websites; user provides URLs.
- True “pause” at network socket level (we implement stop/resume semantics; see §10.3).
- DRM circumvention.
- Advanced editing UI for chapters beyond SponsorBlock integration.

---

## 3. Product Positioning & UX Principles

### 3.1 Positioning
**Consumer-first** and minimal: “It just works.”  
Power tools are available via an **Advanced drawer** and Preferences, not forced upfront.

### 3.2 UX Principles
1. **Two actions to success**: paste (or auto-detect) + download.
2. **Presets first**: show recommended options, hide format matrix by default.
3. **Immediate feedback**: metadata previews and queue creation are fast and clearly staged.
4. **Honest controls**: “Stop (resumable)” instead of “Pause” unless semantics are true pause.
5. **Actionable errors**: translate engine errors into remediation steps (“Import cookies”, “Update yt-dlp”, etc.).
6. **Safe by default**: avoid re-encoding unless explicitly requested; prefer remux/merge.

---

## 4. Target Platforms & Packaging

### 4.1 Platforms
- macOS (Apple Silicon + Intel, ideally Universal build)
- Windows (x64)
- Linux (x64; AppImage preferred; optionally deb/rpm later)

### 4.2 Standalone Distribution
- Bundle sidecar binaries:
  - `yt-dlp` (platform-specific)
  - `ffmpeg` (platform-specific; include `ffprobe` if helpful for validations)
- App resources include initial tool versions.
- Post-install tools can be updated into an **app-managed tools directory** (user-writable), separate from signed app bundle on macOS.

### 4.3 Code Signing
- macOS: Developer ID + notarization, hardened runtime.
- Windows: Authenticode code signing.
- Linux: standard packaging signatures as applicable.

---

## 5. User Stories (Representative)

1. **Single URL download (default)**  
   As a user, I paste a URL, see a preview, click Download, and get the best quality file.

2. **Batch download**  
   As a user, I paste 10 URLs at once and Downlink queues all of them with the chosen preset.

3. **Playlist download (expanded)**  
   As a user, I paste a playlist URL and Downlink expands it into individual items so I can cancel/retry specific videos.

4. **Audio extraction**  
   As a user, I select “Audio only (MP3 320)” and Downlink outputs an MP3 file with metadata.

5. **Subtitles**  
   As a user, I download subtitles in English and embed them into the output.

6. **SponsorBlock**  
   As a user, I remove sponsor segments from the video automatically.

7. **Cookies-required download**  
   As a user, when a download fails due to sign-in, Downlink tells me to import cookies from my browser and retries.

8. **Update engine**  
   As a user, if downloads break because of site changes, I can update `yt-dlp` and retry easily.

---

## 6. UX / UI Information Architecture

### 6.1 Single Window Layout
**Top Bar**
- URL field (supports paste, enter)
- Paste button (optional)
- Destination folder picker
- Settings icon

**Preview Panel (center)**
- Thumbnail, title, uploader, duration
- Preset selector (Recommended, 1080p MP4, etc.)
- Primary button: **Download** (with dropdown: Video/Audio/Subtitles)
- Quick toggles:
  - Subtitles: Off / On (or language shortcut)
  - SponsorBlock: Off / On

**Bottom Panel**
- Tabs: **Queue** | **History**
- Queue row shows:
  - Title, source icon/type
  - Status (phase)
  - Progress bar
  - Speed, ETA
  - Actions: Stop/Resume, Cancel, Open Folder, Retry

### 6.2 Multi-URL Paste Behavior
When paste input contains multiple URLs:
- Prompt: “Add N items to queue?”
- Options:
  - **Add N items** (primary)
  - Preview first
  - Cancel

### 6.3 Playlist Handling (v1 requirement)
When playlist URL detected:
- Fetch playlist metadata quickly.
- Expand into child items:
  - Show playlist header row (optional) and child video rows.
  - Allow per-item actions (cancel one item).
- Provide “Download all / stop all / retry failed” controls.

### 6.4 Advanced Drawer
Collapsed by default; contains:
- Format matrix (container, codec, resolution, bitrate, fps)
- Output template and preview filename
- SponsorBlock categories (Sponsor/Intro/Outro/etc.) and mode (cut vs chapters)
- Subtitles:
  - Language selection
  - Auto captions toggle
  - Embed vs separate file
- Cookies:
  - Import from browser (Chrome/Edge/Firefox)
  - Use cookies file
  - Forget cookies
- Network:
  - Proxy
  - Rate limit
  - Retries
  - Concurrent fragments
- Post-processing:
  - Remux preferences
  - Force re-encode (explicit, with warnings)

### 6.5 Error Messaging (Example Mappings)
Convert common engine patterns into UI-level explanations + actions:
- Bot/sign-in required:
  - “This site requires sign-in to proceed.” → “Import cookies from browser”
- Extractor outdated:
  - “Downloader engine is outdated.” → “Update yt-dlp and retry”
- Geo-restricted:
  - “Not available in your region.” → “Configure proxy…”
- Format unavailable:
  - “That quality isn’t available.” → “Use Recommended”

---

## 7. Technical Architecture Overview

### 7.1 Stack Recommendation
- **UI:** Tauri (WebView-based UI)
- **Core backend:** Rust (download manager, persistence, tool orchestration)
- **Engines:** `yt-dlp` + `ffmpeg` sidecar binaries

> Rationale: small bundle footprint, strong performance, safe native integration, good auto-update story, clean separation between UX and tool orchestration.

### 7.2 High-Level Components
1. **UI Layer**
   - States: idle, metadata loading, ready, queue active, errors
   - Renders queue and progress
   - Sends commands to backend (add URL(s), start stop cancel, update tools, preferences)
2. **Core Download Manager (Rust)**
   - Owns queue scheduling, state machine, concurrency
   - Persists jobs, events, history to SQLite
   - Spawns `yt-dlp`/`ffmpeg` processes
   - Parses output into structured events
3. **Tools Manager**
   - Locates tools (bundled vs updated in app-managed dir)
   - Validates versions
   - Updates tools using manifest + checksums
   - Performs atomic swaps
4. **Error Translator**
   - Converts raw errors into consistent `error_code`, `user_message`, `actions[]`

### 7.3 Process Model
- Each download item maps to a managed subprocess (or pipeline of subprocesses):
  - `yt-dlp` download (may call ffmpeg indirectly depending on args)
  - optional separate `ffmpeg` step (SponsorBlock cut/remux/embed subs)
- Strict control of stdout/stderr capture.
- No unbounded output accumulation; stream parse and store limited logs per job.

---

## 8. Data Model (SQLite)

### 8.1 Tables (Proposed)
#### `downloads`
- `id` (UUID / integer)
- `created_at`, `updated_at`
- `source_url` (text)
- `source_kind` (enum: single, playlist_parent, playlist_item)
- `parent_id` (nullable; links playlist items)
- `title` (text, nullable until known)
- `uploader` (text, nullable)
- `duration_seconds` (int, nullable)
- `thumbnail_url` (text, nullable)
- `status` (enum: queued, fetching, ready, downloading, postprocessing, paused, done, failed, canceled)
- `phase` (text, e.g., "Downloading", "Merging", "Embedding subtitles")
- `preset_id` (text)
- `output_dir` (text)
- `final_path` (text, nullable)
- `temp_dir` (text, nullable)
- `progress_percent` (real, nullable)
- `bytes_downloaded`, `bytes_total` (int, nullable)
- `speed_bps` (int, nullable)
- `eta_seconds` (int, nullable)
- `error_code` (text, nullable)
- `error_message` (text, nullable)
- `engine_version` (`yt_dlp_version`, nullable)
- `toolchain_version` (app + tools snapshot id, nullable)

#### `download_logs`
- `id`
- `download_id`
- `ts`
- `stream` (stdout/stderr)
- `line` (text)

> Log retention: store last N lines per download (configurable, e.g., 2000) to avoid bloat.

#### `presets`
- `id` (text)
- `name`
- `description`
- `yt_dlp_args_json` (json)
- `ffmpeg_args_json` (json)
- `default` (bool)

#### `settings`
- `key` (text primary key)
- `value_json` (json)

#### `tools`
- `tool` (yt-dlp / ffmpeg)
- `version`
- `path`
- `last_checked_at`
- `update_channel` (stable)
- `status` (ok/outdated/broken)

### 8.2 Job State Machine
- `queued` → `fetching` → `ready` → `downloading` → `postprocessing` → `done`
- Any state can go to `failed` or `canceled`.
- `paused` is semantic “stopped but resumable” (see §10.3).

---

## 9. Backend ↔ UI Contract (Commands + Events)

### 9.1 UI → Backend Commands
- `AddUrls(urls: string[], options?: AddOptions)`
- `FetchMetadata(download_id | url)`
- `StartDownload(download_id)`
- `StartAll()`
- `StopDownload(download_id)` (resumable stop)
- `CancelDownload(download_id)` (non-resumable; cleans temp)
- `RetryDownload(download_id)`
- `SetPreset(download_id, preset_id)`
- `SetDestination(download_id | global, path)`
- `UpdateTools({yt_dlp?: bool, ffmpeg?: bool})`
- `CheckToolStatus()`
- `ImportCookies(source: BrowserKind)`
- `ForgetCookies()`
- `OpenFile(path)` / `OpenFolder(path)` (UI may do this directly depending on platform APIs)

### 9.2 Backend → UI Events (Structured)
- `AppReady { versions }`
- `ClipboardUrlDetected { url }` (optional)
- `MetadataStarted { id, url }`
- `MetadataReady { id, info }`
- `PlaylistExpanded { parent_id, item_ids, count }`
- `DownloadQueued { id }`
- `DownloadStarted { id }`
- `DownloadProgress { id, percent, bytes_downloaded, bytes_total, speed_bps, eta_seconds, phase }`
- `DownloadPostProcessing { id, step, detail }`
- `DownloadStopped { id }`
- `DownloadCanceled { id }`
- `DownloadCompleted { id, final_path }`
- `DownloadFailed { id, error_code, user_message, actions: Action[] }`
- `ToolUpdateAvailable { tool, current, latest }`
- `ToolUpdateProgress { tool, percent }`
- `ToolUpdateCompleted { tool, version }`
- `ToolUpdateFailed { tool, user_message }`

### 9.3 Error `Action` objects
Examples:
- `{ kind: "IMPORT_COOKIES", label: "Import cookies from browser" }`
- `{ kind: "UPDATE_YTDLP", label: "Update yt-dlp and retry" }`
- `{ kind: "OPEN_SETTINGS_PROXY", label: "Configure proxy" }`
- `{ kind: "RETRY_RECOMMENDED", label: "Download Recommended instead" }`

---

## 10. Tool Orchestration (yt-dlp + ffmpeg)

### 10.1 Running yt-dlp
Recommendations:
- Use `--dump-json` / `--flat-playlist` (when appropriate) to quickly enumerate playlist entries.
- Use structured progress output (progress templates) to avoid fragile parsing.
- Force consistent locale (set env like `LC_ALL=C`) to keep outputs stable where applicable.
- Store raw output lines for diagnostics but parse into normalized progress.

### 10.2 Playlist Expansion Strategy (Per-item UX)
**Requirement:** Playlist becomes per-video items in queue.

Approach:
1. Create a `playlist_parent` job with `source_url`.
2. Fetch playlist entries:
   - Quick enumeration phase to gather entry URLs/IDs/titles.
   - Create `playlist_item` jobs for each entry with `parent_id`.
3. Schedule item jobs like normal.
4. Parent job reflects aggregate progress:
   - `% = completed_items / total_items`
   - Show "N of M completed" and a condensed ETA (best-effort).

Notes:
- Some playlist entries may be unavailable; mark those items failed with reason, but keep the playlist flowing.
- Provide “Retry failed items” at the playlist level.

### 10.3 Stop/Resume Semantics
We implement:
- **Stop**: terminate current `yt-dlp` process for that item, keep partial files if resumable.
- **Resume**: restart `yt-dlp` with the same output template/path. yt-dlp can resume if partial file is present and server supports it.

UI copy:
- Use “Stop” / “Resume” (or “Stop (resumable)” where needed), not “Pause”.

### 10.4 Post-processing Pipeline
We prefer “no re-encode” defaults:
- Merge video+audio streams (container merge) where possible.
- Remux to MP4 for compatibility when user chooses MP4 presets.
- Embed metadata and thumbnail where supported.
- Subtitles:
  - Download `.vtt`/`.srt`
  - If “embed” chosen, convert/attach using ffmpeg (container-dependent)
- SponsorBlock:
  - Prefer yt-dlp integration where possible.
  - If cutting requires lossless cut:
    - Use ffmpeg with chapter/segment mapping.
    - Warn if exact lossless cut isn’t possible and may require re-encode (avoid by default).

---

## 11. Presets (v1 defaults)

### 11.1 Core Presets
- `recommended_best`
  - “Best quality (recommended)”
  - Prefer original streams; merge as needed; minimal post-processing.
- `mp4_1080p`
  - “1080p MP4 (best compatibility)”
  - Select best <=1080p; remux to mp4 if needed.
- `mp4_best`
  - “Best MP4”
- `audio_m4a`
  - “Audio M4A (fastest)”
- `audio_mp3_320`
  - “Audio MP3 320”
  - Extract audio, encode MP3 (explicitly uses ffmpeg; CPU cost)

### 11.2 Optional Toggles (apply on top)
- Embed metadata
- Embed thumbnail
- Write subtitles (choose language)
- Embed subtitles
- SponsorBlock enabled + categories and mode

---

## 12. Tools Update Design

### 12.1 Requirements
- Safe, atomic updates for `yt-dlp` and `ffmpeg`.
- Works across OSes.
- Does not break code signing and notarization behavior (especially macOS).
- Can roll back if tool fails health checks.

### 12.2 Strategy
- Maintain an app-managed `tools/` directory per user.
- On startup:
  - Decide tool paths:
    1) prefer updated tools if healthy
    2) else fall back to bundled tools
- Health checks:
  - `yt-dlp --version` and a trivial command (when possible)
  - `ffmpeg -version`, `ffprobe -version`

### 12.3 Update Flow
1. Check for latest versions (based on a manifest URL controlled by project).
2. Download to a temp file.
3. Verify checksum/signature.
4. Replace via atomic rename.
5. Re-run health checks.
6. If failing, rollback to previous tool.

### 12.4 Triggering Updates
- On app start (rate-limited, e.g., once per 24h)
- When failures match known “outdated extractor” patterns
- Manual “Check now” in Settings

---

## 13. Privacy & Security Posture

### 13.1 Data Minimization
- Store only what is necessary:
  - download URLs (required for history and retry)
  - metadata for UI
  - limited logs for debugging
- No telemetry in v1 (unless explicitly introduced later with opt-in).

### 13.2 Cookies Handling
- Cookies import is **on-demand**, explicit user action.
- Default is pass-through; avoid storing long-term where possible.
- Provide “Forget cookies” and show where they are stored.
- Document clearly: cookies enable authenticated downloads and may grant account access; user controls it.

### 13.3 Filesystem Permissions
- Use user-selected output directories.
- Avoid broad access; keep temp files in app storage.
- On macOS, align with sandboxing / required entitlements (depending on packaging approach).

### 13.4 Threat Model (Practical)
- Malicious URLs: treat all external inputs as untrusted.
- Tool execution safety:
  - never pass user input unsafely to shell; invoke subprocess with args array
  - sanitize file paths and templates
- Downloaded artifacts are untrusted by nature; avoid auto-executing anything.

---

## 14. Observability & Diagnostics

### 14.1 Logs
- Per-download rolling log buffer stored in SQLite or files.
- Global app log for tool updates and scheduler decisions.

### 14.2 “Copy Debug Info”
Provide a UI action:
- includes app version, OS version, tool versions, and last N lines of a selected job log.

---

## 15. Performance Targets

### 15.1 UX Performance
- App cold start: aim < 1.5s perceived readiness on modern hardware.
- Metadata fetch UI response: immediate skeleton within 50ms; show results as they arrive.

### 15.2 Download Performance
- Default concurrency = 2 (adjustable).
- Avoid over-parsing output; throttle progress events (e.g., 5–10/sec per job max).

### 15.3 Resource Use
- Favor remux/merge vs re-encode.
- Limit memory growth by streaming process IO and capping logs.

---

## 16. Testing Plan

### 16.1 Unit Tests (Core)
- URL parsing and de-dup for multi-paste
- Job state machine transitions
- Progress parsing and event normalization
- Error translation mapping
- Tool path selection and fallback

### 16.2 Integration Tests
- Spawn `yt-dlp` in a controlled environment with known small test sources (as feasible).
- Verify playlist expansion into items.
- Verify post-processing steps triggered by toggles (subs, metadata, sponsorblock).

### 16.3 End-to-End Tests
- Smoke suite per OS:
  - single video, audio only, subtitles, sponsorblock on/off
  - playlist with multiple entries and per-item cancel/retry
  - tool update flow (mocked manifest / local server in CI if permitted)

### 16.4 QA Matrix
- macOS: arm64 + x64, Gatekeeper/notarization checks
- Windows: Defender prompts, file path edge cases, long path handling
- Linux: AppImage execution permissions, common desktop environments

---

## 17. Release Plan (Milestones)

### Milestone 0 — Foundations
- Tauri shell + Rust core scaffolding
- SQLite schema + migrations
- Tool bundling layout (initial versions)

### Milestone 1 — Core UX loop
- URL paste → metadata → preview
- Presets
- Single item download with progress
- Queue list + persistence

### Milestone 2 — Batch + Playlist Expansion (v1 requirement)
- Multi-URL paste → multiple queue items
- Playlist expansion to per-item jobs
- Parent aggregate row + controls

### Milestone 3 — Power features (v1 requirement)
- Subtitles download + embed option
- SponsorBlock integration
- Metadata + thumbnail embedding
- Cookies import flow

### Milestone 4 — Updates + Packaging
- App auto-update
- Tool updates with manifest + checksum + rollback
- Sign/notarize; installers per platform

### Milestone 5 — Polish & Hardening
- Error mapping improvements
- Better advanced drawer
- “Copy debug info”
- Performance tuning and UX refinements

---

## 18. Open Questions / Decisions to Confirm

1. **Playlist UI representation**
   - Do we display a collapsible playlist header row, or just the expanded items with grouping?
2. **SponsorBlock implementation strategy**
   - Use yt-dlp flags only, or include additional ffmpeg logic for lossless cuts where possible?
3. **Cookies persistence**
   - Store imported cookies encrypted at rest (platform keychain) vs ephemeral use-only?
4. **Preset philosophy**
   - “MP4 by default” vs “best original by default” (compatibility vs fidelity).
5. **Update manifest hosting**
   - Who hosts the tool manifest and how do we sign it?

---

## Appendix A — UX Copy Guidelines (Draft)
- Prefer short verbs: Download, Stop, Resume, Retry, Open Folder
- Phases:
  - Fetching info…
  - Queued
  - Downloading…
  - Merging streams…
  - Embedding subtitles…
  - Writing metadata…
  - Applying SponsorBlock…
  - Completed
  - Failed (with reason + action)

---

## Appendix B — Suggested Default Settings (Draft)
- Concurrency: 2
- Auto-start: on
- Default preset: Recommended
- Subtitles: off
- SponsorBlock: off
- Auto-update app: on
- Auto-update yt-dlp: on (daily check)
- Auto-update ffmpeg: off by default (less frequent changes), or monthly

---

## Appendix C — Legal / Compliance Notes (Non-legal advice)
- Downloading content may violate site ToS; users are responsible.
- Avoid site-specific branding in marketing that implies endorsement.
- Do not implement DRM circumvention.

---
