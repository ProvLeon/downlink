"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDownlink } from "./hooks/useDownlink";
import { SettingsModal } from "./components/SettingsModal";
import { PlaylistDialog } from "./components/PlaylistDialog";
import { SplashScreen } from "./components/SplashScreen";
import { HeaderBar } from "./components/HeaderBar";
import { PreviewPanel } from "./components/PreviewPanel";
import { ActionBar } from "./components/ActionBar";
import { DownloadQueue } from "./components/DownloadQueue";
import { Footer } from "./components/Footer";
import { ResizableDivider } from "./components/ResizableDivider";
import { ClipboardBanner } from "./components/ClipboardBanner";
import { toast } from "./components/Toast";
import { PRESETS, DEFAULT_PRESET_ID } from "./constants";
import type { UserSettings, FetchMetadataResult, UrlPreviewItem, VideoQualityOption } from "./types";
import { normalizeBareUrls, expandUrlPattern } from "./types";
import { tryOEmbedPreview, hasOEmbedProvider } from "./lib/oembed";

// Preview data for URLs
interface UrlPreview {
  url: string;
  loading: boolean;
  data: FetchMetadataResult | null;
  error: string | null;
  presetId: string;
}

export default function Home() {
  const downlink = useDownlink();

  // Splash screen state
  const [showSplash, setShowSplash] = useState(true);
  const [appReady, setAppReady] = useState(false);

  // Form state
  const [urlInput, setUrlInput] = useState("");
  const [destination, setDestination] = useState("");
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [sponsorBlockEnabled, setSponsorBlockEnabled] = useState(false);

  // UI state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Queue panel width — persisted in localStorage
  const [queueWidth, setQueueWidth] = useState(() => {
    if (typeof window === "undefined") return 300;
    return parseInt(localStorage.getItem("downlink:queue-width") ?? "300", 10);
  });

  // Clipboard URL banner — detected on window focus, dismissed per URL
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const dismissedClipboardUrls = useRef<Set<string>>(new Set());

  const handleQueueWidthChange = useCallback((w: number) => {
    setQueueWidth(w);
    localStorage.setItem("downlink:queue-width", String(w));
  }, []);

  const openSettings = useCallback((tab?: string) => {
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
  }, []);

  // Playlist dialog state
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [playlistDialogData, setPlaylistDialogData] = useState<{
    url: string;
    metadata: FetchMetadataResult;
  } | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<Array<{
    id: string;
    url: string;
    title: string;
    thumbnail_url?: string;
    duration_seconds?: number;
    uploader?: string;
  }>>([]);
  const [isLoadingPlaylistVideos, setIsLoadingPlaylistVideos] = useState(false);

  // Preview state
  const [urlPreviews, setUrlPreviews] = useState<Map<string, UrlPreview>>(new Map());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Tracks which URLs have already been fetched/initiated (avoids re-fetch on re-render)
  const fetchedUrlsRef = useRef<Set<string>>(new Set());
  // Tracks URLs whose quality options are being fetched in background (after oEmbed fast-path)
  const qualitiesFetchingRef = useRef<Set<string>>(new Set());
  // Per-URL selected quality: url → format_string (or "default" to use global preset)
  const [selectedQualityPerUrl, setSelectedQualityPerUrl] = useState<Map<string, string>>(new Map());

  // Extract + expand URLs from input.
  // Range patterns like [23-27] are expanded to individual URLs.
  // rangeGroups tracks which original patterns produced multiple URLs (for the panel batch card).
  const { extractedUrls, rangeGroups } = useMemo(() => {
    if (!urlInput.trim()) {
      return { extractedUrls: [] as string[], rangeGroups: [] as { pattern: string; urls: string[] }[] };
    }

    const normalized = normalizeBareUrls(urlInput);
    const tokens = normalized.match(/https?:\/\/[^\s]+/g) ?? [];
    const seen = new Set<string>();
    const urls: string[] = [];
    const ranges: { pattern: string; urls: string[] }[] = [];

    for (const token of tokens) {
      const trimmed = token.trim();
      const expanded = expandUrlPattern(trimmed);

      if (expanded.length > 1) {
        // Range pattern — track as a group, add expanded URLs to the flat list
        const unique = expanded.filter((u) => !seen.has(u));
        unique.forEach((u) => { seen.add(u); urls.push(u); });
        if (unique.length > 0) ranges.push({ pattern: trimmed, urls: unique });
      } else {
        if (!seen.has(trimmed)) { seen.add(trimmed); urls.push(trimmed); }
      }
    }

    return { extractedUrls: urls, rangeGroups: ranges };
  }, [urlInput]);

  // Flat set of all range-expanded URLs — these are NOT previewed individually
  const rangeExpandedSet = useMemo(
    () => new Set(rangeGroups.flatMap((g) => g.urls)),
    [rangeGroups]
  );

  // Per-URL preview items for the panel — only for non-range URLs
  const allPreviews = useMemo((): UrlPreviewItem[] => {
    return extractedUrls
      .filter((url) => !rangeExpandedSet.has(url))
      .map((url) => {
        const p = urlPreviews.get(url);
        return p
          ? {
            url: p.url,
            loading: p.loading,
            data: p.data,
            error: p.error,
            qualitiesLoading: qualitiesFetchingRef.current.has(url),
          }
          : { url, loading: false, data: null, error: null, qualitiesLoading: false };
      });
  }, [extractedUrls, urlPreviews, rangeExpandedSet]);

  // Convenience values for single-URL consumers (playlist dialog, download handler)
  // Only valid when there's exactly 1 URL and no range groups
  const previewData =
    allPreviews.length === 1 && rangeGroups.length === 0 ? allPreviews[0].data : null;
  const previewError =
    allPreviews.length === 1 && rangeGroups.length === 0 ? allPreviews[0].error : null;
  // Spinner shows while ANY non-range URL is still loading
  const previewLoading = allPreviews.some((p) => p.loading);

  // Handle splash screen completion
  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  // Load settings on mount
  useEffect(() => {
    if (!downlink.isTauri) {
      setAppReady(true);
      return;
    }
    (async () => {
      try {
        const s = await downlink.getSettings();
        setSettings(s);
        setDestination(s.general.download_folder);
        setPresetId(s.general.default_preset);
        setAppReady(true);
      } catch (e) {
        console.error("Failed to load settings:", e);
        setAppReady(true);
      }
    })();
  }, [downlink.isTauri, downlink.getSettings]);

  // Global keyboard shortcut for Cmd+V / Ctrl+V
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          e.preventDefault();
          try {
            const text = await navigator.clipboard.readText();
            if (text && text.includes("http")) {
              setUrlInput(text);
              inputRef.current?.focus();
            }
          } catch {
            // Clipboard access denied
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Detect URL in clipboard when window regains focus (tab visible).
  // Only surfaces the banner if the URL is new and not already in the input.
  useEffect(() => {
    if (!downlink.isTauri) return;
    const handleFocus = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        const urls = text.match(/https?:\/\/[^\s]+/);
        if (!urls) return;
        const detected = urls[0];
        // Skip: already typed, same as current input, or previously dismissed
        if (
          urlInput.includes(detected) ||
          dismissedClipboardUrls.current.has(detected)
        ) return;
        setClipboardUrl(detected);
      } catch { /* permission denied — silent */ }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") handleFocus();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [downlink.isTauri, urlInput]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const text = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text/uri-list");
    if (text && text.includes("http")) {
      setUrlInput(text);
      inputRef.current?.focus();
    }
  }, []);

  // Stable refs so effect deps don't change every render
  const fetchMetadataRef = useRef(downlink.fetchMetadata);
  const fastFetchMetadataRef = useRef(downlink.fastFetchMetadata);
  useEffect(() => {
    fetchMetadataRef.current = downlink.fetchMetadata;
    fastFetchMetadataRef.current = downlink.fastFetchMetadata;
  });

  // Auto-fetch preview for ALL extracted URLs in parallel.
  // Rules:
  //  - Debounce 500 ms so we don't fire while the user is still typing
  //  - Cap at 8 concurrent previews to avoid hammering the backend
  //  - fetchedUrlsRef prevents re-fetching URLs already initiated
  //  - `cancelled` flag drops results that arrive after the input changed
  useEffect(() => {
    if (!downlink.isTauri || extractedUrls.length === 0) return;

    // Only fetch non-range URLs not yet initiated; cap at 6 to avoid backend overload
    const pending = extractedUrls
      .filter((url) => !rangeExpandedSet.has(url) && !fetchedUrlsRef.current.has(url))
      .slice(0, 6);

    if (pending.length === 0) return;

    let cancelled = false;

    const fetchAll = async () => {
      // Mark all pending as loading in one batch
      fetchedUrlsRef.current = new Set([...fetchedUrlsRef.current, ...pending]);
      setUrlPreviews((prev) => {
        const updated = new Map(prev);
        for (const url of pending) {
          updated.set(url, { url, loading: true, data: null, error: null, presetId });
        }
        return updated;
      });

      // ─── Per-URL fetch logic ──────────────────────────────────────────────
      // Three-phase strategy:
      //   Phase 1 — oEmbed (ms, browser fetch):    YouTube/Vimeo/TikTok etc.
      //   Phase 2 — fast_fetch_metadata (~2-3s):   yt-dlp --print, no formats
      //   Phase 3 — fetch_metadata background:      full --dump-json for qualities
      const fetchOneUrl = async (url: string): Promise<void> => {
        if (cancelled) return;
        try {
          // ── Phase 1: oEmbed fast-path ─────────────────────────────────────
          const oembedResult = await tryOEmbedPreview(url);

          if (oembedResult) {
            if (!cancelled) {
              setUrlPreviews((prev) => {
                const updated = new Map(prev);
                updated.set(url, { url, loading: false, data: oembedResult, error: null, presetId });
                return updated;
              });
              qualitiesFetchingRef.current.add(url);
            }
            // Background full fetch for quality options
            fetchMetadataRef.current(url, { preset_id: presetId, output_dir: destination })
              .then((ytResult) => {
                if (!cancelled) {
                  qualitiesFetchingRef.current.delete(url);
                  setUrlPreviews((prev) => {
                    const updated = new Map(prev);
                    const existing = prev.get(url);
                    if (existing?.data) {
                      updated.set(url, {
                        ...existing,
                        data: {
                          ...existing.data,
                          duration_seconds: ytResult.duration_seconds ?? existing.data.duration_seconds,
                          available_qualities: ytResult.available_qualities ?? [],
                        },
                      });
                    }
                    return updated;
                  });
                }
              })
              .catch(() => {
                if (!cancelled) {
                  qualitiesFetchingRef.current.delete(url);
                  setUrlPreviews((prev) => new Map(prev));
                }
              });
            return;
          }

          // ── Phase 2: fast yt-dlp --print (~2-3s, no format enumeration) ───
          // Shows the card almost immediately without waiting for the slow full JSON dump.
          const fastResult = await fastFetchMetadataRef.current(url);

          if (fastResult && !cancelled) {
            setUrlPreviews((prev) => {
              const updated = new Map(prev);
              updated.set(url, { url, loading: false, data: fastResult, error: null, presetId });
              return updated;
            });
            qualitiesFetchingRef.current.add(url);

            // ── Phase 3: background full fetch for quality options ────────────
            fetchMetadataRef.current(url, { preset_id: presetId, output_dir: destination })
              .then((ytResult) => {
                if (!cancelled) {
                  qualitiesFetchingRef.current.delete(url);
                  setUrlPreviews((prev) => {
                    const updated = new Map(prev);
                    const existing = prev.get(url);
                    if (existing?.data) {
                      updated.set(url, {
                        ...existing,
                        data: {
                          ...existing.data,
                          title: ytResult.title ?? existing.data.title,
                          uploader: ytResult.uploader ?? existing.data.uploader,
                          thumbnail_url: ytResult.thumbnail_url ?? existing.data.thumbnail_url,
                          duration_seconds: ytResult.duration_seconds ?? existing.data.duration_seconds,
                          available_qualities: ytResult.available_qualities ?? [],
                        },
                      });
                    }
                    return updated;
                  });
                }
              })
              .catch(() => {
                if (!cancelled) {
                  qualitiesFetchingRef.current.delete(url);
                  setUrlPreviews((prev) => new Map(prev));
                }
              });
            return;
          }

          // ── Fallback: full fetch (fast path returned null — unsupported extractor) ──
          const result = await Promise.race([
            fetchMetadataRef.current(url, { preset_id: presetId, output_dir: destination }),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Preview timed out — the site may be slow or unsupported.")),
                12_000
              )
            ),
          ]);

          if (!cancelled) {
            setUrlPreviews((prev) => {
              const updated = new Map(prev);
              updated.set(url, { url, loading: false, data: result, error: null, presetId });
              return updated;
            });
          }
        } catch (e) {
          if (!cancelled) {
            fetchedUrlsRef.current.delete(url); // allow retry on next input change
            setUrlPreviews((prev) => {
              const updated = new Map(prev);
              updated.set(url, {
                url,
                loading: false,
                data: null,
                error: e instanceof Error ? e.message : "Failed to fetch preview",
                presetId,
              });
              return updated;
            });
          }
        }
      };

      // ─── Smart concurrency: domain-grouped sequential fetching ─────────────
      //
      // WHY: Firing multiple yt-dlp processes at the same site simultaneously
      // triggers rate-limiting / bot-detection, causing most requests to fail.
      //
      // STRATEGY:
      //   • Group URLs by their hostname.
      //   • Within the same domain → fetch sequentially with a gap:
      //       - oEmbed-capable domains: 150 ms gap (instant calls, minimal risk)
      //       - yt-dlp domains        : 700 ms gap (slow subprocess, prevent bans)
      //   • Across different domains  → run domain groups in parallel.
      const domainMap = new Map<string, string[]>();
      for (const url of pending) {
        let domain: string;
        try { domain = new URL(url).hostname; } catch { domain = "unknown"; }
        if (!domainMap.has(domain)) domainMap.set(domain, []);
        domainMap.get(domain)!.push(url);
      }

      await Promise.allSettled(
        [...domainMap.values()].map(async (domainUrls) => {
          for (let i = 0; i < domainUrls.length; i++) {
            if (cancelled) break;
            await fetchOneUrl(domainUrls[i]);
            // Throttle between same-domain requests
            if (i < domainUrls.length - 1 && !cancelled) {
              const gap = hasOEmbedProvider(domainUrls[i]) ? 150 : 700;
              await new Promise<void>((resolve) => setTimeout(resolve, gap));
            }
          }
        })
      );
    };

    const timeout = setTimeout(fetchAll, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // rangeExpandedSet is intentionally omitted from deps — it's derived from extractedUrls
    // and changing it shouldn't re-trigger fetches for already-initiated URLs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downlink.isTauri, extractedUrls, presetId, destination]);

  // Handle paste button
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrlInput(text);
      inputRef.current?.focus();
    } catch {
      inputRef.current?.focus();
    }
  }, []);

  // Handle download
  const handleDownload = useCallback(async () => {
    if (extractedUrls.length === 0 || isSubmitting) return;

    // Single non-range URL that is a playlist → open the playlist dialog
    if (previewData?.is_playlist && allPreviews.length === 1 && rangeGroups.length === 0) {
      setPlaylistDialogData({
        url: allPreviews[0].url,
        metadata: previewData,
      });
      setPlaylistDialogOpen(true);
      return;
    }

    const hasSingleMeta = allPreviews.length === 1 && rangeGroups.length === 0;

    setIsSubmitting(true);
    try {
      if (hasSingleMeta) {
        // Single URL — pass metadata to skip re-fetch, use per-URL quality selection
        const quality = selectedQualityPerUrl.get(allPreviews[0].url);
        const effectivePresetId =
          quality && quality !== "default" ? `custom:${quality}` : presetId;

        const result = await downlink.addUrls(allPreviews[0].url, {
          preset_id: effectivePresetId,
          output_dir: destination,
          parent_id: null,
          source_kind: "single",
          title: previewData?.title ?? null,
          uploader: previewData?.uploader ?? null,
          thumbnail_url: previewData?.thumbnail_url ?? null,
          duration_seconds: previewData?.duration_seconds ?? null,
          subtitles_enabled: subtitlesEnabled,
          sponsorblock_enabled: sponsorBlockEnabled,
        });

        if (settings?.general.auto_start !== false && result.ids.length > 0) {
          await downlink.startAllDownloads();
        }
      } else {
        // Multi-URL — group by selected quality to minimise addUrls calls
        // Range-expanded URLs always use the global preset (no per-URL selection for them)
        const nonRangeUrlSet = new Set(allPreviews.map((p) => p.url));
        const qualityGroups = new Map<string, string[]>(); // presetId → urls[]

        for (const url of extractedUrls) {
          const isNonRange = nonRangeUrlSet.has(url);
          const quality = isNonRange ? selectedQualityPerUrl.get(url) : undefined;
          const groupPreset =
            quality && quality !== "default" ? `custom:${quality}` : presetId;

          if (!qualityGroups.has(groupPreset)) qualityGroups.set(groupPreset, []);
          qualityGroups.get(groupPreset)!.push(url);
        }

        let hasAnyIds = false;
        for (const [groupPreset, groupUrls] of qualityGroups) {
          const result = await downlink.addUrls(groupUrls.join("\n"), {
            preset_id: groupPreset,
            output_dir: destination,
            parent_id: null,
            source_kind: "single",
            title: null,
            uploader: null,
            thumbnail_url: null,
            duration_seconds: null,
            subtitles_enabled: subtitlesEnabled,
            sponsorblock_enabled: sponsorBlockEnabled,
          });
          if (result.ids.length > 0) hasAnyIds = true;
        }

        if (settings?.general.auto_start !== false && hasAnyIds) {
          await downlink.startAllDownloads();
        }
      }

      setUrlInput("");
      setUrlPreviews(new Map());
      fetchedUrlsRef.current.clear();
      qualitiesFetchingRef.current.clear();
      setSelectedQualityPerUrl(new Map());

      // Success toast
      const count = extractedUrls.length;
      toast.success(
        count === 1
          ? "Added to queue"
          : `${count} URLs added to queue`
      );
    } catch (e) {
      console.error("Failed to add download:", e);
      toast.error("Failed to add download — check console for details");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    extractedUrls,
    isSubmitting,
    previewData,
    allPreviews,
    rangeGroups,
    downlink,
    presetId,
    destination,
    settings,
    selectedQualityPerUrl,
  ]);

  // Handle playlist confirm
  const handlePlaylistConfirm = useCallback(async (downloadPlaylist: boolean, selectedVideoIds?: string[]) => {
    if (!playlistDialogData) return;

    setIsSubmitting(true);
    const { url, metadata } = playlistDialogData;

    try {
      if (downloadPlaylist) {
        if (selectedVideoIds && selectedVideoIds.length > 0 && playlistVideos.length > 0) {
          const selectedVideos = playlistVideos.filter((video) =>
            selectedVideoIds.includes(video.id)
          );

          for (const video of selectedVideos) {
            await downlink.addUrls(video.url, {
              preset_id: presetId,
              output_dir: destination,
              parent_id: null,
              source_kind: "single",
              title: video.title ?? null,
              uploader: video.uploader ?? null,
              thumbnail_url: video.thumbnail_url ?? null,
              duration_seconds: video.duration_seconds ?? null,
            });
          }

          if (settings?.general.auto_start !== false) {
            await downlink.startAllDownloads();
          }
        } else {
          await downlink.expandPlaylist(url, {
            preset_id: presetId,
            output_dir: destination,
          });

          if (settings?.general.auto_start !== false) {
            await downlink.startAllDownloads();
          }
        }
      } else {
        await downlink.addUrls(url, {
          preset_id: presetId,
          output_dir: destination,
          parent_id: null,
          source_kind: "single",
          title: metadata.title ?? null,
          uploader: metadata.uploader ?? null,
          thumbnail_url: metadata.thumbnail_url ?? null,
          duration_seconds: metadata.duration_seconds ?? null,
        });

        if (settings?.general.auto_start !== false) {
          await downlink.startAllDownloads();
        }
      }

      setUrlInput("");
      setUrlPreviews(new Map());
    } catch (e) {
      console.error("Failed to handle playlist:", e);
    } finally {
      setIsSubmitting(false);
      setPlaylistDialogOpen(false);
      setPlaylistDialogData(null);
      setPlaylistVideos([]);
    }
  }, [playlistDialogData, playlistVideos, downlink, presetId, destination, settings]);

  // Load playlist videos
  const handleLoadPlaylistVideos = useCallback(async () => {
    if (!playlistDialogData) return;

    setIsLoadingPlaylistVideos(true);
    try {
      const result = await downlink.previewPlaylist(playlistDialogData.url);

      if (result.videos && result.videos.length > 0) {
        const videos = result.videos.map((video) => ({
          id: video.id,
          url: video.url,
          title: video.title ?? "Untitled",
          thumbnail_url: video.thumbnail_url ?? undefined,
          duration_seconds: video.duration_seconds ?? undefined,
          uploader: video.uploader ?? undefined,
        }));
        setPlaylistVideos(videos);
      }
    } catch (e) {
      console.error("Failed to load playlist videos:", e);
    } finally {
      setIsLoadingPlaylistVideos(false);
    }
  }, [playlistDialogData, downlink]);

  // Save settings
  const handleSaveSettings = useCallback(async (newSettings: UserSettings) => {
    try {
      await downlink.saveSettings(newSettings);
      setSettings(newSettings);
      setDestination(newSettings.general.download_folder);
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }, [downlink]);

  // Apply a quality to all non-range URLs at once
  const handleSelectQualityForAll = useCallback((formatString: string) => {
    setSelectedQualityPerUrl((prev) => {
      const updated = new Map(prev);
      for (const preview of allPreviews) {
        if (formatString === "default") {
          updated.delete(preview.url);
        } else {
          updated.set(preview.url, formatString);
        }
      }
      return updated;
    });
  }, [allPreviews]);

  // Clear preview
  const handleClearPreview = useCallback(() => {
    setUrlInput("");
    setUrlPreviews(new Map());
    fetchedUrlsRef.current.clear();
    qualitiesFetchingRef.current.clear();
    setSelectedQualityPerUrl(new Map());
  }, []);

  // Show splash screen while app is loading
  if (showSplash || !appReady) {
    return <SplashScreen onComplete={handleSplashComplete} minimumDuration={2000} />;
  }

  return (
    <div
      className={`flex h-screen flex-col bg-zinc-950 text-white ${isDragging ? "ring-2 ring-inset ring-blue-500" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Clipboard URL banner */}
      {clipboardUrl && (
        <div className="px-3 pt-2">
          <ClipboardBanner
            url={clipboardUrl}
            onAccept={() => {
              setUrlInput(clipboardUrl);
              setClipboardUrl(null);
              dismissedClipboardUrls.current.add(clipboardUrl);
              inputRef.current?.focus();
            }}
            onDismiss={() => {
              dismissedClipboardUrls.current.add(clipboardUrl);
              setClipboardUrl(null);
            }}
          />
        </div>
      )}

      {/* Header bar */}
      <HeaderBar
        urlInput={urlInput}
        onUrlChange={(val) => {
          setUrlInput(val);
          if (!val.trim()) {
            setUrlPreviews(new Map());
            fetchedUrlsRef.current.clear();
            qualitiesFetchingRef.current.clear();
            setSelectedQualityPerUrl(new Map());
          }
        }}
        onPaste={handlePaste}
        onSubmit={handleDownload}
      onSettingsClick={() => openSettings()}
        isLoading={previewLoading}
        inputRef={inputRef}
        urlCount={extractedUrls.length}
      />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left side - Preview or Empty state */}
        <div className="flex-1 flex flex-col border-r border-zinc-800">
          {/* Preview area — scrollable so multi-URL list can grow */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-6">
              <PreviewPanel
                previewData={previewData}
                previewLoading={previewLoading}
                previewError={previewError}
                isDragging={isDragging}
                onClearPreview={handleClearPreview}
                allPreviews={allPreviews}
                rangeGroups={rangeGroups}
                selectedQualitiesMap={selectedQualityPerUrl}
                onSelectQuality={(url, formatString) => {
                  setSelectedQualityPerUrl((prev) => {
                    const updated = new Map(prev);
                    if (formatString === "default") {
                      updated.delete(url);
                    } else {
                      updated.set(url, formatString);
                    }
                    return updated;
                  });
                }}
                onSelectQualityForAll={handleSelectQualityForAll}
              />
            </div>
          </div>

          {/* Action bar — always visible so presets are always accessible */}
          <ActionBar
            presetId={presetId}
            onPresetChange={setPresetId}
            presets={PRESETS}
            subtitlesEnabled={subtitlesEnabled}
            onSubtitlesToggle={() => setSubtitlesEnabled(!subtitlesEnabled)}
            sponsorBlockEnabled={sponsorBlockEnabled}
            onSponsorBlockToggle={() => setSponsorBlockEnabled(!sponsorBlockEnabled)}
            onDownload={handleDownload}
            isSubmitting={isSubmitting}
            isPlaylist={previewData?.is_playlist ?? false}
            disabled={!urlInput.trim()}
            previewLoading={previewLoading}
          />
        </div>

        {/* Right side - Download queue */}
        <ResizableDivider
          width={queueWidth}
          onWidthChange={handleQueueWidthChange}
          minWidth={260}
          maxWidth={480}
        />
        <div style={{ width: queueWidth, minWidth: queueWidth, maxWidth: queueWidth }} className="flex-shrink-0">
        <DownloadQueue
          queue={downlink.queue}
          history={downlink.history}
          showHistory={showHistory}
          onShowHistoryChange={setShowHistory}
          onStop={downlink.stopDownload}
          onCancel={downlink.cancelDownload}
          onRemove={downlink.removeDownload}
          onRetry={downlink.retryDownload}
          onOpen={downlink.openFile}
          onOpenFolder={downlink.openFolder}
          onClearQueue={downlink.clearQueue}
          onClearHistory={downlink.clearHistory}
        />
        </div>
      </div>

      {/* Footer */}
      <Footer
        appVersion={downlink.appVersion ?? undefined}
        ytDlpVersion={downlink.ytDlpVersion}
        ffmpegVersion={downlink.ffmpegVersion}
        onOpenSettings={openSettings}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
        currentVersion={downlink.appVersion}
        checkAppUpdate={downlink.checkAppUpdate}
        installAppUpdate={downlink.installAppUpdate}
        restartApp={downlink.restartApp}
        initialTab={settingsInitialTab as Parameters<typeof SettingsModal>[0]["initialTab"]}
      />

      {/* Playlist Dialog */}
      {playlistDialogData && (
        <PlaylistDialog
          isOpen={playlistDialogOpen}
          onClose={() => {
            setPlaylistDialogOpen(false);
            setPlaylistVideos([]);
          }}
          onConfirm={handlePlaylistConfirm}
          playlistTitle={playlistDialogData.metadata.playlist_title ?? "Playlist"}
          videoTitle={playlistDialogData.metadata.title ?? "Video"}
          videoThumbnail={playlistDialogData.metadata.thumbnail_url ?? undefined}
          playlistCount={playlistDialogData.metadata.playlist_count_hint ?? 0}
          playlistVideos={playlistVideos}
          isLoadingVideos={isLoadingPlaylistVideos}
          onLoadPlaylistVideos={handleLoadPlaylistVideos}
        />
      )}
    </div>
  );
}
