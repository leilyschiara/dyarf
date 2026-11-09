const fs = require('fs');
const path = require('path');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const stylesCss = fs.readFileSync('src/styles.css', 'utf8');
const logoJs = fs.readFileSync('src/logo-data.js', 'utf8');
const demoJs = fs.readFileSync('src/data-demo.js', 'utf8');
const apiJs = fs.readFileSync('src/sheets-api.js', 'utf8');
const appJs = fs.readFileSync('src/app.js', 'utf8');

// Replace stylesheet link with inline styles
let bundle = indexHtml.replace(
  '<link rel="stylesheet" href="src/styles.css">',
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
  /<script src="src\/logo-data\.js(?:\?[^"]*)?"><\/script>\s*<script src="src\/data-demo\.js(?:\?[^"]*)?"><\/script>\s*<script src="src\/sheets-api\.js(?:\?[^"]*)?"><\/script>\s*<script src="src\/app\.js(?:\?[^"]*)?"><\/script>/,
  scriptsBlock
);

fs.writeFileSync('D_Camisas_App_Portable.html', bundle, 'utf8');
console.log('Successfully created D_Camisas_App_Portable.html, size:', bundle.length);
