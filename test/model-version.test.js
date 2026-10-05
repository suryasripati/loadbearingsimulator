// Guards MODEL_VERSION: the model is run on a fixed canonical input set (sustaining and vintage capex, Definitions
// A and B, entry years 0 and 3) and compared with a stored fixture tied to the version number. If the maths changes
// without a version bump, this fails and says what to do.
const test = require('node:test');
const assert = require('node:assert/strict');
const { MODEL_VERSION } = require('../src/model.js');
const { canonicalOutputs } = require('./support/canonical.js');
const fixture = require('./fixtures/model_outputs.json');

const HOW = 'If the change to the maths is deliberate: bump MODEL_VERSION in src/model.js, run `npm run fixture:model`, and say so in the commit message.';

test('model version fixture: stored fixture matches MODEL_VERSION', () => {
  assert.equal(fixture.modelVersion, MODEL_VERSION,
    'MODEL_VERSION is ' + MODEL_VERSION + ' but test/fixtures/model_outputs.json was made for version ' + fixture.modelVersion + '. Run `npm run fixture:model` to regenerate it for the new version.');
});

test('model version fixture: outputs on the canonical inputs have not changed without a version bump', () => {
  const now = canonicalOutputs();
  assert.deepEqual(Object.keys(now).sort(), Object.keys(fixture.outputs).sort(), 'The canonical case list changed. ' + HOW);
  const diffs = [];
  for (const key of Object.keys(now)) now[key].forEach((o, i) => {
    const f = fixture.outputs[key][i];
    for (const k of Object.keys(o)) {
      const a = o[k], b = f[k];
      const same = (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)) : JSON.stringify(a) === JSON.stringify(b);
      if (!same) diffs.push(key + ' ' + o.id + '.' + k + ': fixture ' + JSON.stringify(b) + ', now ' + JSON.stringify(a));
    }
  });
  assert.equal(diffs.length, 0, 'Model outputs changed without a MODEL_VERSION bump (' + diffs.length + ' values), e.g.\n  ' + diffs.slice(0, 5).join('\n  ') + '\n' + HOW);
});
