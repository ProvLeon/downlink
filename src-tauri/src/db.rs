use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use directories::ProjectDirs;
use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

/// Database schema version.
///
/// Bump this when introducing a new migration.
const SCHEMA_VERSION: i64 = 1;

/// Database handle wrapper.
///
/// Notes:
/// - This uses `rusqlite::Connection`, which is not `Send`/`Sync`.
/// - In practice, you should keep DB access on a single thread (or wrap behind a Tokio task).
pub struct Db {
    conn: Connection,
    path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

impl DownloadStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            DownloadStatus::Queued => "queued",
            DownloadStatus::Fetching => "fetching",
            DownloadStatus::Ready => "ready",
            DownloadStatus::Downloading => "downloading",
            DownloadStatus::PostProcessing => "postprocessing",
            DownloadStatus::Stopped => "stopped",
            DownloadStatus::Done => "done",
            DownloadStatus::Failed => "failed",
            DownloadStatus::Canceled => "canceled",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        Some(match s {
            "queued" => DownloadStatus::Queued,
            "fetching" => DownloadStatus::Fetching,
            "ready" => DownloadStatus::Ready,
            "downloading" => DownloadStatus::Downloading,
            "postprocessing" => DownloadStatus::PostProcessing,
            "stopped" => DownloadStatus::Stopped,
            "done" => DownloadStatus::Done,
            "failed" => DownloadStatus::Failed,
            "canceled" => DownloadStatus::Canceled,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceKind {
    Single,
    PlaylistParent,
    PlaylistItem,
}

impl SourceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            SourceKind::Single => "single",
            SourceKind::PlaylistParent => "playlist_parent",
            SourceKind::PlaylistItem => "playlist_item",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        Some(match s {
            "single" => SourceKind::Single,
            "playlist_parent" => SourceKind::PlaylistParent,
            "playlist_item" => SourceKind::PlaylistItem,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone)]
pub struct DownloadRow {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub source_url: String,
    pub source_kind: SourceKind,
    pub parent_id: Option<Uuid>,

    pub title: Option<String>,
    pub uploader: Option<String>,
    pub duration_seconds: Option<i64>,
    pub thumbnail_url: Option<String>,

    pub status: DownloadStatus,
    pub phase: Option<String>,

    pub preset_id: String,
    pub output_dir: String,

    pub final_path: Option<String>,

    pub progress_percent: Option<f64>,
    pub bytes_downloaded: Option<i64>,
    pub bytes_total: Option<i64>,
    pub speed_bps: Option<i64>,
    pub eta_seconds: Option<i64>,

    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

/// Determines the per-user app data directory and returns its path.
///
/// macOS:  ~/Library/Application Support/Downlink
/// Windows: %APPDATA%\\Downlink
/// Linux:  ~/.local/share/downlink (depending on XDG)
pub fn app_project_dirs() -> Result<ProjectDirs> {
    ProjectDirs::from("com", "downlink", "Downlink")
        .ok_or_else(|| anyhow!("failed to resolve per-user app data directory"))
}

/// Returns the directory where Downlink stores its state (db, logs, tools).
pub fn app_data_dir() -> Result<PathBuf> {
    Ok(app_project_dirs()?.data_dir().to_path_buf())
}

/// Returns the path to the SQLite database file.
pub fn db_path() -> Result<PathBuf> {
    Ok(app_data_dir()?.join("downlink.sqlite3"))
}

/// Create required directories for state storage: data dir, logs dir, tools dir, tmp dir.
pub fn ensure_app_dirs() -> Result<AppDirs> {
    let data = app_data_dir()?;
    let logs = data.join("logs");
    let tools = data.join("tools");
    let tmp = data.join("tmp");

    fs::create_dir_all(&data).with_context(|| format!("create data dir: {}", data.display()))?;
    fs::create_dir_all(&logs).with_context(|| format!("create logs dir: {}", logs.display()))?;
    fs::create_dir_all(&tools).with_context(|| format!("create tools dir: {}", tools.display()))?;
    fs::create_dir_all(&tmp).with_context(|| format!("create tmp dir: {}", tmp.display()))?;

    Ok(AppDirs {
        data,
        logs,
        tools,
        tmp,
    })
}

#[derive(Debug, Clone)]
pub struct AppDirs {
    pub data: PathBuf,
    pub logs: PathBuf,
    pub tools: PathBuf,
    pub tmp: PathBuf,
}

impl Db {
    /// Open database connection at the per-user location and apply migrations.
    pub fn open() -> Result<Self> {
        let dirs = ensure_app_dirs()?;
        let path = dirs.data.join("downlink.sqlite3");

        let mut conn = Connection::open(&path)
            .with_context(|| format!("open sqlite db: {}", path.display()))?;

        // pragmatic defaults for a desktop app:
        // - WAL for concurrency
        // - foreign keys ON
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;

        migrate(&mut conn)?;

        Ok(Self { conn, path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn conn_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }

    /// Insert a new download record in `queued` state.
    pub fn insert_download(
        &mut self,
        source_url: &str,
        source_kind: SourceKind,
        parent_id: Option<Uuid>,
        preset_id: &str,
        output_dir: &str,
    ) -> Result<Uuid> {
        let id = Uuid::new_v4();
        let now = Utc::now();

        self.conn.execute(
            r#"
            INSERT INTO downloads (
              id, created_at, updated_at,
              source_url, source_kind, parent_id,
              title, uploader, duration_seconds, thumbnail_url,
              status, phase,
              preset_id, output_dir,
              final_path,
              progress_percent, bytes_downloaded, bytes_total, speed_bps, eta_seconds,
              error_code, error_message
            ) VALUES (
              ?1, ?2, ?3,
              ?4, ?5, ?6,
              NULL, NULL, NULL, NULL,
              ?7, NULL,
              ?8, ?9,
              NULL,
              NULL, NULL, NULL, NULL, NULL,
              NULL, NULL
            )
            "#,
            params![
                id.to_string(),
                now.to_rfc3339(),
                now.to_rfc3339(),
                source_url,
                source_kind.as_str(),
                parent_id.map(|p| p.to_string()),
                DownloadStatus::Queued.as_str(),
                preset_id,
                output_dir
            ],
        )?;

        Ok(id)
    }

    /// Retrieve a download row by id.
    pub fn get_download(&mut self, id: Uuid) -> Result<Option<DownloadRow>> {
        let row = self
            .conn
            .query_row(
                r#"
                SELECT
                  id, created_at, updated_at,
                  source_url, source_kind, parent_id,
                  title, uploader, duration_seconds, thumbnail_url,
                  status, phase,
                  preset_id, output_dir,
                  final_path,
                  progress_percent, bytes_downloaded, bytes_total, speed_bps, eta_seconds,
                  error_code, error_message
                FROM downloads
                WHERE id = ?1
                "#,
                params![id.to_string()],
                |r| {
                    let id: String = r.get(0)?;
                    let created_at: String = r.get(1)?;
                    let updated_at: String = r.get(2)?;
                    let source_url: String = r.get(3)?;
                    let source_kind: String = r.get(4)?;
                    let parent_id: Option<String> = r.get(5)?;
                    let title: Option<String> = r.get(6)?;
                    let uploader: Option<String> = r.get(7)?;
                    let duration_seconds: Option<i64> = r.get(8)?;
                    let thumbnail_url: Option<String> = r.get(9)?;
                    let status: String = r.get(10)?;
                    let phase: Option<String> = r.get(11)?;
                    let preset_id: String = r.get(12)?;
                    let output_dir: String = r.get(13)?;
                    let final_path: Option<String> = r.get(14)?;
                    let progress_percent: Option<f64> = r.get(15)?;
                    let bytes_downloaded: Option<i64> = r.get(16)?;
                    let bytes_total: Option<i64> = r.get(17)?;
                    let speed_bps: Option<i64> = r.get(18)?;
                    let eta_seconds: Option<i64> = r.get(19)?;
                    let error_code: Option<String> = r.get(20)?;
                    let error_message: Option<String> = r.get(21)?;

                    let id = Uuid::parse_str(&id).map_err(|_| rusqlite::Error::InvalidQuery)?;
                    let created_at = DateTime::parse_from_rfc3339(&created_at)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?
                        .with_timezone(&Utc);
                    let updated_at = DateTime::parse_from_rfc3339(&updated_at)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?
                        .with_timezone(&Utc);

                    let source_kind =
                        SourceKind::from_str(&source_kind).ok_or(rusqlite::Error::InvalidQuery)?;
                    let parent_id = match parent_id {
                        Some(s) => {
                            Some(Uuid::parse_str(&s).map_err(|_| rusqlite::Error::InvalidQuery)?)
                        }
                        None => None,
                    };

                    let status =
                        DownloadStatus::from_str(&status).ok_or(rusqlite::Error::InvalidQuery)?;

                    Ok(DownloadRow {
                        id,
                        created_at,
                        updated_at,
                        source_url,
                        source_kind,
                        parent_id,
                        title,
                        uploader,
                        duration_seconds,
                        thumbnail_url,
                        status,
                        phase,
                        preset_id,
                        output_dir,
                        final_path,
                        progress_percent,
                        bytes_downloaded,
                        bytes_total,
                        speed_bps,
                        eta_seconds,
                        error_code,
                        error_message,
                    })
                },
            )
            .optional()?;

        Ok(row)
    }

    /// Updates a download status+phase+updated_at.
    pub fn set_status(
        &mut self,
        id: Uuid,
        status: DownloadStatus,
        phase: Option<&str>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            r#"
            UPDATE downloads
            SET status = ?2, phase = ?3, updated_at = ?4
            WHERE id = ?1
            "#,
            params![id.to_string(), status.as_str(), phase, now],
        )?;
        Ok(())
    }

    /// Update metadata fields for a download.
    pub fn update_metadata(
        &mut self,
        id: Uuid,
        title: Option<&str>,
        uploader: Option<&str>,
        duration_seconds: Option<i64>,
        thumbnail_url: Option<&str>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            r#"
            UPDATE downloads
            SET title = ?2, uploader = ?3, duration_seconds = ?4, thumbnail_url = ?5, updated_at = ?6
            WHERE id = ?1
            "#,
            params![id.to_string(), title, uploader, duration_seconds, thumbnail_url, now],
        )?;
        Ok(())
    }

    /// Update progress fields for a download.
    pub fn update_progress(
        &mut self,
        id: Uuid,
        percent: Option<f64>,
        bytes_downloaded: Option<i64>,
        bytes_total: Option<i64>,
        speed_bps: Option<i64>,
        eta_seconds: Option<i64>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            r#"
            UPDATE downloads
            SET progress_percent = ?2, bytes_downloaded = ?3, bytes_total = ?4,
                speed_bps = ?5, eta_seconds = ?6, updated_at = ?7
            WHERE id = ?1
            "#,
            params![
                id.to_string(),
                percent,
                bytes_downloaded,
                bytes_total,
                speed_bps,
                eta_seconds,
                now
            ],
        )?;
        Ok(())
    }

    /// Set the final path for a completed download.
    pub fn set_final_path(&mut self, id: Uuid, final_path: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            r#"
            UPDATE downloads
            SET final_path = ?2, updated_at = ?3
            WHERE id = ?1
            "#,
            params![id.to_string(), final_path, now],
        )?;
        Ok(())
    }

    /// Set error information for a failed download.
    pub fn set_error(
        &mut self,
        id: Uuid,
        error_code: Option<&str>,
        error_message: Option<&str>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            r#"
            UPDATE downloads
            SET error_code = ?2, error_message = ?3, status = ?4, phase = ?5, updated_at = ?6
            WHERE id = ?1
            "#,
            params![
                id.to_string(),
                error_code,
                error_message,
                DownloadStatus::Failed.as_str(),
                "Failed",
                now
            ],
        )?;
        Ok(())
    }

    /// Delete a download by ID.
    pub fn delete_download(&mut self, id: Uuid) -> Result<()> {
        self.conn.execute(
            "DELETE FROM downloads WHERE id = ?1",
            params![id.to_string()],
        )?;
        Ok(())
    }

    /// Get all active downloads (not completed, canceled, or failed).
    pub fn get_active_downloads(&mut self) -> Result<Vec<DownloadRow>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT
                id, created_at, updated_at,
                source_url, source_kind, parent_id,
                title, uploader, duration_seconds, thumbnail_url,
                status, phase,
                preset_id, output_dir,
                final_path,
                progress_percent, bytes_downloaded, bytes_total, speed_bps, eta_seconds,
                error_code, error_message
            FROM downloads
            WHERE status NOT IN ('done', 'canceled')
            ORDER BY created_at DESC
            "#,
        )?;

        let rows = stmt.query_map([], |row| Self::row_to_download(row))?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Get completed downloads (done status).
    pub fn get_completed_downloads(&mut self, limit: u32) -> Result<Vec<DownloadRow>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT
                id, created_at, updated_at,
                source_url, source_kind, parent_id,
                title, uploader, duration_seconds, thumbnail_url,
                status, phase,
                preset_id, output_dir,
                final_path,
                progress_percent, bytes_downloaded, bytes_total, speed_bps, eta_seconds,
                error_code, error_message
            FROM downloads
            WHERE status = 'done'
            ORDER BY updated_at DESC
            LIMIT ?1
            "#,
        )?;

        let rows = stmt.query_map(params![limit], |row| Self::row_to_download(row))?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Get IDs of all queued downloads.
    pub fn get_queued_download_ids(&mut self) -> Result<Vec<Uuid>> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM downloads WHERE status IN ('queued', 'ready', 'stopped') ORDER BY created_at ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            let id_str: String = row.get(0)?;
            Uuid::parse_str(&id_str).map_err(|_| rusqlite::Error::InvalidQuery)
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Clear all queued downloads (not started yet).
    pub fn clear_queued_downloads(&mut self) -> Result<()> {
        self.conn
            .execute("DELETE FROM downloads WHERE status = 'queued'", [])?;
        Ok(())
    }

    /// Clear all completed downloads from history.
    pub fn clear_completed_downloads(&mut self) -> Result<()> {
        self.conn.execute(
            "DELETE FROM downloads WHERE status IN ('done', 'canceled', 'failed')",
            [],
        )?;
        Ok(())
    }

    /// Get downloads by parent ID (for playlist items).
    pub fn get_playlist_items(&mut self, parent_id: Uuid) -> Result<Vec<DownloadRow>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT
                id, created_at, updated_at,
                source_url, source_kind, parent_id,
                title, uploader, duration_seconds, thumbnail_url,
                status, phase,
                preset_id, output_dir,
                final_path,
                progress_percent, bytes_downloaded, bytes_total, speed_bps, eta_seconds,
                error_code, error_message
            FROM downloads
            WHERE parent_id = ?1
            ORDER BY created_at ASC
            "#,
        )?;

        let rows = stmt.query_map(params![parent_id.to_string()], |row| {
            Self::row_to_download(row)
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Count downloads by status.
    pub fn count_by_status(&mut self, status: DownloadStatus) -> Result<u64> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM downloads WHERE status = ?1",
            params![status.as_str()],
            |row| row.get(0),
        )?;
        Ok(count as u64)
    }

    /// Helper function to convert a database row to DownloadRow.
    fn row_to_download(row: &Row) -> rusqlite::Result<DownloadRow> {
        let id: String = row.get(0)?;
        let created_at: String = row.get(1)?;
        let updated_at: String = row.get(2)?;
        let source_url: String = row.get(3)?;
        let source_kind: String = row.get(4)?;
        let parent_id: Option<String> = row.get(5)?;
        let title: Option<String> = row.get(6)?;
        let uploader: Option<String> = row.get(7)?;
        let duration_seconds: Option<i64> = row.get(8)?;
        let thumbnail_url: Option<String> = row.get(9)?;
        let status: String = row.get(10)?;
        let phase: Option<String> = row.get(11)?;
        let preset_id: String = row.get(12)?;
        let output_dir: String = row.get(13)?;
        let final_path: Option<String> = row.get(14)?;
        let progress_percent: Option<f64> = row.get(15)?;
        let bytes_downloaded: Option<i64> = row.get(16)?;
        let bytes_total: Option<i64> = row.get(17)?;
        let speed_bps: Option<i64> = row.get(18)?;
        let eta_seconds: Option<i64> = row.get(19)?;
        let error_code: Option<String> = row.get(20)?;
        let error_message: Option<String> = row.get(21)?;

        let id = Uuid::parse_str(&id).map_err(|_| rusqlite::Error::InvalidQuery)?;
        let created_at = DateTime::parse_from_rfc3339(&created_at)
            .map_err(|_| rusqlite::Error::InvalidQuery)?
            .with_timezone(&Utc);
        let updated_at = DateTime::parse_from_rfc3339(&updated_at)
            .map_err(|_| rusqlite::Error::InvalidQuery)?
            .with_timezone(&Utc);

        let source_kind =
            SourceKind::from_str(&source_kind).ok_or(rusqlite::Error::InvalidQuery)?;
        let parent_id = match parent_id {
            Some(s) => Some(Uuid::parse_str(&s).map_err(|_| rusqlite::Error::InvalidQuery)?),
            None => None,
        };

        let status = DownloadStatus::from_str(&status).ok_or(rusqlite::Error::InvalidQuery)?;

        Ok(DownloadRow {
            id,
            created_at,
            updated_at,
            source_url,
            source_kind,
            parent_id,
            title,
            uploader,
            duration_seconds,
            thumbnail_url,
            status,
            phase,
            preset_id,
            output_dir,
            final_path,
            progress_percent,
            bytes_downloaded,
            bytes_total,
            speed_bps,
            eta_seconds,
            error_code,
            error_message,
        })
    }

    /// Add a log entry for a download.
    pub fn add_log_entry(&mut self, download_id: Uuid, stream: &str, line: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            r#"
            INSERT INTO download_logs (download_id, ts, stream, line)
            VALUES (?1, ?2, ?3, ?4)
            "#,
            params![download_id.to_string(), now, stream, line],
        )?;
        Ok(())
    }

    /// Get recent log entries for a download.
    pub fn get_log_entries(
        &mut self,
        download_id: Uuid,
        limit: u32,
    ) -> Result<Vec<(String, String, String)>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT ts, stream, line
            FROM download_logs
            WHERE download_id = ?1
            ORDER BY id DESC
            LIMIT ?2
            "#,
        )?;

        let rows = stmt.query_map(params![download_id.to_string(), limit], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        result.reverse(); // Return in chronological order
        Ok(result)
    }

    /// Trim old log entries to keep database size manageable.
    pub fn trim_logs(&mut self, download_id: Uuid, keep_count: u32) -> Result<()> {
        self.conn.execute(
            r#"
            DELETE FROM download_logs
            WHERE download_id = ?1
            AND id NOT IN (
                SELECT id FROM download_logs
                WHERE download_id = ?1
                ORDER BY id DESC
                LIMIT ?2
            )
            "#,
            params![download_id.to_string(), keep_count],
        )?;
        Ok(())
    }
}

/// Apply migrations to bring database to current schema.
fn migrate(conn: &mut Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        "#,
    )?;

    // Ensure meta row exists for schema_version.
    let existing: Option<String> = conn
        .query_row(
            r#"SELECT value FROM meta WHERE key = 'schema_version'"#,
            [],
            |r| r.get(0),
        )
        .optional()?;

    let current_version: i64 = existing
        .as_deref()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    if current_version > SCHEMA_VERSION {
        return Err(anyhow!(
            "db schema version {} is newer than app supports {}",
            current_version,
            SCHEMA_VERSION
        ));
    }

    if current_version == 0 {
        migration_v1(conn)?;
        set_schema_version(conn, 1)?;
    }

    // Future:
    // if current_version < 2 { migration_v2(conn)?; set_schema_version(conn, 2)?; }

    Ok(())
}

fn set_schema_version(conn: &mut Connection, v: i64) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO meta(key, value) VALUES('schema_version', ?1)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        "#,
        params![v.to_string()],
    )?;
    Ok(())
}

fn migration_v1(conn: &mut Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS downloads (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,

          source_url TEXT NOT NULL,
          source_kind TEXT NOT NULL,
          parent_id TEXT NULL,

          title TEXT NULL,
          uploader TEXT NULL,
          duration_seconds INTEGER NULL,
          thumbnail_url TEXT NULL,

          status TEXT NOT NULL,
          phase TEXT NULL,

          preset_id TEXT NOT NULL,
          output_dir TEXT NOT NULL,

          final_path TEXT NULL,

          progress_percent REAL NULL,
          bytes_downloaded INTEGER NULL,
          bytes_total INTEGER NULL,
          speed_bps INTEGER NULL,
          eta_seconds INTEGER NULL,

          error_code TEXT NULL,
          error_message TEXT NULL,

          FOREIGN KEY(parent_id) REFERENCES downloads(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
        CREATE INDEX IF NOT EXISTS idx_downloads_parent ON downloads(parent_id);
        CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at);

        CREATE TABLE IF NOT EXISTS download_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          download_id TEXT NOT NULL,
          ts TEXT NOT NULL,
          stream TEXT NOT NULL,
          line TEXT NOT NULL,
          FOREIGN KEY(download_id) REFERENCES downloads(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_download_logs_download_id ON download_logs(download_id);

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tools (
          tool TEXT PRIMARY KEY,
          version TEXT NOT NULL,
          path TEXT NOT NULL,
          last_checked_at TEXT NULL,
          update_channel TEXT NOT NULL,
          status TEXT NOT NULL
        );
        "#,
    )?;

    Ok(())
}
