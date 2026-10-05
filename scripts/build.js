// Assembles src/template.html + src/model.js + src/app.js into one self-contained docs/index.html.
// No dependencies. Run: npm run build
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const template = read('src/template.html');
const strip = (src) => src.split('\n').filter((l) => !l.includes('module.exports')).join('\n');
// The model is a CommonJS module for tests; strip the export line so it runs as a plain script in the page.
const model = strip(read('src/model.js'));
// Defaults and snapshots are CommonJS modules too (tests read them); they run in the page just ahead of the UI code.
const app = strip(read('src/defaults.js')) + '\n' + strip(read('src/modes.js')) + '\n' + strip(read('src/snapshots.js')) + '\n' + read('src/app.js');

if (!template.includes('/*MODEL*/') || !template.includes('/*APP*/')) {
  throw new Error('template.html must contain /*MODEL*/ and /*APP*/ placeholders');
}
const out = template.replace('/*MODEL*/', () => model).replace('/*APP*/', () => app);
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'index.html'), out);
console.log('Built docs/index.html (' + out.length + ' bytes)');

// Calibration page: a separate page so the main page stays light. It reuses the main page's styles (one CSS source),
// the model, the defaults and the snapshot code (for its strict-import helpers), plus the calibration logic and UI.
const calTemplate = read('src/calibration.html');
for (const p of ['/*STYLE*/', '/*MODEL*/', '/*APP*/']) {
  if (!calTemplate.includes(p)) throw new Error('calibration.html must contain the ' + p + ' placeholder');
}
const style = template.slice(template.indexOf('<style>') + '<style>'.length, template.indexOf('</style>'));
const calModel = [model, strip(read('src/defaults.js')), strip(read('src/snapshots.js')), strip(read('src/calibration-guide.js')), strip(read('src/calibration.js'))].join('\n');
const calOut = calTemplate.replace('/*STYLE*/', () => style).replace('/*MODEL*/', () => calModel).replace('/*APP*/', () => read('src/calibration-app.js'));
fs.writeFileSync(path.join(root, 'docs', 'calibration.html'), calOut);
console.log('Built docs/calibration.html (' + calOut.length + ' bytes)');

// calibration/GUIDE.md is generated from the same guidance the page shows (src/calibration-guide.js).
const { guideMarkdown } = require(path.join(root, 'src', 'calibration-guide.js'));
fs.writeFileSync(path.join(root, 'calibration', 'GUIDE.md'), guideMarkdown());
console.log('Built calibration/GUIDE.md');
