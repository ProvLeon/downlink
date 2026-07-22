# Downlink Developer & Architectural Documentation

This document serves as the complete technical blueprint for **Downlink**. It is designed for developers who wish to understand the inner workings of the application, replicate its architecture, or build upon it to create an even better media downloading platform.

---

## 1. System Architecture

Downlink is a cross-platform desktop application built on a modern **Tauri v2** stack. It leverages web technologies for the UI while using Rust for heavy lifting and system-level operations.

### High-Level Stack
*   **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4.
*   **Backend**: Rust + Tauri 2.
*   **Database**: SQLite (via `rusqlite`) for local persistence.
*   **Media Engine**: `yt-dlp` (extraction & downloading) + `ffmpeg` (merging, remuxing, embedding).

### The "Sidecar" Pattern
Unlike typical Electron/Tauri apps that use Node.js wrappers for `youtube-dl`/`yt-dlp`, Downlink manages the actual `yt-dlp` and `ffmpeg` executable binaries as **sidecars**.
*   **Why?** `yt-dlp` frequently updates to bypass YouTube's changing anti-bot measures. Bundling it inside the app permanently would force app updates every few days.
*   **How it works**: The Rust backend (`tool_manager.rs`) handles downloading, verifying, and updating the standalone `yt-dlp` and `ffmpeg` binaries independently of the main application.

---

## 2. Core Features & Implementations

### 2.1 Download Engine Orchestration (`ytdlp.rs` & `download_manager.rs`)
The core of Downlink is its robust wrapper around `yt-dlp`. 
*   **Process Management**: Rust spawns `yt-dlp` processes, streaming `stdout` and `stderr` to parse progress (JSON logs) in real-time.
*   **Format Selection**: The UI sends a `preset_id` (e.g., `mp4_1080p`). The backend translates this into complex `yt-dlp -f` format selector strings.
*   **Metadata Fetching**: Before downloading, Downlink uses `--dump-json` to fetch video details (title, thumbnail, duration, formats). This powers the "Preview" UI.
*   **Concurrency**: Managed by `tokio` channels in Rust. Users can configure max concurrent downloads in settings.

### 2.2 Playlist & Batch Processing
*   **Pattern Expansion**: The frontend can expand patterns like `[1-10]` in URLs to automatically generate sequences.
*   **Playlist Extraction**: Rust uses `yt-dlp --flat-playlist --dump-json` to rapidly fetch all entries of a playlist without downloading them, returning a list of child items to the frontend.

### 2.3 Media Enhancements
*   **SponsorBlock**: Handled entirely via `yt-dlp` arguments (`--sponsorblock-mark all`, `--sponsorblock-remove`). Users can configure categories (sponsor, intro, outro) in the settings.
*   **Subtitles**: Managed via `--write-auto-subs` and `--sub-langs`. If `ffmpeg` is present, subtitles are muxed directly into the video container.

### 2.4 State Management & Database (`db.rs`)
The app uses a local SQLite database to ensure the queue and history survive app restarts.
*   **Queue Table**: Stores active, paused, and failed downloads.
*   **History Table**: Stores completed downloads for the user to review or re-open.
*   **Settings Table**: JSON blob of user preferences (theme, default format, paths).

---

## 3. Communication Bridge (Tauri IPC)

Downlink uses a heavily event-driven architecture to keep the React frontend perfectly synced with the Rust backend.

### 3.1 Frontend to Backend (Commands)
The frontend invokes Rust commands to trigger actions. Examples:
*   `add_urls(urls, preset_id, ...)`: Adds items to the DB and returns IDs.
*   `start_download(id)`: Tells Rust to spawn the `yt-dlp` process.
*   `fetch_metadata(url)`: Returns video metadata for the preview panel.
*   `save_settings(settings)`: Persists user configuration.

### 3.2 Backend to Frontend (Events)
Rust emits real-time events to the frontend window. This prevents polling and keeps the UI buttery smooth. Examples:
*   `DownloadProgress`: Emits bytes downloaded, ETA, speed, and percentage.
*   `DownloadCompleted`: Triggers UI confetti and moves item to history.
*   `DownloadFailed`: Returns structured error messages for the UI to display retry buttons.
*   `ToolUpdateProgress`: Emits when the app is downloading a new version of `yt-dlp` in the background.

---

## 4. User Interface Architecture

The UI is built to feel like a native application, not a website.

*   **Tailwind CSS**: Used for rapid, responsive styling with native-feeling interactions (hover states, focus rings, transitions).
*   **DnD-Kit**: Used for drag-and-drop reordering of the download queue.
*   **Radix UI**: Provides accessible, unstyled primitives for dialogs, tooltips, and dropdowns (format selection).
*   **Hooks**: Custom React hooks (`useDownlink`) abstract away the Tauri IPC layer, giving components clean interfaces like `download.progress` or `startDownload()`.

---

## 5. CI/CD & Distribution

Downlink uses a sophisticated GitHub Actions workflow (`release.yml`) for automated cross-platform distribution.

### 5.1 Build Matrix
*   **macOS**: Builds `.app` and `.dmg` for both `aarch64` (Apple Silicon) and `x86_64` (Intel).
*   **Windows**: Builds `.exe` (NSIS) and `.msi` installers.
*   **Linux**: Builds `.deb`, `.rpm`, and `.AppImage`.

### 5.2 Auto-Updater Integration
*   Tauri's `plugin-updater` is fully integrated.
*   The CI pipeline automatically signs the binaries using a private `TAURI_SIGNING_PRIVATE_KEY`.
*   It generates a `latest.json` file containing version notes, download URLs, and cryptographic signatures.
*   A specific workflow job uses `jq` and `perl` to ensure the version numbers in `latest.json` perfectly match the artifacts uploaded to the GitHub Release.

---

## 6. How to Replicate and Improve

If you are cloning this project or building something similar, focus on these areas for improvement:

### 6.1 Recommended Architectural Improvements
1.  **Format Matrix GUI**: The current implementation relies on static presets. A massive improvement would be a "Format Matrix" modal that allows power users to mix-and-match video and audio streams individually (e.g., matching 4K video with uncompressed FLAC audio).
2.  **Plugin System**: Allow community scripts to parse custom websites that `yt-dlp` doesn't natively support, or inject custom post-processing logic (e.g., automatically moving downloaded music to an iTunes/Music library).
3.  **Advanced Network Controls**: Implement per-domain bandwidth throttling limits.
4.  **Cookie Wizard**: `yt-dlp` often requires browser cookies to download age-restricted or premium content. Building an in-app wizard to extract cookies from the user's Chrome/Firefox profile would dramatically improve UX.

### 6.2 Developer Setup Guide
1.  **Prerequisites**: Install Node 18+, Rust, and have `yt-dlp` available in your system path for local dev.
2.  **Run**: `npm install` followed by `npm run tauri dev`.
3.  **Logs**: Pay close attention to the terminal running `tauri dev` for Rust panics or `yt-dlp` stderr output, as UI errors often obscure the root CLI failure.
4.  **Database**: The local SQLite DB lives in the OS AppData folder. If the app gets into a bad state during development, clearing this file is the fastest reset.

---

*End of Documentation*
