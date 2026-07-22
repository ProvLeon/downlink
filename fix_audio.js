const fs = require('fs');
let tsx = fs.readFileSync('app/components/SplashScreen.tsx', 'utf8');

if (!tsx.includes('<audio')) {
  // Replace the return block with the audio wrapped
  tsx = tsx.replace('return (\n    <div\n      ref={containerRef}', 'const audioRef = useRef<HTMLAudioElement>(null);\n\n  return (\n    <>\n      <audio ref={audioRef} src="/sounds/splashscreen-sound.mp3" preload="auto" />\n      <div\n        ref={containerRef}');
  
  // replace soundManager.playSplash()
  tsx = tsx.replace('// Attempt to play splash sound\n    soundManager.playSplash();', '// Play sound directly from audio element\n    if (audioRef.current) {\n      audioRef.current.volume = 0.6;\n      audioRef.current.play().catch(e => console.warn("Autoplay blocked:", e));\n    }');

  // Close the fragment at the end
  tsx = tsx.replace(/<\/div>\n    <\/div>\n  \);\n}/, '</div>\n      </div>\n    </>\n  );\n}');

  fs.writeFileSync('app/components/SplashScreen.tsx', tsx);
  console.log('Fixed audio element insertion');
} else {
  console.log('Audio already present');
}
