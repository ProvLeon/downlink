"use client";

class SoundManager {
  private static instance: SoundManager;
  private context: AudioContext | null = null;
  private swooshBuffer: AudioBuffer | null = null;
  private bounceOpenBuffer: AudioBuffer | null = null;
  private bounceExitBuffer: AudioBuffer | null = null;
  private throwBuffer: AudioBuffer | null = null;
  private splashBuffer: AudioBuffer | null = null;
  private portalSource: AudioBufferSourceNode | null = null;
  private portalGainNode: GainNode | null = null;

  private constructor() {
    if (typeof window !== "undefined") {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.context = new AudioContextClass();
        this.loadAudioFiles();
        this.setupInteractions();
      }
    }
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }
  
  private setupInteractions() {
    if (typeof window !== "undefined") {
      const initAudio = () => {
        this.init();
        window.removeEventListener("click", initAudio);
        window.removeEventListener("keydown", initAudio);
        window.removeEventListener("touchstart", initAudio);
      };
      window.addEventListener("click", initAudio, { once: true });
      window.addEventListener("keydown", initAudio, { once: true });
      window.addEventListener("touchstart", initAudio, { once: true });
    }
  }

  private async loadAudioFiles() {
    if (!this.context) return;
    try {
      const [swooshRes, bounceOpenRes, bounceExitRes, throwRes, splashRes] = await Promise.all([
        fetch("/sounds/portal_idle.mp3"),
        fetch("/sounds/jump-sound-open.mp3"),
        fetch("/sounds/jump-sound-exit.mp3"),
        fetch("/sounds/download-throw-sound.mp3"),
        fetch("/sounds/splashscreen-sound.mp3")
      ]);
      
      const swooshArray = await swooshRes.arrayBuffer();
      const bounceOpenArray = await bounceOpenRes.arrayBuffer();
      const bounceExitArray = await bounceExitRes.arrayBuffer();
      const throwArray = await throwRes.arrayBuffer();
      const splashArray = await splashRes.arrayBuffer();
      
      // decodeAudioData doesn't always support Promise API in older Safari, but standard in modern browsers.
      this.context.decodeAudioData(swooshArray, (buffer) => {
        this.swooshBuffer = buffer;
      });
      this.context.decodeAudioData(bounceOpenArray, (buffer) => {
        this.bounceOpenBuffer = buffer;
      });
      this.context.decodeAudioData(bounceExitArray, (buffer) => {
        this.bounceExitBuffer = buffer;
      });
      this.context.decodeAudioData(throwArray, (buffer) => {
        this.throwBuffer = buffer;
      });
      this.context.decodeAudioData(splashArray, (buffer) => {
        this.splashBuffer = buffer;
      });
    } catch (e) {
      console.error("Failed to load audio buffers:", e);
    }
  }

  public init() {
    if (this.context && this.context.state === "suspended") {
      this.context.resume().catch(e => console.warn("Failed to resume audio context:", e));
    }
  }

  public playSplash() {
    if (!this.context || !this.splashBuffer) return;
    this.init();

    const source = this.context.createBufferSource();
    source.buffer = this.splashBuffer;
    
    const gainNode = this.context.createGain();
    gainNode.gain.value = 1.0;

    source.connect(gainNode);
    gainNode.connect(this.context.destination);
    
    source.start(0);
  }

  public startPortalIdle() {
    if (!this.context || !this.swooshBuffer || this.portalSource) return;
    this.init();

    const source = this.context.createBufferSource();
    source.buffer = this.swooshBuffer;
    source.loop = true; // Make it continuous
    
    const gainNode = this.context.createGain();
    gainNode.gain.value = 0.5; // Default starting volume

    source.connect(gainNode);
    gainNode.connect(this.context.destination);
    
    source.start(0);

    this.portalSource = source;
    this.portalGainNode = gainNode;
  }

  public setPortalVolume(volume: number) {
    if (this.portalGainNode && this.context) {
      // Smoothly transition volume over 100ms
      this.portalGainNode.gain.setTargetAtTime(volume, this.context.currentTime, 0.1);
    }
  }

  public stopPortalIdle() {
    if (this.portalSource) {
      try {
        this.portalSource.stop();
        this.portalSource.disconnect();
      } catch (e) {}
      this.portalSource = null;
    }
    if (this.portalGainNode) {
      try {
        this.portalGainNode.disconnect();
      } catch (e) {}
      this.portalGainNode = null;
    }
  }

  public playThrow() {
    if (!this.context || !this.throwBuffer) return;
    this.init();

    const source = this.context.createBufferSource();
    source.buffer = this.throwBuffer;
    
    const gainNode = this.context.createGain();
    gainNode.gain.value = 0.5;

    source.connect(gainNode);
    gainNode.connect(this.context.destination);
    
    source.start(0);
  }

  public playBounce(animation: "open" | "exit", type: "floor" | "target") {
    if (!this.context) return;
    const buffer = animation === "open" ? this.bounceOpenBuffer : this.bounceExitBuffer;
    if (!buffer) return;

    this.init();

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    
    const gainNode = this.context.createGain();
    
    if (type === "floor") {
      source.playbackRate.value = 1.0;
      gainNode.gain.value = 0.3;
    } else {
      source.playbackRate.value = 1.4; // Pitch up slightly for the target land
      gainNode.gain.value = 0.5;
    }

    source.connect(gainNode);
    gainNode.connect(this.context.destination);
    
    source.start(0);
  }
}

export const soundManager = SoundManager.getInstance();
