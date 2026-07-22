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
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { soundManager } from "../lib/SoundManager";
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

// ─── Animated Preview Morph Wrapper ────────────────────────
function AnimatedPreviewMorph({ 
  loading, 
  index = 0, 
  children, 
  className,
  isExiting = false,
}: { 
  loading: boolean; 
  index?: number; 
  children: React.ReactNode; 
  className?: string;
  isExiting?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasLanded = useRef(false);

  // Mount animation: the swoop and drop
  useGSAP(() => {
    if (!containerRef.current || !contentRef.current) return;
    const delay = index * 0.15;
    
    // Start state: Wide input field replica high near the top
    gsap.set(containerRef.current, {
      y: -180, 
      width: 450, 
      height: 48,
      borderRadius: "12px",
      backgroundColor: "rgb(39 39 42)", // zinc-800
      border: "1px solid rgb(63 63 70)", // zinc-700
      overflow: "hidden"
    });
    // Hide actual children while it's dropping
    gsap.set(contentRef.current, { opacity: 0 });

    const tl = gsap.timeline({
      onComplete: () => {
        hasLanded.current = true;
        // As soon as it lands, expand into CURRENT children (which will be the skeleton)
        expandToCurrent();
      }
    });
    
    const floorY = 60; // Simulate floor depth
    
    // Step 1: Swoop down and morph into a small ball
    tl.to(containerRef.current, {
      width: 24,
      height: 24,
      borderRadius: "12px",
      backgroundColor: "rgb(59 130 246)", // blue-500
      border: "none",
      duration: 0.35,
      ease: "power2.in"
    }, delay)
    .to(containerRef.current, {
      y: floorY,
      duration: 0.35,
      ease: "power2.in"
    }, delay)
    
    // Step 2: Bounce up to natural row/center position (y: 0)
    .to(containerRef.current, {
      y: 0,
      duration: 0.3,
      ease: "back.out(1.5)"
    }, ">");
  }, { scope: containerRef }); // Empty dependencies -> runs only on mount

  const expandToCurrent = () => {
    if (!containerRef.current || !contentRef.current || isExiting) return;
    
    // Temporarily make content visible to measure
    contentRef.current.style.opacity = "0";
    contentRef.current.style.display = ""; // Remove display:none without breaking flex/grid
    
    // Measure natural height of the skeleton/content
    containerRef.current.style.width = "auto";
    containerRef.current.style.height = "auto";
    const targetH = contentRef.current.offsetHeight || 64;
    const targetW = contentRef.current.offsetWidth || 384;
    
    // Revert to ball dimensions to animate to target
    containerRef.current.style.width = "24px";
    containerRef.current.style.height = "24px";
    
    const tl = gsap.timeline();
    tl.to(containerRef.current, {
      width: targetW,
      height: targetH,
      borderRadius: "16px", // standard card radius
      backgroundColor: "transparent",
      duration: 0.5,
      ease: "power3.inOut"
    })
    .to(contentRef.current, {
      opacity: 1,
      duration: 0.3,
      onComplete: () => {
        // Lock dimensions so the NEXT morph works smoothly
        if (containerRef.current) {
           containerRef.current.style.width = targetW + "px";
           containerRef.current.style.height = targetH + "px";
        }
      }
    }, "-=0.2");
  };

  // Watch for loading state turning false (data fetched)
  useGSAP(() => {
    // Morph container if we've landed, loading finishes, and we're not exiting
    if (hasLanded.current && !loading && !isExiting) {
      if (!containerRef.current || !contentRef.current) return;
      
      const oldW = containerRef.current.style.width;
      const oldH = containerRef.current.style.height;
      
      containerRef.current.style.width = "auto";
      containerRef.current.style.height = "auto";
      
      const newH = contentRef.current.offsetHeight;
      const newW = contentRef.current.offsetWidth;
      
      containerRef.current.style.width = oldW;
      containerRef.current.style.height = oldH;
      
      contentRef.current.style.opacity = "0";
      
      const tl = gsap.timeline();
      tl.to(containerRef.current, {
        width: newW,
        height: newH,
        duration: 0.5,
        ease: "power3.inOut",
        onComplete: () => {
          if (containerRef.current) {
            gsap.set(containerRef.current, { clearProps: "all" });
          }
        }
      });
      
      tl.to(contentRef.current, {
        opacity: 1,
        duration: 0.3
      }, "-=0.2");
    }
  }, [loading]); // Only re-run when loading changes

  // Exit Animation (triggered by user clicking Download)
  useGSAP(() => {
    if (isExiting) {
      if (!containerRef.current || !contentRef.current) return;
      
      // Stop all ongoing animations immediately
      gsap.killTweensOf(containerRef.current);
      gsap.killTweensOf(contentRef.current);
      
      // Lock dimensions to current so it doesn't snap
      const currentW = containerRef.current.offsetWidth;
      const currentH = containerRef.current.offsetHeight;
      containerRef.current.style.width = currentW + "px";
      containerRef.current.style.height = currentH + "px";
      
      const tl = gsap.timeline();
      
      // Fade out the inner preview card rapidly
      tl.to(contentRef.current, { opacity: 0, duration: 0.15 });
      
      // Morph back into a blue ball
      tl.to(containerRef.current, {
        width: 24,
        height: 24,
        borderRadius: "12px",
        backgroundColor: "rgb(59 130 246)", // blue-500
        border: "none",
        duration: 0.3,
        ease: "power2.inOut"
      }, "<");
      
      // Drop to ground and bounce over into the download queue on the right
      const delay = index * 0.1; // Stagger multiple balls
      
      const rect = containerRef.current.getBoundingClientRect();
      const queueEl = document.getElementById("download-queue-container");
      const actionEl = document.getElementById("action-bar-container");

      // Calculate floorY accurately based on the action bar top
      let floorY = window.innerHeight - rect.bottom - 40;
      if (actionEl) {
        const actionRect = actionEl.getBoundingClientRect();
        floorY = actionRect.top - rect.bottom;
      }

      // Calculate targetX and targetY accurately based on the download queue
      let targetX = window.innerWidth - rect.right - 40;
      let targetY = 80 - rect.top;

      if (queueEl) {
        const queueRect = queueEl.getBoundingClientRect();
        // Fly to the left edge of the queue plus 40px padding inward
        targetX = queueRect.left + 40 - rect.left;
        // Target about 60px from the top of the queue
        targetY = queueRect.top + 60 - rect.top;
      }
      
      const peakY = targetY - 150; // The top of the bounce arc (150px higher than destination)
      
      tl.to(containerRef.current, {
        y: floorY, // hit the floor
        duration: 0.25,
        ease: "power2.in", // accelerate downwards (gravity)
        onStart: () => soundManager.playThrow()
      }, `+=${delay}`)
      .to(containerRef.current, {
        x: targetX, // travel horizontally at constant speed
        scale: 0.5, // shrink away
        duration: 0.5,
        ease: "none" // linear horizontal motion creates a true parabola
      }, ">")
      .to(containerRef.current, {
        y: peakY, // bounce upwards to the peak of the arc
        duration: 0.25,
        ease: "power2.out" // decelerate as it reaches the peak
      }, "<")
      .to(containerRef.current, {
        y: targetY, // drop down into the queue from the peak
        duration: 0.25,
        ease: "power2.in" // accelerate downwards into the queue
      }, ">")
      .to(containerRef.current, {
        opacity: 0, // fade out right as it enters the queue
        duration: 0.15
      }, "-=0.15"); // overlap with end of arc
    }
  }, [isExiting]); // Runs when isExiting becomes true

  return (
    <div ref={containerRef} className="mx-auto flex flex-col items-center justify-center relative">
      <div ref={contentRef} className={className} style={{ display: "none" }}>
        {children}
      </div>
    </div>
  );
}

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
  isExiting?: boolean;
  onClearPreview: () => void;
  allPreviews?: UrlPreviewItem[];
  rangeGroups?: RangeGroup[];
  selectedQualitiesMap?: Map<string, string>;
  onSelectQuality?: (url: string, formatString: string) => void;
  onSelectQualityForAll?: (formatString: string) => void;
  trimEnabled?: boolean;
  trimStart?: number;
  trimEnd?: number;
  onTrimChange?: (start: number, end: number) => void;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded bg-zinc-800 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

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
  let displayPattern = group.pattern;
  try { displayPattern = group.pattern.replace(/^https?:\/\//, ""); } catch { /* keep */ }

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 ring-1 ring-blue-500/10">
      <div className="flex items-center gap-2.5">
        <span className="w-5 flex-shrink-0 text-right text-[10px] tabular-nums text-zinc-600">{startIndex}</span>
        <div className="flex h-10 w-[72px] flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
          <Hash className="h-4 w-4 text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-blue-300">Range &middot; {group.urls.length} episodes</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Episodes {from} &rarr; {to}</p>
        </div>
      </div>
      <p className="ml-[calc(1.25rem+0.625rem+72px+0.625rem)] mt-1.5 truncate rounded bg-zinc-900/60 px-2 py-1 font-mono text-[9px] text-zinc-500">
        {displayPattern}
      </p>
    </div>
  );
}

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
  if (loading && qualities.length === 0) {
    return (
      <div className="mt-1.5 flex items-center gap-1">
        <Loader2 className="h-2.5 w-2.5 animate-spin text-zinc-700" />
        <span className="text-[9px] text-zinc-600">Loading quality…</span>
      </div>
    );
  }
  const isActive = (fmt: string) => fmt === "default" ? !selected || selected === "default" : selected === fmt;
  const pillCls = (fmt: string, isAudio = false) => `rounded px-1.5 py-0.5 text-[10px] font-semibold transition-all cursor-pointer ${isActive(fmt) ? (isAudio ? "bg-purple-600 text-white shadow-sm" : "bg-blue-600 text-white shadow-sm") : "bg-zinc-700/60 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"}`;
  
  if (qualities.length > 0) {
    return (
      <div className="mt-1.5 flex flex-wrap gap-1">
        <button type="button" onClick={() => onSelect("default")} className={pillCls("default")}>Best</button>
        {qualities.filter((q) => !q.is_audio_only).map((q) => (
          <button key={q.format_string} type="button" onClick={() => onSelect(q.format_string)} title={q.filesize_approx ? `≈ ${formatBytes(q.filesize_approx)}` : undefined} className={pillCls(q.format_string)}>{q.label}</button>
        ))}
        {qualities.filter((q) => q.is_audio_only).map((q) => (
          <button key={q.format_string} type="button" onClick={() => onSelect(q.format_string)} title={q.filesize_approx ? `≈ ${formatBytes(q.filesize_approx)}` : undefined} className={pillCls(q.format_string, true)}>Audio</button>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {GLOBAL_QUALITY_PRESETS.map((preset) => (
        <button key={preset.value} type="button" onClick={() => onSelect(preset.value)} className={pillCls(preset.value, preset.value === "bestaudio")}>{preset.label}</button>
      ))}
    </div>
  );
}

function MultiPreviewCard({
  index,
  preview,
  selectedQuality,
  onSelectQuality,
  isExiting,
}: {
  index: number;
  preview: UrlPreviewItem;
  selectedQuality?: string | null;
  onSelectQuality?: (fmt: string) => void;
  isExiting?: boolean;
}) {
  if (preview.error || (!preview.loading && !preview.data)) {
    let hostname = preview.url;
    try { hostname = new URL(preview.url).hostname; } catch { /* keep raw url */ }
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-zinc-800/40 p-2.5 ring-1 ring-red-500/10">
        <span className="w-5 flex-shrink-0 text-right text-[10px] tabular-nums text-zinc-600">{index}</span>
        <div className="flex h-10 w-[72px] flex-shrink-0 items-center justify-center rounded-lg bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-zinc-400" title={preview.url}>{hostname}</p>
          <p className="text-[10px] text-red-400/80 mt-0.5">Preview unavailable</p>
        </div>
      </div>
    );
  }

  const { data } = preview;
  return (
    <AnimatedPreviewMorph loading={preview.loading} index={index - 1} className="w-full" isExiting={isExiting}>
      {preview.loading ? (
        <div className="flex items-center gap-2.5 rounded-xl bg-zinc-800/50 p-2.5 ring-1 ring-white/5 w-full">
          <span className="w-5 flex-shrink-0 text-right text-[10px] tabular-nums text-zinc-600">{index}</span>
          <Skeleton className="h-10 w-[72px] flex-shrink-0 rounded-lg" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-full" />
            {preview.fetchHint ? (
              <p className="text-[10px] text-blue-400/80 animate-pulse">{preview.fetchHint}</p>
            ) : (
              <Skeleton className="h-2.5 w-28" />
            )}
          </div>
          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-blue-400" />
        </div>
      ) : data ? (
        <div className="rounded-xl bg-zinc-800/50 p-2.5 ring-1 ring-white/5 transition-colors hover:bg-zinc-800/80 w-full">
          <div className="flex items-center gap-2.5">
            <span className="w-5 flex-shrink-0 text-right text-[10px] tabular-nums text-zinc-600">{index}</span>
            <div className="relative h-10 w-[72px] flex-shrink-0 overflow-hidden rounded-lg bg-zinc-700">
              {data.thumbnail_url ? (
                <Image src={data.thumbnail_url} alt={data.title || ""} fill className="object-cover" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center"><Video className="h-4 w-4 text-zinc-500" /></div>
              )}
              {data.duration_seconds && (
                <div className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[8px] font-medium text-white leading-tight">{formatDuration(data.duration_seconds)}</div>
              )}
              {data.is_playlist && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50"><ListVideo className="h-4 w-4 text-blue-300" /></div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold leading-tight text-white" title={data.title || ""}>{data.title || "Untitled"}</p>
              {data.uploader && <p className="mt-0.5 truncate text-[10px] text-zinc-400">{data.uploader}</p>}
            </div>
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-500/60" />
          </div>
          {onSelectQuality && (
            <div className="ml-[112px]">
              <CompactQualityPicker qualities={data.available_qualities ?? []} loading={preview.qualitiesLoading} selected={selectedQuality} onSelect={onSelectQuality} />
            </div>
          )}
        </div>
      ) : null}
    </AnimatedPreviewMorph>
  );
}

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
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Quality</p>
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-zinc-600" />
          <span className="text-[11px] text-zinc-600">Loading quality options…</span>
        </div>
      </div>
    );
  }
  const isSelected = (fmt: string) => fmt === "default" ? !selected || selected === "default" : selected === fmt;
  const videoPillCls = (fmt: string) => `rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${isSelected(fmt) ? "bg-blue-600 text-white shadow-sm shadow-blue-900/40" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"}`;
  const audioPillCls = (fmt: string) => `rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${isSelected(fmt) ? "bg-purple-600 text-white shadow-sm" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"}`;
  
  if (qualities.length > 0) {
    return (
      <div className="w-full">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Quality</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onSelect("default")} className={videoPillCls("default")}>Best</button>
          {qualities.filter((q) => !q.is_audio_only).map((q) => (
            <button key={q.format_string} type="button" onClick={() => onSelect(q.format_string)} title={q.filesize_approx ? `≈ ${formatBytes(q.filesize_approx)}` : undefined} className={videoPillCls(q.format_string)}>
              {q.label}
              {q.filesize_approx && <span className={`ml-1 font-normal ${isSelected(q.format_string) ? "text-blue-200" : "text-zinc-600"}`}>· {formatBytes(q.filesize_approx)}</span>}
            </button>
          ))}
          {qualities.filter((q) => q.is_audio_only).map((q) => (
            <button key={q.format_string} type="button" onClick={() => onSelect(q.format_string)} title={q.filesize_approx ? `≈ ${formatBytes(q.filesize_approx)}` : undefined} className={audioPillCls(q.format_string)}>
              Audio
              {q.filesize_approx && <span className={`ml-1 font-normal ${isSelected(q.format_string) ? "text-purple-200" : "text-zinc-600"}`}>· {formatBytes(q.filesize_approx)}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="w-full">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Quality</p>
      <div className="flex flex-wrap gap-1.5">
        {GLOBAL_QUALITY_PRESETS.map((preset) => (
          <button key={preset.value} type="button" onClick={() => onSelect(preset.value)} className={preset.value === "bestaudio" ? audioPillCls(preset.value) : videoPillCls(preset.value)}>{preset.label}</button>
        ))}
      </div>
    </div>
  );
}

export function PreviewPanel({
  previewData,
  previewLoading,
  previewError,
  isDragging,
  isExiting,
  onClearPreview,
  allPreviews = [],
  rangeGroups = [],
  selectedQualitiesMap,
  onSelectQuality,
  onSelectQualityForAll,
  trimEnabled,
  trimStart,
  trimEnd,
  onTrimChange,
}: PreviewPanelProps) {
  const playerRef = useRef<MediaPlayerInstance>(null);

  // Delay playback state
  const [isPlaying, setIsPlaying] = useState(false);

  // Reset playback state if trim is disabled
  useEffect(() => {
    if (!trimEnabled) setIsPlaying(false);
  }, [trimEnabled]);

  // Sync player to trimStart when trimStart changes externally (from the slider)
  useEffect(() => {
    if (trimEnabled && playerRef.current && trimStart !== undefined) {
      try {
        playerRef.current.currentTime = trimStart;
      } catch (e) {}
    }
  }, [trimStart, trimEnabled]);


  const hasMultiple = allPreviews.length + rangeGroups.length > 1 || rangeGroups.length > 0;

  if (hasMultiple) {
    const loadedCount = allPreviews.filter((p) => p.data).length;
    const loadingCount = allPreviews.filter((p) => p.loading).length;
    const rangeTotal = rangeGroups.reduce((s, g) => s + g.urls.length, 0);
    const totalUrls = allPreviews.length + rangeTotal;

    return (
      <div className="flex w-full max-w-sm flex-col">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">{totalUrls} URL{totalUrls !== 1 ? "s" : ""} detected</h2>
            <p className="text-xs text-zinc-500">{loadingCount > 0 ? `Fetching previews\u2026 ${loadedCount} / ${allPreviews.length} ready` : rangeTotal > 0 ? `${allPreviews.length} preview${allPreviews.length !== 1 ? "s" : ""} + ${rangeTotal} range items` : "All previews loaded"}</p>
          </div>
          <button onClick={onClearPreview} className="text-xs text-zinc-600 underline-offset-2 transition-colors hover:text-zinc-400 hover:underline">Clear all</button>
        </div>

        {onSelectQualityForAll && (
          <div className="mb-2.5 rounded-xl bg-zinc-900/60 p-2.5 ring-1 ring-white/5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Apply quality to all</p>
            <div className="flex flex-wrap gap-1">
              {GLOBAL_QUALITY_PRESETS.map((preset) => (
                <button key={preset.value} type="button" onClick={() => onSelectQualityForAll(preset.value)} className="rounded px-2 py-1 text-[10px] font-semibold bg-zinc-800 text-zinc-400 hover:bg-blue-600 hover:text-white transition-all">{preset.label}</button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5 w-full">
          {allPreviews.map((preview, idx) => (
            <MultiPreviewCard
              key={preview.url}
              index={idx + 1}
              preview={preview}
              selectedQuality={selectedQualitiesMap?.get(preview.url)}
              onSelectQuality={(fmt) => onSelectQuality?.(preview.url, fmt)}
              isExiting={isExiting}
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

  /* ── Single URL: preview loading or loaded ───────────── */
  if (previewLoading || previewData) {
    return (
      <AnimatedPreviewMorph loading={previewLoading} index={0} className="w-full max-w-sm flex justify-center" isExiting={isExiting}>
        {previewLoading ? (
          <div className="flex flex-col items-center text-center w-full">
            <Skeleton className="mb-5 h-44 w-80 rounded-xl" />
            <Skeleton className="mb-2 h-5 w-64" />
            <Skeleton className="mb-4 h-4 w-40" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <p className="mt-5 text-xs text-blue-400/80 animate-pulse">
              {allPreviews[0]?.fetchHint ?? "Fetching video info\u2026"}
            </p>
          </div>
        ) : previewData ? (
          <div className="flex flex-col items-center text-center w-full">
            {/* Thumbnail or Video Player */}
            <div 
              className="group relative mb-4 w-full mx-auto overflow-hidden rounded-2xl bg-black ring-1 ring-white/10" 
              style={{ 
                aspectRatio: (allPreviews[0]?.url || previewData.url || "").includes("/shorts/") ? "9/16" : "16/9", 
                maxWidth: (allPreviews[0]?.url || previewData.url || "").includes("/shorts/") ? "225px" : "100%" 
              }}
            >
              {trimEnabled && previewData.url ? (
                <div className="absolute inset-0 z-10 w-full h-full bg-black">
                  <MediaPlayer
                    ref={playerRef}
                    src={previewData.stream_url || previewData.url}
                    autoPlay={true}
                    muted={true}
                    onTimeUpdate={(e: any) => {
                      if (trimEnd && e.detail > trimEnd) {
                        try {
                          if (playerRef.current) playerRef.current.currentTime = trimStart ?? 0;
                        } catch (e) {}
                      }
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    className="w-full h-full"
                  >
                    <MediaProvider />
                  </MediaPlayer>
                </div>
              ) : previewData.thumbnail_url ? (
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

              {!trimEnabled && !previewData.is_playlist && previewData.duration_seconds && (
                <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/80 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                  <Clock className="h-3 w-3 opacity-70" />
                  {formatDuration(previewData.duration_seconds)}
                </div>
              )}

              {!trimEnabled && previewData.is_playlist && (
                <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-gradient-to-r from-blue-600 to-cyan-600 px-2 py-1 text-xs font-semibold text-white shadow">
                  <ListVideo className="h-3.5 w-3.5" />
                  {previewData.playlist_count_hint ?? "?"} videos
                </div>
              )}

              {!trimEnabled && !previewData.is_playlist && (
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
        ) : null}
      </AnimatedPreviewMorph>
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
