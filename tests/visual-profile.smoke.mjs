import assert from 'node:assert/strict';
import {
  DEFAULT_VISUAL_PROFILE,
  VISUAL_PROFILES,
  isDraft2dProfile,
  isLineDiagramProfile,
  isSolid3dProfile,
  isVisualProfile,
  isWireframeProfile,
  makeViewerVisualSettings,
  normalizeVisualProfile,
  resolveVisualProfile,
  setVisualProfile,
  toggleLineDiagram,
  visualProfileIcon,
  visualProfileLabel,
} from '../core/view/visual-profile.js';

assert.equal(DEFAULT_VISUAL_PROFILE, VISUAL_PROFILES.SOLID_3D);

assert.equal(isVisualProfile('solid3d'), true);
assert.equal(isVisualProfile('draft2d'), true);
assert.equal(isVisualProfile('wireframe'), true);
assert.equal(isVisualProfile('lineDiagram'), true);
assert.equal(isVisualProfile('bad-profile'), false);

assert.equal(normalizeVisualProfile('solid'), VISUAL_PROFILES.SOLID_3D);
assert.equal(normalizeVisualProfile('3d'), VISUAL_PROFILES.SOLID_3D);
assert.equal(normalizeVisualProfile('draft'), VISUAL_PROFILES.DRAFT_2D);
assert.equal(normalizeVisualProfile('2d'), VISUAL_PROFILES.DRAFT_2D);
assert.equal(normalizeVisualProfile('wire'), VISUAL_PROFILES.WIREFRAME);
assert.equal(normalizeVisualProfile('stick'), VISUAL_PROFILES.LINE_DIAGRAM);
assert.equal(normalizeVisualProfile('line'), VISUAL_PROFILES.LINE_DIAGRAM);
assert.equal(normalizeVisualProfile('lineDiagram'), VISUAL_PROFILES.LINE_DIAGRAM);

assert.equal(resolveVisualProfile({}), VISUAL_PROFILES.SOLID_3D);
assert.equal(resolveVisualProfile({ visualProfile: 'draft2d' }), VISUAL_PROFILES.DRAFT_2D);
assert.equal(resolveVisualProfile({ visualProfile: 'wireframe' }), VISUAL_PROFILES.WIREFRAME);
assert.equal(resolveVisualProfile({ visualProfile: 'lineDiagram' }), VISUAL_PROFILES.LINE_DIAGRAM);

assert.equal(resolveVisualProfile({
  visualProfile: 'solid3d',
  wireframe: true,
  lineDiagram: true,
}), VISUAL_PROFILES.LINE_DIAGRAM);

assert.equal(resolveVisualProfile({ lineDiagramEnabled: true }), VISUAL_PROFILES.LINE_DIAGRAM);
assert.equal(resolveVisualProfile({ wireframe: true }), VISUAL_PROFILES.WIREFRAME);
assert.equal(resolveVisualProfile({ draft2d: true }), VISUAL_PROFILES.DRAFT_2D);
assert.equal(resolveVisualProfile({ solid3d: true }), VISUAL_PROFILES.SOLID_3D);

assert.equal(isLineDiagramProfile('stick'), true);
assert.equal(isDraft2dProfile('draft2d'), true);
assert.equal(isWireframeProfile('wireframe'), true);
assert.equal(isSolid3dProfile('solid3d'), true);

const lineSettings = setVisualProfile({}, 'lineDiagram');
assert.equal(lineSettings.visualProfile, VISUAL_PROFILES.LINE_DIAGRAM);
assert.equal(lineSettings.lineDiagram, true);
assert.equal(lineSettings.lineDiagramEnabled, true);
assert.equal(lineSettings.wireframe, false);
assert.equal(lineSettings.draft2d, false);
assert.equal(lineSettings.solid3d, false);

const wireSettings = setVisualProfile(lineSettings, 'wireframe');
assert.equal(wireSettings.visualProfile, VISUAL_PROFILES.WIREFRAME);
assert.equal(wireSettings.lineDiagram, false);
assert.equal(wireSettings.lineDiagramEnabled, false);
assert.equal(wireSettings.wireframe, true);

const toggleOn = toggleLineDiagram({}, true);
assert.equal(toggleOn.visualProfile, VISUAL_PROFILES.LINE_DIAGRAM);
assert.equal(toggleOn.lineDiagramEnabled, true);

const toggleOff = toggleLineDiagram(toggleOn, false);
assert.equal(toggleOff.visualProfile, VISUAL_PROFILES.DRAFT_2D);
assert.equal(toggleOff.lineDiagramEnabled, false);

const made = makeViewerVisualSettings({ visualProfile: 'draft2d' });
assert.equal(made.visualProfile, VISUAL_PROFILES.DRAFT_2D);
assert.equal(made.draft2d, true);
assert.equal(made.solid3d, false);

assert.equal(visualProfileLabel('lineDiagram'), 'Line diagram');
assert.equal(visualProfileLabel('draft2d'), 'Draft 2D');
assert.equal(visualProfileLabel('wireframe'), 'Wireframe');
assert.equal(visualProfileLabel('solid3d'), 'Solid 3D');

assert.equal(visualProfileIcon('lineDiagram'), 'line');
assert.equal(visualProfileIcon('draft2d'), 'plan');
assert.equal(visualProfileIcon('wireframe'), 'wire');
assert.equal(visualProfileIcon('solid3d'), 'solid');

console.log('PASS visual-profile.smoke.mjs');
