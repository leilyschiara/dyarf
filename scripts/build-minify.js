/**
 * Build & Minify Script for D'Camisas Web & APK
 * Genera versiones minificadas y ofuscadas de los archivos JavaScript para producción y empaquetado APK.
 */

const fs = require('fs');
const path = require('path');

function tokenizeJs(input) {
  const tokens = [];
  let i = 0;
  const len = input.length;
  const stack = []; // for template literal expressions

  const FLOW_KEYWORDS = new Set([
    'return', 'case', 'throw', 'yield', 'await', 'typeof', 'void', 'delete', 'instanceof', 'in', 'of', 'else', 'do'
  ]);

  let lastSignificantToken = null;

  function isRegexAllowed() {
    if (!lastSignificantToken) return true;
    const type = lastSignificantToken.type;
    if (type === 'punct' || type === 'operator' || type === 'keyword_flow') {
      return true;
    }
    return false;
  }

  while (i < len) {
    const ch = input[i];
    const nextCh = i + 1 < len ? input[i + 1] : '';

    // Direct inside template string literal
    if (stack.length > 0 && stack[stack.length - 1].type === 'template') {
      let str = '';
      while (i < len) {
        const c = input[i];
        if (c === '\\' && i + 1 < len) {
          str += c + input[i + 1];
          i += 2;
        } else if (c === '`') {
          str += c;
          i++;
          stack.pop();
          tokens.push({ type: 'template_tail', value: str });
          lastSignificantToken = tokens[tokens.length - 1];
          break;
        } else if (c === '$' && i + 1 < len && input[i + 1] === '{') {
          str += '${';
          i += 2;
          stack.push({ type: 'template_expr', braceDepth: 1 });
          tokens.push({ type: 'template_middle', value: str });
          lastSignificantToken = tokens[tokens.length - 1];
          break;
        } else {
          str += c;
          i++;
        }
      }
      continue;
    }

    // Single line comment: // ...
    if (ch === '/' && nextCh === '/') {
      let comment = '';
      while (i < len && input[i] !== '\n') {
        comment += input[i];
        i++;
      }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }

    // Multi-line comment: /* ... */
    if (ch === '/' && nextCh === '*') {
      let comment = '/*';
      i += 2;
      while (i < len) {
        if (input[i] === '*' && i + 1 < len && input[i + 1] === '/') {
          comment += '*/';
          i += 2;
          break;
        }
        comment += input[i];
        i++;
      }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }

    // Single quote string: '...'
    if (ch === '\'') {
      let str = '\'';
      i++;
      while (i < len) {
        const c = input[i];
        if (c === '\\' && i + 1 < len) {
          str += c + input[i + 1];
          i += 2;
        } else if (c === '\'') {
          str += c;
          i++;
          break;
        } else {
          str += c;
          i++;
        }
      }
      tokens.push({ type: 'string', value: str });
      lastSignificantToken = tokens[tokens.length - 1];
      continue;
    }

    // Double quote string: "..."
    if (ch === '\"') {
      let str = '\"';
      i++;
      while (i < len) {
        const c = input[i];
        if (c === '\\' && i + 1 < len) {
          str += c + input[i + 1];
          i += 2;
        } else if (c === '\"') {
          str += c;
          i++;
          break;
        } else {
          str += c;
          i++;
        }
      }
      tokens.push({ type: 'string', value: str });
      lastSignificantToken = tokens[tokens.length - 1];
      continue;
    }

    // Template literal start: `...
    if (ch === '`') {
      let str = '`';
      i++;
      while (i < len) {
        const c = input[i];
        if (c === '\\' && i + 1 < len) {
          str += c + input[i + 1];
          i += 2;
        } else if (c === '`') {
          str += c;
          i++;
          tokens.push({ type: 'template_literal', value: str });
          lastSignificantToken = tokens[tokens.length - 1];
          break;
        } else if (c === '$' && i + 1 < len && input[i + 1] === '{') {
          str += '${';
          i += 2;
          stack.push({ type: 'template' });
          stack.push({ type: 'template_expr', braceDepth: 1 });
          tokens.push({ type: 'template_head', value: str });
          lastSignificantToken = tokens[tokens.length - 1];
          break;
        } else {
          str += c;
          i++;
        }
      }
      continue;
    }

    // Regular Expression literal: /pattern/flags
    if (ch === '/' && isRegexAllowed()) {
      let regex = '/';
      i++;
      let inCharClass = false;
      while (i < len) {
        const c = input[i];
        if (c === '\\' && i + 1 < len) {
          regex += c + input[i + 1];
          i += 2;
        } else if (c === '[' && !inCharClass) {
          inCharClass = true;
          regex += c;
          i++;
        } else if (c === ']' && inCharClass) {
          inCharClass = false;
          regex += c;
          i++;
        } else if (c === '/' && !inCharClass) {
          regex += c;
          i++;
          while (i < len && /[a-z]/i.test(input[i])) {
            regex += input[i];
            i++;
          }
          break;
        } else {
          regex += c;
          i++;
        }
      }
      tokens.push({ type: 'regex', value: regex });
      lastSignificantToken = tokens[tokens.length - 1];
      continue;
    }

    // Template expression braces tracking
    if (ch === '{') {
      if (stack.length > 0 && stack[stack.length - 1].type === 'template_expr') {
        stack[stack.length - 1].braceDepth++;
      }
      tokens.push({ type: 'punct', value: '{' });
      lastSignificantToken = tokens[tokens.length - 1];
      i++;
      continue;
    }
    if (ch === '}') {
      if (stack.length > 0 && stack[stack.length - 1].type === 'template_expr') {
        stack[stack.length - 1].braceDepth--;
        if (stack[stack.length - 1].braceDepth === 0) {
          stack.pop(); // End of template_expr, return to 'template'
          tokens.push({ type: 'template_expr_end', value: '}' });
          i++;
          continue;
        }
      }
      tokens.push({ type: 'punct', value: '}' });
      lastSignificantToken = tokens[tokens.length - 1];
      i++;
      continue;
    }

    // Whitespace
    if (/\s/.test(ch)) {
      const hasNewline = /[\r\n]/.test(ch);
      let ws = ch;
      i++;
      let containsNewline = hasNewline;
      while (i < len && /\s/.test(input[i])) {
        if (/[\r\n]/.test(input[i])) containsNewline = true;
        ws += input[i];
        i++;
      }
      tokens.push({ type: 'whitespace', value: ws, hasNewline: containsNewline });
      continue;
    }

    // Identifiers and numbers
    if (/[a-zA-Z0-9_$]/.test(ch)) {
      let id = '';
      while (i < len && /[a-zA-Z0-9_$]/.test(input[i])) {
        id += input[i];
        i++;
      }
      const type = FLOW_KEYWORDS.has(id) ? 'keyword_flow' : 'ident';
      tokens.push({ type: type, value: id });
      lastSignificantToken = tokens[tokens.length - 1];
      continue;
    }

    // Operators and Punctuation
    const three = i + 2 < len ? input.slice(i, i + 3) : '';
    const two = i + 1 < len ? input.slice(i, i + 2) : '';
    let op = ch;
    if (['===', '!==', '>>>', '...'].includes(three)) {
      op = three;
      i += 3;
    } else if (['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '=>', '??', '<<', '>>'].includes(two)) {
      op = two;
      i += 2;
    } else {
      i++;
    }

    const punctList = [';', '(', ')', '[', ']', ',', ':', '?', '.'];
    tokens.push({ type: punctList.includes(op) ? 'punct' : 'operator', value: op });
    lastSignificantToken = tokens[tokens.length - 1];
  }

  return tokens;
}

function minifyTokens(tokens) {
  let output = '';
  let prevToken = null;

  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];

    // Strip comments completely
    if (tok.type === 'comment') {
      continue;
    }

    if (tok.type === 'whitespace') {
      // If whitespace contained a newline, we might need a newline or semicolon to prevent ASI issues,
      // but if adjacent tokens are punctuation that doesn't need space or newline, we can omit.
      // To be 100% safe against Automatic Semicolon Insertion (ASI) bugs in JS,
      // if whitespace had a newline, we emit a single newline '\n' instead of a space.
      if (tok.hasNewline) {
        // Only emit newline if necessary (not directly after or before certain punctuation)
        if (prevToken) {
          const pv = prevToken.value;
          if ([';', '{', '}', ',', '(', '[', ':', '?', '&&', '||', '=', '=>', '+', '-', '*', '/'].includes(pv)) {
            // No newline needed
          } else {
            output += '\n';
            prevToken = { type: 'newline', value: '\n' };
          }
        }
      }
      continue;
    }

    // Check if space is required between prevToken and current token
    if (prevToken && prevToken.type !== 'newline') {
      const isWord = (t) => t.type === 'ident' || t.type === 'keyword_flow';
      if (isWord(prevToken) && isWord(tok)) {
        output += ' ';
      } else if (isWord(prevToken) && (tok.type === 'regex' || tok.type === 'string' || tok.type === 'template_literal' || tok.type === 'template_head')) {
        output += ' ';
      } else if ((prevToken.value === '+' && tok.value.startsWith('+')) || (prevToken.value === '-' && tok.value.startsWith('-'))) {
        output += ' ';
      }
    }

    output += tok.value;
    prevToken = tok;
  }

  return output.trim();
}

function processFile(srcPath, destPaths) {
  const content = fs.readFileSync(srcPath, 'utf8');
  const tokens = tokenizeJs(content);
  const minified = minifyTokens(tokens);

  for (const dest of destPaths) {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dest, minified, 'utf8');
    const origSize = Buffer.byteLength(content, 'utf8');
    const minSize = Buffer.byteLength(minified, 'utf8');
    const savings = ((1 - minSize / origSize) * 100).toFixed(1);
    console.log(`[MINIFY] ${srcPath} -> ${dest} (${origSize}B -> ${minSize}B, -${savings}%)`);
  }
}

// Target files for minification
const filesToMinify = [
  {
    src: 'src/logo-data.js',
    dest: ['src/logo-data.min.js', 'public/logo-data.min.js', 'www/src/logo-data.min.js', 'www/src/logo-data.js']
  },
  {
    src: 'src/data-demo.js',
    dest: ['src/data-demo.min.js', 'public/data-demo.min.js', 'www/src/data-demo.min.js', 'www/src/data-demo.js']
  },
  {
    src: 'src/sheets-api.js',
    dest: ['src/sheets-api.min.js', 'public/sheets-api.min.js', 'www/src/sheets-api.min.js', 'www/src/sheets-api.js']
  },
  {
    src: 'src/app.js',
    dest: ['src/app.min.js', 'public/app.min.js', 'www/src/app.min.js', 'www/src/app.js']
  }
];

console.log('--- INICIANDO MINIFICACIÓN DE CÓDIGO JS (PREPARACIÓN APK) ---');
for (const item of filesToMinify) {
  processFile(item.src, item.dest);
}

// Sincronizar directorio www para Capacitor
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

console.log('--- GENERANDO DIRECTORIO WWW PARA CAPACITOR ---');
copyRecursive('src/styles.css', 'www/src/styles.css');
copyRecursive('index.html', 'www/index.html');
copyRecursive('manifest.webmanifest', 'www/manifest.webmanifest');
copyRecursive('manifest.webmanifest', 'www/manifest.json');
copyRecursive('manifest.webmanifest', 'manifest.json');
copyRecursive('sw.js', 'www/sw.js');
copyRecursive('public', 'www/public');
copyRecursive('assets', 'www/assets');
if (fs.existsSync('D_Camisas_App_Portable.html')) {
  copyRecursive('D_Camisas_App_Portable.html', 'www/D_Camisas_App_Portable.html');
}
console.log('--- DIRECTORIO WWW PREPARADO EXITOSAMENTE ---');
console.log('--- MINIFICACIÓN COMPLETADA EXITOSAMENTE ---');
