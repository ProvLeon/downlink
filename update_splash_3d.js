const fs = require('fs');
let tsx = fs.readFileSync('app/components/SplashScreen.tsx', 'utf8');

// Add Logo3D import
if (!tsx.includes('Logo3D')) {
  tsx = tsx.replace('import gsap from "gsap";', 'import gsap from "gsap";\nimport { Logo3D } from "./Logo3D";');
}

// Remove GSAP animation for .logo-part and logoGroupRef
tsx = tsx.replace(/gsap\.set\("\.logo-part"[\s\S]*?\}\);/, '');
tsx = tsx.replace(/\.to\("\.logo-part"[\s\S]*?\}<0\.2"\)/, '');
tsx = tsx.replace(/tl\.to\(logoGroupRef\.current[\s\S]*?\}\)/, '');

// Replace the <svg> block with <Logo3D />
// Match from <div ref={logoGroupRef}... to </div> below the svg
const svgBlockRegex = /<div ref=\{logoGroupRef\}[^>]*>\s*<svg[\s\S]*?<\/svg>\s*<\/div>/;
tsx = tsx.replace(svgBlockRegex, '<Logo3D />');

fs.writeFileSync('app/components/SplashScreen.tsx', tsx);
console.log('SplashScreen.tsx updated with Logo3D');
