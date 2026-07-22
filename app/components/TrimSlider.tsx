"use client";

import { useEffect, useRef, useCallback } from "react";

interface TrimSliderProps {
  duration: number; // total duration in seconds
  start: number;    // trim start in seconds
  end: number;      // trim end in seconds
  onChange: (start: number, end: number) => void;
  thumbnailUrl?: string; // For CapCut style filmstrip
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function TrimSlider({ duration, start, end, onChange, thumbnailUrl }: TrimSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const startThumbRef = useRef<HTMLDivElement>(null);
  const endThumbRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"start" | "end" | "center" | null>(null);
  const dragStartRef = useRef<{ clientX: number; start: number; end: number } | null>(null);
  const wasDraggingRef = useRef(false);

  const startPct = duration > 0 ? (start / duration) * 100 : 0;
  const endPct = duration > 0 ? (end / duration) * 100 : 100;
  const selectedDuration = end - start;

  const clamp = (val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val));

  const getPctFromEvent = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      return clamp((clientX - rect.left) / rect.width, 0, 1);
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingRef.current || !dragStartRef.current || !trackRef.current) return;
      
      const rect = trackRef.current.getBoundingClientRect();
      const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const seconds = pct * duration;

      // All branches use the snapshot from drag-start to avoid stale closures
      const snap = dragStartRef.current;

      if (draggingRef.current === "start") {
        // Clamp so start can't pass the snapshotted end
        const newStart = clamp(seconds, 0, snap.end - 1);
        onChange(Math.round(newStart * 10) / 10, snap.end);
      } else if (draggingRef.current === "end") {
        // Clamp so end can't pass the snapshotted start
        const newEnd = clamp(seconds, snap.start + 1, duration);
        onChange(snap.start, Math.round(newEnd * 10) / 10);
      } else if (draggingRef.current === "center") {
        const deltaX = e.clientX - snap.clientX;
        const deltaSec = (deltaX / rect.width) * duration;
        
        const windowSize = snap.end - snap.start;
        let newStart = snap.start + deltaSec;
        let newEnd = snap.end + deltaSec;
        
        if (newStart < 0) {
          newStart = 0;
          newEnd = windowSize;
        } else if (newEnd > duration) {
          newEnd = duration;
          newStart = duration - windowSize;
        }
        
        onChange(Math.round(newStart * 10) / 10, Math.round(newEnd * 10) / 10);
      }
    },
    [duration, onChange]
  );

  const handleMouseUp = useCallback(() => {
    if (draggingRef.current) {
      wasDraggingRef.current = true;
      // Reset the flag after a tick so the click event is suppressed
      requestAnimationFrame(() => {
        wasDraggingRef.current = false;
      });
    }
    draggingRef.current = null;
    dragStartRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const startDrag = (handle: "start" | "end" | "center") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = handle;
    dragStartRef.current = { clientX: e.clientX, start, end };
    document.body.style.cursor = handle === "center" ? "grabbing" : "ew-resize";
    document.body.style.userSelect = "none";
  };

  // Keyboard nudge: 1-second steps
  const handleKeyDown = (handle: "start" | "end") => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1;
    if (handle === "start") {
      if (e.key === "ArrowLeft") onChange(clamp(start - step, 0, end - 1), end);
      if (e.key === "ArrowRight") onChange(clamp(start + step, 0, end - 1), end);
    } else {
      if (e.key === "ArrowLeft") onChange(start, clamp(end - step, start + 1, duration));
      if (e.key === "ArrowRight") onChange(start, clamp(end + step, start + 1, duration));
    }
  };

  // Click on track to set nearest handle — suppressed after any drag
  const handleTrackClick = (e: React.MouseEvent) => {
    if (wasDraggingRef.current) return;
    const pct = getPctFromEvent(e.clientX);
    const seconds = pct * duration;
    const distStart = Math.abs(seconds - start);
    const distEnd = Math.abs(seconds - end);
    if (distStart <= distEnd) {
      onChange(clamp(seconds, 0, end - 1), end);
    } else {
      onChange(start, clamp(seconds, start + 1, duration));
    }
  };

  return (
    <div className="trim-slider px-1 py-3 select-none">
      {/* Timestamp badges row */}
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">Start</span>
          <span className="rounded-md bg-blue-600/20 px-2 py-0.5 text-[11px] font-mono font-semibold text-blue-300 ring-1 ring-blue-500/30 tabular-nums">
            {formatTime(start)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400 ring-1 ring-zinc-700">
            {formatTime(selectedDuration)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="rounded-md bg-blue-600/20 px-2 py-0.5 text-[11px] font-mono font-semibold text-blue-300 ring-1 ring-blue-500/30 tabular-nums">
            {formatTime(end)}
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">End</span>
        </div>
      </div>

      {/* Track (Thick Filmstrip Style) */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        className="relative h-14 rounded-lg bg-zinc-800 cursor-pointer overflow-hidden ring-1 ring-white/10"
        style={{ margin: "0 12px" }}
        role="presentation"
      >
        {/* Filmstrip Background */}
        {thumbnailUrl && (
          <div
            className="absolute inset-0 opacity-80"
            style={{
              backgroundImage: `url(${thumbnailUrl})`,
              backgroundSize: "auto 100%",
              backgroundRepeat: "repeat-x",
              backgroundPosition: "left center",
            }}
          />
        )}

        {/* Unselected region (left) - darkened */}
        <div
          className="absolute inset-y-0 left-0 bg-black/70 backdrop-blur-[1px]"
          style={{ width: `${startPct}%` }}
        />

        {/* Unselected region (right) - darkened */}
        <div
          className="absolute inset-y-0 right-0 bg-black/70 backdrop-blur-[1px]"
          style={{ width: `${100 - endPct}%` }}
        />

        {/* Selected Region Border Wrapper (Center Area) */}
        <div
          className="absolute inset-y-0 cursor-grab active:cursor-grabbing hover:bg-white/10 transition-colors"
          onMouseDown={startDrag("center")}
          style={{
            left: `${startPct}%`,
            width: `${endPct - startPct}%`,
          }}
        >
          {/* Top/Bottom active border */}
          <div className="absolute inset-x-0 top-0 h-1 bg-blue-500 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-500 pointer-events-none" />
          
          {/* Light overlay for selected part */}
          <div className="absolute inset-0 bg-blue-500/10 pointer-events-none" />
        </div>

        {/* Start Handle */}
        <div
          ref={startThumbRef}
          role="slider"
          tabIndex={0}
          aria-valuenow={start}
          aria-valuemin={0}
          aria-valuemax={end}
          onMouseDown={startDrag("start")}
          onKeyDown={handleKeyDown("start")}
          className="absolute inset-y-0 flex items-center justify-center w-4 -ml-2 cursor-ew-resize bg-blue-500 rounded-l-md hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-white/50 group"
          style={{ left: `${startPct}%` }}
        >
          <div className="w-1 h-4 rounded-full bg-blue-900/40 group-hover:bg-blue-900/60" />
        </div>

        {/* End Handle */}
        <div
          ref={endThumbRef}
          role="slider"
          tabIndex={0}
          aria-valuenow={end}
          aria-valuemin={start}
          aria-valuemax={duration}
          onMouseDown={startDrag("end")}
          onKeyDown={handleKeyDown("end")}
          className="absolute inset-y-0 flex items-center justify-center w-4 -mr-2 cursor-ew-resize bg-blue-500 rounded-r-md hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-white/50 group"
          style={{ right: `${100 - endPct}%` }}
        >
          <div className="w-1 h-4 rounded-full bg-blue-900/40 group-hover:bg-blue-900/60" />
        </div>
      </div>

      {/* Full duration label */}
      <div className="mt-2 flex justify-center">
        <span className="text-[9px] text-zinc-600">Total: {formatTime(duration)}</span>
      </div>
    </div>
  );
}
