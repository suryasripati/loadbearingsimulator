// Assembles src/template.html + the src/*.js files + the case library into one self-contained page.
// No dependencies.
//   npm run build       -> docs/index.html with cases/*.case.json (the live page)
//   npm run build:dev   -> docs-dev/index.html (gitignored) that also includes the synthetic fixtures in
//                          test/support/cases/, for reviewing the case interface. Never published.
// The build fails (non-zero exit) on any case validation error.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) => src.split('\n').filter((l) => !l.includes('module.exports')).join('\n');

function loadCases(dirs, opts){
  const { validateCase } = require(path.join(root, 'src', 'cases.js'));
  const cases = [], errors = [], ids = new Set();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.case.json')).sort()) {
      const file = path.relative(root, path.join(dir, f));
      let raw;
      try { raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch (e) { errors.push(file + ': not valid JSON'); continue; }
      try {
        const c = validateCase(raw, file);
        if (!opts.dev && /^synthetic/.test(c.id)) throw new Error(file + ': synthetic fixtures are never shipped in the live build');
        if (ids.has(c.id)) throw new Error(file + ': duplicate case id "' + c.id + '"');
        ids.add(c.id);
        cases.push(c);
      } catch (e) { errors.push(e.message); }
    }
  }
  if (errors.length) {
    const err = new Error('Case validation failed:\n  ' + errors.join('\n  '));
    err.caseErrors = errors;
    throw err;
  }
  return cases.sort((a, b) => (a.asOfDate < b.asOfDate ? -1 : a.asOfDate > b.asOfDate ? 1 : a.id < b.id ? -1 : 1));
}

function build(options){
  const opts = Object.assign({ dev: false }, options || {});
  const caseDirs = opts.caseDirs || [path.join(root, 'cases')].concat(opts.dev ? [path.join(root, 'test', 'support', 'cases')] : []);
  const outDir = opts.outDir || path.join(root, opts.dev ? 'docs-dev' : 'docs');
  const cases = loadCases(caseDirs, opts);
  const template = read('src/template.html');
  if (!template.includes('/*MODEL*/') || !template.includes('/*APP*/')) throw new Error('template.html must contain /*MODEL*/ and /*APP*/ placeholders');
  // The model is a CommonJS module for tests; strip the export line so it runs as a plain script in the page.
  const model = strip(read('src/model.js'));
  // The case library is inlined as data. "<" is escaped so no text in a case can close the script element.
  const casesJs = '// Case library, bundled at build time' + (opts.dev ? ' (DEV BUILD: includes synthetic fixtures, never published)' : '') + '.\n'
    + 'const CASES = ' + JSON.stringify(cases).replace(/</g, '\\u003c') + ';\n';
  const app = [strip(read('src/defaults.js')), strip(read('src/guide.js')), strip(read('src/cases.js')), casesJs,
    strip(read('src/modes.js')), strip(read('src/snapshots.js')), read('src/app.js')].join('\n');
  const out = template.replace('/*MODEL*/', () => model).replace('/*APP*/', () => app);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), out);
  return { file: path.join(outDir, 'index.html'), bytes: out.length, cases: cases.map(c => c.id) };
}

if (require.main === module) {
  // --cases=DIR and --out=DIR replace the case folders and the output folder (used by the tests).
  const arg = (k) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? path.resolve(a.slice(k.length + 3)) : undefined; };
  const dev = process.argv.includes('--dev');
  try {
    const r = build({ dev, caseDirs: arg('cases') ? [arg('cases')] : undefined, outDir: arg('out') });
    console.log('Built ' + path.relative(root, r.file) + ' (' + r.bytes + ' bytes, ' + r.cases.length + ' case' + (r.cases.length === 1 ? '' : 's') + (r.cases.length ? ': ' + r.cases.join(', ') : '') + ')');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
module.exports = { build, loadCases };
