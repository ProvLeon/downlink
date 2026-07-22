"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
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
import { UpdateModal } from "./components/UpdateModal";
import { TrimModal } from "./components/TrimModal";
import { BlackHoleOverlay } from "./components/BlackHoleOverlay";
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
  fetchHint?: string;
}

export default function Home() {
  const downlink = useDownlink();

  // App ready state
  const [appReady, setAppReady] = useState(true);

  // Form state
  const [urlInput, setUrlInput] = useState("");
  const [destination, setDestination] = useState("");
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [sponsorBlockEnabled, setSponsorBlockEnabled] = useState(false);
  // Trim state
  const [trimEnabled, setTrimEnabled] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isTrimModalOpen, setIsTrimModalOpen] = useState(false);
  // Metadata embed state
  const [embedMetaEnabled, setEmbedMetaEnabled] = useState(false);

  // UI state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
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

  // Multi-package orbit state
  const [orbitingUrls, setOrbitingUrls] = useState<
    { id: string; url: string; startX: number; startY: number }[]
  >([]);
  // Counter-based drag tracking so dragging over child elements doesn't flicker isDragging off
  const dragCounterRef = useRef(0);

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
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

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
  const deferredUrlInput = useDeferredValue(urlInput);
  
  const { extractedUrls, rangeGroups } = useMemo(() => {
    if (!deferredUrlInput.trim()) {
      return { extractedUrls: [] as string[], rangeGroups: [] as { pattern: string; urls: string[] }[] };
    }

    const normalized = normalizeBareUrls(deferredUrlInput);
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
  }, [deferredUrlInput]);

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

  // Duration from preview (seconds) — drives trim slider range
  const previewDuration = previewData?.duration_seconds ?? 0;

  // Reset trim range when preview duration becomes known or URL changes
  useEffect(() => {
    if (previewDuration > 0) {
      setTrimStart(0);
      setTrimEnd(previewDuration);
    }
  }, [previewDuration]);

  // Auto-open update modal when download finishes
  useEffect(() => {
    if (downlink.updateAvailable.readyToInstall) {
      setIsUpdateModalOpen(true);
    }
  }, [downlink.updateAvailable.readyToInstall]);



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
            let text = "";
            if (downlink.isTauri) {
              const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
              text = await readText() || "";
            } else {
              text = await navigator.clipboard.readText();
            }
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

  // Keep a stable ref to urlInput so the focus handler always sees the latest value
  // without being re-registered on every keystroke.
  const urlInputRef = useRef(urlInput);
  useEffect(() => { urlInputRef.current = urlInput; }, [urlInput]);
  const orbitingUrlsRef = useRef(orbitingUrls);
  useEffect(() => { orbitingUrlsRef.current = orbitingUrls; }, [orbitingUrls]);

  // Detect URL in clipboard when window regains focus — uses Tauri's native focus
  // event API (more reliable than browser window.focus in a webview).
  useEffect(() => {
    if (!downlink.isTauri) return;

    let tauriUnlisten: (() => void) | null = null;

    const checkClipboard = async () => {
      try {
        const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
        const text = await readText();
        if (!text) return;
        const matches = text.match(/https?:\/\/[^\s]+/g);
        if (!matches) return;
        
        const newUrls = matches
          .map(m => m.replace(/[,;.]+$/, ""))
          .filter(url => 
            !urlInputRef.current.includes(url) && 
            !dismissedClipboardUrls.current.has(url) &&
            !orbitingUrlsRef.current.some(p => p.url === url)
          );
          
        if (newUrls.length === 0) return;
        
        // Remove duplicates within the new array itself
        const uniqueNewUrls = Array.from(new Set(newUrls));
        setClipboardUrl(uniqueNewUrls.join("\n"));
      } catch {
        /* clipboard permission denied — silent */
      }
    };

    const setup = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();

        // Tauri's native OS-level focus event — fires when the user clicks into the app
        const unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
          if (focused) {
            // Small delay so the OS clipboard is fully updated before we read it
            setTimeout(checkClipboard, 300);
          }
        });
        tauriUnlisten = unlisten;
      } catch {
        // Silent fallback
      }
      
      // Also attach to standard DOM events as a reliable fallback for webviews
      const handleFocus = () => setTimeout(checkClipboard, 300);
      const handleVisibility = () => {
        if (document.visibilityState === "visible") setTimeout(checkClipboard, 300);
      };
      const handleMouseEnter = () => setTimeout(checkClipboard, 100);
      
      window.addEventListener("focus", handleFocus);
      document.addEventListener("visibilitychange", handleVisibility);
      document.body.addEventListener("mouseenter", handleMouseEnter);
      
      // Override tauriUnlisten to also clean up DOM events
      const originalUnlisten = tauriUnlisten;
      tauriUnlisten = () => {
        originalUnlisten?.();
        window.removeEventListener("focus", handleFocus);
        document.removeEventListener("visibilitychange", handleVisibility);
        document.body.removeEventListener("mouseenter", handleMouseEnter);
      };
    };

    setup();

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = target.closest('button, input, textarea, a, select, [role="button"], [role="menuitem"], [role="dialog"], [role="switch"]');
      if (!isInteractive && inputRef.current) {
        inputRef.current.focus();
      }
    };

    window.addEventListener("click", handleGlobalClick);
    return () => {
      tauriUnlisten?.();
      window.removeEventListener("click", handleGlobalClick);
    };
  }, [downlink.isTauri]); // stable — urlInput accessed via ref

  // Native document-level drag listeners (React synthetic events are unreliable
  // for external-application drags in Tauri webviews).
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDragging(true);
    };

    const onDragOver = (e: DragEvent) => {
      // Must preventDefault to allow drop
      e.preventDefault();
    };

    const onDragLeave = (e: DragEvent) => {
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const text =
        e.dataTransfer?.getData("text/plain") ||
        e.dataTransfer?.getData("text/uri-list") ||
        "";
      if (text.includes("http")) {
        // Split and add to orbiting state
        const urls = text.split(/\r?\n/).filter(line => line.trim().includes("http"));
        const newPackages = urls.map((url) => ({
          id: Math.random().toString(36).substring(2, 9),
          url: url.trim(),
          startX: e.clientX,
          startY: e.clientY,
        }));
        setOrbitingUrls((prev) => [...prev, ...newPackages]);
      }
    };

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);

    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, []); // stable — no deps needed

  // Stable refs so effect deps don't change every render
  const fetchMetadataRef = useRef(downlink.fetchMetadata);
  const fastFetchMetadataRef = useRef(downlink.fastFetchMetadata);
  useEffect(() => {
    fetchMetadataRef.current = downlink.fetchMetadata;
    fastFetchMetadataRef.current = downlink.fastFetchMetadata;
  });

  // Listen for real-time tier progress hints from the backend and update the
  // matching skeleton card so users see "Scanning page…" / "Deep scanning…" etc.
  useEffect(() => {
    if (!downlink.isTauri) return;
    const handler = (e: Event) => {
      const { url, hint } = (e as CustomEvent<{ url: string; hint: string }>).detail;
      setUrlPreviews((prev) => {
        if (!prev.has(url)) return prev;
        const updated = new Map(prev);
        const item = prev.get(url)!;
        // Only update while still loading — don't stomp a resolved card
        if (item.loading) updated.set(url, { ...item, fetchHint: hint });
        return updated;
      });
    };
    window.addEventListener("downlink:fetchProgress", handler);
    return () => window.removeEventListener("downlink:fetchProgress", handler);
  }, [downlink.isTauri]);

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
      let text = "";
      if (downlink.isTauri) {
        const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
        text = await readText() || "";
      } else {
        text = await navigator.clipboard.readText();
      }
      setUrlInput(text);
      inputRef.current?.focus();
    } catch {
      inputRef.current?.focus();
    }
  }, [downlink.isTauri]);

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
    setIsAnimatingOut(true);

    // Total animation = morph (0.3s) + drop (0.25s) + arc (0.5s) = 1.05s
    // Stagger adds 0.1s per additional item. We add 50ms buffer.
    const staggerMs = Math.max(0, extractedUrls.length - 1) * 100;
    const animationMs = 1100 + staggerMs;

    // Wait for the exit animation to finish before adding to backend
    await new Promise((resolve) => setTimeout(resolve, animationMs));

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
          // Encode trim and meta flags into preset suffix (avoids DB schema change)
          let effectivePreset = groupPreset;
          if (trimEnabled && previewDuration > 0 && !previewData?.is_playlist) {
            effectivePreset += `+trim:${trimStart.toFixed(1)}-${trimEnd.toFixed(1)}`;
          }
          if (embedMetaEnabled) {
            effectivePreset += "+meta";
          }
          const result = await downlink.addUrls(groupUrls.join("\n"), {
            preset_id: effectivePreset,
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

      // Clear state immediately now that backend call is complete
      setUrlInput("");
      setUrlPreviews(new Map());
      fetchedUrlsRef.current.clear();
      qualitiesFetchingRef.current.clear();
      setSelectedQualityPerUrl(new Map());
      setIsAnimatingOut(false);
      setIsSubmitting(false);

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
    setIsAnimatingOut(true);
    const { url, metadata } = playlistDialogData;

    // Wait for the exit animation to finish before adding to backend
    // Playlists only have 1 preview card, so no stagger delay is needed.
    await new Promise((resolve) => setTimeout(resolve, 1100));

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
      fetchedUrlsRef.current.clear();
      qualitiesFetchingRef.current.clear();
      setSelectedQualityPerUrl(new Map());
    } catch (e) {
      console.error("Failed to handle playlist:", e);
    } finally {
      setIsSubmitting(false);
      // Wait an extra 200ms to guarantee the modal's GSAP exit animation finishes before unmounting
      setTimeout(() => {
        setIsAnimatingOut(false);
        setPlaylistDialogOpen(false);
        setPlaylistDialogData(null);
        setPlaylistVideos([]);
      }, 200);
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



  return (
    <div
      className="relative flex h-screen flex-col bg-transparent text-white"
    >
      {/* BlackHole Drop Zone Overlay */}
      {(isDragging || clipboardUrl || orbitingUrls.length > 0) && (
        <BlackHoleOverlay
          mode={isDragging ? "drag" : "clipboard"}
          clipboardUrl={clipboardUrl}
          orbitingUrls={orbitingUrls}
          onDropPackage={(x, y, urls) => {
            const newPackages = urls.map((url) => ({
              id: Math.random().toString(36).substring(2, 9),
              url,
              startX: x + (Math.random() * 40 - 20), // slight offset if multiple
              startY: y + (Math.random() * 40 - 20),
            }));
            setOrbitingUrls((prev) => [...prev, ...newPackages]);
            setClipboardUrl(null);
            import("@tauri-apps/plugin-clipboard-manager").then(m => m.writeText("")).catch(() => {});
          }}
          onAbsorb={(url) => {
            if (url) {
              setUrlInput((prev) => {
                if (!prev) return url;
                if (prev.includes(url)) return prev;
                return prev.trim() + "\n" + url;
              });
              dismissedClipboardUrls.current.add(url);
              setOrbitingUrls((prev) => prev.filter((p) => p.url !== url));
              
              if (clipboardUrl === url || clipboardUrl?.includes(url)) {
                setClipboardUrl(null);
                import("@tauri-apps/plugin-clipboard-manager").then(m => m.writeText("")).catch(() => {});
              }
            }
            inputRef.current?.focus();
          }}
          onDismiss={() => {
            setClipboardUrl(null);
          }}
        />
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
        updateState={downlink.updateAvailable}
        onUpdateClick={() => setIsUpdateModalOpen(true)}
      />

      {/* Main content area */}
      <div className={`flex flex-1 ${isAnimatingOut ? "overflow-visible" : "overflow-hidden"}`}>
        {/* Left side - Preview or Empty state */}
        <div className="flex-1 flex flex-col border-r border-zinc-800">
          {/* Preview area — scrollable so multi-URL list can grow */}
          <div className={`flex-1 ${isAnimatingOut ? "overflow-visible" : "overflow-y-auto"}`}>
            <div className="flex min-h-full items-center justify-center p-6">
              <PreviewPanel
                previewData={previewData}
                previewLoading={previewLoading}
                previewError={previewError}
                isDragging={isDragging}
                isExiting={isAnimatingOut}
                onClearPreview={handleClearPreview}
                allPreviews={allPreviews}
                rangeGroups={rangeGroups}
                selectedQualitiesMap={selectedQualityPerUrl}
                trimEnabled={trimEnabled}
                trimStart={trimStart}
                trimEnd={trimEnd}
                onTrimChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }}
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
          <div id="action-bar-container">
            <ActionBar
              presetId={presetId}
              onPresetChange={setPresetId}
              presets={PRESETS}
              subtitlesEnabled={subtitlesEnabled}
              onSubtitlesToggle={() => setSubtitlesEnabled(!subtitlesEnabled)}
              sponsorBlockEnabled={sponsorBlockEnabled}
              onSponsorBlockToggle={() => setSponsorBlockEnabled(!sponsorBlockEnabled)}
              trimEnabled={trimEnabled}
              onTrimToggle={() => trimEnabled ? setTrimEnabled(false) : setIsTrimModalOpen(true)}
              trimStart={trimStart}
              trimEnd={trimEnd}
              onTrimChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }}
              duration={previewDuration}
              embedMetaEnabled={embedMetaEnabled}
              onEmbedMetaToggle={() => setEmbedMetaEnabled(!embedMetaEnabled)}
              onDownload={handleDownload}
              isSubmitting={isSubmitting}
              isPlaylist={previewData?.is_playlist ?? false}
              disabled={!urlInput.trim()}
              previewLoading={previewLoading}
            />
          </div>
        </div>

        {/* Right side - Download queue */}
        <ResizableDivider
          width={queueWidth}
          onWidthChange={handleQueueWidthChange}
          minWidth={260}
          maxWidth={480}
        />
        <div id="download-queue-container" style={{ width: queueWidth, minWidth: queueWidth, maxWidth: queueWidth }} className="flex-shrink-0">
        <DownloadQueue
          queue={downlink.queue}
          history={downlink.history}
          onStop={downlink.stopDownload}
          onCancel={downlink.cancelDownload}
          onRemove={downlink.removeDownload}
          onRetry={downlink.retryDownload}
          onOpen={downlink.openFile}
          onOpenFolder={downlink.openFolder}
          onClearQueue={downlink.clearQueue}
          onClearHistory={downlink.clearHistory}
          onTranscribe={downlink.transcribeFile}
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

      {/* Update Modal */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        updateState={downlink.updateAvailable}
        installAppUpdate={downlink.installAppUpdate}
        restartApp={downlink.restartApp}
      />

      {/* Trim Modal */}
      <TrimModal
        isOpen={isTrimModalOpen}
        onClose={() => setIsTrimModalOpen(false)}
        previewUrl={allPreviews[0]?.url || previewData?.url || ""}
        streamUrl={previewData?.stream_url || previewData?.url || ""}
        thumbnailUrl={previewData?.thumbnail_url ?? undefined}
        duration={previewDuration}
        initialStart={trimStart}
        initialEnd={trimEnd}
        onSave={(start, end) => {
          setTrimStart(start);
          setTrimEnd(end);
          setTrimEnabled(true);
        }}
      />

      {/* Playlist Dialog */}
      {playlistDialogData && (
        <PlaylistDialog
          isOpen={playlistDialogOpen}
          isExiting={isAnimatingOut}
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
