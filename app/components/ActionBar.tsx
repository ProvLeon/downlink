"use client";

import { Download, Captions, Scissors, Loader2, Database, ClapperboardIcon } from "lucide-react";
import type { PresetWithHint } from "../types";

interface ActionBarProps {
  presetId: string;
  onPresetChange: (value: string) => void;
  presets: PresetWithHint[];
  subtitlesEnabled: boolean;
  onSubtitlesToggle: () => void;
  sponsorBlockEnabled: boolean;
  onSponsorBlockToggle: () => void;
  // Trim
  trimEnabled: boolean;
  onTrimToggle: () => void;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  duration: number; // in seconds (0 if no preview data)
  // Metadata embed
  embedMetaEnabled: boolean;
  onEmbedMetaToggle: () => void;
  // Download
  onDownload: () => void;
  isSubmitting: boolean;
  isPlaylist: boolean;
  disabled: boolean;
  previewLoading?: boolean;
}

export function ActionBar({
  presetId,
  onPresetChange,
  presets,
  subtitlesEnabled,
  onSubtitlesToggle,
  sponsorBlockEnabled,
  onSponsorBlockToggle,
  trimEnabled,
  onTrimToggle,
  trimStart,
  trimEnd,
  onTrimChange,
  duration,
  embedMetaEnabled,
  onEmbedMetaToggle,
  onDownload,
  isSubmitting,
  isPlaylist,
  disabled,
  previewLoading = false,
}: ActionBarProps) {
  const isLoading = isSubmitting || previewLoading;
  const canTrim = duration > 0 && !isPlaylist;

  return (
    <div className="border-t border-zinc-800/80 bg-transparent">

      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* ── Toggle buttons ─────────────────────────── */}
        <div className="flex items-center gap-1.5">
          {/* Subtitles toggle */}
          <button
            type="button"
            onClick={onSubtitlesToggle}
            title="Download subtitles / captions"
            aria-pressed={subtitlesEnabled}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
              subtitlesEnabled
                ? "bg-blue-600 text-white shadow-sm shadow-blue-900/40"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            <Captions className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Subtitles</span>
          </button>

          {/* SponsorBlock toggle */}
          <button
            type="button"
            onClick={onSponsorBlockToggle}
            title="Skip sponsored segments via SponsorBlock"
            aria-pressed={sponsorBlockEnabled}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
              sponsorBlockEnabled
                ? "bg-blue-600 text-white shadow-sm shadow-blue-900/40"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            <Scissors className="h-3.5 w-3.5 flex-shrink-0" />
            <span>SponsorBlock</span>
          </button>

          {/* Trim toggle — only shown when a single video with duration is previewed */}
          {canTrim && (
            <button
              id="trim-icon"
              type="button"
              onClick={onTrimToggle}
              title="Trim clip — select a start and end time to download only that segment"
              aria-pressed={trimEnabled}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                trimEnabled
                  ? "bg-violet-600 text-white shadow-sm shadow-violet-900/40"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
            >
              <ClapperboardIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Trim</span>
            </button>
          )}

          {/* Embed Metadata toggle */}
          <button
            type="button"
            onClick={onEmbedMetaToggle}
            title="Embed thumbnail and metadata into the file (requires ffmpeg)"
            aria-pressed={embedMetaEnabled}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
              embedMetaEnabled
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-900/40"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            <Database className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Embed Meta</span>
          </button>
        </div>

        {/* Removed redundant global PresetSelector */}

        {/* ── Download button ─────────────────────────── */}
        <button
          id="download-button"
          type="button"
          onClick={onDownload}
          disabled={disabled || isLoading}
          className="btn-brand flex min-w-[130px] items-center justify-center gap-2 rounded-xl px-5 py-2 text-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{isSubmitting ? "Adding…" : "Loading…"}</span>
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" />
              <span>{isPlaylist ? "Download Playlist" : trimEnabled && canTrim ? "Download Clip" : "Download"}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
