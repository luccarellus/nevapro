const fs = require('fs');
const path = require('path');

const srcPath = 'C:\\Users\\bruno\\.gemini\\antigravity-ide\\brain\\0fac9b8a-5634-48c3-a6ec-653a714c5565\\media__1785441649991.png';
const dest1 = path.join(__dirname, 'src/components/logo_light.png');
const dest2 = path.join(__dirname, 'public/logo_light.png');
const destTs = path.join(__dirname, 'src/components/logoLightData.ts');

try {
  if (fs.existsSync(srcPath)) {
    const buf = fs.readFileSync(srcPath);
    fs.writeFileSync(dest1, buf);
    fs.writeFileSync(dest2, buf);
    const b64 = 'data:image/png;base64,' + buf.toString('base64');
    fs.writeFileSync(destTs, `export const LOGO_LIGHT_DATA = "${b64}";\n`, 'utf8');
    console.log('Successfully generated logo_light.png and logoLightData.ts!');
  }
} catch (e) {
  console.error('Error generating logo:', e);
}
