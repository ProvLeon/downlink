use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows flag to prevent console window from appearing when spawning processes.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Where to find yt-dlp.
#[derive(Debug, Clone)]
pub struct YtDlpConfig {
    /// Absolute path to `yt-dlp` binary (preferred for deterministic packaging).
    pub yt_dlp_path: PathBuf,

    /// Optional extra arguments injected into every yt-dlp call (e.g., proxy).
    pub global_args: Vec<String>,

    /// Timeout for metadata enumeration calls (not for downloads).
    pub metadata_timeout: Duration,
}

impl YtDlpConfig {
    pub fn new(yt_dlp_path: PathBuf) -> Self {
        Self {
            yt_dlp_path,
            global_args: vec![],
            metadata_timeout: Duration::from_secs(30),
        }
    }
}

/// Minimal preview metadata for the UI.
#[derive(Debug, Clone)]
pub struct PreviewMetadata {
    pub url: String,
    pub title: Option<String>,
    pub uploader: Option<String>,
    pub duration_seconds: Option<u64>,
    pub thumbnail_url: Option<String>,
    pub filesize_bytes: Option<u64>,

    pub is_playlist: bool,
    pub playlist_title: Option<String>,
    pub playlist_count_hint: Option<u64>,
}

/// A single playlist entry returned by enumeration.
#[derive(Debug, Clone)]
pub struct PlaylistEntry {
    pub url: String,
    pub title: Option<String>,
    pub uploader: Option<String>,
    pub duration_seconds: Option<u64>,
    pub thumbnail_url: Option<String>,
}

/// Low-level execution result.
#[derive(Debug, Clone)]
pub struct YtDlpOutput {
    /// Raw stdout lines captured (bounded).
    pub stdout_lines: Vec<String>,
    /// Raw stderr lines captured (bounded).
    pub stderr_lines: Vec<String>,
    /// Exit code if available.
    pub exit_code: Option<i32>,
}

/// Error categories we can map to user-facing remediation later.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum YtDlpErrorKind {
    NotFound,
    Timeout,
    InvalidJson,
    NonZeroExit,
}

#[derive(Debug)]
pub struct YtDlpError {
    pub kind: YtDlpErrorKind,
    pub message: String,
    pub output: Option<YtDlpOutput>,
}

impl std::fmt::Display for YtDlpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for YtDlpError {}

/// Primary runner for metadata and playlist operations.
#[derive(Debug, Clone)]
pub struct YtDlpRunner {
    cfg: YtDlpConfig,
}

impl YtDlpRunner {
    pub fn new(cfg: YtDlpConfig) -> Self {
        Self { cfg }
    }

    pub fn yt_dlp_path(&self) -> &Path {
        &self.cfg.yt_dlp_path
    }

    /// Fetch metadata for a URL via `yt-dlp --dump-json`.
    ///
    /// Notes:
    /// - This is intended for preview and playlist detection.
    /// - It uses a timeout (configurable).
    /// - It does NOT download media.
    pub async fn fetch_metadata(&self, url: &str) -> Result<(PreviewMetadata, YtDlpOutput)> {
        let args = vec![
            "--dump-json".to_string(),
            "--no-warnings".to_string(),
            "--no-call-home".to_string(),
            "--newline".to_string(),
            url.to_string(),
        ];

        let (json_lines, output) = self
            .exec_json_lines(&args, self.cfg.metadata_timeout)
            .await?;
        let first = json_lines
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("yt-dlp returned no JSON output"))?;

        let meta = parse_preview_metadata(&first, url)?;

        Ok((meta, output))
    }

    /// Enumerate a playlist into per-item entries.
    ///
    /// This is the key v1 UX behavior: playlist expands to individual queue items.
    ///
    /// Strategy:
    /// - Prefer `--flat-playlist --dump-json` for fast enumeration of entries.
    /// - Each line is a JSON object representing the playlist entry.
    ///
    /// Caveats:
    /// - Some extractors don't provide full `webpage_url` in flat mode; we attempt to build a URL.
    /// - If URLs can't be determined, we still return entries with best-effort URL.
    pub async fn enumerate_playlist(
        &self,
        playlist_url: &str,
    ) -> Result<(Vec<PlaylistEntry>, YtDlpOutput)> {
        let args = vec![
            "--flat-playlist".to_string(),
            "--dump-json".to_string(),
            "--no-warnings".to_string(),
            "--no-call-home".to_string(),
            "--newline".to_string(),
            playlist_url.to_string(),
        ];

        let (json_lines, output) = self
            .exec_json_lines(&args, self.cfg.metadata_timeout)
            .await?;

        let mut entries = Vec::with_capacity(json_lines.len());
        for line in json_lines {
            if line.trim().is_empty() {
                continue;
            }
            match parse_playlist_entry(&line, playlist_url) {
                Ok(e) => entries.push(e),
                Err(_) => {
                    // For enumeration we don't want a single bad entry to kill the playlist.
                    // We can improve this by collecting per-entry parse errors later.
                    continue;
                }
            }
        }

        Ok((entries, output))
    }

    /// Execute yt-dlp and return each stdout line that parses as a JSON object.
    ///
    /// - Captures bounded stdout/stderr logs for diagnostics.
    /// - Fails on non-zero exit.
    async fn exec_json_lines(
        &self,
        args: &[String],
        timeout: Duration,
    ) -> Result<(Vec<String>, YtDlpOutput)> {
        // Prefer explicit binary path; check existence early for nicer errors.
        if !self.cfg.yt_dlp_path.exists() {
            return Err(YtDlpError {
                kind: YtDlpErrorKind::NotFound,
                message: format!("yt-dlp not found at {}", self.cfg.yt_dlp_path.display()),
                output: None,
            }
            .into());
        }

        let mut cmd = Command::new(&self.cfg.yt_dlp_path);
        cmd.args(&self.cfg.global_args)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Hide console window on Windows
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd.spawn().with_context(|| {
            format!("failed to spawn yt-dlp: {}", self.cfg.yt_dlp_path.display())
        })?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow!("failed to capture yt-dlp stdout"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow!("failed to capture yt-dlp stderr"))?;

        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();

        // Bound log capture to avoid unbounded memory use.
        const MAX_STDOUT_LINES: usize = 20_000;
        const MAX_STDERR_LINES: usize = 20_000;

        let mut stdout_lines: Vec<String> = Vec::new();
        let mut stderr_lines: Vec<String> = Vec::new();
        let mut json_lines: Vec<String> = Vec::new();

        // Read concurrently-ish in a simple loop. This is fine for metadata sized output.
        // If it becomes a perf issue, we can select over streams.
        let read_task = async {
            loop {
                tokio::select! {
                    line = stdout_reader.next_line() => {
                        match line {
                            Ok(Some(l)) => {
                                if stdout_lines.len() < MAX_STDOUT_LINES {
                                    stdout_lines.push(l.clone());
                                }
                                // json lines are typically full objects per line in these modes
                                if looks_like_json_object(&l) {
                                    json_lines.push(l);
                                }
                            }
                            Ok(None) => break,
                            Err(e) => return Err(anyhow!("error reading yt-dlp stdout: {e}")),
                        }
                    }
                    line = stderr_reader.next_line() => {
                        match line {
                            Ok(Some(l)) => {
                                if stderr_lines.len() < MAX_STDERR_LINES {
                                    stderr_lines.push(l);
                                }
                            }
                            Ok(None) => {
                                // don't break; stdout might still have data
                                // We'll break when stdout closes and process exits.
                            }
                            Err(e) => return Err(anyhow!("error reading yt-dlp stderr: {e}")),
                        }
                    }
                }
            }
            Ok::<(), anyhow::Error>(())
        };

        let timed = tokio::time::timeout(timeout, read_task).await;
        if timed.is_err() {
            // Timeout: kill process and return error with partial output.
            let _ = child.kill().await;
            return Err(YtDlpError {
                kind: YtDlpErrorKind::Timeout,
                message: format!("yt-dlp timed out after {:?}", timeout),
                output: Some(YtDlpOutput {
                    stdout_lines,
                    stderr_lines,
                    exit_code: None,
                }),
            }
            .into());
        }
        timed.unwrap()?; // propagate read errors

        let status = child.wait().await?;
        let exit_code = status.code();

        let output = YtDlpOutput {
            stdout_lines: stdout_lines.clone(),
            stderr_lines,
            exit_code,
        };

        if !status.success() {
            return Err(YtDlpError {
                kind: YtDlpErrorKind::NonZeroExit,
                message: format!(
                    "yt-dlp exited with status {:?}. See logs for details.",
                    exit_code
                ),
                output: Some(output),
            }
            .into());
        }

        Ok((json_lines, output))
    }
}

fn looks_like_json_object(s: &str) -> bool {
    let t = s.trim_start();
    t.starts_with('{') && t.ends_with('}')
}

fn parse_preview_metadata(json_line: &str, fallback_url: &str) -> Result<PreviewMetadata> {
    let v: Value = serde_json::from_str(json_line).map_err(|e| YtDlpError {
        kind: YtDlpErrorKind::InvalidJson,
        message: format!("invalid yt-dlp JSON: {e}"),
        output: None,
    })?;

    // Common yt-dlp fields:
    // - webpage_url
    // - title
    // - uploader / uploader_id
    // - duration
    // - thumbnail
    // Playlist indicators:
    // - _type: "playlist"
    // - entries: [...]
    // - playlist_count
    let webpage_url = v
        .get("webpage_url")
        .and_then(|x| x.as_str())
        .unwrap_or(fallback_url)
        .to_string();

    let title = v
        .get("title")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let uploader = v
        .get("uploader")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());

    let duration_seconds = v
        .get("duration")
        .and_then(|x| x.as_u64())
        .or_else(|| v.get("duration").and_then(|x| x.as_f64()).map(|f| f as u64));

    let thumbnail_url = v
        .get("thumbnail")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());

    // Try filesize first, then filesize_approx
    let filesize_bytes = v
        .get("filesize")
        .and_then(|x| x.as_u64())
        .or_else(|| v.get("filesize_approx").and_then(|x| x.as_u64()));

    let is_playlist = v
        .get("_type")
        .and_then(|x| x.as_str())
        .map(|t| t == "playlist")
        .unwrap_or(false)
        || v.get("entries").is_some();

    let playlist_title = v
        .get("title")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .filter(|_| is_playlist);

    let playlist_count_hint = v
        .get("playlist_count")
        .and_then(|x| x.as_u64())
        .or_else(|| v.get("n_entries").and_then(|x| x.as_u64()))
        .filter(|_| is_playlist);

    Ok(PreviewMetadata {
        url: webpage_url,
        title,
        uploader,
        duration_seconds,
        thumbnail_url,
        filesize_bytes,
        is_playlist,
        playlist_title,
        playlist_count_hint,
    })
}

fn parse_playlist_entry(json_line: &str, playlist_url: &str) -> Result<PlaylistEntry> {
    let v: Value = serde_json::from_str(json_line).map_err(|e| YtDlpError {
        kind: YtDlpErrorKind::InvalidJson,
        message: format!("invalid yt-dlp playlist JSON: {e}"),
        output: None,
    })?;

    // In flat-playlist mode, yt-dlp typically yields one object per entry:
    // - id
    // - url (sometimes)
    // - webpage_url (sometimes)
    // - title
    // - uploader (sometimes)
    let title = v
        .get("title")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let uploader = v
        .get("uploader")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());

    let duration_seconds = v
        .get("duration")
        .and_then(|x| x.as_u64())
        .or_else(|| v.get("duration").and_then(|x| x.as_f64()).map(|f| f as u64));

    let thumbnail_url = v
        .get("thumbnail")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());

    // Prefer `webpage_url` if present.
    if let Some(u) = v.get("webpage_url").and_then(|x| x.as_str()) {
        return Ok(PlaylistEntry {
            url: u.to_string(),
            title,
            uploader,
            duration_seconds,
            thumbnail_url,
        });
    }

    // Some extractors provide `url` without scheme/host or use `id`.
    if let Some(u) = v.get("url").and_then(|x| x.as_str()) {
        // Best-effort: if it already looks like a URL, use it.
        if u.starts_with("http://") || u.starts_with("https://") {
            return Ok(PlaylistEntry {
                url: u.to_string(),
                title,
                uploader,
                duration_seconds,
                thumbnail_url,
            });
        }

        // Otherwise, try to derive from playlist URL's domain.
        if let Ok(mut base) = url::Url::parse(playlist_url) {
            // Place the entry `url` under the same origin if possible.
            // This is imperfect but better than returning empty.
            // If it fails, we'll fall back to just the raw string.
            if base.path().ends_with('/') {
                // keep
            } else {
                // strip last path segment
                let mut segs: Vec<&str> = base.path().split('/').collect();
                segs.pop();
                base.set_path(&segs.join("/"));
            }
            if let Ok(joined) = base.join(u) {
                return Ok(PlaylistEntry {
                    url: joined.to_string(),
                    title,
                    uploader,
                    duration_seconds,
                    thumbnail_url,
                });
            }
        }

        return Ok(PlaylistEntry {
            url: u.to_string(),
            title,
            uploader,
            duration_seconds,
            thumbnail_url,
        });
    }

    // Last resort: if we have an id, return it as url-ish.
    if let Some(id) = v.get("id").and_then(|x| x.as_str()) {
        return Ok(PlaylistEntry {
            url: id.to_string(),
            title,
            uploader,
            duration_seconds,
            thumbnail_url,
        });
    }

    Err(anyhow!("playlist entry missing url/webpage_url/id"))
}
