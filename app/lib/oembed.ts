/**
 * oEmbed Fast-Path Preview
 * ────────────────────────────────────────────────────────────
 * For well-known sites (YouTube, Vimeo, SoundCloud, Twitter, TikTok, Dailymotion)
 * we can get title + thumbnail directly from their native oEmbed API — a plain
 * HTTP GET that resolves in < 500 ms, with no yt-dlp subprocess spawn at all.
 *
 * Falls back gracefully (returns null) for any site that isn't covered or whose
 * oEmbed request fails, so callers can then hit the backend yt-dlp path.
 */

import type { FetchMetadataResult } from "../types";
import { invoke } from "@tauri-apps/api/core";

// ─── Provider registry ──────────────────────────────────────────────────────

interface OEmbedProvider {
  /** Returns the oEmbed endpoint URL, or null if the URL doesn't belong to this provider. */
  endpoint(url: string): string | null;
}

const PROVIDERS: OEmbedProvider[] = [
  // YouTube ─────────────────────────────────────────────────
  {
    endpoint(url) {
      if (
        /youtube\.com\/(watch|shorts|live|playlist)/i.test(url) ||
        /youtu\.be\//i.test(url)
      ) {
        return `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      }
      return null;
    },
  },

  // Vimeo ───────────────────────────────────────────────────
  {
    endpoint(url) {
      if (/vimeo\.com\//i.test(url)) {
        return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
      }
      return null;
    },
  },

  // SoundCloud ──────────────────────────────────────────────
  {
    endpoint(url) {
      if (/soundcloud\.com\//i.test(url)) {
        return `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      }
      return null;
    },
  },

  // Twitter / X ─────────────────────────────────────────────
  {
    endpoint(url) {
      if (/(?:twitter|x)\.com\//i.test(url)) {
        return `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
      }
      return null;
    },
  },

  // TikTok ──────────────────────────────────────────────────
  {
    endpoint(url) {
      if (/tiktok\.com\//i.test(url)) {
        return `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
      }
      return null;
    },
  },

  // Dailymotion ─────────────────────────────────────────────
  {
    endpoint(url) {
      if (/dailymotion\.com\//i.test(url)) {
        return `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(url)}&format=json`;
      }
      return null;
    },
  },

  // Instagram ───────────────────────────────────────────────
  {
    endpoint(url) {
      if (/instagram\.com\//i.test(url)) {
        return `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&format=json`;
      }
      return null;
    },
  },
];

// ─── Core fetch logic ───────────────────────────────────────────────────────

interface RawOEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  duration?: number; // Vimeo includes this
  type?: string;
}

/**
 * Attempts to get preview metadata from the site's native oEmbed API.
 *
 * Returns a partial `FetchMetadataResult` (with null fields for data we
 * don't get from oEmbed) on success, or `null` on any failure so the caller
 * can fall back to the yt-dlp backend path.
 *
 * Timeout: 5 seconds — oEmbed should be instant; if it isn't, skip it.
 */
export async function tryOEmbedPreview(
  url: string
): Promise<FetchMetadataResult | null> {
  // Find the first matching provider
  let endpointUrl: string | null = null;
  for (const provider of PROVIDERS) {
    endpointUrl = provider.endpoint(url);
    if (endpointUrl) break;
  }
  if (!endpointUrl) return null; // Not a supported site

  try {
    const data: RawOEmbed | null = await invoke("proxy_oembed_request", { endpointUrl });

    if (!data || !data.title) return null;

    const is_playlist = url.includes("list=") || url.includes("/playlist");

    return {
      id: "00000000-0000-0000-0000-000000000000", // placeholder, same as UUID::nil()
      url,
      is_playlist,
      title: data.title ?? null,
      uploader: data.author_name ?? null,
      duration_seconds: data.duration ?? null,
      thumbnail_url: data.thumbnail_url ?? null,
      filesize_bytes: null, // not available from oEmbed
      playlist_title: null,
      playlist_count_hint: null,
      available_qualities: [], // populated later by background yt-dlp fetch
    };
  } catch {
    // AbortError (timeout), CORS block, network error — all fall through to yt-dlp
    return null;
  }
}

/** Returns true if the URL belongs to a site with a known oEmbed provider. */
export function hasOEmbedProvider(url: string): boolean {
  return PROVIDERS.some((p) => p.endpoint(url) !== null);
}
