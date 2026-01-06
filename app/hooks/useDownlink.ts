"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AddUrlsOptions,
  AddUrlsResult,
  AppUpdateInfo,
  DownlinkEvent,
  ExpandPlaylistOptions,
  ExpandPlaylistResult,
  FetchMetadataOptions,
  FetchMetadataResult,
  PresetInfo,
  QueueItem,
  ToolchainStatus,
  UserSettings,
  WindowState,
} from "../types";

// Update check state
export interface UpdateAvailableState {
  available: boolean;
  latestVersion: string | null;
  dismissed: boolean;
}

// Event name used by the backend
const DOWNLINK_EVENT_NAME = "downlink://event";

// Hook return type
export interface UseDownlinkReturn {
  // State
  isTauri: boolean;
  isReady: boolean;
  appVersion: string | null;
  ytDlpVersion: string | null;
  ffmpegVersion: string | null;

  // Update state
  updateAvailable: UpdateAvailableState;
  dismissUpdateNotification: () => void;

  // Queue state
  queue: QueueItem[];
  history: QueueItem[];
  refreshQueue: () => Promise<void>;
  refreshHistory: () => Promise<void>;

  // URL operations
  addUrls: (urlsText: string, options: AddUrlsOptions) => Promise<AddUrlsResult>;
  fetchMetadata: (url: string, options: FetchMetadataOptions) => Promise<FetchMetadataResult>;
  expandPlaylist: (playlistUrl: string, options: ExpandPlaylistOptions) => Promise<ExpandPlaylistResult>;
  extractUrls: (text: string) => Promise<string[]>;

  // Download control
  startDownload: (id: string) => Promise<void>;
  stopDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  retryDownload: (id: string) => Promise<void>;
  startAllDownloads: () => Promise<void>;
  stopAllDownloads: () => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  clearHistory: () => Promise<void>;

  // Settings
  getSettings: () => Promise<UserSettings>;
  saveSettings: (settings: UserSettings) => Promise<void>;
  getWindowState: () => Promise<WindowState>;
  saveWindowState: (state: WindowState) => Promise<void>;

  // Tools
  getToolchainStatus: () => Promise<ToolchainStatus>;
  checkForUpdates: () => Promise<string[]>;
  updateTool: (toolName: string) => Promise<string>;

  // App updates
  checkAppUpdate: () => Promise<AppUpdateInfo>;
  installAppUpdate: () => Promise<void>;
  restartApp: () => Promise<void>;

  // Presets
  getPresets: () => Promise<PresetInfo[]>;

  // Utilities
  getAppDataDir: () => Promise<string>;
  getDefaultDownloadDir: () => Promise<string>;
  openFile: (path: string) => Promise<void>;
  openFolder: (path: string) => Promise<void>;

  // Error state
  lastError: string | null;
  clearError: () => void;
}

export function useDownlink(): UseDownlinkReturn {
  // State
  const [isTauri, setIsTauri] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [ytDlpVersion, setYtDlpVersion] = useState<string | null>(null);
  const [ffmpegVersion, setFfmpegVersion] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<QueueItem[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<UpdateAvailableState>({
    available: false,
    latestVersion: null,
    dismissed: false,
  });

  // Refs for cleanup
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Check if we're running in Tauri
  useEffect(() => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      setIsTauri(true);
    }
  }, []);

  // Normalize status from backend (handles SCREAMING_SNAKE_CASE to lowercase)
  const normalizeStatus = (status: string): QueueItem["status"] => {
    return status.toLowerCase() as QueueItem["status"];
  };

  // Handle backend events
  const handleEvent = useCallback((event: DownlinkEvent) => {
    console.log("[Downlink] Event received:", event.event, event.data);
    switch (event.event) {
      case "AppReady": {
        const data = event.data as {
          versions: {
            app_version: string;
            yt_dlp_version: string | null;
            ffmpeg_version: string | null;
          };
        };
        setAppVersion(data.versions.app_version);
        setYtDlpVersion(data.versions.yt_dlp_version);
        setFfmpegVersion(data.versions.ffmpeg_version);
        setIsReady(true);
        break;
      }

      case "DownloadProgress": {
        const data = event.data as {
          id: string;
          status: string;
          progress: {
            percent: number | null;
            speed_bps: number | null;
            eta_seconds: number | null;
            phase: { name: string } | null;
          };
        };
        console.log("[Downlink] Progress update for", data.id, "percent:", data.progress.percent);
        setQueue((prev) => {
          const updated = prev.map((item) =>
            item.id === data.id
              ? {
                ...item,
                status: normalizeStatus(data.status),
                progress_percent: data.progress.percent,
                speed_bps: data.progress.speed_bps,
                eta_seconds: data.progress.eta_seconds,
                phase: data.progress.phase?.name ?? null,
              }
              : item
          );
          console.log("[Downlink] Queue after update:", updated.find(i => i.id === data.id));
          return updated;
        });
        break;
      }

      case "DownloadCompleted": {
        const data = event.data as { id: string; final_path: string };
        setQueue((prev) =>
          prev.map((item) =>
            item.id === data.id
              ? {
                ...item,
                status: "done" as const,
                progress_percent: 100,
                final_path: data.final_path,
                phase: "Completed",
              }
              : item
          )
        );
        break;
      }

      case "DownloadFailed": {
        const data = event.data as {
          id: string;
          error_code: string;
          user_message: string;
        };
        setQueue((prev) =>
          prev.map((item) =>
            item.id === data.id
              ? {
                ...item,
                status: "failed" as const,
                phase: "Failed",
                error_message: data.user_message,
              }
              : item
          )
        );
        break;
      }

      case "DownloadStopped": {
        const data = event.data as { id: string };
        // Preserve progress when stopped - only update status and phase
        setQueue((prev) =>
          prev.map((item) =>
            item.id === data.id
              ? {
                ...item,
                status: "stopped" as const,
                phase: "Stopped",
                // Clear speed and ETA since we're not downloading anymore
                speed_bps: null,
                eta_seconds: null,
                // Keep progress_percent, bytes_downloaded, bytes_total as-is
              }
              : item
          )
        );
        break;
      }

      case "DownloadCanceled": {
        const data = event.data as { id: string };
        setQueue((prev) =>
          prev.map((item) =>
            item.id === data.id
              ? { ...item, status: "canceled" as const, phase: "Canceled" }
              : item
          )
        );
        break;
      }

      case "DownloadStarted": {
        const data = event.data as { id: string };
        setQueue((prev) =>
          prev.map((item) =>
            item.id === data.id
              ? { ...item, status: "downloading" as const, phase: "Starting…" }
              : item
          )
        );
        break;
      }

      case "MetadataReady": {
        const data = event.data as {
          id: string;
          info: {
            title: string | null;
            uploader: string | null;
            duration_seconds: number | null;
            thumbnail_url: string | null;
            webpage_url: string | null;
          };
        };
        console.log("[Downlink] MetadataReady for", data.id, "title:", data.info.title);
        setQueue((prev) =>
          prev.map((item) =>
            item.id === data.id
              ? {
                ...item,
                title: data.info.title ?? item.title,
                uploader: data.info.uploader ?? item.uploader,
                thumbnail_url: data.info.thumbnail_url ?? item.thumbnail_url,
                duration_seconds: data.info.duration_seconds ?? item.duration_seconds,
              }
              : item
          )
        );
        break;
      }

      case "DownloadPostProcessing": {
        const data = event.data as { id: string; step: string };
        setQueue((prev) =>
          prev.map((item) =>
            item.id === data.id
              ? {
                ...item,
                status: "postprocessing" as const,
                phase: data.step,
              }
              : item
          )
        );
        break;
      }
    }
  }, []);

  // Set up event listener
  useEffect(() => {
    if (!isTauri) return;

    const setupListener = async () => {
      try {
        console.log("[Downlink] Setting up event listener for:", DOWNLINK_EVENT_NAME);
        unlistenRef.current = await listen<DownlinkEvent>(
          DOWNLINK_EVENT_NAME,
          (event) => {
            console.log("[Downlink] Raw event received:", event);
            handleEvent(event.payload);
          }
        );
        console.log("[Downlink] Event listener set up successfully");
      } catch (e) {
        console.error("Failed to set up event listener:", e);
      }
    };

    setupListener();

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, [isTauri, handleEvent]);

  // Queue operations
  const refreshQueue = useCallback(async () => {
    if (!isTauri) return;
    try {
      const items = await invoke<QueueItem[]>("get_queue");
      setQueue(items);
    } catch (e) {
      setLastError(`Failed to refresh queue: ${e}`);
    }
  }, [isTauri]);

  const refreshHistory = useCallback(async () => {
    if (!isTauri) return;
    try {
      const items = await invoke<QueueItem[]>("get_history", { limit: 100 });
      setHistory(items);
    } catch (e) {
      setLastError(`Failed to refresh history: ${e}`);
    }
  }, [isTauri]);

  // Initial data load - must be after refreshQueue/refreshHistory are defined
  useEffect(() => {
    if (!isTauri) return;

    const loadInitialData = async () => {
      try {
        // Fetch app version first (since AppReady event may have been missed)
        try {
          const version = await invoke<string>("get_app_version");
          setAppVersion(version);
          setIsReady(true);
        } catch (e) {
          console.warn("Failed to get app version:", e);
        }

        await refreshQueue();
        await refreshHistory();

        // Check for app updates in the background
        try {
          const updateInfo = await invoke<AppUpdateInfo>("check_app_update");
          if (updateInfo.available) {
            setUpdateAvailable({
              available: true,
              latestVersion: updateInfo.latest_version,
              dismissed: false,
            });
          }
        } catch (e) {
          // Silently fail update check - not critical
          console.warn("Failed to check for updates:", e);
        }
      } catch (e) {
        console.error("Failed to load initial data:", e);
      }
    };

    loadInitialData();
  }, [isTauri, refreshQueue, refreshHistory]);

  // Dismiss update notification
  const dismissUpdateNotification = useCallback(() => {
    setUpdateAvailable(prev => ({ ...prev, dismissed: true }));
  }, []);

  // URL operations
  const addUrls = useCallback(
    async (urlsText: string, options: AddUrlsOptions): Promise<AddUrlsResult> => {
      const result = await invoke<AddUrlsResult>("add_urls", {
        urlsText: urlsText,
        options,
      });
      await refreshQueue();
      return result;
    },
    [refreshQueue]
  );

  const fetchMetadata = useCallback(
    async (
      url: string,
      options: FetchMetadataOptions
    ): Promise<FetchMetadataResult> => {
      const result = await invoke<FetchMetadataResult>("fetch_metadata", {
        url,
        options,
      });
      await refreshQueue();
      return result;
    },
    [refreshQueue]
  );

  const expandPlaylist = useCallback(
    async (
      playlistUrl: string,
      options: ExpandPlaylistOptions
    ): Promise<ExpandPlaylistResult> => {
      const result = await invoke<ExpandPlaylistResult>("expand_playlist", {
        playlistUrl: playlistUrl,
        options,
      });
      await refreshQueue();
      return result;
    },
    [refreshQueue]
  );

  const extractUrls = useCallback(async (text: string): Promise<string[]> => {
    return invoke<string[]>("extract_urls_from_text", { text });
  }, []);

  // Download control
  const startDownload = useCallback(async (id: string) => {
    await invoke("start_download", { id });
    await refreshQueue();
  }, [refreshQueue]);

  const stopDownload = useCallback(async (id: string) => {
    await invoke("stop_download", { id });
    // Don't refreshQueue here - the DownloadStopped event handler preserves progress
    // If we refresh, we'd lose the progress since it's not saved to DB
  }, []);

  const cancelDownload = useCallback(async (id: string) => {
    await invoke("cancel_download", { id });
    await refreshQueue();
  }, [refreshQueue]);

  const retryDownload = useCallback(async (id: string) => {
    await invoke("retry_download", { id });
    await refreshQueue();
  }, [refreshQueue]);

  const startAllDownloads = useCallback(async () => {
    await invoke("start_all_downloads");
    await refreshQueue();
  }, [refreshQueue]);

  const stopAllDownloads = useCallback(async () => {
    await invoke("stop_all_downloads");
    await refreshQueue();
  }, [refreshQueue]);

  const removeDownload = useCallback(
    async (id: string) => {
      await invoke("remove_download", { id });
      await refreshQueue();
    },
    [refreshQueue]
  );

  const clearQueue = useCallback(async () => {
    await invoke("clear_queue");
    await refreshQueue();
  }, [refreshQueue]);

  const clearHistory = useCallback(async () => {
    await invoke("clear_history");
    await refreshHistory();
  }, [refreshHistory]);

  // Settings
  const getSettings = useCallback(async (): Promise<UserSettings> => {
    return invoke<UserSettings>("get_settings");
  }, []);

  const saveSettings = useCallback(
    async (settings: UserSettings): Promise<void> => {
      await invoke("save_settings", { settings });
    },
    []
  );

  const getWindowState = useCallback(async (): Promise<WindowState> => {
    return invoke<WindowState>("get_window_state");
  }, []);

  const saveWindowState = useCallback(
    async (windowState: WindowState): Promise<void> => {
      await invoke("save_window_state", { windowState: windowState });
    },
    []
  );

  // Tools
  const getToolchainStatus = useCallback(async (): Promise<ToolchainStatus> => {
    return invoke<ToolchainStatus>("get_toolchain_status");
  }, []);

  const checkForUpdates = useCallback(async (): Promise<string[]> => {
    return invoke<string[]>("check_for_updates");
  }, []);

  const updateTool = useCallback(async (toolName: string): Promise<string> => {
    return invoke<string>("update_tool", { toolName: toolName });
  }, []);

  // App updates
  const checkAppUpdate = useCallback(async (): Promise<AppUpdateInfo> => {
    return invoke<AppUpdateInfo>("check_app_update");
  }, []);

  const installAppUpdate = useCallback(async (): Promise<void> => {
    await invoke("install_app_update");
  }, []);

  const restartApp = useCallback(async (): Promise<void> => {
    await invoke("restart_app");
  }, []);

  // Presets
  const getPresets = useCallback(async (): Promise<PresetInfo[]> => {
    return invoke<PresetInfo[]>("get_presets");
  }, []);

  // Utilities
  const getAppDataDir = useCallback(async (): Promise<string> => {
    return invoke<string>("get_app_data_dir");
  }, []);

  const getDefaultDownloadDir = useCallback(async (): Promise<string> => {
    return invoke<string>("get_default_download_dir");
  }, []);

  const openFile = useCallback(async (path: string): Promise<void> => {
    await invoke("open_file", { path });
  }, []);

  const openFolder = useCallback(async (path: string): Promise<void> => {
    await invoke("open_folder", { path });
  }, []);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  return {
    // State
    isTauri,
    isReady,
    appVersion,
    ytDlpVersion,
    ffmpegVersion,

    // Update state
    updateAvailable,
    dismissUpdateNotification,

    // Queue state
    queue,
    history,
    refreshQueue,
    refreshHistory,

    // URL operations
    addUrls,
    fetchMetadata,
    expandPlaylist,
    extractUrls,

    // Download control
    startDownload,
    stopDownload,
    cancelDownload,
    retryDownload,
    startAllDownloads,
    stopAllDownloads,
    removeDownload,
    clearQueue,
    clearHistory,

    // Settings
    getSettings,
    saveSettings,
    getWindowState,
    saveWindowState,

    // Tools
    getToolchainStatus,
    checkForUpdates,
    updateTool,

    // App updates
    checkAppUpdate,
    installAppUpdate,
    restartApp,

    // Presets
    getPresets,

    // Utilities
    getAppDataDir,
    getDefaultDownloadDir,
    openFile,
    openFolder,

    // Error state
    lastError,
    clearError,
  };
}
