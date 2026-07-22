const fs = require('fs');
let tsx = fs.readFileSync('app/components/SplashScreen.tsx', 'utf8');

// Replace bg-[#02000A] with bg-background to fix the solid background issue
tsx = tsx.replace(/className="fixed inset-0[^"]*bg-\[\#02000A\]"/, 'className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-background"');

// Replace glowRef blur with a radial gradient to prevent WebKit black box bug
tsx = tsx.replace(/className="absolute top-1\/2[^"]*blur-\[60px\][^"]*"/, 'className="absolute top-1/2 left-1/2 h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(6,182,212,0.15)_0%,_rgba(59,130,246,0.05)_50%,_transparent_100%)] pointer-events-none"');

// Remove className="drop-shadow-xl" from the SVG element
tsx = tsx.replace(/className="drop-shadow-xl"/, 'className="overflow-visible"');

// Replace the buggy SVG filter with a bulletproof multi-layered drop shadow
const newFilter = `<filter id="emboss" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="12" stdDeviation="16" floodColor="#000000" floodOpacity="0.6" />
                <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#06b6d4" floodOpacity="0.5" />
                <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#ffffff" floodOpacity="0.4" />
              </filter>`;
tsx = tsx.replace(/<filter id="emboss"[\s\S]*?<\/filter>/, newFilter);

// Update GSAP setup to dynamically assemble pieces
const oldSet = 'gsap.set(".logo-part", { opacity: 0, scale: 0.6, transformOrigin: "50% 50%" });';
const newSet = `gsap.set(".logo-part", { 
      opacity: 0, 
      scale: 0,
      rotationZ: () => gsap.utils.random(-60, 60),
      x: () => gsap.utils.random(-150, 150),
      y: () => gsap.utils.random(-150, 150),
      transformOrigin: "50% 50%" 
    });`;
tsx = tsx.replace(oldSet, newSet);

// Update GSAP animation for pieces
const oldTo = /\.to\("\.logo-part", {[\s\S]*?}, "<0\.2"\)/;
const newTo = `.to(".logo-part", {
      opacity: 1,
      scale: 1,
      rotationZ: 0,
      x: 0,
      y: 0,
      duration: 1.2,
      stagger: 0.1,
      ease: "back.out(1.2)"
    }, "<0.2")`;
tsx = tsx.replace(oldTo, newTo);

// Add audio element and play logic
if (!tsx.includes('<audio')) {
  tsx = tsx.replace('return (', 'const audioRef = useRef<HTMLAudioElement>(null);\n\n  return (\n    <>\n      <audio ref={audioRef} src="/sounds/splashscreen-sound.mp3" preload="auto" />');
  tsx = tsx.replace('// Attempt to play splash sound\n    soundManager.playSplash();', '// Play sound directly from audio element\n    if (audioRef.current) {\n      audioRef.current.volume = 0.6;\n      audioRef.current.play().catch(e => console.warn("Autoplay blocked:", e));\n    }');
  // Close the fragment
  tsx = tsx.replace(/div>$/, 'div>\n    </>');
}

fs.writeFileSync('app/components/SplashScreen.tsx', tsx);
console.log('SplashScreen.tsx updated successfully');
