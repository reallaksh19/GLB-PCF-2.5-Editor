import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cegToUxmlXml, uxmlToCeg } from '../formats/uxml/ceg-uxml-bridge.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(HERE, 'fixtures/phase08-editor-native-ceg.json'), 'utf8'));

test('editor-native CEG exports to UXML XML', () => {
  const xml = cegToUxmlXml(fixture);
  assert.ok(xml.includes('schemaVersion="uxml-topology-v1"'), 'UXML schema version present');
  assert.ok(xml.startsWith('<UXML'), 'UXML root element');
});

test('CEG → UXML → CEG round-trip is stable (topology-preserving)', () => {
  // First conversion canonicalizes through the package loss contract; the
  // round-trip of the canonicalized CEG must then be stable.
  const xml1 = cegToUxmlXml(fixture);
  const { ceg: ceg1 } = uxmlToCeg(xml1, { name: 'rt-1' });
  const xml2 = cegToUxmlXml(ceg1);
  const { ceg: ceg2 } = uxmlToCeg(xml2, { name: 'rt-2' });

  const ids1 = Object.keys(ceg1.components).sort();
  const ids2 = Object.keys(ceg2.components).sort();
  assert.deepEqual(ids2, ids1, 'component ids stable across round-trip');

  const anchorIds1 = Object.keys(ceg1.anchors).sort();
  const anchorIds2 = Object.keys(ceg2.anchors).sort();
  assert.deepEqual(anchorIds2, anchorIds1, 'anchor ids stable across round-trip');

  for (const id of anchorIds1) {
    const a = ceg1.anchors[id].point;
    const b = ceg2.anchors[id].point;
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(Math.abs((a[axis] ?? 0) - (b[axis] ?? 0)) < 1e-9, `anchor ${id}.${axis} preserved`);
    }
  }

  for (const id of ids1) {
    assert.equal(ceg2.components[id].type, ceg1.components[id].type, `component ${id} type stable`);
    assert.deepEqual(
      [...ceg2.components[id].anchorIds].sort(),
      [...ceg1.components[id].anchorIds].sort(),
      `component ${id} anchorIds stable`
    );
  }
});

test('uxmlToCeg returns renderer-compatible generic components', () => {
  const xml = cegToUxmlXml(fixture);
  const { components, enrichment } = uxmlToCeg(xml, { name: 'rt-render' });
  assert.ok(components.length > 0, 'generic components produced');
  for (const comp of components) {
    assert.ok(comp.id, 'component id');
    assert.ok(comp.geometry && typeof comp.geometry === 'object', 'geometry object present');
  }
  assert.ok(Number.isInteger(enrichment.enriched) && Number.isInteger(enrichment.missed));
});
