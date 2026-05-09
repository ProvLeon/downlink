"use client";

import Image from "next/image";
import {
  Play,
  AlertTriangle,
  CloudDownload,
  Video,
  ListVideo,
  RotateCcw,
  Clock,
  HardDrive,
  Loader2,
  CheckCircle2,
  Hash,
} from "lucide-react";
import type { FetchMetadataResult, UrlPreviewItem, VideoQualityOption } from "../types";
import { formatBytes, formatDuration } from "../types";

const GLOBAL_QUALITY_PRESETS = [
  { label: "Best", value: "default" },
  { label: "4K", value: "bestvideo[height<=2160]+bestaudio/best[height<=2160]" },
  { label: "1080p", value: "bestvideo[height<=1080]+bestaudio/best[height<=1080]" },
  { label: "720p", value: "bestvideo[height<=720]+bestaudio/best[height<=720]" },
  { label: "480p", value: "bestvideo[height<=480]+bestaudio/best[height<=480]" },
  { label: "Audio", value: "bestaudio" },
] as const;

interface RangeGroup {
  pattern: string;
  urls: string[];
}

interface PreviewPanelProps {
  previewData: FetchMetadataResult | null;
  previewLoading: boolean;
  previewError: string | null;
  isDragging: boolean;
  onClearPreview: () => void;
  /** Individual URL previews (non-range) */
  allPreviews?: UrlPreviewItem[];
  /** Range expansion groups — shown as compact batch cards */
  rangeGroups?: RangeGroup[];
  /** All per-URL quality selections: url → format_string */
  selectedQualitiesMap?: Map<string, string>;
  /** Called when user selects a quality for a specific URL */
  onSelectQuality?: (url: string, formatString: string) => void;
  /** Called when user clicks "Apply to all" */
  onSelectQualityForAll?: (formatString: string) => void;
}

// ─── Skeleton block ────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded bg-zinc-800 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

// ─── Range batch card ─────────────────────────────────────
function RangeGroupCard({
  group,
  startIndex,
}: {
  group: RangeGroup;
  startIndex: number;
}) {
  const rangeMatch = /\[(\d+)-(\d+)\]/.exec(group.pattern);
  const from = rangeMatch ? rangeMatch[1] : "?";
  const to = rangeMatch ? rangeMatch[2] : "?";

  // Strip the scheme for a compact display
  let displayPattern = group.pattern;
  try { displayPattern = group.pattern.replace(/^https?:\/\//, ""); } catch { /* keep */ }

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 ring-1 ring-blue-500/10">
      <div className="flex items-center gap-2.5">
        <span className="w-5 flex-shrink-0 text-right text-[10px] tabular-nums text-zinc-600">
          {startIndex}
        </span>

        {/* Icon */}
        <div className="flex h-10 w-[72px] flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
          <Hash className="h-4 w-4 text-blue-400" />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-blue-300">
            Range &middot; {group.urls.length} episodes
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            Episodes {from} &rarr; {to}
          </p>
        </div>
      </div>

      {/* Pattern */}
      <p className="ml-[calc(1.25rem+0.625rem+72px+0.625rem)] mt-1.5 truncate rounded bg-zinc-900/60 px-2 py-1 font-mono text-[9px] text-zinc-500">
        {displayPattern}
      </p>
    </div>
  );
}

// ─── Compact quality picker (for multi-preview cards) ──────
function CompactQualityPicker({
  qualities,
  loading,
  selected,
  onSelect,
}: {
  qualities: VideoQualityOption[];
  loading?: boolean;
  selected: string | null | undefined;
  onSelect: (fmt: string) => void;
}) {
  // While waiting for yt-dlp quality data and nothing else to show
  if (loading && qualities.length === 0) {
    return (
      <div className="mt-1.5 flex items-center gap-1">
        <Loader2 className="h-2.5 w-2.5 animate-spin text-zinc-700" />
        <span className="text-[9px] text-zinc-600">Loading quality…</span>
      </div>
    );
  }

  const isActive = (fmt: string) =>
    fmt === "default" ? !selected || selected === "default" : selected === fmt;

  const pillCls = (fmt: string, isAudio = false) =>
    `rounded px-1.5 py-0.5 text-[10px] font-semibold transition-all cursor-pointer ${isActive(fmt)
      ? isAudio
        ? "bg-purple-600 text-white shadow-sm"
        : "bg-blue-600 text-white shadow-sm"
      : "bg-zinc-700/60 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
    }`;

  // yt-dlp returned specific format options — show per-video quality pills
  if (qualities.length > 0) {
    return (
      <div className="mt-1.5 flex flex-wrap gap-1">
        <button type="button" onClick={() => onSelect("default")} className={pillCls("default")}>
          Best
        </button>
        {qualities
          .filter((q) => !q.is_audio_only)
          .map((q) => (
            <button
              key={q.format_string}
              type="button"
              onClick={() => onSelect(q.format_string)}
              title={q.filesize_approx ? `≈ ${formatBytes(q.filesize_approx)}` : undefined}
              className={pillCls(q.format_string)}
            >
              {q.label}
            </button>
          ))}
        {qualities
          .filter((q) => q.is_audio_only)
          .map((q) => (
            <button
              key={q.format_string}
              type="button"
              onClick={() => onSelect(q.format_string)}
              title={q.filesize_approx ? `≈ ${formatBytes(q.filesize_approx)}` : undefined}
              className={pillCls(q.format_string, true)}
            >
              Audio
            </button>
          ))}
      </div>
    );
  }

  // Fallback: yt-dlp returned no format data (site doesn't expose them, or backend
  // not yet recompiled). Show the standard presets — yt-dlp handles format selection
  // gracefully, downloading the best available at or below the requested height.
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {GLOBAL_QUALITY_PRESETS.map((preset) => (
        <button
          key={preset.value}
          type="button"
          onClick={() => onSelect(preset.value)}
          className={pillCls(preset.value, preset.value === "bestaudio")}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

// ─── Single card in the multi-preview list ─────────────────
function MultiPreviewCard({
  index,
  preview,
  selectedQuality,
  onSelectQuality,
}: {
  index: number;
  preview: UrlPreviewItem;
  selectedQuality?: string | null;
  onSelectQuality?: (fmt: string) => void;
}) {
  /* Loading skeleton */
  if (preview.loading) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-zinc-800/50 p-2.5 ring-1 ring-white/5">
        <span className="w-5 flex-shrink-0 text-right text-[10px] tabular-nums text-zinc-600">
          {index}
        </span>
        <Skeleton className="h-10 w-[72px] flex-shrink-0 rounded-lg" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-2.5 w-28" />
        </div>
        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-blue-400" />
      </div>
    );
  }

  /* Error card */
  if (preview.error || !preview.data) {
    let hostname = preview.url;
    try { hostname = new URL(preview.url).hostname; } catch { /* keep raw url */ }

    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-zinc-800/40 p-2.5 ring-1 ring-red-500/10">
        <span className="w-5 flex-shrink-0 text-right text-[10px] tabular-nums text-zinc-600">
          {index}
        </span>
        <div className="flex h-10 w-[72px] flex-shrink-0 items-center justify-center rounded-lg bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-zinc-400" title={preview.url}>
            {hostname}
          </p>
          <p className="text-[10px] text-red-400/80 mt-0.5">Preview unavailable</p>
        </div>
      </div>
    );
  }

  /* Loaded card */
  const { data } = preview;
  return (
    <div className="rounded-xl bg-zinc-800/50 p-2.5 ring-1 ring-white/5 transition-colors hover:bg-zinc-800/80">
      {/* Top row: index + thumbnail + info + checkmark */}
      <div className="flex items-center gap-2.5">
        <span className="w-5 flex-shrink-0 text-right text-[10px] tabular-nums text-zinc-600">
          {index}
        </span>

        {/* Thumbnail */}
        <div className="relative h-10 w-[72px] flex-shrink-0 overflow-hidden rounded-lg bg-zinc-700">
          {data.thumbnail_url ? (
            <Image
              src={data.thumbnail_url}
              alt={data.title || ""}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Video className="h-4 w-4 text-zinc-500" />
            </div>
          )}
          {data.duration_seconds && (
            <div className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[8px] font-medium text-white leading-tight">
              {formatDuration(data.duration_seconds)}
            </div>
          )}
          {data.is_playlist && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <ListVideo className="h-4 w-4 text-blue-300" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold leading-tight text-white" title={data.title || ""}>
            {data.title || "Untitled"}
          </p>
          {data.uploader && (
            <p className="mt-0.5 truncate text-[10px] text-zinc-400">{data.uploader}</p>
          )}
        </div>

        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-500/60" />
      </div>

      {/* Quality picker — indented to align with info text */}
      {onSelectQuality && (
        <div className="ml-[112px]">
          <CompactQualityPicker
            qualities={data.available_qualities ?? []}
            loading={preview.qualitiesLoading}
            selected={selectedQuality}
            onSelect={onSelectQuality}
          />
        </div>
      )}
    </div>
  );
}

// ─── Quality picker ────────────────────────────────────────
function QualityPicker({
  qualities,
  loading,
  selected,
  onSelect,
}: {
  qualities: VideoQualityOption[];
  loading: boolean;
  selected: string | null;
  onSelect: (fmt: string) => void;
}) {
  if (loading && qualities.length === 0) {
    return (
      <div className="w-full">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          Quality
        </p>
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-zinc-600" />
          <span className="text-[11px] text-zinc-600">Loading quality options…</span>
        </div>
      </div>
    );
  }

  const isSelected = (fmt: string) =>
    fmt === "default" ? !selected || selected === "default" : selected === fmt;

  const videoPillCls = (fmt: string) =>
    `rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${isSelected(fmt)
      ? "bg-blue-600 text-white shadow-sm shadow-blue-900/40"
      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
    }`;

  const audioPillCls = (fmt: string) =>
    `rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${isSelected(fmt)
      ? "bg-purple-600 text-white shadow-sm"
      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
    }`;

  // yt-dlp returned specific per-video format options
  if (qualities.length > 0) {
    return (
      <div className="w-full">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          Quality
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onSelect("default")} className={videoPillCls("default")}>
            Best
          </button>

          {qualities
            .filter((q) => !q.is_audio_only)
            .map((q) => (
              <button
                key={q.format_string}
                type="button"
                onClick={() => onSelect(q.format_string)}
                title={q.filesize_approx ? `≈ ${formatBytes(q.filesize_approx)}` : undefined}
                className={videoPillCls(q.format_string)}
              >
                {q.label}
                {q.filesize_approx && (
                  <span className={`ml-1 font-normal ${isSelected(q.format_string) ? "text-blue-200" : "text-zinc-600"
                    }`}>
                    · {formatBytes(q.filesize_approx)}
                  </span>
                )}
              </button>
            ))}

          {qualities
            .filter((q) => q.is_audio_only)
            .map((q) => (
              <button
                key={q.format_string}
                type="button"
                onClick={() => onSelect(q.format_string)}
                title={q.filesize_approx ? `≈ ${formatBytes(q.filesize_approx)}` : undefined}
                className={audioPillCls(q.format_string)}
              >
                Audio
                {q.filesize_approx && (
                  <span className={`ml-1 font-normal ${isSelected(q.format_string) ? "text-purple-200" : "text-zinc-600"
                    }`}>
                    · {formatBytes(q.filesize_approx)}
                  </span>
                )}
              </button>
            ))}
        </div>
      </div>
    );
  }

  // Fallback — yt-dlp didn't return format data for this URL.
  // Show the standard presets (which yt-dlp resolves gracefully via its format selector).
  return (
    <div className="w-full">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        Quality
      </p>
      <div className="flex flex-wrap gap-1.5">
        {GLOBAL_QUALITY_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onSelect(preset.value)}
            className={preset.value === "bestaudio" ? audioPillCls(preset.value) : videoPillCls(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────
export function PreviewPanel({
  previewData,
  previewLoading,
  previewError,
  isDragging,
  onClearPreview,
  allPreviews = [],
  rangeGroups = [],
  selectedQualitiesMap,
  onSelectQuality,
  onSelectQualityForAll,
}: PreviewPanelProps) {

  /* ── Drag overlay ─────────────────────────────────────── */
  if (isDragging) {
    return (
      <div className="flex flex-col items-center justify-center text-center animate-fade-in">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-blue-400 bg-blue-500/10 animate-pulse">
          <CloudDownload className="h-9 w-9 text-blue-400" />
        </div>
        <h2 className="text-xl font-semibold text-blue-300">Drop URL here</h2>
        <p className="mt-1.5 text-sm text-zinc-400">Release to add the video to your queue</p>
      </div>
    );
  }

  /* ── Multi-URL preview list (individual + range groups) ─ */
  const hasMultiple = allPreviews.length + rangeGroups.length > 1 || rangeGroups.length > 0;

  if (hasMultiple) {
    const loadedCount = allPreviews.filter((p) => p.data).length;
    const loadingCount = allPreviews.filter((p) => p.loading).length;
    const rangeTotal = rangeGroups.reduce((s, g) => s + g.urls.length, 0);
    const totalUrls = allPreviews.length + rangeTotal;

    return (
      <div className="flex w-full max-w-sm flex-col animate-fade-in">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">
              {totalUrls} URL{totalUrls !== 1 ? "s" : ""} detected
            </h2>
            <p className="text-xs text-zinc-500">
              {loadingCount > 0
                ? `Fetching previews\u2026 ${loadedCount} / ${allPreviews.length} ready`
                : rangeTotal > 0
                  ? `${allPreviews.length} preview${allPreviews.length !== 1 ? "s" : ""} + ${rangeTotal} range items`
                  : "All previews loaded"}
            </p>
          </div>
          <button
            onClick={onClearPreview}
            className="text-xs text-zinc-600 underline-offset-2 transition-colors hover:text-zinc-400 hover:underline"
          >
            Clear all
          </button>
        </div>

        {/* Apply to all — shown only when there are callbacks wired */}
        {onSelectQualityForAll && (
          <div className="mb-2.5 rounded-xl bg-zinc-900/60 p-2.5 ring-1 ring-white/5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Apply quality to all
            </p>
            <div className="flex flex-wrap gap-1">
              {GLOBAL_QUALITY_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onSelectQualityForAll(preset.value)}
                  className="rounded px-2 py-1 text-[10px] font-semibold bg-zinc-800 text-zinc-400 hover:bg-blue-600 hover:text-white transition-all"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Individual preview cards */}
        <div className="space-y-1.5 w-full">
          {allPreviews.map((preview, i) => (
            <MultiPreviewCard
              key={preview.url}
              index={i + 1}
              preview={preview}
              selectedQuality={selectedQualitiesMap?.get(preview.url) ?? null}
              onSelectQuality={
                onSelectQuality
                  ? (fmt) => onSelectQuality(preview.url, fmt)
                  : undefined
              }
            />
          ))}

          {/* Range group batch cards — each represents N expanded URLs */}
          {rangeGroups.map((group, gi) => (
            <RangeGroupCard
              key={group.pattern}
              group={group}
              startIndex={allPreviews.length + gi + 1}
            />
          ))}
        </div>
      </div>
    );
  }

  /* ── Single URL: loading skeleton ────────────────────── */
  if (previewLoading) {
    return (
      <div className="flex flex-col items-center text-center animate-fade-in">
        <Skeleton className="mb-5 h-44 w-80 rounded-xl" />
        <Skeleton className="mb-2 h-5 w-64" />
        <Skeleton className="mb-4 h-4 w-40" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        <p className="mt-5 text-xs text-zinc-600">Fetching video info…</p>
      </div>
    );
  }

  /* ── Single URL: error state ─────────────────────────── */
  if (previewError) {
    return (
      <div className="flex flex-col items-center text-center animate-fade-in max-w-sm">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
          <AlertTriangle className="h-7 w-7 text-red-400" />
        </div>
        <h3 className="mb-1.5 text-base font-semibold text-white">Preview unavailable</h3>
        <p className="mb-5 text-sm leading-relaxed text-zinc-400">{previewError}</p>
        <button
          onClick={onClearPreview}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Try another URL
        </button>
      </div>
    );
  }

  /* ── Single URL: preview card ────────────────────────── */
  if (previewData) {
    return (
      <div className="flex flex-col items-center text-center animate-fade-in max-w-sm w-full">
        {/* Thumbnail */}
        <div className="relative mb-5 h-44 w-full max-w-xs overflow-hidden rounded-xl bg-zinc-800 shadow-2xl ring-1 ring-white/5">
          {previewData.thumbnail_url ? (
            <Image
              src={previewData.thumbnail_url}
              alt={previewData.title || "Video"}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Video className="h-14 w-14 text-zinc-600" />
            </div>
          )}

          {!previewData.is_playlist && previewData.duration_seconds && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/80 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              <Clock className="h-3 w-3 opacity-70" />
              {formatDuration(previewData.duration_seconds)}
            </div>
          )}

          {previewData.is_playlist && (
            <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-gradient-to-r from-blue-600 to-cyan-600 px-2 py-1 text-xs font-semibold text-white shadow">
              <ListVideo className="h-3.5 w-3.5" />
              {previewData.playlist_count_hint ?? "?"} videos
            </div>
          )}

          {!previewData.is_playlist && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity duration-200 hover:bg-black/25 hover:opacity-100">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                <Play className="ml-0.5 h-5 w-5 text-zinc-900" fill="currentColor" />
              </div>
            </div>
          )}
        </div>

        <h2 className="mb-1.5 line-clamp-2 text-base font-semibold leading-snug text-white">
          {previewData.title || "Untitled"}
        </h2>

        <div className="mb-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-zinc-400">
          {previewData.uploader && <span>{previewData.uploader}</span>}
          {previewData.filesize_bytes && (
            <>
              <span className="text-zinc-600">·</span>
              <span className="flex items-center gap-1">
                <HardDrive className="h-3.5 w-3.5 text-zinc-500" />
                {formatBytes(previewData.filesize_bytes)}
              </span>
            </>
          )}
        </div>

        {/* Quality picker — single URL */}
        {onSelectQuality && allPreviews.length === 1 && (
          <div className="mb-4 w-full">
            <QualityPicker
              qualities={previewData.available_qualities ?? []}
              loading={allPreviews[0]?.qualitiesLoading ?? false}
              selected={selectedQualitiesMap?.get(allPreviews[0].url) ?? null}
              onSelect={(fmt) => onSelectQuality(allPreviews[0].url, fmt)}
            />
          </div>
        )}

        <button
          onClick={onClearPreview}
          className="text-xs text-zinc-600 underline-offset-2 transition-colors hover:text-zinc-400 hover:underline"
        >
          Clear preview
        </button>
      </div>
    );
  }

  /* ── Empty / default state ────────────────────────────── */
  return (
    <div className="flex flex-col items-center text-center animate-fade-in px-4 w-full max-w-sm">

      {/* Floating icon with animated pull-down arrows */}
      <div className="relative mb-8 mt-2">
        {/* Ambient glow */}
        <div className="absolute inset-0 blur-2xl opacity-40 rounded-full bg-gradient-to-br from-blue-500/50 to-cyan-500/30 scale-150" />

        {/* Icon container — floats gently */}
        <div className="relative animate-float flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600/20 to-cyan-500/10 ring-1 ring-white/8 shadow-xl">
          <CloudDownload className="h-10 w-10 text-blue-400" />
        </div>

        {/* Staggered chevron arrows pulling downward */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-arrow-pull-down"
              style={{ animationDelay: `${i * 200}ms` }}
            >
              <svg width="14" height="9" viewBox="0 0 14 9" fill="none">
                <path
                  d="M1 1L7 7L13 1"
                  stroke="url(#empty-arrow)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <defs>
                  <linearGradient id="empty-arrow" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* Heading */}
      <h1 className="mb-2 mt-4 text-xl font-bold tracking-tight text-white">
        Paste a video URL to begin
      </h1>
      <p className="mb-6 text-sm leading-relaxed text-zinc-500">
        Supports YouTube, Vimeo, TikTok, Twitter, Instagram
        &amp; 1,000+ other sites
      </p>

      {/* Keyboard hint */}
      <div className="mb-7 flex items-center gap-2 text-zinc-500">
        <kbd className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-1 text-xs font-medium text-zinc-300 shadow-sm">
          ⌘V
        </kbd>
        <span className="text-sm">to paste from clipboard</span>
      </div>

      {/* Ghost example URLs — show off range patterns */}
      <div className="w-full space-y-2">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">
          Example patterns
        </p>
        {[
          { label: "Single video", url: "youtube.com/watch?v=…" },
          { label: "Episode range", url: "site.com/episode-[1-24]" },
          { label: "Playlist", url: "youtube.com/playlist?list=…" },
        ].map(({ label, url }) => (
          <div
            key={url}
            className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left"
          >
            <span className="min-w-[76px] text-[10px] font-medium text-zinc-600 uppercase tracking-wide">
              {label}
            </span>
            <span className="flex-1 truncate font-mono text-[11px] text-zinc-600">
              {url}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
