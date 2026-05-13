import assert from 'node:assert/strict';
import fs from 'node:fs';

const sceneRenderer = fs.readFileSync('js/renderer/scene-renderer.js', 'utf8');
const viewerTab = fs.readFileSync('js/tabs/viewer-tab.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function mustContain(source, text, label = text) {
  assert.ok(source.includes(text), `Missing ${label}`);
}

[
  '_disposeObjectTree',
  '_objectTreeHasComponent',
  'removeComponentById',
  'replaceComponent',
  'reconcileComponents',
  'options.allComponents',
].forEach((text) => mustContain(sceneRenderer, text, `scene-renderer ${text}`));

[
  '../renderer/route-render-reconciler.js',
  'buildRouteRenderSnapshot',
  'diffRouteRenderSnapshot',
  'summarizeRouteRenderDiff',
  '_routeRenderSnapshot',
  'ROUTE_RENDER_RECONCILE',
  'route-engine-reconcile',
].forEach((text) => mustContain(viewerTab, text, `viewer-tab ${text}`));

assert.ok(
  !viewerTab.includes('const newComps = allDerived.filter(c => !_knownRouteCompIds.has(c.id));'),
  'viewer-tab must not use add-only route sync after Slice 10'
);

[
  'test:route-render-reconciler',
  'test:scene-renderer-reconcile-contract',
  'test:slice10',
].forEach((text) => mustContain(pkg, text, `package ${text}`));

console.log('PASS scene-renderer-reconcile-contract.smoke.mjs');