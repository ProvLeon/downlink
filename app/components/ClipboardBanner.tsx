"use client";

import { X, Link } from "lucide-react";

interface ClipboardBannerProps {
  url: string;
  onAccept: () => void;
  onDismiss: () => void;
}

/**
 * Slide-down banner shown when a video URL is detected in clipboard
 * on window focus. User can accept (auto-fills input) or dismiss.
 */
export function ClipboardBanner({ url, onAccept, onDismiss }: ClipboardBannerProps) {
  // Trim long URLs for display
  let display = url;
  try {
    const u = new URL(url);
    display = u.hostname + (u.pathname.length > 24 ? u.pathname.slice(0, 24) + "…" : u.pathname);
  } catch { /* keep raw */ }

  return (
    <div className="animate-slide-down w-full rounded-xl border border-blue-500/20 bg-blue-500/8 px-3 py-2.5 backdrop-blur-sm ring-1 ring-blue-500/10 shadow-lg">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
          <Link className="h-3.5 w-3.5 text-blue-400" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-zinc-300">URL detected in clipboard</p>
          <p className="truncate text-[11px] text-zinc-500 mt-0.5">{display}</p>
        </div>

        <button
          onClick={onAccept}
          className="flex-shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-500 active:bg-blue-700"
        >
          Use it
        </button>

        <button
          onClick={onDismiss}
          className="flex-shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
