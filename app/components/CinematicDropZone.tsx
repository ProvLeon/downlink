"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { CloudDownload } from "lucide-react";

export function CinematicDropZone() {
  const containerRef = useRef<HTMLDivElement>(null);
  const ring1Ref = useRef<HTMLDivElement>(null);
  const ring2Ref = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Initial entrance animation
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, scale: 0.9 },
      { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.5)" }
    );

    // Continuous magnetic pulsing for the outer rings
    gsap.to(ring1Ref.current, {
      scale: 1.5,
      opacity: 0,
      duration: 2,
      repeat: -1,
      ease: "power2.out",
    });

    gsap.to(ring2Ref.current, {
      scale: 1.2,
      opacity: 0,
      duration: 2,
      delay: 0.5,
      repeat: -1,
      ease: "power2.out",
    });

    // Gentle floating for the icon
    gsap.to(iconRef.current, {
      y: -10,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });

  }, []);

  return (
    <div 
      ref={containerRef}
      className="flex flex-col items-center justify-center text-center pointer-events-none"
    >
      <div className="relative mb-8 flex h-32 w-32 items-center justify-center">
        {/* Animated Rings */}
        <div 
          ref={ring1Ref}
          className="absolute inset-0 rounded-full border-2 border-cyan-500/30"
        />
        <div 
          ref={ring2Ref}
          className="absolute inset-0 rounded-full border-2 border-blue-500/50"
        />
        
        {/* Core Drop Target */}
        <div 
          ref={iconRef}
          className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.5)]"
        >
          <div className="absolute inset-0 rounded-full bg-black/20 mix-blend-overlay" />
          <CloudDownload className="h-10 w-10 text-white" />
        </div>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
        Drop URL Here
      </h2>
      <p className="mt-2 text-sm font-medium text-cyan-200/80">
        Release to add to queue
      </p>
    </div>
  );
}
