const fs = require('fs');
let tsx = fs.readFileSync('app/components/SplashScreen.tsx', 'utf8');

// Add import
if (!tsx.includes('@tauri-apps/api/window')) {
  tsx = tsx.replace('import gsap from "gsap";', 'import gsap from "gsap";\nimport { getCurrentWindow } from "@tauri-apps/api/window";');
}

// Add show() call
if (!tsx.includes('getCurrentWindow().show()')) {
  tsx = tsx.replace('useGSAP(() => {\n', 'useGSAP(() => {\n    // Show the Tauri window now that React has hydrated and we are ready to animate\n    getCurrentWindow().show().catch(() => {});\n\n');
}

fs.writeFileSync('app/components/SplashScreen.tsx', tsx);
console.log('SplashScreen.tsx patched for Tauri window show');
