"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

interface LiquidProgressProps {
  progress: number;
  isActive: boolean;
  isDone: boolean;
  isStopped: boolean;
}

export function LiquidProgress({ progress, isActive, isDone, isStopped }: LiquidProgressProps) {
  const fillContainerRef = useRef<HTMLDivElement>(null);
  const wave1Ref = useRef<SVGPathElement>(null);
  const wave2Ref = useRef<SVGPathElement>(null);
  const wave3Ref = useRef<SVGPathElement>(null);
  const sloshContainerRef = useRef<HTMLDivElement>(null);

  // Animate the fill width smoothly
  useGSAP(() => {
    if (fillContainerRef.current) {
      gsap.to(fillContainerRef.current, {
        width: `${progress}%`,
        duration: 0.8,
        ease: "power2.out",
      });
    }
  }, [progress]);

  // Animate the realistic fluid waves
  useGSAP(() => {
    if (isActive && !isDone) {
      // Wave 1 (Back) - Slow, deep waves
      gsap.to(wave1Ref.current, {
        x: -500,
        duration: 6,
        repeat: -1,
        ease: "none",
      });

      // Wave 2 (Middle) - Medium speed, offset phase
      gsap.to(wave2Ref.current, {
        x: -500,
        duration: 4,
        repeat: -1,
        ease: "none",
      });

      // Wave 3 (Front) - Fast, choppy waves
      gsap.to(wave3Ref.current, {
        x: -400,
        duration: 2.5,
        repeat: -1,
        ease: "none",
      });

      // Slosh physics: Make the entire body of water gently bob up and down
      gsap.to(sloshContainerRef.current, {
        y: 4,
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    } else if (isDone) {
      // When done, smoothly settle the waves down and stop sloshing
      gsap.to([wave1Ref.current, wave2Ref.current, wave3Ref.current], {
        y: 20, // push waves down slightly to flatten the top visually
        duration: 2,
        ease: "power3.out",
      });
      gsap.to(sloshContainerRef.current, {
        y: 0,
        duration: 1,
        ease: "power3.out",
      });
    }
  }, [isActive, isDone]);

  // Flash effect on completion
  const flashRef = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (isDone && flashRef.current) {
      gsap.fromTo(
        flashRef.current,
        { x: "-100%", opacity: 0.8 },
        { x: "200%", opacity: 0, duration: 1.5, ease: "power2.out" }
      );
    }
  }, [isDone]);

  // Determine colors based on state
  const isError = isStopped;
  
  // Layered colors to simulate depth in the liquid
  const colorBack = isDone ? "#86efac" : isError ? "#fde047" : "#7dd3fc"; // light
  const colorMid = isDone ? "#22c55e" : isError ? "#eab308" : "#0ea5e9";   // base
  const colorFront = isDone ? "#16a34a" : isError ? "#ca8a04" : "#0284c7"; // deep

  const bgColor = isDone ? "bg-green-500/10" : isError ? "bg-yellow-500/10" : "bg-sky-500/5";

  return (
    <div className={`relative h-2.5 w-full overflow-hidden rounded-lg ${bgColor} ring-1 ring-inset ring-white/15 shadow-inner`}>
      {/* Glossy glass reflection overlay (adds physical tube feel) */}
      <div className="absolute left-0 right-0 top-0 h-[55%] bg-gradient-to-b from-white/10 to-transparent pointer-events-none z-10" />

      {/* The clipped fill container that grows left-to-right */}
      <div
        ref={fillContainerRef}
        className="absolute bottom-0 left-0 top-0 overflow-hidden rounded-l-lg transition-all"
        style={{ width: "0%" }}
      >
        {/* The slosh container moves up and down organically */}
        <div ref={sloshContainerRef} className="absolute inset-0 h-[150%] -top-[25%] w-[1000px]">
          <svg
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            viewBox="0 0 1000 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Wave 1: Back layer (Period 500) */}
            <path
              ref={wave1Ref}
              d="M 0 45 Q 125 15, 250 45 T 500 45 T 750 45 T 1000 45 L 1000 150 L 0 150 Z"
              fill={colorBack}
              opacity={isActive && !isDone ? 0.6 : 1}
            />
            
            {/* Wave 2: Middle layer (Period 500) - Offset Q points for turbulence */}
            <path
              ref={wave2Ref}
              d="M 0 55 Q 125 85, 250 55 T 500 55 T 750 55 T 1000 55 L 1000 150 L 0 150 Z"
              fill={colorMid}
              opacity={isActive && !isDone ? 0.8 : 1}
            />
            
            {/* Wave 3: Front layer (Period 400) - Tighter, faster waves */}
            <path
              ref={wave3Ref}
              d="M 0 65 Q 100 45, 200 65 T 400 65 T 600 65 T 800 65 T 1000 65 L 1000 150 L 0 150 Z"
              fill={colorFront}
            />
          </svg>
        </div>
      </div>
      
      {/* Right-edge lighting/glow for the water surface */}
      {isActive && !isDone && progress > 0 && (
        <div 
          className="absolute top-0 bottom-0 w-2 bg-white/20 blur-[2px] z-20"
          style={{ left: `calc(${progress}% - 4px)` }}
        />
      )}

      {/* Completion Flash Sweep */}
      <div 
        ref={flashRef}
        className="absolute inset-0 z-30 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 pointer-events-none"
      />
    </div>
  );
}
