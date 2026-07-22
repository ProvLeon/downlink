//! Whisper AI Auto-Transcription
//!
//! Priority chain (highest → lowest):
//!   1. User's own Groq API key (set in Settings → Transcription)
//!   2. App's bundled Groq key (compiled in via DOWNLINK_GROQ_KEY env var)
//!   3. yt-dlp platform auto-subtitles (YouTube, Vimeo etc. — free, zero setup)
//!   4. Local whisper binary (power users)
//!
//! Users never need to configure anything — the bundled key ensures it always works.
//! Power users who set their own key in Settings get priority + their own quota.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WhisperModel {
    Tiny,
    Base,
    Small,
    Medium,
}

impl WhisperModel {
    pub fn as_str(&self) -> &'static str {
        match self {
            WhisperModel::Tiny   => "tiny",
            WhisperModel::Base   => "base",
            WhisperModel::Small  => "small",
            WhisperModel::Medium => "medium",
        }
    }

    /// Maps to Groq's model names.
    /// tiny/base → turbo (fast), small/medium → large-v3 (accurate)
    pub fn groq_model(&self) -> &'static str {
        match self {
            WhisperModel::Tiny | WhisperModel::Base   => "whisper-large-v3-turbo",
            WhisperModel::Small | WhisperModel::Medium => "whisper-large-v3",
        }
    }
}

#[derive(Debug, serde::Serialize)]
pub struct TranscriptionResult {
    pub srt_path: String,
    /// "groq_user" | "groq_bundled" | "platform_subs" | "local_whisper"
    pub method: String,
}

#[derive(Debug, serde::Serialize)]
pub struct TranscriptionError {
    pub kind: TranscriptionErrorKind,
    pub message: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TranscriptionErrorKind {
    FileNotFound,
    NoSubtitlesAvailable,
    GroqApiError,
    LocalWhisperFailed,
    TranscriptionFailed,
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundled key (baked in at compile time via build.rs + DOWNLINK_GROQ_KEY)
// ─────────────────────────────────────────────────────────────────────────────

/// Returns the app's bundled Groq key compiled in at build time.
/// Empty string if the developer didn't set DOWNLINK_GROQ_KEY when building.
fn bundled_groq_key() -> &'static str {
    env!("DOWNLINK_GROQ_KEY")
}

/// Resolve the effective API key and provider.
/// User's key + provider is primary; bundled Groq key is the fallback.
pub fn resolve_api_config<'a>(
    user_key: Option<&'a str>,
    provider: &crate::settings::TranscriptionProvider,
) -> Option<(String, crate::settings::TranscriptionProvider)> {
    use crate::settings::TranscriptionProvider;

    // User's own key — use whatever provider they selected
    if let Some(k) = user_key {
        let k = k.trim();
        if !k.is_empty() {
            return Some((k.to_string(), provider.clone()));
        }
    }
    // Bundled Groq key — always Groq regardless of user provider setting
    let bundled = bundled_groq_key().trim();
    if !bundled.is_empty() {
        return Some((bundled.to_string(), TranscriptionProvider::Groq));
    }
    None
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider-specific transcription
// ─────────────────────────────────────────────────────────────────────────────

/// Groq + OpenAI both use the same OpenAI-compatible multipart API.
async fn transcribe_openai_compat(
    resolved_path: &Path,
    api_key: &str,
    api_base: &str,
    model: &str,
) -> Result<String, TranscriptionError> {
    let upload_path = maybe_extract_audio(resolved_path).await?;
    let upload_ref = upload_path.as_deref().unwrap_or(resolved_path);

    let file_bytes = tokio::fs::read(upload_ref).await.map_err(|e| TranscriptionError {
        kind: TranscriptionErrorKind::GroqApiError,
        message: format!("Cannot read file: {e}"),
    })?;

    let mime = match upload_ref.extension().and_then(|e| e.to_str()) {
        Some("mp3")  => "audio/mpeg",
        Some("m4a")  => "audio/mp4",
        Some("wav")  => "audio/wav",
        Some("ogg")  => "audio/ogg",
        Some("flac") => "audio/flac",
        Some("opus") => "audio/ogg",
        _            => "video/mp4",
    };

    log::info!("Uploading {:.1} MB → {api_base} (model: {model})",
               file_bytes.len() as f64 / 1_048_576.0);

    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(upload_ref.file_name().unwrap_or_default().to_string_lossy().to_string())
        .mime_str(mime)
        .map_err(|e| TranscriptionError {
            kind: TranscriptionErrorKind::GroqApiError,
            message: format!("MIME: {e}"),
        })?;

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", model.to_string())
        .text("response_format", "verbose_json")
        .text("temperature", "0")
        .text("prompt", "Please do not transcribe any silence, background noise, or instrumental music. If there is no speech, leave the transcription completely blank.");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| TranscriptionError {
            kind: TranscriptionErrorKind::GroqApiError,
            message: format!("HTTP client: {e}"),
        })?;

    let resp = client
        .post(format!("{api_base}/audio/transcriptions"))
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| TranscriptionError {
            kind: TranscriptionErrorKind::GroqApiError,
            message: format!("Network error: {e}"),
        })?;

    if let Some(tmp) = &upload_path { let _ = tokio::fs::remove_file(tmp).await; }

    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        let msg = if status.as_u16() == 401 {
            "Invalid API key — check your key in Settings → Transcription.".to_string()
        } else if status.as_u16() == 413 {
            "File too large (max 25 MB). Try a shorter clip.".to_string()
        } else {
            format!("API error {status}: {body}")
        };
        return Err(TranscriptionError { kind: TranscriptionErrorKind::GroqApiError, message: msg });
    }
    
    // Convert verbose_json to SRT
    Ok(verbose_json_to_srt(&body))
}

fn verbose_json_to_srt(json_str: &str) -> String {
    let mut srt = String::new();
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
        if let Some(segments) = val.get("segments").and_then(|v| v.as_array()) {
            for (i, seg) in segments.iter().enumerate() {
                let start = seg.get("start").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let end = seg.get("end").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let text = seg.get("text").and_then(|v| v.as_str()).unwrap_or("").trim();
                
                srt.push_str(&format!("{}\n", i + 1));
                srt.push_str(&format!("{} --> {}\n", format_timestamp(start), format_timestamp(end)));
                srt.push_str(&format!("{}\n\n", text));
            }
        } else if let Some(text) = val.get("text").and_then(|v| v.as_str()) {
            // Fallback if no segments
            srt = text.to_string();
        }
    } else {
        // If it wasn't valid JSON (e.g. they supported raw SRT after all), just return it
        srt = json_str.to_string();
    }
    srt.trim_end().to_string()
}

fn format_timestamp(seconds: f64) -> String {
    let hours = (seconds / 3600.0) as u64;
    let minutes = ((seconds % 3600.0) / 60.0) as u64;
    let secs = (seconds % 60.0) as u64;
    let millis = (seconds.fract() * 1000.0).round() as u64;
    format!("{:02}:{:02}:{:02},{:03}", hours, minutes, secs, millis)
}

/// Gemini audio transcription via Gemini 1.5 Flash inline audio API.
async fn transcribe_gemini(
    resolved_path: &Path,
    api_key: &str,
) -> Result<String, TranscriptionError> {
    let upload_path = maybe_extract_audio(resolved_path).await?;
    let upload_ref = upload_path.as_deref().unwrap_or(resolved_path);

    let audio_bytes = tokio::fs::read(upload_ref).await.map_err(|e| TranscriptionError {
        kind: TranscriptionErrorKind::GroqApiError,
        message: format!("Cannot read file: {e}"),
    })?;

    if let Some(tmp) = &upload_path { let _ = tokio::fs::remove_file(tmp).await; }

    let b64 = {
        use std::io::Write;
        let mut enc = Vec::new();
        {
            let mut e = base64_encoder(&mut enc);
            e.write_all(&audio_bytes).ok();
        }
        String::from_utf8(enc).unwrap_or_default()
    };

    let body = serde_json::json!({
        "contents": [{
            "parts": [
                { "text": "Transcribe this audio into SRT subtitle format with timestamps. Return only the SRT content, no other text." },
                { "inline_data": { "mime_type": "audio/mp4", "data": b64 } }
            ]
        }],
        "generationConfig": { "temperature": 0.0 }
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| TranscriptionError {
            kind: TranscriptionErrorKind::GroqApiError,
            message: format!("HTTP client: {e}"),
        })?;

    let resp = client
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        ))
        .json(&body)
        .send()
        .await
        .map_err(|e| TranscriptionError {
            kind: TranscriptionErrorKind::GroqApiError,
            message: format!("Network error: {e}"),
        })?;

    let status = resp.status();
    let json: serde_json::Value = resp.json().await.unwrap_or_default();
    if !status.is_success() {
        return Err(TranscriptionError {
            kind: TranscriptionErrorKind::GroqApiError,
            message: format!("Gemini API error {status}"),
        });
    }

    let text = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(text)
}

/// Simple base64 encoder without external crate dependency.
fn base64_encoder(out: &mut Vec<u8>) -> impl std::io::Write + '_ {
    struct B64Writer<'a>(&'a mut Vec<u8>, [u8; 3], usize);
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    impl<'a> std::io::Write for B64Writer<'a> {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            for &b in buf {
                self.1[self.2] = b;
                self.2 += 1;
                if self.2 == 3 {
                    let [a, b, c] = self.1;
                    self.0.push(TABLE[(a >> 2) as usize]);
                    self.0.push(TABLE[((a & 3) << 4 | b >> 4) as usize]);
                    self.0.push(TABLE[((b & 15) << 2 | c >> 6) as usize]);
                    self.0.push(TABLE[(c & 63) as usize]);
                    self.2 = 0;
                }
            }
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            if self.2 > 0 {
                let (a, b) = (self.1[0], if self.2 > 1 { self.1[1] } else { 0 });
                self.0.push(TABLE[(a >> 2) as usize]);
                self.0.push(TABLE[((a & 3) << 4 | b >> 4) as usize]);
                if self.2 > 1 { self.0.push(TABLE[((b & 15) << 2) as usize]); } else { self.0.push(b'='); }
                self.0.push(b'=');
            }
            Ok(())
        }
    }
    B64Writer(out, [0u8; 3], 0)
}

/// Route to the correct provider transcription function.
async fn transcribe_with_provider(
    resolved: &Path,
    model: WhisperModel,
    api_key: &str,
    provider: &crate::settings::TranscriptionProvider,
) -> Result<String, TranscriptionError> {
    use crate::settings::TranscriptionProvider;
    match provider {
        TranscriptionProvider::Groq => {
            transcribe_openai_compat(resolved, api_key, provider.api_base(), model.groq_model()).await
        }
        TranscriptionProvider::OpenAI => {
            // OpenAI uses "whisper-1" model name
            transcribe_openai_compat(resolved, api_key, provider.api_base(), "whisper-1").await
        }
        TranscriptionProvider::Gemini => {
            transcribe_gemini(resolved, api_key).await
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// File path resolution (handles yt-dlp .webm → .mp4 remuxing)
// ─────────────────────────────────────────────────────────────────────────────

const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "webm", "m4v", "mov", "avi",
    "mp3", "m4a", "flac", "opus", "ogg", "aac", "wav",
];

pub fn resolve_media_path(file_path: &Path) -> Result<PathBuf, TranscriptionError> {
    if file_path.exists() {
        return Ok(file_path.to_path_buf());
    }
    let stem = file_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let parent = file_path.parent().unwrap_or(Path::new("."));

    for ext in MEDIA_EXTENSIONS {
        let candidate = parent.join(format!("{stem}.{ext}"));
        if candidate.exists() {
            log::info!("Resolved {:?} → {:?} (remuxed)", file_path, candidate);
            return Ok(candidate);
        }
    }
    // Fuzzy scan
    if let Ok(entries) = std::fs::read_dir(parent) {
        for entry in entries.flatten() {
            let p = entry.path();
            let s = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let e = p.extension().unwrap_or_default().to_string_lossy().to_lowercase();
            if (s == stem || s.starts_with(&stem)) && MEDIA_EXTENSIONS.contains(&e.as_str()) {
                log::info!("Fuzzy-resolved {:?} → {:?}", file_path, p);
                return Ok(p);
            }
        }
    }
    Err(TranscriptionError {
        kind: TranscriptionErrorKind::FileNotFound,
        message: format!("File not found: {}", file_path.display()),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Groq cloud transcription
// ─────────────────────────────────────────────────────────────────────────────


/// Extract audio if file > 24 MB to stay within Groq's 25 MB limit.
async fn maybe_extract_audio(path: &Path) -> Result<Option<PathBuf>, TranscriptionError> {
    let size = tokio::fs::metadata(path).await
        .map(|m| m.len())
        .unwrap_or(0);

    const MAX: u64 = 24 * 1024 * 1024;
    if size <= MAX { return Ok(None); }

    let Some(ffmpeg) = crate::download_manager::find_ffmpeg_binary() else {
        log::warn!("File > 24 MB and ffmpeg not found — uploading raw");
        return Ok(None);
    };

    let tmp = std::env::temp_dir().join(format!(
        "downlink_audio_{}.m4a",
        uuid::Uuid::new_v4()
    ));

    let ok = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        Command::new(&ffmpeg)
            .args(["-y", "-i", &path.to_string_lossy(),
                   "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k",
                   &tmp.to_string_lossy()])
            .stdout(Stdio::null()).stderr(Stdio::null())
            .status(),
    ).await
    .ok()
    .and_then(|r| r.ok())
    .map(|s| s.success())
    .unwrap_or(false);

    Ok(if ok && tmp.exists() { Some(tmp) } else { None })
}

// ─────────────────────────────────────────────────────────────────────────────
// yt-dlp platform subtitles (YouTube, Vimeo etc. — free, zero setup)
// ─────────────────────────────────────────────────────────────────────────────

pub async fn fetch_platform_subtitles(
    source_url: &str,
    output_dir: &Path,
) -> Result<PathBuf, TranscriptionError> {
    let ytdlp = crate::download_manager::find_ytdlp_binary();

    // Output template: drop the video, only write subs
    let template = output_dir.join("%(title)s [%(id)s].%(ext)s");

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        Command::new(&ytdlp)
            .args([
                "--write-auto-subs",
                "--write-subs",
                "--sub-langs", "en.*,en",
                "--convert-subs", "srt",
                "--skip-download",
                "-o", &template.to_string_lossy(),
                source_url,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| TranscriptionError {
        kind: TranscriptionErrorKind::NoSubtitlesAvailable,
        message: "Subtitle fetch timed out".to_string(),
    })?
    .map_err(|e| TranscriptionError {
        kind: TranscriptionErrorKind::NoSubtitlesAvailable,
        message: format!("yt-dlp error: {e}"),
    })?;

    if !output.status.success() {
        return Err(TranscriptionError {
            kind: TranscriptionErrorKind::NoSubtitlesAvailable,
            message: "No subtitles available for this URL".to_string(),
        });
    }

    // Find the .srt that was written
    find_srt_in_dir(output_dir).ok_or_else(|| TranscriptionError {
        kind: TranscriptionErrorKind::NoSubtitlesAvailable,
        message: "No subtitle file was created".to_string(),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Local whisper (power user fallback)
// ─────────────────────────────────────────────────────────────────────────────

pub fn check_whisper() -> Option<String> {
    find_whisper_binary().map(|p| p.to_string_lossy().to_string())
}

pub fn find_whisper_binary() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(|h| h.to_string_lossy().to_string()).unwrap_or_default();
    let candidates = [
        "whisper".to_string(),
        format!("{home}/.local/bin/whisper"),
        format!("{home}/Library/Python/3.11/bin/whisper"),
        format!("{home}/Library/Python/3.12/bin/whisper"),
        format!("{home}/Library/Python/3.13/bin/whisper"),
        "/opt/homebrew/bin/whisper".to_string(),
        "/usr/local/bin/whisper".to_string(),
    ];
    for c in &candidates {
        let p = PathBuf::from(c);
        if p.is_absolute() && p.exists() { return Some(p); }
        #[cfg(not(windows))]
        if let Ok(out) = std::process::Command::new("which").arg(c).output() {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !s.is_empty() { return Some(PathBuf::from(s)); }
            }
        }
    }
    None
}

async fn transcribe_via_local(
    resolved: &Path,
    model: WhisperModel,
    out_dir: &Path,
) -> Result<(), TranscriptionError> {
    let bin = find_whisper_binary().ok_or_else(|| TranscriptionError {
        kind: TranscriptionErrorKind::LocalWhisperFailed,
        message: "whisper not found".to_string(),
    })?;

    let ok = tokio::time::timeout(
        std::time::Duration::from_secs(600),
        Command::new(&bin)
            .args([
                resolved.to_string_lossy().as_ref(),
                "--model", model.as_str(),
                "--output_format", "srt",
                "--output_dir", out_dir.to_string_lossy().as_ref(),
            ])
            .stdout(Stdio::null()).stderr(Stdio::null())
            .status(),
    ).await
    .ok().and_then(|r| r.ok()).map(|s| s.success()).unwrap_or(false);

    if ok { Ok(()) } else {
        Err(TranscriptionError {
            kind: TranscriptionErrorKind::LocalWhisperFailed,
            message: "Local whisper failed".to_string(),
        })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

fn find_srt_in_dir(dir: &Path) -> Option<PathBuf> {
    std::fs::read_dir(dir).ok()?.flatten().find_map(|e| {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) == Some("srt") { Some(p) } else { None }
    })
}

fn find_srt_by_stem(dir: &Path, stem: &str) -> Option<PathBuf> {
    std::fs::read_dir(dir).ok()?.flatten().find_map(|e| {
        let p = e.path();
        let name = p.file_name()?.to_string_lossy().to_string();
        if name.starts_with(stem) && name.ends_with(".srt") { Some(p) } else { None }
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/// Transcribe a media file.
///
/// Priority:
///   1. User's key + selected provider (Settings → Transcription)
///   2. App bundled Groq key (always Groq, zero setup for users)
///   3. Local whisper binary (power user bonus)
pub async fn transcribe(
    file_path: &Path,
    model: WhisperModel,
    user_key: Option<&str>,
    provider: &crate::settings::TranscriptionProvider,
) -> Result<TranscriptionResult, TranscriptionError> {
    let resolved = resolve_media_path(file_path)?;
    let out_dir = resolved.parent().unwrap_or(Path::new(".")).to_path_buf();

    // ── Cloud AI (user key → bundled key) ────────────────────────────────────
    let has_user_key = user_key.map(|k| !k.trim().is_empty()).unwrap_or(false);
    println!("DEBUG: has_user_key: {}", has_user_key);
    println!("DEBUG: bundled_groq_key len: {}", bundled_groq_key().len());

    if let Some((key, effective_provider)) = resolve_api_config(user_key, provider) {
        println!("DEBUG: resolved api config: provider={:?}, key_len={}", effective_provider, key.len());
        let method = if has_user_key {
            format!("{}_user", effective_provider.as_str())
        } else {
            "groq_bundled".to_string()
        };

        let srt_text = transcribe_with_provider(&resolved, model, &key, &effective_provider).await?;
        let stem = resolved.file_stem().unwrap_or_default().to_string_lossy();
        let srt_path = out_dir.join(format!("{stem}.srt"));
        tokio::fs::write(&srt_path, &srt_text).await.map_err(|e| TranscriptionError {
            kind: TranscriptionErrorKind::TranscriptionFailed,
            message: format!("Failed to write .srt: {e}"),
        })?;
        return Ok(TranscriptionResult {
            srt_path: srt_path.to_string_lossy().to_string(),
            method,
        });
    }

    // ── Local whisper (no cloud key available) ────────────────────────────────
    if find_whisper_binary().is_some() {
        transcribe_via_local(&resolved, model, &out_dir).await?;
        let stem = resolved.file_stem().unwrap_or_default().to_string_lossy();
        let srt = find_srt_by_stem(&out_dir, &stem).ok_or_else(|| TranscriptionError {
            kind: TranscriptionErrorKind::TranscriptionFailed,
            message: "Transcription ran but no .srt produced".to_string(),
        })?;
        return Ok(TranscriptionResult {
            srt_path: srt.to_string_lossy().to_string(),
            method: "local_whisper".to_string(),
        });
    }

    Err(TranscriptionError {
        kind: TranscriptionErrorKind::TranscriptionFailed,
        message: "Transcription unavailable".to_string(),
    })
}
// force rebuild
// force rebuild again
