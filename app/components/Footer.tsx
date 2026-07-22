"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";

interface FooterProps {
  appVersion?: string;
  ytDlpVersion?: string | null;
  ffmpegVersion?: string | null;
  onOpenSettings?: (tab: string) => void;
  hasToolUpdate?: boolean;
}

export function Footer({
  appVersion,
  ytDlpVersion,
  ffmpegVersion,
  onOpenSettings,
  hasToolUpdate = false,
}: FooterProps) {
  const handleToolClick = () => onOpenSettings?.("updates");

  return (
    <div className="flex items-center justify-between bg-transparent px-4 py-2 pb-3">
      {/* Left: branding */}
      <div className="flex items-center gap-1.5">
        <Image
          src="/downlink-square.png"
          alt="Downlink"
          width={14}
          height={14}
          className="rounded opacity-50"
        />
        <span className="text-[11px] text-zinc-600">
          Downlink{appVersion ? ` v${appVersion}` : ""}
        </span>
      </div>

      {/* Right: tool versions — clickable, opens Settings > Updates */}
      <div className="flex items-center gap-2.5">
        {(ytDlpVersion || ffmpegVersion) ? (
          <button
            type="button"
            onClick={handleToolClick}
            title="Open Settings → Updates"
            className="group flex items-center gap-2 rounded transition-colors hover:text-zinc-400"
          >
            {/* Update dot */}
            {hasToolUpdate && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}

            {ytDlpVersion && (
              <span className="text-[11px] text-zinc-600 group-hover:text-zinc-400 transition-colors">
                yt-dlp {ytDlpVersion}
              </span>
            )}
            {ffmpegVersion && (
              <>
                <span className="text-zinc-800">·</span>
                <span className="text-[11px] text-zinc-600 group-hover:text-zinc-400 transition-colors">
                  ffmpeg {ffmpegVersion}
                </span>
              </>
            )}
            <ExternalLink className="h-2.5 w-2.5 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ) : (
          <span className="text-[11px] text-zinc-700">Powered by yt-dlp</span>
        )}
      </div>
    </div>
  );
}
