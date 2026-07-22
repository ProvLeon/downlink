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
  Mic,
  FileText,
} from "lucide-react";
import type { QueueItem } from "../types";
import { formatBytes, formatSpeed, formatEta } from "../types";
import { LiquidProgress } from "./LiquidProgress";

export type WhisperModel = "tiny" | "base" | "small" | "medium";
type TranscribeState = "idle" | "loading" | "done" | "error" | "not_installed";

interface DownloadItemProps {
  item: QueueItem;
  onStop: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onOpen: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onTranscribe?: (filePath: string, model: WhisperModel) => Promise<{ srt_path: string; method: string }>;
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

const WHISPER_MODEL_LABELS: Record<WhisperModel, string> = {
  tiny:   "Tiny (fast)",
  base:   "Base (balanced)",
  small:  "Small (accurate)",
  medium: "Medium (best)",
};

export function DownloadItem({
  item,
  onStop,
  onCancel,
  onRemove,
  onRetry,
  onOpen,
  onOpenFolder,
  onTranscribe,
}: DownloadItemProps) {
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  // Transcription state
  const [transcribeState, setTranscribeState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [selectedModel, setSelectedModel] = useState<WhisperModel>("base");
  const [srtPath, setSrtPath] = useState<string | null>(null);
  const [transcribeMethod, setTranscribeMethod] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);

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

  const handleTranscribe = useCallback(async () => {
    if (!onTranscribe || !item.final_path) return;
    setTranscribeState("loading");
    setTranscribeError(null);
    setSrtPath(null);
    setTranscribeMethod(null);
    try {
      const result = await onTranscribe(item.final_path, selectedModel);
      setSrtPath(result.srt_path);
      setTranscribeMethod(result.method);
      setTranscribeState("done");
    } catch (e) {
      const msg = String(e);
      // Clean up the error message if it's stringified JSON from Rust
      let displayMsg = msg;
      try {
        const parts = msg.split(": ");
        if (parts.length > 1) {
          const kind = JSON.parse(parts[0].replace(/"/g, ''));
          displayMsg = parts.slice(1).join(": ");
        }
      } catch (_) {}
      
      setTranscribeState("error");
      setTranscribeError(displayMsg);
    }
  }, [onTranscribe, item.final_path, selectedModel]);

  return (
    <div
      role="listitem"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`${item.title || item.source_url} — ${item.status}`}
      className="rounded-xl bg-zinc-800/50 p-2.5 ring-1 ring-white/5 transition-colors hover:bg-zinc-800/80 animate-fade-in focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
    >
      <div className="flex items-start gap-2.5">
        {/* ── Thumbnail ─────────────────────────────────── */}
        <div className="relative h-12 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-700/60">
          {item.thumbnail_url ? (
            <Image
              src={item.thumbnail_url}
              alt=""
              fill
              className={`object-cover transition-all duration-500 ${
                isDone ? "opacity-60 grayscale" : "opacity-90"
              }`}
              onLoad={(e) => {
                const img = e.currentTarget;
                setIsPortrait(img.naturalHeight > img.naturalWidth * 1.2);
              }}
              sizes="80px"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Video className="h-5 w-5 text-zinc-500" />
            </div>
          )}

          {/* Done overlay checkmark */}
          {isDone && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/90 shadow-sm">
                <Check className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
          )}
        </div>

        {/* ── Main content ───────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            {/* Title / URL */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-zinc-100 leading-snug">
                {item.title || "Fetching info…"}
              </p>
              {item.uploader && (
                <p className="truncate text-[10px] text-zinc-500 leading-snug">
                  {item.uploader}
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-shrink-0 items-center gap-0.5">
              {/* Open file (done only) */}
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

              {/* Retry (failed/stopped) */}
              {(isFailed || isStopped) && (
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-blue-400"
                  title="Retry download"
                  aria-label="Retry download"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Stop (active only) */}
              {isActive && (
                <button
                  type="button"
                  onClick={() => onStop(item.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-yellow-400"
                  title="Pause download"
                  aria-label="Pause download"
                >
                  <Pause className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Open folder */}
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
          <LiquidProgress 
            progress={progress} 
            isActive={isActive} 
            isDone={isDone} 
            isStopped={isStopped} 
          />

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

      {/* ── AI Transcription panel (done items only) ──────── */}
      {isDone && item.final_path && onTranscribe && (
        <div className="mt-2.5 border-t border-zinc-700/50 pt-2.5">
          {transcribeState === "idle" && (
            <div className="flex items-center gap-2">
              {/* Model selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowModelPicker((v) => !v)}
                  className="flex items-center gap-1 rounded-md bg-zinc-700/60 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                >
                  {WHISPER_MODEL_LABELS[selectedModel]}
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
                {showModelPicker && (
                  <div className="absolute bottom-full left-0 mb-1 z-50 w-36 rounded-lg bg-zinc-800 p-1 ring-1 ring-white/10 shadow-xl animate-fade-in">
                    {(Object.keys(WHISPER_MODEL_LABELS) as WhisperModel[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setSelectedModel(m); setShowModelPicker(false); }}
                        className={`w-full rounded-md px-2 py-1 text-left text-[10px] transition-colors ${
                          selectedModel === m
                            ? "bg-violet-600/20 text-violet-300"
                            : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        {WHISPER_MODEL_LABELS[m]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleTranscribe}
                className="flex items-center gap-1.5 rounded-md bg-violet-600/15 px-2.5 py-1 text-[10px] font-medium text-violet-400 ring-1 ring-violet-500/30 hover:bg-violet-600/25 hover:text-violet-300 transition-colors"
              >
                <Mic className="h-3 w-3" />
                Transcribe
              </button>
              <span className="text-[9px] text-zinc-600">AI subtitle generation</span>
            </div>
          )}

          {transcribeState === "loading" && (
            <div className="flex items-center gap-2 text-[10px] text-violet-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Transcribing... (Using AI provider or local Whisper)</span>
            </div>
          )}

          {transcribeState === "done" && srtPath && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[10px] text-green-400">
                <FileText className="h-3 w-3" />
                <span className="font-medium">SRT generated successfully</span>
                <span className="text-zinc-500">•</span>
                <span className="text-zinc-500 font-mono text-[9px] uppercase">{transcribeMethod?.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(srtPath)}
                  className="flex items-center gap-1 rounded-md bg-green-600/10 px-2 py-0.5 text-[10px] text-green-400 ring-1 ring-green-500/20 hover:bg-green-600/20 transition-colors"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  Open .srt
                </button>
                <button
                  type="button"
                  onClick={() => { setTranscribeState("idle"); setSrtPath(null); }}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Transcribe again
                </button>
              </div>
            </div>
          )}

          {transcribeState === "error" && (
            <div className="rounded-lg bg-red-500/8 px-2.5 py-2 ring-1 ring-red-500/15">
              <p className="text-[10px] text-red-400 break-words">
                Transcription failed: {transcribeError}
              </p>
              <button
                type="button"
                onClick={() => { setTranscribeState("idle"); setTranscribeError(null); }}
                className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
