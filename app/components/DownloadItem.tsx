"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import {
  Pause,
  Play,
  RotateCcw,
  FolderOpen,
  X,
  Check,
  AlertCircle,
  Video,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { QueueItem } from "../types";
import { formatBytes, formatSpeed, formatEta } from "../types";

interface DownloadItemProps {
  item: QueueItem;
  onStop: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onOpen: (path: string) => void;
  onOpenFolder: (path: string) => void;
}

/** Tiny status pill */
function StatusPill({
  status,
  phase,
}: {
  status: QueueItem["status"];
  phase: string | null;
}) {
  const label = phase || statusLabel(status);
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none";

  switch (status) {
    case "downloading":
    case "fetching":
      return (
        <span className={`${base} bg-blue-500/15 text-blue-400`}>
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          {label}
        </span>
      );
    case "postprocessing":
      return (
        <span className={`${base} bg-cyan-500/15 text-cyan-400`}>
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          {label}
        </span>
      );
    case "queued":
    case "ready":
      return (
        <span className={`${base} bg-zinc-700/60 text-zinc-400`}>{label}</span>
      );
    case "stopped": {
      const isInterrupted = phase?.toLowerCase().includes("interrupted");
      return (
        <span className={`${base} ${isInterrupted ? "bg-orange-500/15 text-orange-400" : "bg-yellow-500/15 text-yellow-400"}`}>
          {isInterrupted ? <Play className="h-2.5 w-2.5" /> : null}
          {isInterrupted ? "Interrupted — Resume" : label}
        </span>
      );
    }
    case "done":
      return (
        <span className={`${base} bg-green-500/15 text-green-400`}>
          <Check className="h-2.5 w-2.5" />
          {label}
        </span>
      );
    case "failed":
      return (
        <span className={`${base} bg-red-500/15 text-red-400`}>
          <AlertCircle className="h-2.5 w-2.5" />
          {label}
        </span>
      );
    case "canceled":
      return (
        <span className={`${base} bg-zinc-700/60 text-zinc-500`}>{label}</span>
      );
    default:
      return (
        <span className={`${base} bg-zinc-700/60 text-zinc-400`}>{label}</span>
      );
  }
}

function statusLabel(status: QueueItem["status"]): string {
  switch (status) {
    case "queued":      return "Queued";
    case "fetching":    return "Fetching…";
    case "ready":       return "Ready";
    case "downloading": return "Downloading";
    case "postprocessing": return "Processing…";
    case "stopped":     return "Paused";
    case "done":        return "Done";
    case "failed":      return "Failed";
    case "canceled":    return "Canceled";
    default:            return status;
  }
}

export function DownloadItem({
  item,
  onStop,
  onCancel,
  onRemove,
  onRetry,
  onOpen,
  onOpenFolder,
}: DownloadItemProps) {
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  const isActive =
    item.status === "downloading" ||
    item.status === "fetching" ||
    item.status === "postprocessing";
  const isDone    = item.status === "done";
  const isFailed  = item.status === "failed";
  const isStopped = item.status === "stopped";
  const isQueued  = item.status === "queued" || item.status === "ready";
  const progress  = item.progress_percent ?? 0;

  // Keyboard primary action: resume/retry for stopped/failed, open file for done, else no-op
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return; // only handle on the card itself
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (isActive) onStop(item.id);
      else if (isStopped || isQueued || isFailed) onRetry(item.id);
      else if (isDone && item.final_path) onOpen(item.final_path);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (isActive || isQueued) onCancel(item.id);
      else onRemove(item.id);
    }
  }, [isActive, isDone, isFailed, isStopped, isQueued, item, onStop, onRetry, onOpen, onCancel, onRemove]);

  return (
    <div
      role="listitem"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`${item.title || item.source_url} — ${item.status}`}
      className="rounded-xl bg-zinc-800/50 p-2.5 ring-1 ring-white/5 transition-colors hover:bg-zinc-800/80 animate-fade-in focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
    >
      <div className="flex items-start gap-2.5">

        {/* ── Thumbnail ──────────────────────────────────── */}
        <div className="relative h-12 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-700">
          {item.thumbnail_url ? (
            <Image
              src={item.thumbnail_url}
              alt={item.title || "Video"}
              fill
              className={isPortrait ? "object-contain" : "object-cover"}
              unoptimized
              onLoad={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                if (img.naturalWidth > 0 && img.naturalHeight > img.naturalWidth) {
                  setIsPortrait(true);
                }
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Video className="h-5 w-5 text-zinc-500" />
            </div>
          )}

          {/* Status overlays */}
          {isActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
            </div>
          )}
          {isDone && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Check className="h-4 w-4 text-green-400" />
            </div>
          )}
          {isFailed && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <X className="h-4 w-4 text-red-400" />
            </div>
          )}
          {isStopped && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Pause className="h-4 w-4 text-yellow-400" />
            </div>
          )}
        </div>

        {/* ── Info ───────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* Title + actions row */}
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-xs font-semibold text-white leading-tight"
                title={item.title || item.source_url}
              >
                {item.title || item.source_url}
              </p>
              {item.uploader && (
                <p className="truncate text-[10px] text-zinc-400 leading-tight mt-0.5">
                  {item.uploader}
                </p>
              )}
            </div>

            {/* ── Action buttons ─────────────────────────── */}
            <div className="flex flex-shrink-0 items-center gap-0.5 ml-1">
              {(isQueued || isStopped) && (
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
                  title={isStopped ? "Resume" : "Start"}
                  aria-label={isStopped ? "Resume download" : "Start download"}
                >
                  <Play className="h-3.5 w-3.5" fill="currentColor" />
                </button>
              )}

              {isActive && (
                <button
                  type="button"
                  onClick={() => onStop(item.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-yellow-300"
                  title="Pause"
                  aria-label="Pause download"
                >
                  <Pause className="h-3.5 w-3.5" />
                </button>
              )}

              {isFailed && (
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
                  title="Retry"
                  aria-label="Retry download"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}

              {isDone && item.final_path && (
                <button
                  type="button"
                  onClick={() => onOpen(item.final_path!)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
                  title="Open file"
                  aria-label="Open downloaded file"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Reveal in folder */}
              <button
                type="button"
                onClick={() =>
                  onOpenFolder(
                    isDone && item.final_path ? item.final_path : item.output_dir
                  )
                }
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
                title={isDone ? "Reveal in Finder" : "Open download folder"}
                aria-label="Open folder"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>

              {/* Cancel / Remove — semantics depend on current state */}
              <button
                type="button"
                onClick={() =>
                  isActive || isQueued
                    ? onCancel(item.id)
                    : onRemove(item.id)
                }
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
                title={isActive ? "Cancel" : "Remove"}
                aria-label={isActive ? "Cancel download" : "Remove from list"}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Status pill + speed/ETA */}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <StatusPill status={item.status} phase={item.phase} />

            {isActive && item.speed_bps != null && (
              <span className="text-[10px] text-zinc-400 tabular-nums">
                {formatSpeed(item.speed_bps)}
              </span>
            )}
            {isActive && item.eta_seconds != null && (
              <span className="text-[10px] text-zinc-500 tabular-nums">
                {formatEta(item.eta_seconds)}
              </span>
            )}

            {/* ── Expandable error message ──────────────── */}
            {isFailed && item.error_message && (
              <button
                type="button"
                onClick={() => setErrorExpanded((v) => !v)}
                className="flex items-center gap-0.5 text-[10px] text-red-400/80 hover:text-red-300 transition-colors"
                title={item.error_message}
                aria-expanded={errorExpanded}
              >
                <span className="max-w-[120px] truncate">
                  {errorExpanded ? "Hide details" : item.error_message}
                </span>
                {errorExpanded ? (
                  <ChevronUp className="h-2.5 w-2.5 flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-2.5 w-2.5 flex-shrink-0" />
                )}
              </button>
            )}
          </div>

          {/* Expanded error detail */}
          {isFailed && item.error_message && errorExpanded && (
            <div className="mt-1.5 rounded-lg bg-red-500/8 px-2.5 py-2 ring-1 ring-red-500/15 animate-fade-in">
              <p className="text-[10px] leading-relaxed text-red-300 break-words">
                {item.error_message}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Progress bar ──────────────────────────────────── */}
      {(isActive || isStopped || isDone) && (
        <div className="mt-2.5">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-700/80">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                isDone
                  ? "bg-green-500"
                  : isStopped
                  ? "bg-yellow-500"
                  : "bg-gradient-to-r from-blue-500 to-cyan-500"
              }`}
              style={{
                width: `${progress}%`,
                boxShadow: isActive
                  ? "0 0 8px rgba(59,130,246,0.55), 0 0 2px rgba(6,182,212,0.4)"
                  : isDone
                  ? "0 0 6px rgba(34,197,94,0.4)"
                  : undefined,
              }}
            />
            {/* Shimmer on indeterminate */}
            {isActive && progress === 0 && (
              <div className="progress-shimmer absolute inset-0" />
            )}
          </div>

          {/* Progress labels */}
          <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500 tabular-nums">
            <span>
              {isDone
                ? item.bytes_total
                  ? formatBytes(item.bytes_total)
                  : "Complete"
                : item.bytes_downloaded && item.bytes_total
                ? `${formatBytes(item.bytes_downloaded)} / ${formatBytes(item.bytes_total)}`
                : item.bytes_total
                ? formatBytes(item.bytes_total)
                : ""}
            </span>
            <span>
              {isDone ? "100%" : progress > 0 ? `${progress.toFixed(1)}%` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
