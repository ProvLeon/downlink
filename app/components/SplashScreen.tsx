"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface SplashScreenProps {
  onComplete: () => void;
  minimumDuration?: number;
}

export function SplashScreen({ onComplete, minimumDuration = 2000 }: SplashScreenProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setIsFadingOut(true), minimumDuration - 400);
    const doneTimer = setTimeout(() => { setGone(true); onComplete(); }, minimumDuration);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [minimumDuration, onComplete]);

  if (gone) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 transition-opacity duration-400 ${
        isFadingOut ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* ── Logo cluster ──────────────────────────────────── */}
      <div className="relative flex items-center justify-center">

        {/* Ambient glow blob */}
        <div className="absolute h-48 w-48 rounded-full bg-gradient-to-br from-blue-600/30 via-cyan-500/20 to-transparent blur-3xl" />

        {/* Slow-spinning gradient arc */}
        <div className="absolute animate-spin-slow">
          <svg className="h-44 w-44" viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            <circle
              cx="50" cy="50" r="46"
              stroke="url(#ring-grad)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="90 200"
              opacity="0.6"
            />
          </svg>
        </div>

        {/* Logo: scale overshoot entrance */}
        <div className="relative animate-logo-entrance">
          <Image
            src="/downlink-square.png"
            alt="Downlink"
            width={112}
            height={112}
            className="drop-shadow-2xl"
            priority
          />
        </div>

        {/* Animated download arrow — "pull-down" loop beneath logo */}
        <div className="absolute -bottom-8 flex flex-col items-center gap-0.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-arrow-pull-down"
              style={{ animationDelay: `${i * 220}ms` }}
            >
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                <path
                  d="M1 1L6 6L11 1"
                  stroke="url(#chevron-grad)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <defs>
                  <linearGradient id="chevron-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* ── App name ──────────────────────────────────────── */}
      <h1 className="mt-16 text-2xl font-bold tracking-tight text-white animate-fade-in-up animation-delay-300">
        Downlink
      </h1>

      {/* ── Tagline ───────────────────────────────────────── */}
      <p className="mt-1.5 text-sm text-zinc-500 animate-fade-in-up animation-delay-500">
        Fast &amp; Beautiful Video Downloader
      </p>

      {/* ── Loading dots ──────────────────────────────────── */}
      <div className="mt-8 flex items-center gap-1.5 animate-fade-in-up animation-delay-500">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>

      {/* ── Version slot ──────────────────────────────────── */}
      <p className="absolute bottom-6 text-[11px] text-zinc-700 animate-fade-in-up animation-delay-500">
        Starting up…
      </p>
    </div>
  );
}
