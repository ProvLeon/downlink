//! Tool Manager
//!
//! Handles discovery, version checking, health validation, and updates for
//! bundled tools (yt-dlp, ffmpeg, ffprobe).

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows flag to prevent console window from appearing when spawning processes.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use crate::db::{ensure_app_dirs, AppDirs};

/// Tool identifiers managed by Downlink.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tool {
    YtDlp,
    Ffmpeg,
    Ffprobe,
}

impl Tool {
    pub fn as_str(&self) -> &'static str {
        match self {
            Tool::YtDlp => "yt-dlp",
            Tool::Ffmpeg => "ffmpeg",
            Tool::Ffprobe => "ffprobe",
        }
    }

    pub fn binary_name(&self) -> &'static str {
        #[cfg(target_os = "windows")]
        {
            match self {
                Tool::YtDlp => "yt-dlp.exe",
                Tool::Ffmpeg => "ffmpeg.exe",
                Tool::Ffprobe => "ffprobe.exe",
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            match self {
                Tool::YtDlp => "yt-dlp",
                Tool::Ffmpeg => "ffmpeg",
                Tool::Ffprobe => "ffprobe",
            }
        }
    }

    pub fn version_args(&self) -> &[&str] {
        match self {
            Tool::YtDlp => &["--version"],
            Tool::Ffmpeg => &["-version"],
            Tool::Ffprobe => &["-version"],
        }
    }
}

/// Health status for a tool.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolStatus {
    Ok,
    Outdated,
    Missing,
    Broken,
}

/// Information about an installed tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    pub tool: Tool,
    pub path: PathBuf,
    pub version: Option<String>,
    pub status: ToolStatus,
    pub is_bundled: bool,
    pub last_checked: Option<DateTime<Utc>>,
}

/// Combined toolchain status for UI display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolchainStatus {
    pub yt_dlp: Option<ToolInfo>,
    pub ffmpeg: Option<ToolInfo>,
    pub ffprobe: Option<ToolInfo>,
    pub overall_status: ToolStatus,
}

/// Update manifest entry for a tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolManifestEntry {
    pub tool: String,
    pub version: String,
    pub download_url: String,
    pub sha256: String,
    pub size_bytes: u64,
}

/// Update manifest containing latest tool versions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateManifest {
    pub manifest_version: u32,
    pub updated_at: String,
    pub tools: Vec<ToolManifestEntry>,
}

/// Tool Manager configuration.
#[derive(Debug, Clone)]
pub struct ToolManagerConfig {
    /// Directory where bundled tools are located (read-only, in app bundle).
    pub bundled_dir: Option<PathBuf>,
    /// Directory where updated tools are stored (user-writable).
    pub updated_dir: PathBuf,
    /// URL to fetch the update manifest from.
    pub manifest_url: Option<String>,
    /// How long to wait for version checks.
    pub version_timeout: Duration,
}

impl Default for ToolManagerConfig {
    fn default() -> Self {
        Self {
            bundled_dir: None,
            updated_dir: PathBuf::new(),
            manifest_url: None,
            version_timeout: Duration::from_secs(5),
        }
    }
}

/// Tool Manager handles tool discovery, validation, and updates.
pub struct ToolManager {
    config: ToolManagerConfig,
    app_dirs: AppDirs,
}

impl ToolManager {
    /// Create a new tool manager.
    pub fn new(config: ToolManagerConfig) -> Result<Self> {
        let app_dirs = ensure_app_dirs()?;

        let config = ToolManagerConfig {
            updated_dir: if config.updated_dir.as_os_str().is_empty() {
                app_dirs.tools.clone()
            } else {
                config.updated_dir
            },
            ..config
        };

        Ok(Self { config, app_dirs })
    }

    /// Get the path to the tools directory.
    pub fn tools_dir(&self) -> &Path {
        &self.config.updated_dir
    }

    /// Find the best available path for a tool.
    ///
    /// Priority:
    /// 1. Updated tool in user directory (if healthy)
    /// 2. Bundled tool (if healthy)
    /// 3. System PATH
    pub async fn find_tool(&self, tool: Tool) -> Option<PathBuf> {
        // Check updated directory first
        let updated_path = self.config.updated_dir.join(tool.binary_name());
        if updated_path.exists() {
            if self.check_health(&updated_path, tool).await.is_ok() {
                return Some(updated_path);
            }
        }

        // Check bundled directory
        if let Some(ref bundled_dir) = self.config.bundled_dir {
            let bundled_path = bundled_dir.join(tool.binary_name());
            if bundled_path.exists() {
                if self.check_health(&bundled_path, tool).await.is_ok() {
                    return Some(bundled_path);
                }
            }
        }

        // Fall back to system PATH
        if let Ok(path) = which::which(tool.binary_name()) {
            if self.check_health(&path, tool).await.is_ok() {
                return Some(path);
            }
        }

        None
    }

    /// Get the path to yt-dlp, finding the best available version.
    pub async fn yt_dlp_path(&self) -> Option<PathBuf> {
        self.find_tool(Tool::YtDlp).await
    }

    /// Get the path to ffmpeg, finding the best available version.
    pub async fn ffmpeg_path(&self) -> Option<PathBuf> {
        self.find_tool(Tool::Ffmpeg).await
    }

    /// Get the path to ffprobe, finding the best available version.
    pub async fn ffprobe_path(&self) -> Option<PathBuf> {
        self.find_tool(Tool::Ffprobe).await
    }

    /// Get detailed info about a specific tool.
    pub async fn get_tool_info(&self, tool: Tool) -> ToolInfo {
        // Try to find the tool
        let path = self.find_tool(tool).await;

        match path {
            Some(p) => {
                let version = self.get_version(&p, tool).await.ok();
                let is_bundled = self
                    .config
                    .bundled_dir
                    .as_ref()
                    .map(|d| p.starts_with(d))
                    .unwrap_or(false);

                ToolInfo {
                    tool,
                    path: p,
                    version,
                    status: ToolStatus::Ok,
                    is_bundled,
                    last_checked: Some(Utc::now()),
                }
            }
            None => ToolInfo {
                tool,
                path: PathBuf::new(),
                version: None,
                status: ToolStatus::Missing,
                is_bundled: false,
                last_checked: Some(Utc::now()),
            },
        }
    }

    /// Get the complete toolchain status.
    pub async fn get_toolchain_status(&self) -> ToolchainStatus {
        let yt_dlp = self.get_tool_info(Tool::YtDlp).await;
        let ffmpeg = self.get_tool_info(Tool::Ffmpeg).await;
        let ffprobe = self.get_tool_info(Tool::Ffprobe).await;

        // Determine overall status
        let overall_status = if yt_dlp.status == ToolStatus::Missing {
            ToolStatus::Missing
        } else if yt_dlp.status == ToolStatus::Broken || ffmpeg.status == ToolStatus::Broken {
            ToolStatus::Broken
        } else if yt_dlp.status == ToolStatus::Outdated || ffmpeg.status == ToolStatus::Outdated {
            ToolStatus::Outdated
        } else {
            ToolStatus::Ok
        };

        ToolchainStatus {
            yt_dlp: Some(yt_dlp),
            ffmpeg: Some(ffmpeg),
            ffprobe: Some(ffprobe),
            overall_status,
        }
    }

    /// Check if a tool binary is healthy (can execute and return version).
    async fn check_health(&self, path: &Path, tool: Tool) -> Result<()> {
        if !path.exists() {
            return Err(anyhow!("Tool binary does not exist: {}", path.display()));
        }

        // Try to get version as a health check
        self.get_version(path, tool).await?;
        Ok(())
    }

    /// Get the version string from a tool.
    pub async fn get_version(&self, path: &Path, tool: Tool) -> Result<String> {
        let mut cmd = Command::new(path);
        cmd.args(tool.version_args())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Hide console window on Windows
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let output = tokio::time::timeout(self.config.version_timeout, cmd.output())
            .await
            .context("Version check timed out")?
            .context("Failed to execute tool")?;

        if !output.status.success() {
            return Err(anyhow!(
                "Tool returned non-zero exit code: {}",
                output.status
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let version = parse_version(&stdout, tool);

        version.ok_or_else(|| anyhow!("Could not parse version from output"))
    }

    /// Check for available updates.
    pub async fn check_for_updates(&self) -> Result<Vec<ToolManifestEntry>> {
        let manifest_url = self
            .config
            .manifest_url
            .as_ref()
            .ok_or_else(|| anyhow!("No manifest URL configured"))?;

        let manifest = fetch_manifest(manifest_url).await?;
        let mut updates = Vec::new();

        for entry in manifest.tools {
            let tool = match entry.tool.as_str() {
                "yt-dlp" => Tool::YtDlp,
                "ffmpeg" => Tool::Ffmpeg,
                "ffprobe" => Tool::Ffprobe,
                _ => continue,
            };

            let current_info = self.get_tool_info(tool).await;

            // Check if update is needed
            let needs_update = match &current_info.version {
                Some(v) => version_is_newer(&entry.version, v),
                None => true, // Missing tool, definitely needs "update" (install)
            };

            if needs_update {
                updates.push(entry);
            }
        }

        Ok(updates)
    }

    /// Update a tool to a new version.
    pub async fn update_tool(
        &self,
        entry: &ToolManifestEntry,
        progress_callback: impl Fn(f64) + Send + 'static,
    ) -> Result<PathBuf> {
        let tool = match entry.tool.as_str() {
            "yt-dlp" => Tool::YtDlp,
            "ffmpeg" => Tool::Ffmpeg,
            "ffprobe" => Tool::Ffprobe,
            _ => return Err(anyhow!("Unknown tool: {}", entry.tool)),
        };

        // Ensure tools directory exists
        fs::create_dir_all(&self.config.updated_dir).await?;

        // Download to temp file
        let temp_path = self
            .app_dirs
            .tmp
            .join(format!("{}.download", tool.binary_name()));
        let final_path = self.config.updated_dir.join(tool.binary_name());

        download_file(
            &entry.download_url,
            &temp_path,
            entry.size_bytes,
            progress_callback,
        )
        .await?;

        // Verify checksum
        let actual_hash = compute_sha256(&temp_path).await?;
        if actual_hash != entry.sha256 {
            fs::remove_file(&temp_path).await?;
            return Err(anyhow!(
                "Checksum mismatch: expected {}, got {}",
                entry.sha256,
                actual_hash
            ));
        }

        // Atomic rename (move temp to final)
        // On some platforms, we need to remove the old file first
        if final_path.exists() {
            // Backup old version
            let backup_path = final_path.with_extension("bak");
            let _ = fs::rename(&final_path, &backup_path).await;
        }

        fs::rename(&temp_path, &final_path).await?;

        // Set executable permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&final_path).await?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&final_path, perms).await?;
        }

        // Verify the new binary works
        self.check_health(&final_path, tool).await?;

        Ok(final_path)
    }

    /// Remove updated tools and fall back to bundled versions.
    pub async fn reset_to_bundled(&self, tool: Tool) -> Result<()> {
        let updated_path = self.config.updated_dir.join(tool.binary_name());
        if updated_path.exists() {
            fs::remove_file(&updated_path).await?;
        }
        Ok(())
    }
}

/// Parse version string from tool output.
fn parse_version(output: &str, tool: Tool) -> Option<String> {
    let first_line = output.lines().next()?.trim();

    match tool {
        Tool::YtDlp => {
            // yt-dlp outputs just the version number, e.g., "2024.01.01"
            Some(first_line.to_string())
        }
        Tool::Ffmpeg | Tool::Ffprobe => {
            // ffmpeg outputs "ffmpeg version N-xxxxx-..."
            // We extract the version part
            let parts: Vec<&str> = first_line.split_whitespace().collect();
            if parts.len() >= 3 && (parts[0] == "ffmpeg" || parts[0] == "ffprobe") {
                Some(parts[2].to_string())
            } else {
                Some(first_line.to_string())
            }
        }
    }
}

/// Compare versions to see if `new_version` is newer than `current_version`.
fn version_is_newer(new_version: &str, current_version: &str) -> bool {
    // Simple string comparison works for yt-dlp's YYYY.MM.DD format
    // For more complex versions, we'd need semver parsing
    new_version > current_version
}

/// Fetch the update manifest from a URL.
async fn fetch_manifest(url: &str) -> Result<UpdateManifest> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    let response = client.get(url).send().await?.error_for_status()?;
    let manifest: UpdateManifest = response.json().await?;

    Ok(manifest)
}

/// Download a file with progress reporting.
async fn download_file(
    url: &str,
    dest: &Path,
    expected_size: u64,
    progress_callback: impl Fn(f64) + Send + 'static,
) -> Result<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600)) // 10 minute timeout for large files
        .build()?;

    let response = client.get(url).send().await?.error_for_status()?;
    let total_size = response.content_length().unwrap_or(expected_size);

    // Download entire content at once (simpler than streaming for tool binaries)
    let bytes = response.bytes().await?;

    let mut file = fs::File::create(dest).await?;
    file.write_all(&bytes).await?;
    file.flush().await?;

    // Report 100% completion
    progress_callback(100.0);

    // Log actual vs expected size
    let actual_size = bytes.len() as u64;
    if actual_size != total_size && total_size > 0 {
        log::warn!(
            "Downloaded size {} differs from expected {}",
            actual_size,
            total_size
        );
    }

    Ok(())
}

/// Compute SHA256 hash of a file.
async fn compute_sha256(path: &Path) -> Result<String> {
    let data = fs::read(path).await?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    let result = hasher.finalize();
    Ok(hex::encode(result))
}

/// Builder for ToolManagerConfig.
pub struct ToolManagerConfigBuilder {
    config: ToolManagerConfig,
}

impl ToolManagerConfigBuilder {
    pub fn new() -> Self {
        Self {
            config: ToolManagerConfig::default(),
        }
    }

    pub fn bundled_dir(mut self, path: PathBuf) -> Self {
        self.config.bundled_dir = Some(path);
        self
    }

    pub fn updated_dir(mut self, path: PathBuf) -> Self {
        self.config.updated_dir = path;
        self
    }

    pub fn manifest_url(mut self, url: String) -> Self {
        self.config.manifest_url = Some(url);
        self
    }

    pub fn version_timeout(mut self, timeout: Duration) -> Self {
        self.config.version_timeout = timeout;
        self
    }

    pub fn build(self) -> ToolManagerConfig {
        self.config
    }
}

impl Default for ToolManagerConfigBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version_ytdlp() {
        let output = "2024.01.01\n";
        assert_eq!(
            parse_version(output, Tool::YtDlp),
            Some("2024.01.01".to_string())
        );
    }

    #[test]
    fn test_parse_version_ffmpeg() {
        let output = "ffmpeg version 6.1.1 Copyright (c) 2000-2023 the FFmpeg developers\n";
        assert_eq!(
            parse_version(output, Tool::Ffmpeg),
            Some("6.1.1".to_string())
        );
    }

    #[test]
    fn test_version_is_newer() {
        assert!(version_is_newer("2024.01.02", "2024.01.01"));
        assert!(!version_is_newer("2024.01.01", "2024.01.02"));
        assert!(!version_is_newer("2024.01.01", "2024.01.01"));
    }

    #[test]
    fn test_tool_binary_names() {
        #[cfg(target_os = "windows")]
        {
            assert_eq!(Tool::YtDlp.binary_name(), "yt-dlp.exe");
            assert_eq!(Tool::Ffmpeg.binary_name(), "ffmpeg.exe");
        }
        #[cfg(not(target_os = "windows"))]
        {
            assert_eq!(Tool::YtDlp.binary_name(), "yt-dlp");
            assert_eq!(Tool::Ffmpeg.binary_name(), "ffmpeg");
        }
    }
}
