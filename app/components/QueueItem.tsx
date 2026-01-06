"use client";

import { useCallback, useMemo } from "react";
import type { QueueItem as QueueItemType } from "../types";
import { formatBytes, formatSpeed, formatEta, getStatusColor, getStatusLabel } from "../types";

interface QueueItemProps {
  item: QueueItemType;
  onStart?: (id: string) => void;
  onStop?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  onOpenFile?: (path: string) => void;
  onOpenFolder?: (path: string) => void;
}

export function QueueItemComponent({
  item,
  onStart,
  onStop,
  onCancel,
  onRetry,
  onRemove,
  onOpenFile,
  onOpenFolder,
}: QueueItemProps) {
  const handleStart = useCallback(() => onStart?.(item.id), [item.id, onStart]);
  const handleStop = useCallback(() => onStop?.(item.id), [item.id, onStop]);
  const handleCancel = useCallback(() => onCancel?.(item.id), [item.id, onCancel]);
  const handleRetry = useCallback(() => onRetry?.(item.id), [item.id, onRetry]);
  const handleRemove = useCallback(() => onRemove?.(item.id), [item.id, onRemove]);
  const handleOpenFile = useCallback(
    () => item.final_path && onOpenFile?.(item.final_path),
    [item.final_path, onOpenFile]
  );
  const isDone = item.status === "done";
  const isActive =
    item.status === "downloading" || item.status === "postprocessing" || item.status === "fetching";
  const isQueued = item.status === "queued" || item.status === "ready";
  const isStopped = item.status === "stopped";
  const isFailed = item.status === "failed";
  const isCanceled = item.status === "canceled";

  const handleOpenFolder = useCallback(() => {
    // For incomplete downloads, just open the output directory
    // Only use final_path if the download is complete
    const path = isDone && item.final_path ? item.final_path : item.output_dir;
    if (path) onOpenFolder?.(path);
  }, [item.final_path, item.output_dir, onOpenFolder, isDone]);

  const displayTitle = item.title || item.source_url;
  const displaySubtitle = item.uploader || (item.title ? item.source_url : null);

  const speedText = useMemo(() => {
    if (!isActive || !item.speed_bps) return null;
    return formatSpeed(item.speed_bps);
  }, [isActive, item.speed_bps]);

  const etaText = useMemo(() => {
    if (!isActive || !item.eta_seconds) return null;
    return formatEta(item.eta_seconds);
  }, [isActive, item.eta_seconds]);

  const progressPercent = item.progress_percent ?? 0;

  const sizeText = useMemo(() => {
    if (item.bytes_total) {
      if (item.bytes_downloaded && isActive) {
        return `${formatBytes(item.bytes_downloaded)} / ${formatBytes(item.bytes_total)}`;
      }
      return formatBytes(item.bytes_total);
    }
    return null;
  }, [item.bytes_total, item.bytes_downloaded, isActive]);

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start gap-2">
        {/* Thumbnail */}
        <div className="shrink-0">
          {item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt=""
              className="h-10 w-16 rounded-lg object-cover bg-zinc-200 dark:bg-zinc-800"
            />
          ) : (
            <div className="h-10 w-16 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Info and Actions */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold" title={displayTitle}>
                {displayTitle}
              </div>
              {displaySubtitle && (
                <div
                  className="truncate text-[10px] text-zinc-500 dark:text-zinc-400"
                  title={displaySubtitle}
                >
                  {displaySubtitle}
                </div>
              )}
            </div>

            {/* Actions - icon buttons for compact view */}
            <div className="flex shrink-0 items-center gap-0.5">
              {isQueued && (
                <button
                  type="button"
                  onClick={handleStart}
                  className="cursor-pointer rounded p-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  title="Start download"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                </button>
              )}

              {isActive && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="cursor-pointer rounded p-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  title="Stop download"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                  </svg>
                </button>
              )}

              {isStopped && (
                <button
                  type="button"
                  onClick={handleStart}
                  className="cursor-pointer rounded p-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  title="Resume download"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                </button>
              )}

              {isFailed && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="cursor-pointer rounded p-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  title="Retry download"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}

              {isDone && item.final_path && (
                <button
                  type="button"
                  onClick={handleOpenFile}
                  className="cursor-pointer rounded p-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  title="Open file"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              )}

              {(isDone || item.output_dir) && (
                <button
                  type="button"
                  onClick={handleOpenFolder}
                  className="cursor-pointer rounded p-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  title={isDone ? "Reveal in folder" : "Open download folder"}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </button>
              )}

              {(isQueued || isStopped || isFailed || isCanceled) && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="cursor-pointer rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                  title="Remove from queue"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}

              {isActive && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="cursor-pointer rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                  title="Cancel download"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="mt-0.5 flex items-center gap-1">
            <span className={`text-[10px] font-medium ${getStatusColor(item.status)}`}>
              {item.phase || getStatusLabel(item.status)}
            </span>
            {isFailed && item.error_message && (
              <span
                className="text-[10px] text-red-500 truncate max-w-[120px]"
                title={item.error_message}
              >
                — {item.error_message}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {(isActive || isStopped || isDone) && (
        <div className="mt-1.5 ml-[72px]">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${isDone
                ? "bg-green-500"
                : isStopped
                  ? "bg-yellow-500"
                  : "bg-blue-500"
                }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
            <span>{speedText || ""}</span>
            <span>
              {isDone
                ? sizeText || "100%"
                : progressPercent > 0
                  ? `${progressPercent.toFixed(1)}%${sizeText ? ` · ${sizeText}` : ""}`
                  : sizeText || ""}
            </span>
            <span>{etaText || ""}</span>
          </div>
        </div>
      )}
    </li>
  );
}

export default QueueItemComponent;
