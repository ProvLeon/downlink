"use client";

import { useEffect, useRef, useState } from "react";
import { X, Check } from "lucide-react";
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import { TrimSlider } from "./TrimSlider";
import { useModalAnimation } from "../hooks/useModalAnimation";

interface TrimModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewUrl: string;
  streamUrl?: string;
  thumbnailUrl?: string;
  duration: number;
  initialStart: number;
  initialEnd: number;
  onSave: (start: number, end: number) => void;
}

export function TrimModal({
  isOpen,
  onClose,
  previewUrl,
  streamUrl,
  thumbnailUrl,
  duration,
  initialStart,
  initialEnd,
  onSave,
}: TrimModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<MediaPlayerInstance>(null);
  
  // Local state for sliders so we don't commit until "Save" is clicked
  const [localStart, setLocalStart] = useState(initialStart);
  const [localEnd, setLocalEnd] = useState(initialEnd);
  
  // Delay playback to avoid React 19 StrictMode AbortError with ReactPlayer
  const [isPlaying, setIsPlaying] = useState(false);

  // Keep track of previous values to know which handle moved
  const prevStartRef = useRef(initialStart);
  const prevEndRef = useRef(initialEnd > 0 ? initialEnd : duration);

  // Reset local state when opened with new initial values
  useEffect(() => {
    if (isOpen) {
      setLocalStart(initialStart);
      const end = initialEnd > 0 ? initialEnd : duration;
      setLocalEnd(end);
      prevStartRef.current = initialStart;
      prevEndRef.current = end;
    } else {
      setIsPlaying(false);
      if (playerRef.current) {
        playerRef.current.pause();
      }
    }
  }, [isOpen, initialStart, initialEnd, duration]);

  // Sync player to the handle that is currently moving
  useEffect(() => {
    if (isOpen && playerRef.current) {
      const doSeek = () => {
        try {
          if (localStart !== prevStartRef.current) {
            if (playerRef.current) {
              playerRef.current.currentTime = localStart;
            }
            prevStartRef.current = localStart;
          } else if (localEnd !== prevEndRef.current) {
            if (playerRef.current) {
              playerRef.current.currentTime = localEnd;
            }
            prevEndRef.current = localEnd;
          }
        } catch (e) {
          // Ignore "provider destroyed" or similar errors during unmount
        }
      };

      // Debounce seek to prevent choking the video player network requests
      const timeoutId = setTimeout(doSeek, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [localStart, localEnd, isOpen]);

  const { renderState } = useModalAnimation({
    isOpen,
    onClose,
    targetId: "trim-icon",
    modalRef,
    backdropRef,
    contentRef,
  });

  const handleSave = () => {
    onSave(localStart, localEnd);
    onClose();
  };

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
        className="relative z-10 flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-zinc-200 bg-white/70 shadow-xl backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/90"
      >
        <div ref={contentRef} className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
            <h2 className="text-base font-semibold">Trim Clip</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

        {/* Video Player Area */}
        <div 
          className="relative w-full mx-auto bg-black shrink-0 overflow-hidden" 
          style={{ 
            height: "340px",
            maxWidth: previewUrl.includes("/shorts/") ? "192px" : "100%"
          }}
        >
            <MediaPlayer
              ref={playerRef}
              src={streamUrl || previewUrl}
              autoPlay={true}
              muted={true}
              onTimeUpdate={(e: any) => {
                if (localEnd > 0 && e.detail > localEnd) {
                  try {
                    if (playerRef.current) playerRef.current.currentTime = localStart ?? 0;
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

        {/* Controls Area */}
        <div className="flex flex-col gap-4 p-5 overflow-y-auto">
          <TrimSlider
            duration={duration}
            start={localStart}
            end={localEnd}
            thumbnailUrl={thumbnailUrl}
            onChange={(s, e) => {
              setLocalStart(s);
              setLocalEnd(e);
            }}
          />

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all"
            >
              <Check className="h-4 w-4" />
              Save Trim
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
