"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { AppUpdateInfo } from "../types";

interface AppUpdaterProps {
  checkAppUpdate: () => Promise<AppUpdateInfo>;
  installAppUpdate: () => Promise<void>;
  restartApp: () => Promise<void>;
  currentVersion: string | null;
}

type UpdateState = "idle" | "checking" | "downloading" | "ready" | "error";

export function AppUpdater({
  checkAppUpdate,
  installAppUpdate,
  restartApp,
  currentVersion,
}: AppUpdaterProps) {
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const handleCheckForUpdate = useCallback(async () => {
    setUpdateState("checking");
    setError(null);

    try {
      const info = await checkAppUpdate();
      setUpdateInfo(info);
      setLastChecked(new Date());
      setUpdateState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to check for updates");
      setUpdateState("error");
    }
  }, [checkAppUpdate]);

  const handleInstallUpdate = useCallback(async () => {
    setUpdateState("downloading");
    setError(null);

    try {
      await installAppUpdate();
      setUpdateState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to install update");
      setUpdateState("error");
    }
  }, [installAppUpdate]);

  const handleRestart = useCallback(async () => {
    try {
      await restartApp();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restart app");
    }
  }, [restartApp]);

  // Auto-check for updates on mount
  const hasCheckedRef = useRef(false);
  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    // Check in background after a short delay
    const timer = setTimeout(() => {
      checkAppUpdate()
        .then((info) => {
          setUpdateInfo(info);
          setLastChecked(new Date());
        })
        .catch((e) => {
          // Silently fail on auto-check - user can manually check
          console.warn("Auto-check for updates failed:", e);
        });
    }, 1000);

    return () => clearTimeout(timer);
  }, [checkAppUpdate]);

  return (
    <div className="space-y-4">
      {/* Current version */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Current Version</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {currentVersion || "Unknown"}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCheckForUpdate}
          disabled={updateState === "checking" || updateState === "downloading"}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          {updateState === "checking" ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Checking…
            </span>
          ) : (
            "Check for Updates"
          )}
        </button>
      </div>

      {/* Last checked */}
      {lastChecked && (
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          Last checked: {lastChecked.toLocaleString()}
        </div>
      )}

      {/* Update available */}
      {updateInfo?.available && updateState !== "ready" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                  />
                </svg>
                <span className="font-medium text-blue-800 dark:text-blue-200">
                  Update Available
                </span>
              </div>
              <div className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                Version {updateInfo.latest_version} is available
              </div>
              {updateInfo.release_notes && (
                <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 max-h-24 overflow-y-auto">
                  <div className="font-medium mb-1">Release Notes:</div>
                  <div className="whitespace-pre-wrap">{updateInfo.release_notes}</div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleInstallUpdate}
              disabled={updateState === "downloading"}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateState === "downloading" ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Downloading…
                </span>
              ) : (
                "Download & Install"
              )}
            </button>
          </div>
        </div>
      )}

      {/* No update available */}
      {updateInfo && !updateInfo.available && updateState === "idle" && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/30">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="font-medium text-green-800 dark:text-green-200">
              You&apos;re up to date!
            </span>
          </div>
          <div className="mt-1 text-sm text-green-700 dark:text-green-300">
            Downlink {currentVersion} is the latest version.
          </div>
        </div>
      )}

      {/* Update ready - restart required */}
      {updateState === "ready" && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/30">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="font-medium text-green-800 dark:text-green-200">
                  Update Ready
                </span>
              </div>
              <div className="mt-1 text-sm text-green-700 dark:text-green-300">
                The update has been downloaded. Restart to apply.
              </div>
            </div>
            <button
              type="button"
              onClick={handleRestart}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              Restart Now
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-red-600 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-medium text-red-800 dark:text-red-200">
              Update Error
            </span>
          </div>
          <div className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</div>
        </div>
      )}

      {/* Auto-update setting info */}
      <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          <p>
            Downlink will automatically check for updates when you open the app.
            Updates are downloaded in the background and applied on restart.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AppUpdater;
