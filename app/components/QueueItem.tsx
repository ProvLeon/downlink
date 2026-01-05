"use client";

import { useCallback, useMemo } from "react";
import type { QueueItem as QueueItemType } from "../types";
import { formatSpeed, formatEta, getStatusColor, getStatusLabel } from "../types";

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

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        {/* Thumbnail */}
        <div className="shrink-0">
          {item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt=""
              className="h-12 w-20 rounded-lg object-cover bg-zinc-200 dark:bg-zinc-800"
            />
          ) : (
            <div className="h-12 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-zinc-400"
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

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" title={displayTitle}>
            {displayTitle}
          </div>
          {displaySubtitle && (
            <div
              className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400"
              title={displaySubtitle}
            >
              {displaySubtitle}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2">
            <span className={`text-xs font-medium ${getStatusColor(item.status)}`}>
              {item.phase || getStatusLabel(item.status)}
            </span>
            {isFailed && item.error_message && (
              <span
                className="text-xs text-red-500 truncate max-w-[200px]"
                title={item.error_message}
              >
                — {item.error_message}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {isQueued && (
            <button
              type="button"
              onClick={handleStart}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              title="Start download"
            >
              Start
            </button>
          )}

          {isActive && (
            <button
              type="button"
              onClick={handleStop}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              title="Stop download"
            >
              Stop
            </button>
          )}

          {isStopped && (
            <button
              type="button"
              onClick={handleStart}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              title="Resume download"
            >
              Resume
            </button>
          )}

          {isFailed && (
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              title="Retry download"
            >
              Retry
            </button>
          )}

          {isDone && item.final_path && (
            <button
              type="button"
              onClick={handleOpenFile}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              title="Open file"
            >
              Open
            </button>
          )}

          {/* Show folder button for completed downloads or when we have an output_dir */}
          {(isDone || item.output_dir) && (
            <button
              type="button"
              onClick={handleOpenFolder}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              title={isDone ? "Reveal in folder" : "Open download folder"}
            >
              Folder
            </button>
          )}

          {(isQueued || isStopped || isFailed || isCanceled) && (
            <button
              type="button"
              onClick={handleRemove}
              className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:hover:bg-red-950"
              title="Remove from queue"
            >
              Remove
            </button>
          )}

          {isActive && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:hover:bg-red-950"
              title="Cancel download"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(isActive || isStopped || isDone) && (
        <div className="mt-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${isDone
                ? "bg-green-500"
                : isStopped
                  ? "bg-yellow-500"
                  : "bg-blue-500"
                }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>{speedText || ""}</span>
            <span>
              {isDone
                ? "100%"
                : progressPercent > 0
                  ? `${progressPercent.toFixed(1)}%`
                  : ""}
            </span>
            <span>{etaText || ""}</span>
          </div>
        </div>
      )}
    </li>
  );
}

export default QueueItemComponent;
