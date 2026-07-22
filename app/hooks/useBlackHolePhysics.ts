import { RefObject, useEffect, useRef } from "react";

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  prevX: number;
  prevY: number;

  constructor(x: number, y: number, isAccretion: boolean, centerX: number, centerY: number) {
    if (isAccretion) {
      // Spawn around the core
      const angle = Math.random() * Math.PI * 2;
      const radius = 60 + Math.random() * 150;
      this.x = centerX + Math.cos(angle) * radius;
      this.y = centerY + Math.sin(angle) * radius;
      
      // Tangential starting velocity for orbit
      this.vx = -Math.sin(angle) * (Math.random() * 2 + 1);
      this.vy = Math.cos(angle) * (Math.random() * 2 + 1);
    } else {
      // Spawn near mouse
      this.x = x + (Math.random() - 0.5) * 60;
      this.y = y + (Math.random() - 0.5) * 60;
      this.vx = (Math.random() - 0.5) * 2;
      this.vy = (Math.random() - 0.5) * 2;
    }

    this.prevX = this.x;
    this.prevY = this.y;
    this.maxLife = isAccretion ? 200 + Math.random() * 200 : 100 + Math.random() * 100;
    this.life = this.maxLife;
    
    // Closer particles appear smaller (spaghettification effect)
    this.size = Math.random() * 2 + 0.5;
    
    const colors = ['#8b5cf6', '#3b82f6', '#06b6d4', '#c4b5fd', '#a78bfa'];
    this.color = colors[Math.floor(Math.random() * colors.length)];
  }

  update(centerX: number, centerY: number, isAbsorbed: boolean) {
    this.prevX = this.x;
    this.prevY = this.y;

    const dx = centerX - this.x;
    const dy = centerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // If it falls into the event horizon, kill it immediately
    if (dist < 20) {
      this.life = 0;
      return dist;
    }

    // Inverse square-ish gravity
    let force = 400 / Math.max(dist, 10);
    if (isAbsorbed) force *= 3; // Huge suck when clicked
    
    const nx = dx / dist;
    const ny = dy / dist;
    
    const tx = -ny;
    const ty = nx;

    // Spiral mix
    this.vx += nx * force * 0.04 + tx * force * 0.06;
    this.vy += ny * force * 0.04 + ty * force * 0.06;
    
    this.vx *= 0.96; // Friction
    this.vy *= 0.96;

    this.x += this.vx;
    this.y += this.vy;

    // Fade out as it dies
    this.life--;
    return dist;
  }

  draw(ctx: CanvasRenderingContext2D, centerX: number, centerY: number) {
    const opacity = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = opacity;
    
    // Spaghettification: draw line from prev to current, stretch if fast
    ctx.beginPath();
    ctx.moveTo(this.prevX, this.prevY);
    ctx.lineTo(this.x, this.y);
    ctx.strokeStyle = this.color;
    
    // Stretch effect - thicker line based on size, thinner as it stretches
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    ctx.lineWidth = Math.max(0.5, this.size - (speed * 0.1));
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Add a tiny dot at the head for a "glowing core" of the particle
    ctx.beginPath();
    ctx.arc(this.x, this.y, ctx.lineWidth * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}

export function useBlackHolePhysics(
  canvasRef: RefObject<HTMLCanvasElement | null>, 
  coreRef: RefObject<HTMLDivElement | null>,
  isActive: boolean,
  absorbedRef: React.MutableRefObject<boolean>
) {
  const mousePosRef = useRef<{ x: number, y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    let animationId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);

    const animate = () => {
      if (!isActive) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        animationId = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let centerX = canvas.width / 2;
      let centerY = canvas.height / 2;
      
      if (coreRef.current) {
        const rect = coreRef.current.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
      }

      const isAbsorbed = absorbedRef.current || false;

      // Spawn accretion disk particles
      if (Math.random() < 0.3 && !isAbsorbed) {
        particles.push(new Particle(centerX, centerY, true, centerX, centerY));
      }

      // Spawn pointer particles
      if (mousePosRef.current && !isAbsorbed) {
        // Spawn more particles the further the mouse is, to create a visible stream
        const distToCore = Math.hypot(mousePosRef.current.x - centerX, mousePosRef.current.y - centerY);
        const spawnCount = distToCore > 100 ? 3 : 1;
        for (let i = 0; i < spawnCount; i++) {
          particles.push(new Particle(mousePosRef.current.x, mousePosRef.current.y, false, centerX, centerY));
        }
      }

      // Update and draw
      ctx.globalCompositeOperation = 'screen';
      
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update(centerX, centerY, isAbsorbed);
        
        if (p.life <= 0) {
          particles.splice(i, 1);
        } else {
          p.draw(ctx, centerX, centerY);
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isActive, canvasRef, coreRef, absorbedRef]);

  return mousePosRef;
}
