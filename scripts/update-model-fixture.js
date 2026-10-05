// Regenerates test/fixtures/model_outputs.json from the canonical input set under the current MODEL_VERSION.
// Run only after a deliberate change to the maths, and bump MODEL_VERSION in src/model.js first.
// Run: npm run fixture:model
const fs = require('fs');
const path = require('path');
const { MODEL_VERSION } = require('../src/model.js');
const { canonicalOutputs } = require('../test/support/canonical.js');
const out = { modelVersion: MODEL_VERSION, note: 'Canonical model outputs. Regenerate only with a MODEL_VERSION bump.', outputs: canonicalOutputs() };
const file = path.join(__dirname, '..', 'test', 'fixtures', 'model_outputs.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log('Wrote ' + path.relative(process.cwd(), file) + ' for model version ' + MODEL_VERSION + ' (' + Object.keys(out.outputs).length + ' cases)');
