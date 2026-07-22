import { useState, useEffect, RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { soundManager } from "../lib/SoundManager";

interface UseModalAnimationProps {
  isOpen: boolean;
  isExiting?: boolean;
  onClose: () => void;
  targetId: string;
  exitTargetId?: string;
  modalRef: RefObject<HTMLDivElement | null>;
  backdropRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
}

export function useModalAnimation({
  isOpen,
  isExiting,
  onClose,
  targetId,
  exitTargetId,
  modalRef,
  backdropRef,
  contentRef,
}: UseModalAnimationProps) {
  // Manual render state to keep the component in the DOM while GSAP animates the exit
  const [renderState, setRenderState] = useState(false);

  useEffect(() => {
    if (isOpen && !isExiting) {
      setRenderState(true);
    }
  }, [isOpen, isExiting]);

  useGSAP(() => {
    if (!renderState || !modalRef.current || !backdropRef.current || !contentRef.current) return;

    // Calculate dynamic coordinates of the target icon relative to the center of the screen
    let targetX = 0;
    let targetY = 0;
    
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      
      const iconCenterX = rect.left + rect.width / 2;
      const iconCenterY = rect.top + rect.height / 2;
      
      targetX = iconCenterX - centerX;
      targetY = iconCenterY - centerY;
    } else {
      // Fallbacks if the element isn't found (top right corner roughly)
      targetX = window.innerWidth * 0.4;
      targetY = -window.innerHeight * 0.45;
    }

    if (isOpen && !isExiting) {
      // ENTRANCE ANIMATION
      const tl = gsap.timeline();

      const w = modalRef.current.offsetWidth || window.innerWidth * 0.2;
      const h = modalRef.current.offsetHeight || window.innerHeight * 0.2;

      // Lock the content size so it doesn't reflow when the modal wrapper shrinks to 40px
      gsap.set(contentRef.current, { width: w, height: h, opacity: 0 });

      // Start state: Tiny 40x40 ball exactly at the target icon
      gsap.set(modalRef.current, {
        width: 25,
        height: 25,
        x: targetX,
        y: targetY,
        borderRadius: "50%",
        backgroundColor: "#3b82f6", // Solid blue ball
        boxShadow: "0 0 30px 10px rgba(59, 130, 246, 0.6)", // Blue glow
        opacity: 1,
        // Reset scale in case it was applied previously
        scaleX: 1,
        scaleY: 1
      });
      gsap.set(backdropRef.current, { opacity: 0 });

      // Fade in backdrop
      tl.to(backdropRef.current, { opacity: 1, duration: 0.3 }, 0);

      // Arc Throw to center with a realistic floor bounce
      const floorY = (window.innerHeight / 2) - 20;

      // X moves linearly (smooth curve)
      tl.to(modalRef.current, {
        x: 0,
        duration: 0.7,
        ease: "power1.out"
      }, 0)
      // Y first falls DOWN from the icon to the floor (gravity)
      .to(modalRef.current, {
        y: floorY,
        duration: 0.45,
        ease: "power2.in",
        onComplete: () => soundManager.playBounce("open", "floor")
      }, 0)
      // Y then bounces UP from the floor into the center of the screen
      .to(modalRef.current, {
        y: 0,
        duration: 0.25,
        ease: "back.out(0.8)" // Gentle overshoot as it hangs in mid-air
      }, ">")
      
      // After hitting the center, morph into the large rectangular modal
      .to(modalRef.current, {
        width: w,
        height: h,
        borderRadius: "16px",
        backgroundColor: "rgba(24, 24, 27, 0.0)", // Fade to transparent, Tailwind will take over
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", // Fade out glow into standard shadow
        duration: 0.6,
        ease: "back.out(1.2)",
        onComplete: () => {
          // Clear inline styles so Tailwind classes take over perfectly
          gsap.set(modalRef.current, { clearProps: "width,height,boxShadow,backgroundColor,scaleX,scaleY" });
          gsap.set(contentRef.current, { clearProps: "width,height" });
        }
      })
      
      // Fade in contents
      .to(contentRef.current, {
        opacity: 1,
        duration: 0.2
      }, "-=0.2");

    } else if (isExiting || !isOpen) {
      // EXIT ANIMATION
      const tl = gsap.timeline({
        onComplete: () => {
          setRenderState(false);
          if (isExiting) {
            onClose(); // Auto-close when exit finishes if controlled via isExiting
          }
        }
      });

      const w = modalRef.current.offsetWidth || window.innerWidth * 0.5;
      const h = modalRef.current.offsetHeight || window.innerHeight * 0.5;

      // Lock the content size before the modal wrapper shrinks
      gsap.set(contentRef.current, { width: w, height: h });

      // 1. Fade out contents so it looks like a solid ball
      tl.to(contentRef.current, { opacity: 0, duration: 0.15 })
      
      // 2. Morph in place into a tiny ball
      .to(modalRef.current, {
        width: 24,
        height: 24,
        borderRadius: "12px",
        backgroundColor: "#3b82f6", // Solid blue ball
        boxShadow: "none", 
        border: "none",
        duration: 0.35,
        ease: "power2.inOut"
      });
      
      // Calculate exit target trajectory if exitTargetId is provided
      if (exitTargetId) {
        const exitEl = document.getElementById(exitTargetId);
        const actionEl = document.getElementById("action-bar-container");
        const rect = modalRef.current.getBoundingClientRect();
        
        let targetFloorY = window.innerHeight - rect.bottom - 40;
        if (actionEl) {
          const actionRect = actionEl.getBoundingClientRect();
          targetFloorY = actionRect.top - rect.bottom;
        }

        let exitTargetX = window.innerWidth - rect.right - 40;
        let exitTargetY = 80 - rect.top;

        if (exitEl) {
          const queueRect = exitEl.getBoundingClientRect();
          exitTargetX = queueRect.left + 40 - rect.left;
          exitTargetY = queueRect.top + 60 - rect.top;
        }

        const peakY = exitTargetY - 150;

        // Reset relative positioning for GSAP transforms
        gsap.set(modalRef.current, { x: 0, y: 0 });

        tl.to(modalRef.current, {
          y: targetFloorY, // hit the floor
          duration: 0.25,
          ease: "power2.in",
          onComplete: () => soundManager.playBounce("exit", "floor")
        }, "-=0.02")
        .to(modalRef.current, {
          x: exitTargetX,
          scale: 0.5,
          duration: 0.5,
          ease: "none"
        }, ">")
        .to(modalRef.current, {
          y: peakY,
          duration: 0.25,
          ease: "power2.out"
        }, "<")
        .to(modalRef.current, {
          y: exitTargetY,
          duration: 0.25,
          ease: "power2.in",
          onComplete: () => soundManager.playBounce("exit", "target")
        }, "-=0.02");
      } else {
        // 3. Original Throw the ball to the target icon with a realistic floor bounce
        const floorY = (window.innerHeight / 2) - 20;

        tl.to(modalRef.current, {
          x: targetX,
          duration: 0.7,
          ease: "power1.out"
        })
        .to(modalRef.current, {
          y: floorY, 
          duration: 0.25,
          ease: "power2.in",
          onComplete: () => soundManager.playBounce("exit", "floor")
        }, "<") 
        .to(modalRef.current, {
          y: targetY, 
          duration: 0.45,
          ease: "back.out(1.0)",
          // onComplete: () => soundManager.playBounce("exit", "target")
        }, ">");
      }

      // Fade backdrop out near the end of the throw
      tl.to(backdropRef.current, { opacity: 0, duration: 0.3 }, "-=0.3");
    }
  }, [isOpen, isExiting, renderState, targetId, exitTargetId]);

  return { renderState };
}
