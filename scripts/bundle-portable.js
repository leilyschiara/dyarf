const fs = require('fs');
const path = require('path');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const stylesCss = fs.readFileSync('src/styles.css', 'utf8');
const logoJs = fs.existsSync('src/logo-data.min.js') ? fs.readFileSync('src/logo-data.min.js', 'utf8') : fs.readFileSync('src/logo-data.js', 'utf8');
const demoJs = fs.existsSync('src/data-demo.min.js') ? fs.readFileSync('src/data-demo.min.js', 'utf8') : fs.readFileSync('src/data-demo.js', 'utf8');
const apiJs = fs.existsSync('src/sheets-api.min.js') ? fs.readFileSync('src/sheets-api.min.js', 'utf8') : fs.readFileSync('src/sheets-api.js', 'utf8');
const appJs = fs.existsSync('src/app.min.js') ? fs.readFileSync('src/app.min.js', 'utf8') : fs.readFileSync('src/app.js', 'utf8');

// Replace stylesheet link with inline styles
let bundle = indexHtml.replace(
  /<link rel="stylesheet" href="src\/styles\.css(?:\?[^"]*)?">/,
  `<style>\n${stylesCss}\n</style>`
);

// Replace script tags with inline scripts
const scriptsBlock = `
  <script>
    ${logoJs}
    ${demoJs}
    ${apiJs}
    ${appJs}
  </script>
`;

bundle = bundle.replace(
  /<script src="src\/logo-data(?:\.min)?\.js(?:\?[^"]*)?"><\/script>\s*<script src="src\/data-demo(?:\.min)?\.js(?:\?[^"]*)?"><\/script>\s*<script src="src\/sheets-api(?:\.min)?\.js(?:\?[^"]*)?"><\/script>\s*<script src="src\/app(?:\.min)?\.js(?:\?[^"]*)?"><\/script>/,
  scriptsBlock
);

fs.writeFileSync('D_Camisas_App_Portable.html', bundle, 'utf8');
console.log('Successfully created D_Camisas_App_Portable.html, size:', bundle.length);
