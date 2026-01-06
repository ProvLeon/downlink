"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDownlink } from "./hooks/useDownlink";
import { QueueItemComponent } from "./components/QueueItem";
import { SettingsModal } from "./components/SettingsModal";
import { AdvancedOptions, DEFAULT_OPTIONS, type AdvancedOptionsState } from "./components/AdvancedOptions";
import type { PresetWithHint, UserSettings, FetchMetadataResult } from "./types";
import { formatBytes, formatDuration } from "./types";
import Image from "next/image";

// Preview data for multiple URLs
interface UrlPreview {
  url: string;
  loading: boolean;
  data: FetchMetadataResult | null;
  error: string | null;
  presetId: string; // Per-URL preset selection
}

const PRESETS: PresetWithHint[] = [
  { id: "recommended_best", name: "Recommended (Best)", hint: "Best quality, merges automatically" },
  { id: "mp4_1080p", name: "1080p MP4", hint: "Best compatibility" },
  { id: "mp4_best", name: "Best MP4", hint: "Prefer MP4 container" },
  { id: "audio_m4a", name: "Audio M4A", hint: "Fastest, great quality" },
  { id: "audio_mp3_320", name: "Audio MP3 320", hint: "Most compatible, larger file" },
];

export default function Home() {
  // Downlink hook
  const downlink = useDownlink();

  // Form state
  const [urlInput, setUrlInput] = useState("");
  const [destination, setDestination] = useState("");
  const [presetId, setPresetId] = useState<string>("recommended_best");
  const [sponsorBlockEnabled, setSponsorBlockEnabled] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [subtitlesLanguage, setSubtitlesLanguage] = useState("en");

  // UI state
  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [advancedOptions, setAdvancedOptions] = useState<AdvancedOptionsState>(DEFAULT_OPTIONS);

  // Preview state - now supports multiple URLs
  const [urlPreviews, setUrlPreviews] = useState<Map<string, UrlPreview>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Extract URLs from input - must be defined before dependent useMemos
  const extractedUrls = useMemo(() => {
    if (!urlInput.trim()) return [];
    const matches = urlInput.match(/https?:\/\/[^\s]+/g) ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of matches) {
      const u = m.trim();
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
    return out;
  }, [urlInput]);

  const hasMultipleUrls = extractedUrls.length > 1;

  // Single preview data (for backwards compatibility with single URL)
  const previewData = useMemo(() => {
    if (extractedUrls.length === 1) {
      return urlPreviews.get(extractedUrls[0])?.data ?? null;
    }
    return null;
  }, [extractedUrls, urlPreviews]);

  const previewLoading = useMemo(() => {
    if (extractedUrls.length === 1) {
      return urlPreviews.get(extractedUrls[0])?.loading ?? false;
    }
    return Array.from(urlPreviews.values()).some(p => p.loading);
  }, [extractedUrls, urlPreviews]);

  const previewError = useMemo(() => {
    if (extractedUrls.length === 1) {
      return urlPreviews.get(extractedUrls[0])?.error ?? null;
    }
    return null;
  }, [extractedUrls, urlPreviews]);

  // Derived state
  const selectedPreset = useMemo(
    () => PRESETS.find((p) => p.id === presetId) ?? PRESETS[0],
    [presetId]
  );

  // Load default destination on mount
  useEffect(() => {
    if (!downlink.isTauri) return;

    const loadDefaults = async () => {
      try {
        const defaultDir = await downlink.getDefaultDownloadDir();
        setDestination(defaultDir);

        const loadedSettings = await downlink.getSettings();
        setSettings(loadedSettings);

        if (loadedSettings.general.default_preset) {
          setPresetId(loadedSettings.general.default_preset);
        }
        if (loadedSettings.sponsorblock.enabled_by_default) {
          setSponsorBlockEnabled(true);
        }
        if (loadedSettings.subtitles.enabled_by_default) {
          setSubtitlesEnabled(true);
          setSubtitlesLanguage(loadedSettings.subtitles.default_language || "en");
        }
      } catch (e) {
        console.error("Failed to load defaults:", e);
      }
    };

    loadDefaults();
  }, [downlink.isTauri]);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 38), 150);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [urlInput, adjustTextareaHeight]);

  // Auto-fetch preview for all URLs
  useEffect(() => {
    if (!downlink.isTauri || extractedUrls.length === 0) {
      setUrlPreviews(new Map());
      return;
    }

    // Initialize previews for new URLs
    const newPreviews = new Map<string, UrlPreview>();
    const urlsToFetch: string[] = [];

    for (const url of extractedUrls) {
      const existing = urlPreviews.get(url);
      if (existing) {
        newPreviews.set(url, existing);
      } else {
        newPreviews.set(url, { url, loading: true, data: null, error: null, presetId: presetId });
        urlsToFetch.push(url);
      }
    }

    // Remove previews for URLs no longer in the list
    setUrlPreviews(newPreviews);

    // Fetch metadata for new URLs
    if (urlsToFetch.length === 0) return;

    let cancelled = false;

    const fetchAllPreviews = async () => {
      for (const url of urlsToFetch) {
        if (cancelled) break;

        try {
          const result = await downlink.fetchMetadata(url, {
            preset_id: presetId,
            output_dir: destination,
          });
          if (!cancelled) {
            setUrlPreviews(prev => {
              const updated = new Map(prev);
              const existing = prev.get(url);
              updated.set(url, { url, loading: false, data: result, error: null, presetId: existing?.presetId ?? presetId });
              return updated;
            });
          }
        } catch (e) {
          if (!cancelled) {
            setUrlPreviews(prev => {
              const updated = new Map(prev);
              const existing = prev.get(url);
              updated.set(url, {
                url,
                loading: false,
                data: null,
                error: e instanceof Error ? e.message : "Failed to fetch",
                presetId: existing?.presetId ?? presetId,
              });
              return updated;
            });
          }
        }
      }
    };

    const timeout = setTimeout(fetchAllPreviews, 500);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [downlink.isTauri, extractedUrls.join(','), presetId, destination]);

  // Handlers
  const handlePasteClick = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrlInput(text);
    } catch {
      const el = document.getElementById("downlink-url") as HTMLInputElement | null;
      el?.focus();
    }
  }, []);

  // Handler to update preset for a specific URL
  const handleUrlPresetChange = useCallback((url: string, newPresetId: string) => {
    setUrlPreviews(prev => {
      const updated = new Map(prev);
      const existing = prev.get(url);
      if (existing) {
        updated.set(url, { ...existing, presetId: newPresetId });
      }
      return updated;
    });
  }, []);

  // Handler to remove a URL from the input and preview list
  const handleRemoveUrl = useCallback((urlToRemove: string) => {
    // Remove from the text input
    setUrlInput(prev => {
      // Split by whitespace, filter out the URL, rejoin
      const urls = prev.match(/https?:\/\/[^\s]+/g) ?? [];
      const filtered = urls.filter(u => u !== urlToRemove);
      return filtered.join(' ');
    });
    // Remove from preview map
    setUrlPreviews(prev => {
      const updated = new Map(prev);
      updated.delete(urlToRemove);
      return updated;
    });
  }, []);

  const handleAddToQueue = useCallback(async () => {
    if (!downlink.isTauri || extractedUrls.length === 0) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const allIds: string[] = [];

      // For multiple URLs, submit each with its own preset
      if (hasMultipleUrls) {
        for (const url of extractedUrls) {
          const preview = urlPreviews.get(url);
          const urlPresetId = preview?.presetId ?? presetId;

          const result = await downlink.addUrls(url, {
            preset_id: urlPresetId,
            output_dir: destination,
            parent_id: null,
            source_kind: preview?.data?.is_playlist ? "playlist_parent" : "single",
            title: preview?.data?.title ?? null,
            uploader: preview?.data?.uploader ?? null,
            thumbnail_url: preview?.data?.thumbnail_url ?? null,
            duration_seconds: preview?.data?.duration_seconds ?? null,
          });

          // If it's a playlist, expand it
          if (preview?.data?.is_playlist && result.ids.length > 0) {
            await downlink.expandPlaylist(url, {
              preset_id: urlPresetId,
              output_dir: destination,
            });
          }

          allIds.push(...result.ids);
        }
      } else {
        // Single URL - use the global preset
        const result = await downlink.addUrls(urlInput, {
          preset_id: presetId,
          output_dir: destination,
          parent_id: null,
          source_kind: previewData?.is_playlist ? "playlist_parent" : "single",
          title: previewData?.title ?? null,
          uploader: previewData?.uploader ?? null,
          thumbnail_url: previewData?.thumbnail_url ?? null,
          duration_seconds: previewData?.duration_seconds ?? null,
        });

        // If it's a playlist, expand it
        if (previewData?.is_playlist && result.ids.length > 0) {
          await downlink.expandPlaylist(extractedUrls[0], {
            preset_id: presetId,
            output_dir: destination,
          });
        }

        allIds.push(...result.ids);
      }

      // Auto-start if enabled
      if (settings?.general.auto_start !== false && allIds.length > 0) {
        for (const id of allIds) {
          await downlink.startDownload(id);
        }
      }

      // Clear input
      setUrlInput("");
      setUrlPreviews(new Map());
      setTab("queue");
    } catch (e) {
      console.error("[Downlink] Failed to add to queue:", e);
      setSubmitError(e instanceof Error ? e.message : "Failed to add to queue");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    downlink,
    extractedUrls,
    hasMultipleUrls,
    urlPreviews,
    previewData,
    urlInput,
    presetId,
    destination,
    settings,
  ]);

  const handleSaveSettings = useCallback(
    async (newSettings: UserSettings) => {
      await downlink.saveSettings(newSettings);
      setSettings(newSettings);
    },
    [downlink]
  );

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const handleOpenAdvanced = useCallback(() => {
    setAdvancedOpen(true);
  }, []);

  const handleCloseAdvanced = useCallback(() => {
    setAdvancedOpen(false);
  }, []);

  const handleApplyAdvanced = useCallback((options: AdvancedOptionsState) => {
    setAdvancedOptions(options);
    // Apply quick toggles from advanced options
    setSponsorBlockEnabled(options.sponsorBlockEnabled);
    setSubtitlesEnabled(options.subtitlesEnabled);
    setSubtitlesLanguage(options.subtitlesLanguage);
  }, []);

  // Queue items to display
  const displayQueue = downlink.queue.length > 0 ? downlink.queue : [];
  const displayHistory = downlink.history;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-4">
        {/* Top bar */}
        <header className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">
                <Image
                  src="/downlink.png" alt="Downlink Logo"
                  width={24}
                  height={24}
                />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">Downlink</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Paste → preview → download
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {downlink.ytDlpVersion && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  yt-dlp {downlink.ytDlpVersion}
                </span>
              )}
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                onClick={handleOpenSettings}
              >
                Settings
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-8">
              <label
                htmlFor="downlink-url"
                className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                URL {hasMultipleUrls && `(${extractedUrls.length} URLs detected)`}
              </label>
              <div className="flex gap-2 items-start">
                <textarea
                  ref={textareaRef}
                  id="downlink-url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Paste a video/playlist link… (or multiple links)"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700 resize-none overflow-hidden"
                  rows={1}
                  style={{ minHeight: '38px' }}
                />
                <button
                  type="button"
                  onClick={handlePasteClick}
                  className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  Paste
                </button>
              </div>
            </div>

            <div className="md:col-span-4">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Destination
              </label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700"
              />
            </div>
          </div>
        </header>

        {/* Web mode warning */}
        {!downlink.isTauri && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Web Mode:</strong> Downloads are disabled. Run inside the Downlink
            desktop app to use full features.
          </div>
        )}

        {/* Error messages */}
        {submitError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            {submitError}
          </div>
        )}

        {downlink.lastError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            {downlink.lastError}
            <button
              type="button"
              onClick={downlink.clearError}
              className="ml-2 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main content */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* Preview + actions */}
          <div className="md:col-span-7">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {/* Preview area - Multiple URLs */}
              {hasMultipleUrls ? (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 sticky top-0 bg-white dark:bg-zinc-900 pb-2">
                    {extractedUrls.length} URLs to download
                  </div>
                  {extractedUrls.map((url, index) => {
                    const preview = urlPreviews.get(url);
                    return (
                      <div
                        key={url}
                        className="flex items-start gap-3 p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800"
                      >
                        {/* Thumbnail */}
                        <div className="shrink-0">
                          {preview?.data?.thumbnail_url ? (
                            <img
                              src={preview.data.thumbnail_url}
                              alt=""
                              className="h-12 w-20 rounded-lg object-cover bg-zinc-200 dark:bg-zinc-800"
                            />
                          ) : (
                            <div className="h-12 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                              {preview?.loading ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                              ) : (
                                <svg
                                  className="w-5 h-5 text-zinc-400"
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
                              )}
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                            {preview?.loading
                              ? "Fetching…"
                              : preview?.data?.title
                                ? preview.data.title
                                : preview?.error
                                  ? `Error: ${preview.error}`
                                  : `Video ${index + 1}`}
                          </div>
                          <div className="text-xs truncate" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
                            {preview?.data?.uploader ?? url}
                            {/* Duration and filesize info */}
                            {(preview?.data?.duration_seconds || preview?.data?.filesize_bytes) && (
                              <span className="ml-1">
                                {preview?.data?.duration_seconds && (
                                  <span>· {formatDuration(preview.data.duration_seconds)}</span>
                                )}
                                {preview?.data?.filesize_bytes && (
                                  <span> · {formatBytes(preview.data.filesize_bytes)}</span>
                                )}
                              </span>
                            )}
                          </div>
                          {preview?.data?.is_playlist && (
                            <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                              Playlist ({preview.data.playlist_count_hint ?? "?"})
                            </span>
                          )}
                          {/* Per-URL preset selector */}
                          <select
                            value={preview?.presetId ?? presetId}
                            onChange={(e) => handleUrlPresetChange(url, e.target.value)}
                            className="mt-1.5 text-xs bg-zinc-200 dark:bg-zinc-700 border-0 rounded-md px-1.5 py-0.5 focus:ring-1 focus:ring-blue-500"
                            style={{ color: 'var(--foreground)' }}
                          >
                            {PRESETS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Remove button and index badge */}
                        <div className="shrink-0 flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRemoveUrl(url)}
                            className="flex items-center justify-center h-6 w-6 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                            title="Remove from list"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <div className="flex items-center justify-center h-5 w-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-[10px] font-medium" style={{ color: 'var(--foreground)' }}>
                            {index + 1}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Single URL preview */
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  <div className="shrink-0">
                    {previewData?.thumbnail_url ? (
                      <img
                        src={previewData.thumbnail_url}
                        alt=""
                        className="h-20 w-32 rounded-xl object-cover bg-zinc-200 dark:bg-zinc-800"
                      />
                    ) : (
                      <div className="h-20 w-32 rounded-xl bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
                        {previewLoading ? (
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                        ) : (
                          <svg
                            className="w-8 h-8 text-zinc-400"
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
                        )}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {previewLoading
                        ? "Fetching preview…"
                        : previewData?.title
                          ? previewData.title
                          : urlInput.trim()
                            ? "Ready to fetch preview"
                            : "Paste a link to preview"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {previewError
                        ? previewError
                        : previewData?.uploader
                          ? previewData.uploader
                          : previewData?.is_playlist
                            ? `Playlist: ${previewData.playlist_count_hint ?? "?"} items`
                            : urlInput.trim()
                              ? "Metadata preview will appear here"
                              : "Downlink will show title, channel, and formats here"}
                      {/* Duration and filesize for single URL */}
                      {previewData && !previewData.is_playlist && (previewData.duration_seconds || previewData.filesize_bytes) && (
                        <span className="ml-1">
                          {previewData.duration_seconds && (
                            <span>· {formatDuration(previewData.duration_seconds)}</span>
                          )}
                          {previewData.filesize_bytes && (
                            <span> · {formatBytes(previewData.filesize_bytes)}</span>
                          )}
                        </span>
                      )}
                    </div>
                    {previewData?.is_playlist && (
                      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 4a1 1 0 011-1h11a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h11a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h7a1 1 0 110 2H3a1 1 0 01-1-1z" />
                        </svg>
                        Playlist ({previewData.playlist_count_hint ?? "?"} items)
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Preset and toggles */}
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
                {/* Only show global preset selector for single URL mode */}
                {!hasMultipleUrls && (
                  <div className="md:col-span-7">
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Preset
                    </label>
                    <select
                      value={presetId}
                      onChange={(e) => setPresetId(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700"
                    >
                      {PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {selectedPreset.hint}
                    </div>
                  </div>
                )}

                <div className={hasMultipleUrls ? "md:col-span-12" : "md:col-span-5"}>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Quick toggles
                  </label>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={subtitlesEnabled}
                        onChange={(e) => setSubtitlesEnabled(e.target.checked)}
                      />
                      Subtitles
                    </label>

                    {subtitlesEnabled && (
                      <input
                        value={subtitlesLanguage}
                        onChange={(e) => setSubtitlesLanguage(e.target.value)}
                        className="w-12 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                        placeholder="en"
                      />
                    )}

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={sponsorBlockEnabled}
                        onChange={(e) => setSponsorBlockEnabled(e.target.checked)}
                      />
                      SponsorBlock
                    </label>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={isSubmitting || previewLoading || !downlink.isTauri || extractedUrls.length === 0}
                  onClick={handleAddToQueue}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isSubmitting
                    ? "Adding…"
                    : previewLoading
                      ? "Loading…"
                      : previewData?.is_playlist
                        ? `Download Playlist (${previewData.playlist_count_hint ?? "?"} items)`
                        : hasMultipleUrls
                          ? `Download ${extractedUrls.length} Items`
                          : "Download"}
                </button>

                <div className="flex-1" />

                <button
                  type="button"
                  onClick={handleOpenAdvanced}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  title="Advanced options"
                >
                  Advanced…
                </button>
              </div>
            </div>
          </div>

          {/* Queue / History */}
          <div className="md:col-span-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-950">
                  <button
                    type="button"
                    onClick={() => setTab("queue")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "queue"
                      ? "bg-white shadow-sm dark:bg-zinc-900"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                      }`}
                  >
                    Queue ({displayQueue.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("history")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "history"
                      ? "bg-white shadow-sm dark:bg-zinc-900"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                      }`}
                  >
                    History ({displayHistory.length})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {tab === "queue" && displayQueue.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        onClick={() => downlink.startAllDownloads()}
                      >
                        Start all
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        onClick={() => downlink.clearQueue()}
                      >
                        Clear
                      </button>
                    </>
                  )}
                  {tab === "history" && displayHistory.length > 0 && (
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      onClick={() => downlink.clearHistory()}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 max-h-[500px] overflow-y-auto">
                {tab === "queue" ? (
                  <ul className="flex flex-col gap-2">
                    {displayQueue.length === 0 ? (
                      <li className="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                        <div className="mb-2">Queue is empty</div>
                        <div className="text-xs">
                          Paste a link above to get started
                        </div>
                      </li>
                    ) : (
                      displayQueue.map((item) => (
                        <QueueItemComponent
                          key={item.id}
                          item={item}
                          onStart={downlink.startDownload}
                          onStop={downlink.stopDownload}
                          onCancel={downlink.cancelDownload}
                          onRetry={downlink.retryDownload}
                          onRemove={downlink.removeDownload}
                          onOpenFile={downlink.openFile}
                          onOpenFolder={downlink.openFolder}
                        />
                      ))
                    )}
                  </ul>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {displayHistory.length === 0 ? (
                      <li className="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                        <div className="mb-2">No history yet</div>
                        <div className="text-xs">
                          Completed downloads will appear here
                        </div>
                      </li>
                    ) : (
                      displayHistory.map((item) => (
                        <QueueItemComponent
                          key={item.id}
                          item={item}
                          onOpenFile={downlink.openFile}
                          onOpenFolder={downlink.openFolder}
                        />
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="pb-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Downlink v{downlink.appVersion ?? "0.1.0"} · Powered by yt-dlp
          {downlink.ytDlpVersion && ` ${downlink.ytDlpVersion}`}
        </footer>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={handleCloseSettings}
        settings={settings}
        onSave={handleSaveSettings}
      />

      {/* Advanced Options Modal */}
      <AdvancedOptions
        isOpen={advancedOpen}
        onClose={handleCloseAdvanced}
        options={advancedOptions}
        onOptionsChange={setAdvancedOptions}
        onApply={handleApplyAdvanced}
      />
    </div>
  );
}
