import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSourceBoundaries } from '../../../integration/cad/source-boundary-guard.mjs';
function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-boundary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}
test('empty source packages are NOT_APPLICABLE', t => {
  assert.equal(checkSourceBoundaries(fixture(t, {})).status, 'NOT_APPLICABLE');
});
for (const source of ["import 'three';", "import(\n 'three'\n);", "export { x } from 'three';", "require('three');", "import {\n Vector3\n} from 'three';"]) {
  test('rejects forbidden import form: ' + source, t => {
    const r = checkSourceBoundaries(fixture(t, { 'formats/dxf/model/doc.js': source }));
    assert.ok(r.violations.some(v => v.code === 'FORBIDDEN_IMPORT'));
  });
}
test('resolved transitive helper cannot hide CEG', t => {
  const r = checkSourceBoundaries(fixture(t, {
    'formats/dxf/parser/read.js': "import './helper.js';",
    'formats/dxf/parser/helper.js': "import '../../../core/ceg/index.js';",
    'core/ceg/index.js': 'export const x = 1;',
  }));
  assert.ok(r.violations.some(v => v.code === 'FORBIDDEN_IMPORT'));
});
test('catches DOM/scalers, ignoring comments/strings and locally bound names', t => {
  const bad = checkSourceBoundaries(fixture(t, { 'formats/dxf/model/doc.js': "globalThis['document'].createElement('div'); scalePointToMm(p);" }));
  assert.ok(bad.violations.some(v => v.code === 'DOM_DEPENDENCY'));
  assert.ok(bad.violations.some(v => v.code === 'SOURCE_UNIT_SCALER'));
  const good = checkSourceBoundaries(fixture(t, { 'formats/dxf/model/doc.js': "// import 'three'; scalePointToMm(p);\nconst text = 'document'; export function read(document) { return document; }" }));
  assert.deepEqual(good.violations, []);
  assert.equal(good.status, 'PASS');
});
test('unresolvable dynamic dependencies fail closed', t => {
  assert.ok(checkSourceBoundaries(fixture(t, { 'formats/dxf/parser/read.js': 'import(moduleName);' })).violations.some(v => v.code === 'UNRESOLVED_DYNAMIC_IMPORT'));
});
test('invalid JavaScript fails closed', t => {
  assert.ok(checkSourceBoundaries(fixture(t, { 'formats/dxf/model/doc.js': 'export const =' })).violations.some(v => v.code === 'INVALID_JAVASCRIPT'));
});
