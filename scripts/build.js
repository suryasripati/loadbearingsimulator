// Assembles src/template.html + src/model.js + src/app.js into one self-contained docs/index.html.
// No dependencies. Run: npm run build
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const template = read('src/template.html');
// The model is a CommonJS module for tests; strip the export line so it runs as a plain script in the page.
const model = read('src/model.js').split('\n').filter((l) => !l.includes('module.exports')).join('\n');
const app = read('src/app.js');

if (!template.includes('/*MODEL*/') || !template.includes('/*APP*/')) {
  throw new Error('template.html must contain /*MODEL*/ and /*APP*/ placeholders');
}
const out = template.replace('/*MODEL*/', () => model).replace('/*APP*/', () => app);
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'index.html'), out);
console.log('Built docs/index.html (' + out.length + ' bytes)');
