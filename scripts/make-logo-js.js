const fs = require('fs');
const b64 = fs.readFileSync('public/logo-base64.txt', 'utf8').trim();
const js = `window.BRAND_LOGO = "data:image/jpeg;base64,${b64}";\n`;
fs.writeFileSync('assets/logo-data.js', js, 'utf8');
fs.writeFileSync('src/logo-data.js', js, 'utf8');
console.log('Successfully wrote logo-data.js, length:', js.length);
