const fs = require('fs');
const { SVGLoader } = require('three/examples/jsm/loaders/SVGLoader.js');

const svgData = fs.readFileSync('public/downlink.svg', 'utf8');
const loader = new SVGLoader();
const parsed = loader.parse(svgData);

console.log("Found paths:", parsed.paths.length);
parsed.paths.forEach((path, i) => {
  const shapes = path.toShapes(true);
  console.log(`Path ${i} generated ${shapes.length} shapes`);
});
