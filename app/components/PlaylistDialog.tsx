"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  X,
  Play,
  ListVideo,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  Download,
  Video,
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useModalAnimation } from "../hooks/useModalAnimation";

interface PlaylistVideo {
  id: string;
  title: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  uploader?: string;
}

interface PlaylistDialogProps {
  isOpen: boolean;
  isExiting?: boolean;
  onClose: () => void;
  onConfirm: (downloadPlaylist: boolean, selectedVideoIds?: string[]) => void;
  playlistTitle: string;
  videoTitle: string;
  videoThumbnail?: string;
  playlistCount: number;
  playlistVideos?: PlaylistVideo[];
  isLoadingVideos?: boolean;
  onLoadPlaylistVideos?: () => void;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

type ViewMode = "choice" | "select";

export function PlaylistDialog({
  isOpen,
  isExiting,
  onClose,
  onConfirm,
  playlistTitle,
  videoTitle,
  videoThumbnail,
  playlistCount,
  playlistVideos = [],
  isLoadingVideos = false,
  onLoadPlaylistVideos,
}: PlaylistDialogProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("choice");
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(true);

  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { renderState } = useModalAnimation({
    isOpen,
    isExiting,
    onClose,
    targetId: "download-button",
    exitTargetId: "download-queue-container",
    modalRef,
    backdropRef,
    contentRef,
  });

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setViewMode("choice");
      setSelectedVideos(new Set());
      setSelectAll(true);
    }
  }, [isOpen]);

  // Select all videos when playlist is loaded
  useEffect(() => {
    if (playlistVideos.length > 0 && selectAll) {
      setSelectedVideos(new Set(playlistVideos.map((v) => v.id)));
    }
  }, [playlistVideos, selectAll]);

  const handleSelectAll = useCallback(() => {
    if (selectAll) {
      setSelectedVideos(new Set());
      setSelectAll(false);
    } else {
      setSelectedVideos(new Set(playlistVideos.map((v) => v.id)));
      setSelectAll(true);
    }
  }, [selectAll, playlistVideos]);

  const handleToggleVideo = useCallback((videoId: string) => {
    setSelectedVideos((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(videoId)) {
        newSet.delete(videoId);
      } else {
        newSet.add(videoId);
      }
      return newSet;
    });
    setSelectAll(false);
  }, []);

  const handleChoosePlaylist = useCallback(() => {
    setViewMode("select");
    if (onLoadPlaylistVideos && playlistVideos.length === 0) {
      onLoadPlaylistVideos();
    }
  }, [onLoadPlaylistVideos, playlistVideos.length]);

  const handleDownloadSelected = useCallback(() => {
    if (selectedVideos.size === playlistVideos.length) {
      // All selected, download entire playlist
      onConfirm(true);
    } else {
      // Partial selection
      onConfirm(true, Array.from(selectedVideos));
    }
  }, [selectedVideos, playlistVideos.length, onConfirm]);

  useGSAP(() => {
    if (viewMode === "select" && !isExiting) {
      gsap.from(".playlist-video-item", {
        y: 20,
        opacity: 0,
        duration: 0.4,
        stagger: 0.03,
        ease: "power3.out",
        clearProps: "all"
      });
    }
  }, [viewMode, isExiting]);

  if (!renderState) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        ref={backdropRef}
        className="fixed inset-0 bg-black/60 backdrop-blur-xl"
        onClick={onClose}
      />
      {/* Modal */}
      <div 
        ref={modalRef}
        className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[24px] border border-white/10 bg-zinc-950/80 shadow-[0_0_80px_rgba(0,0,0,0.8)] backdrop-blur-3xl flex flex-col max-h-[85vh] ring-1 ring-white/5"
      >
        <div ref={contentRef} className="flex h-full flex-col overflow-hidden">
          {/* Header */}
          <div className="relative border-b border-white/5 px-6 py-5 flex-shrink-0 bg-gradient-to-b from-white/5 to-transparent">
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-5 min-w-0">
                {/* Playlist thumbnail */}
                <div className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-800 shadow-lg ring-1 ring-white/10">
                  {videoThumbnail ? (
                    <Image
                      src={videoThumbnail}
                      alt={playlistTitle}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ListVideo className="h-8 w-8 text-zinc-600" />
                    </div>
                  )}
                  {/* Playlist badge */}
                  <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white backdrop-blur-md">
                    <ListVideo className="h-3 w-3" />
                    {playlistCount}
                  </div>
                </div>
                <div className="min-w-0 flex-1 py-1">
                  <h2 className="text-xl font-bold tracking-tight text-white truncate drop-shadow-md">
                    {playlistTitle}
                  </h2>
                  <p className="mt-1.5 text-sm font-medium text-zinc-400">
                    {playlistCount} videos in playlist
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-1 rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white transition-all active:scale-95"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          {viewMode === "choice" ? (
            /* Initial choice view */
            <div className="p-8 flex-1 overflow-y-auto bg-zinc-950/40">
              <p className="text-[15px] text-zinc-400 mb-8 text-center font-medium">
                This video is part of a playlist. What would you like to download?
              </p>

              <div className="space-y-4 max-w-lg mx-auto">
                {/* Single Video Option */}
                <button
                  type="button"
                  onClick={() => onConfirm(false)}
                  className="w-full group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-all duration-300 hover:border-white/20 hover:bg-white/10 hover:shadow-xl hover:shadow-white/5 active:scale-[0.98]"
                >
                  <div className="relative z-10 flex items-center gap-5">
                    {/* Video thumbnail */}
                    <div className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-800 shadow-md ring-1 ring-white/10">
                      {videoThumbnail ? (
                        <Image
                          src={videoThumbnail}
                          alt={videoTitle}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Video className="h-8 w-8 text-zinc-500" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <Play className="h-8 w-8 text-white drop-shadow-lg" fill="currentColor" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                          Single Video
                        </span>
                      </div>
                      <div className="font-semibold text-zinc-100 truncate text-[15px]">
                        {videoTitle}
                      </div>
                      <div className="text-[13px] text-zinc-500 mt-1 font-medium">
                        Download only this video
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-zinc-600 group-hover:text-white transition-colors duration-300" />
                  </div>
                </button>

                {/* Entire Playlist Option */}
                <button
                  type="button"
                  onClick={handleChoosePlaylist}
                  className="w-full group relative overflow-hidden rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-left transition-all duration-300 hover:border-blue-500/50 hover:bg-blue-500/20 hover:shadow-xl hover:shadow-blue-500/10 active:scale-[0.98]"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10 flex items-center gap-5">
                    {/* Stacked thumbnails effect */}
                    <div className="relative h-16 w-28 flex-shrink-0">
                      <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-800/80 ring-1 ring-white/5" />
                      <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-lg bg-zinc-800/90 ring-1 ring-white/10" />
                      <div className="relative h-full w-full overflow-hidden rounded-lg bg-zinc-800 shadow-md ring-1 ring-white/20">
                        {videoThumbnail ? (
                          <Image
                            src={videoThumbnail}
                            alt={playlistTitle}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ListVideo className="h-8 w-8 text-zinc-500" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                          <span className="text-xl font-bold text-white drop-shadow-md">{playlistCount}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                          Full Playlist
                        </span>
                        <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2 py-0.5 text-[9px] font-bold text-blue-300 uppercase tracking-wider ring-1 ring-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                          Recommended
                        </span>
                      </div>
                      <div className="font-semibold text-white text-[15px] drop-shadow-sm">
                        Download all {playlistCount} videos
                      </div>
                      <div className="text-[13px] text-blue-300/80 mt-1 font-medium">
                        Choose which videos to include
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-blue-400 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </button>
              </div>
            </div>
          ) : (
            /* Video selection view */
            <>
              <div className="border-b border-white/5 px-6 py-3 flex items-center justify-between flex-shrink-0 bg-zinc-900/60 backdrop-blur-xl sticky top-0 z-20 shadow-sm">
                <button
                  type="button"
                  onClick={() => setViewMode("choice")}
                  className="flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-white transition-all duration-200 group active:scale-95"
                >
                  <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                  Back
                </button>
                <div className="flex items-center gap-5">
                  <span className="text-sm font-medium text-zinc-500">
                    <span className="text-zinc-200 font-semibold">{selectedVideos.size}</span> of {playlistVideos.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors active:scale-95"
                  >
                    {selectAll ? "Deselect All" : "Select All"}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-2 bg-zinc-950/40">
                {isLoadingVideos ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p className="mt-4 text-[13px] font-medium text-zinc-400 uppercase tracking-widest">Loading playlist...</p>
                  </div>
                ) : playlistVideos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <ListVideo className="h-12 w-12 text-zinc-600" />
                    <p className="mt-4 text-[13px] font-medium text-zinc-400 uppercase tracking-widest">No videos found</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 py-2">
                    {playlistVideos.map((video) => (
                      <button
                        key={video.id}
                        type="button"
                        onClick={() => handleToggleVideo(video.id)}
                        className={`playlist-video-item group relative w-full flex items-center gap-4 rounded-xl p-2.5 text-left transition-all duration-300 ${selectedVideos.has(video.id)
                            ? "bg-blue-500/10 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]"
                            : "bg-transparent hover:bg-white/5"
                          }`}
                      >
                        {/* Premium Circular Checkbox */}
                        <div
                          className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-300 ${selectedVideos.has(video.id)
                              ? "border-blue-500 bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.4)]"
                              : "border-zinc-600 bg-black/20 group-hover:border-zinc-400"
                            }`}
                        >
                          <Check 
                            className={`h-3.5 w-3.5 text-white transition-all duration-300 ${selectedVideos.has(video.id) ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} 
                            strokeWidth={3} 
                          />
                        </div>

                        {/* Thumbnail */}
                        <div className="relative h-[60px] w-[106px] flex-shrink-0 overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-white/10 transition-transform duration-500 ease-out group-hover:scale-[1.03] group-hover:shadow-lg">
                          {video.thumbnail_url ? (
                            <Image
                              src={video.thumbnail_url}
                              alt={video.title}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Video className="h-5 w-5 text-zinc-500" />
                            </div>
                          )}
                          {video.duration_seconds && (
                            <div className="absolute bottom-1 right-1 rounded-[4px] bg-black/80 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white backdrop-blur-md">
                              {formatDuration(video.duration_seconds)}
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 pr-2 py-0.5">
                          <div className="font-medium text-zinc-100 text-[14px] truncate leading-tight mb-1 tracking-tight">
                            {video.title}
                          </div>
                          {video.uploader && (
                            <div className="text-[12px] font-medium text-zinc-500 truncate">
                              {video.uploader}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer with download button */}
              <div className="border-t border-white/5 px-6 py-4 flex-shrink-0 bg-zinc-950/80 backdrop-blur-2xl">
                <button
                  type="button"
                  onClick={handleDownloadSelected}
                  disabled={selectedVideos.size === 0}
                  className="relative w-full overflow-hidden rounded-xl bg-blue-600 py-3.5 px-4 flex items-center justify-center gap-2 font-semibold tracking-wide text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all duration-300 disabled:opacity-50 disabled:shadow-none hover:bg-blue-500 hover:shadow-[0_0_25px_rgba(59,130,246,0.5)] active:scale-[0.98]"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                  <Download className="relative z-10 h-5 w-5" />
                  <span className="relative z-10">
                    Download {selectedVideos.size} {selectedVideos.size === 1 ? "Video" : "Videos"}
                  </span>
                </button>
              </div>
            </>
          )}

          {/* Footer for choice view */}
          {viewMode === "choice" && (
            <div className="border-t border-white/5 px-6 py-4 flex-shrink-0 bg-zinc-950/80 backdrop-blur-md">
              <p className="text-[12px] font-medium text-zinc-500 text-center tracking-wide">
                You can pause or cancel downloads from the queue at any time
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
