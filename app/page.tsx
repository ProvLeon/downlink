"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDownlink } from "./hooks/useDownlink";
import { QueueItemComponent } from "./components/QueueItem";
import { SettingsModal } from "./components/SettingsModal";
import { AdvancedOptions, DEFAULT_OPTIONS, type AdvancedOptionsState } from "./components/AdvancedOptions";
import type { PresetWithHint, UserSettings, FetchMetadataResult } from "./types";
import Image from "next/image";

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

  // Preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<FetchMetadataResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Derived state
  const selectedPreset = useMemo(
    () => PRESETS.find((p) => p.id === presetId) ?? PRESETS[0],
    [presetId]
  );

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

  // Auto-fetch preview when a single URL is entered
  useEffect(() => {
    if (!downlink.isTauri || extractedUrls.length !== 1) {
      setPreviewData(null);
      setPreviewError(null);
      return;
    }

    const url = extractedUrls[0];
    let cancelled = false;

    const fetchPreview = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewData(null);

      try {
        const result = await downlink.fetchMetadata(url, {
          preset_id: presetId,
          output_dir: destination,
        });
        if (!cancelled) {
          setPreviewData(result);
        }
      } catch (e) {
        if (!cancelled) {
          setPreviewError(e instanceof Error ? e.message : "Failed to fetch preview");
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    };

    const timeout = setTimeout(fetchPreview, 500);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [downlink.isTauri, extractedUrls, presetId, destination]);

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

  const handleAddToQueue = useCallback(async () => {
    if (!downlink.isTauri || extractedUrls.length === 0) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Always use addUrls to insert into the database
      // fetch_metadata no longer creates DB entries - it's just for preview
      const result = await downlink.addUrls(urlInput, {
        preset_id: presetId,
        output_dir: destination,
        parent_id: null,
        source_kind: previewData?.is_playlist ? "playlist_parent" : "single",
        // Pass along preview metadata if available (convert undefined to null explicitly)
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

      // Auto-start if enabled
      if (settings?.general.auto_start !== false && result.ids.length > 0) {
        for (const id of result.ids) {
          await downlink.startDownload(id);
        }
      }

      // Clear input
      setUrlInput("");
      setPreviewData(null);
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
              <div className="flex gap-2">
                <input
                  id="downlink-url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Paste a video/playlist link… (or multiple links)"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700"
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
              {/* Preview area */}
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
                        : hasMultipleUrls
                          ? `${extractedUrls.length} URLs ready to add`
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

              {/* Preset and toggles */}
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
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

                <div className="md:col-span-5">
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
                  disabled={isSubmitting || !downlink.isTauri || extractedUrls.length === 0}
                  onClick={handleAddToQueue}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isSubmitting
                    ? "Adding…"
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
