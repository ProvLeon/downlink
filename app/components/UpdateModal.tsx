"use client";

import { useState, useCallback, useRef } from "react";
import { DownloadCloud, X, Loader2, RefreshCw } from "lucide-react";
import { useModalAnimation } from "../hooks/useModalAnimation";

import type { UpdateAvailableState } from "../hooks/useDownlink";

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateState: UpdateAvailableState;
  installAppUpdate: () => Promise<void>;
  restartApp: () => Promise<void>;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function UpdateModal({
  isOpen,
  onClose,
  updateState,
  installAppUpdate,
  restartApp,
}: UpdateModalProps) {
  const {
    latestVersion: version,
    releaseNotes,
    downloading,
    downloadProgress,
    readyToInstall,
    error,
  } = updateState;

  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { renderState } = useModalAnimation({
    isOpen,
    onClose,
    targetId: "update-button",
    modalRef,
    backdropRef,
    contentRef,
  });

  const handleDownload = useCallback(() => {
    installAppUpdate().catch(() => {});
  }, [installAppUpdate]);

  const handleRestart = useCallback(() => {
    restartApp().catch(() => {});
  }, [restartApp]);

  let progressPercent = 0;
  if (downloadProgress && downloadProgress.total) {
    progressPercent = Math.min(100, Math.round((downloadProgress.downloaded / downloadProgress.total) * 100));
  } else if (downloadProgress && downloadProgress.downloaded > 0) {
    progressPercent = 50;
  }

  if (!renderState) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        ref={backdropRef}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div 
        ref={modalRef}
        className="relative z-10 w-full max-w-md transform overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/90 text-left shadow-2xl backdrop-blur-xl"
      >
        {/* Inner Content Wrapper for Fading */}
        <div ref={contentRef}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                <DownloadCloud className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold leading-6 text-white">
                  Software Update
                </h3>
                <p className="text-sm text-zinc-400">
                  Downlink {version}
                </p>
              </div>
            </div>
                {!downloading && (
                  <button
                    onClick={onClose}
                    className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* Content */}
              <div className="px-6 py-5">
                {error ? (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                    <p className="font-medium">Failed to update</p>
                    <p className="mt-1 text-red-300/80">{error}</p>
                  </div>
                ) : readyToInstall ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                      <RefreshCw className="h-8 w-8" />
                    </div>
                    <h4 className="text-lg font-medium text-white">Ready to Install</h4>
                    <p className="mt-2 text-sm text-zinc-400">
                      The update has been downloaded successfully. Restart Downlink to apply the new version.
                    </p>
                  </div>
                ) : downloading ? (
                  <div className="space-y-4 py-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-white">Downloading update...</span>
                      <span className="text-zinc-400">
                        {downloadProgress?.total 
                          ? `${formatBytes(downloadProgress.downloaded)} / ${formatBytes(downloadProgress.total)}`
                          : formatBytes(downloadProgress?.downloaded ?? 0)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300 ease-out" 
                        style={{ width: `${progressPercent}%` }} 
                      />
                    </div>
                    <p className="text-xs text-zinc-500">
                      You can hide this window while the update downloads in the background.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-zinc-300">
                      A new version of Downlink is available. We recommend updating to the latest version for the best experience.
                    </p>
                    
                    {releaseNotes && (
                      <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-white/5 bg-black/20 p-4 text-sm text-zinc-300 custom-scrollbar">
                        <h4 className="mb-2 font-medium text-zinc-200">Release Notes</h4>
                        <div className="whitespace-pre-wrap font-mono text-xs opacity-80 leading-relaxed">
                          {releaseNotes}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Controls */}
              <div className="flex items-center justify-end gap-3 border-t border-white/5 bg-zinc-950/50 px-6 py-4">
                {readyToInstall ? (
                  <>
                    <button
                      type="button"
                      className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                      onClick={onClose}
                    >
                      Later
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                      onClick={handleRestart}
                    >
                      Restart Now
                    </button>
                  </>
                ) : downloading ? (
                  <button
                    type="button"
                    className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                    onClick={onClose}
                  >
                    Hide
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                      onClick={onClose}
                    >
                      Not Now
                    </button>
                    <button
                      type="button"
                      className="flex min-w-[140px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                      onClick={handleDownload}
                    >
                      <span>Download Update</span>
                    </button>
                  </>
                )}
          </div>
        </div>
      </div>
    </div>
  );
}
