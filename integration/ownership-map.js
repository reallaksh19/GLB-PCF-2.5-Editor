/**
 * integration/ownership-map.js
 * Enforced file ownership map for orchestrated multi-agent delivery.
 */
export const PROTECTED_FILES = Object.freeze([
  'js/tabs/viewer-tab.js',
  'js/ui/toolbar.js',
  'js/tabs/debug-tab.js',
  'core/app.js',
  'core/state.js',
]);

export const OWNERSHIP_MAP = Object.freeze({
  orchestrator: [
    'wi/',
    'orchestrator/',
    'integration/',
    'editor/command-types.js',
    'editor/command-handlers.js',
    'editor/history.js',
    'editor/route-contract.js',
    'hud/hud-contract.js',
    'data/masterdb-contract.js',
    'macro/macro-ir-contract.js',
    'core/app.js',
    'core/state.js',
    'core/event-bus.js',
    'tests/',
  ],
  ai1: ['js/tabs/viewer-tab.js', 'js/ui/toolbar.js', 'js/tabs/debug-tab.js', 'js/ui/component-panel.js'],
  ai2: ['editor/', 'domains/piping/geometry-builder.js', 'geometry/pipe-geometry.js'],
  ai3: ['hud/'],
  ai4: ['data/'],
  ai5: ['macro/', 'js/glb/exportToDXF.js'],
});
