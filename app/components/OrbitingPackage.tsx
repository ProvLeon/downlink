"use client";

import { useEffect, useRef } from "react";
import { Package } from "lucide-react";
import gsap from "gsap";

interface OrbitingPackageProps {
  id: string;
  url: string;
  startX: number;
  startY: number;
  centerX: number;
  centerY: number;
  onAbsorb: (id: string, url: string) => void;
}

export function OrbitingPackage({
  id,
  url,
  startX,
  startY,
  centerX,
  centerY,
  onAbsorb,
}: OrbitingPackageProps) {
  const pillRef = useRef<HTMLDivElement>(null);
  
  // Physics state refs
  const state = useRef({
    x: startX,
    y: startY,
    radius: Math.hypot(startX - centerX, startY - centerY),
    angle: Math.atan2(startY - centerY, startX - centerX),
    isDragging: false,
    isAbsorbed: false,
    mousePos: { x: 0, y: 0 }
  });

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!state.current.isDragging) {
        state.current.mousePos = { x: e.clientX, y: e.clientY };
      }
    };
    window.addEventListener("mousemove", handleGlobalMouseMove);
    return () => window.removeEventListener("mousemove", handleGlobalMouseMove);
  }, []);

  useEffect(() => {
    let animationFrameId: number;

    const animate = () => {
      if (state.current.isAbsorbed) return;

      const s = state.current;
      
      if (s.isDragging) {
        // Smoothly interpolate towards the mouse
        s.x += (s.mousePos.x - s.x) * 0.3;
        s.y += (s.mousePos.y - s.y) * 0.3;
        
        // Update polar coordinates based on new cartesian coords
        s.radius = Math.hypot(s.x - centerX, s.y - centerY);
        s.angle = Math.atan2(s.y - centerY, s.x - centerX);
      } else {
        // Calculate distance to mouse for magnetic slowdown
        const distToMouse = Math.hypot(s.mousePos.x - s.x, s.mousePos.y - s.y);
        
        let orbitSpeed = 0.008;
        let pullSpeed = 0.3;

        // Magnetic field radius
        const magneticRadius = 150;
        
        if (distToMouse < magneticRadius && s.mousePos.x !== 0 && s.mousePos.y !== 0) {
          const distanceFactor = distToMouse / magneticRadius; // 0 (center) to 1 (edge)
          
          // Slow down as mouse gets closer (min 10% speed)
          const speedMultiplier = Math.max(0.1, distanceFactor);
          orbitSpeed *= speedMultiplier;
          pullSpeed *= speedMultiplier;
          
          // Apply a slight magnetic pull towards the mouse
          const pullStrength = (1 - distanceFactor) * 0.02;
          s.x += (s.mousePos.x - s.x) * pullStrength;
          s.y += (s.mousePos.y - s.y) * pullStrength;
          
          // Re-sync polar coordinates with the new magnetically-pulled position
          s.radius = Math.hypot(s.x - centerX, s.y - centerY);
          s.angle = Math.atan2(s.y - centerY, s.x - centerX);
        }

        // Orbit physics
        s.angle -= orbitSpeed; 
        s.radius -= pullSpeed;

        if (s.radius < 40) {
          s.isAbsorbed = true;
          onAbsorb(id, url);
          return;
        }

        s.x = centerX + Math.cos(s.angle) * s.radius;
        s.y = centerY + Math.sin(s.angle) * s.radius;
      }

      if (pillRef.current) {
        // Apply transform
        pillRef.current.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) translate(-50%, -50%)`;
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [centerX, centerY, id, url, onAbsorb]);

  // Entrance animation
  useEffect(() => {
    if (pillRef.current) {
      gsap.fromTo(
        pillRef.current,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.5)" }
      );
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    state.current.isDragging = true;
    state.current.mousePos = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (state.current.isDragging) {
      e.stopPropagation();
      state.current.mousePos = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    state.current.isDragging = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    // Check if dropped directly into core
    if (state.current.radius < 60 && !state.current.isAbsorbed) {
      state.current.isAbsorbed = true;
      onAbsorb(id, url);
    }
  };

  return (
    <div
      ref={pillRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 left-0 flex items-center justify-center h-12 w-12 rounded-xl border border-violet-400/60 bg-indigo-900/60 backdrop-blur-md z-[10001] shadow-[0_0_25px_rgba(139,92,246,0.5)] origin-center cursor-grab active:cursor-grabbing hover:border-cyan-400/80 hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] transition-colors pointer-events-auto"
      style={{ willChange: "transform" }}
    >
      <Package className="h-6 w-6 text-cyan-300 pointer-events-none" />
    </div>
  );
}
