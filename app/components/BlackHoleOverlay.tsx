"use client";

import { useRef, useState, useEffect } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Package } from "lucide-react";
import { soundManager } from "../lib/SoundManager";
import { useBlackHolePhysics } from "../hooks/useBlackHolePhysics";
import { useGravityCursor } from "../hooks/useGravityCursor";
import { OrbitingPackage } from "./OrbitingPackage";

interface BlackHoleOverlayProps {
  mode: "drag" | "clipboard";
  clipboardUrl?: string | null;
  orbitingUrls?: { id: string; url: string; startX: number; startY: number }[];
  onDropPackage?: (x: number, y: number, urls: string[]) => void;
  onAbsorb?: (url?: string) => void;
  onDismiss?: () => void;
}

export function BlackHoleOverlay({ mode, clipboardUrl, orbitingUrls = [], onDropPackage, onAbsorb, onDismiss }: BlackHoleOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const urlPillRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const absorbedRef = useRef(false);
  const [isActive, setIsActive] = useState(true);

  useBlackHolePhysics(canvasRef, coreRef, isActive, absorbedRef);

  const isDrag = mode === "drag";
  
  // Custom gravity cursor replaces standard pointer in clipboard mode
  useGravityCursor(urlPillRef, coreRef, isActive && !isDrag && !!clipboardUrl, () => {
    // When absorbed by gravity directly
    if (clipboardUrl) handleAbsorb(clipboardUrl);
  });

  // ── Smooth Entrance & Reactivation ──────────────────────────────────────
  useGSAP(() => {
    if (isActive && !absorbedRef.current) {
      soundManager.startPortalIdle();
      
      const tl = gsap.timeline({ overwrite: "auto" });
      
      // Fade in the background overlay
      tl.to(overlayRef.current, { opacity: 1, duration: 0.3, ease: "power2.out" }, 0);
      
      // Expand the core from small/invisible to full size
      tl.to(coreRef.current, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2)" }, 0);
      
      // Fade in the 3D physics canvas
      tl.to(canvasRef.current, { opacity: 1, duration: 0.5, ease: "power2.out" }, 0.1);
    } else if (!isActive && !absorbedRef.current) {
      soundManager.stopPortalIdle();
      
      const tl = gsap.timeline({ overwrite: "auto" });
      
      // Shrink and vanish the core
      tl.to(coreRef.current, { scale: 0.2, opacity: 0, duration: 0.4, ease: "back.in(1.5)" }, 0);
      
      // Fade out the 3D physics canvas
      tl.to(canvasRef.current, { opacity: 0, duration: 0.3, ease: "power2.in" }, 0);
      
      // Keep the overlay background visible slightly longer so the shrink animation is visible
      tl.to(overlayRef.current, { opacity: 0, duration: 0.3, ease: "power2.in" }, 0.2);
    }

    return () => {
      soundManager.stopPortalIdle();
    };
  }, [isActive, mode]);

  // Dedicated hook for the package pill visibility so it fades in when a new link is detected
  useGSAP(() => {
    if (isActive && mode === "clipboard" && clipboardUrl && urlPillRef.current) {
      gsap.to(urlPillRef.current, { opacity: 1, duration: 0.5, delay: 0.1 });
    } else if (urlPillRef.current) {
      gsap.to(urlPillRef.current, { opacity: 0, duration: 0.3 });
    }
  }, [isActive, mode, clipboardUrl]);

  useEffect(() => {
    const handleDeactivate = () => {
      if (orbitingUrls.length === 0) setIsActive(false);
    };
    const handleActivate = () => {
      if (document.visibilityState === "visible") setIsActive(true);
    };

    const handleMouseLeave = (e: MouseEvent) => {
      if (orbitingUrls.length > 0) return;
      // If the mouse leaves the document completely, deactivate
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        setIsActive(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && orbitingUrls.length === 0) setIsActive(false);
      else setIsActive(true);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isActive && !absorbedRef.current) {
        setIsActive(true);
        return;
      }

      if (!isActive || !coreRef.current || absorbedRef.current) return;
      
      const rect = coreRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
      
      const maxDist = window.innerWidth * 0.7; 
      
      let volume = 1.0 - (dist / maxDist);
      if (volume < 0.05) volume = 0.05;
      if (volume > 1.0) volume = 1.0;
      
      soundManager.setPortalVolume(volume);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("blur", handleDeactivate);
    window.addEventListener("focus", handleActivate);
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("blur", handleDeactivate);
      window.removeEventListener("focus", handleActivate);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isActive, orbitingUrls.length]);

  // (Entrance animation is now handled in the isActive useGSAP block)

  // ── Continuous black hole physics ───────────────────────────────────────
  useGSAP(() => {
    // The physics simulation handles most of the movement,
    // but the URL pill still bobs toward core using GSAP.

    // The URL pill bob is removed because useGravityCursor controls its transform.
  }, [mode]);

  // ── Absorb: pill falls into singularity ────────────────────────────────
  const handleAbsorb = (url?: string) => {
    soundManager.playThrow(); // Play the blackhole sound

    // Core "gulp" animation
    if (coreRef.current) {
      gsap.fromTo(coreRef.current, 
        { scale: 1.2 }, 
        { scale: 1, duration: 0.3, ease: "back.out(2)" }
      );
    }
    
    // Hide the tracking pill if this was the clipboardUrl
    if (url === clipboardUrl && urlPillRef.current) {
      gsap.to(urlPillRef.current, { opacity: 0, duration: 0.1 });
    }

    onAbsorb?.(url);
  };

  // ── Click to Drop ────────────────────────────────────────────────────────
  const handleOverlayClick = (e: React.MouseEvent) => {
    // Determine if clicked on the core
    let clickedCore = false;
    if (coreRef.current) {
      const rect = coreRef.current.getBoundingClientRect();
      const dist = Math.hypot(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
      if (dist < 60) {
        clickedCore = true;
      }
    }

    if (clipboardUrl && onDropPackage && !clickedCore) {
      const urls = clipboardUrl.split(/\r?\n/).filter(line => line.trim().includes("http"));
      onDropPackage(e.clientX, e.clientY, urls);
    } else if (clipboardUrl && clickedCore) {
      handleAbsorb(clipboardUrl);
    }
  };

  // ── Dismiss: fade out ──────────────────────────────────────────────────
  const handleDismiss = () => {
    soundManager.stopPortalIdle();
    gsap.to(overlayRef.current, {
      opacity: 0, duration: 0.25, ease: "power2.in",
      onComplete: () => onDismiss?.(),
    });
  };
  return (
    <div
      ref={overlayRef}
      onPointerUp={handleOverlayClick}
      className={`absolute inset-0 z-[9999] flex flex-col items-center justify-center opacity-0 overflow-hidden cursor-default`}
      style={{
        // Start slightly transparent — GSAP animates from 0 to 1
        // We use a high z-index to ensure it sits above everything
        background: isDrag
          ? "radial-gradient(ellipse at center, rgba(4,0,18,0.88) 0%, rgba(2,0,10,0.65) 100%)"
          : "radial-gradient(ellipse at center, rgba(4,0,18,0.94) 0%, rgba(2,0,10,0.80) 100%)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div className="flex flex-col items-center justify-center gap-8 pointer-events-none">

        {/* 3D Particle Canvas Overlay */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 10 }}
        />

        {/* URL pill acts as the physical gravity cursor (clipboard mode only) */}
        {!isDrag && clipboardUrl && (
          <div
            ref={urlPillRef}
            className="absolute top-0 left-0 flex items-center justify-center h-12 w-12 rounded-xl border border-violet-400/60 bg-indigo-900/60 backdrop-blur-md z-[10000] opacity-0 shadow-[0_0_25px_rgba(139,92,246,0.5)] origin-center pointer-events-none"
            style={{ willChange: "transform" }}
          >
            <Package className="h-6 w-6 text-cyan-300" />
          </div>
        )}

        {/* Orbiting Packages */}
        {typeof window !== "undefined" && orbitingUrls.map((pkg) => (
          <OrbitingPackage
            key={pkg.id}
            id={pkg.id}
            url={pkg.url}
            startX={pkg.startX}
            startY={pkg.startY}
            centerX={window.innerWidth / 2}
            centerY={window.innerHeight / 2}
            onAbsorb={(id, url) => handleAbsorb(url)}
          />
        ))}

        {/* Bottom instruction */}
        <div className="relative flex h-48 w-48 items-center justify-center">

          {/* Singularity core — clickable in clipboard mode */}
          <div
            ref={coreRef}
            className="relative z-20 flex h-20 w-20 items-center justify-center rounded-full opacity-0 scale-[0.2]"
            style={{
              background: "radial-gradient(circle, #0a0020 40%, rgba(88,28,220,0.7) 80%, transparent 100%)",
              boxShadow: "0 0 0 2px rgba(139,92,246,0.4), 0 0 35px rgba(139,92,246,0.7), 0 0 70px rgba(59,130,246,0.4), inset 0 0 20px rgba(0,0,0,0.95)",
              cursor: isDrag ? "default" : "pointer",
              pointerEvents: "auto",
            }}
            onClick={!isDrag ? (e) => { e.stopPropagation(); handleAbsorb(); } : undefined}
          >
            <div className="absolute inset-2 rounded-full" style={{ background: "radial-gradient(circle, rgba(80,0,255,0.35) 0%, transparent 70%)" }} />
            <div className="h-4 w-4 rounded-full bg-black ring-2 ring-violet-400/70 shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
          </div>
        </div>

        {/* Label */}
        <div className="text-center">
          {isDrag ? (
            <>
              <p className="text-lg font-semibold tracking-wide text-white/95">Drop to Download</p>
              <p className="mt-1 text-xs text-violet-300/80">Release your link to add it to the queue</p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold tracking-wide text-white/95">Link Detected in Clipboard</p>
              <p className="mt-1 text-xs text-violet-300/80">Click the singularity to absorb it · Click outside to dismiss</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
