/*
 * Canonical visual profile contract.
 *
 * This file intentionally contains no renderer code.
 * It only defines stable profile names and compatibility helpers.
 */

export const VISUAL_PROFILES = Object.freeze({
  SOLID_3D: 'solid3d',
  DRAFT_2D: 'draft2d',
  WIREFRAME: 'wireframe',
  LINE_DIAGRAM: 'lineDiagram',
});

export const DEFAULT_VISUAL_PROFILE = VISUAL_PROFILES.SOLID_3D;

const LEGACY_PROFILE_ALIASES = Object.freeze({
  solid: VISUAL_PROFILES.SOLID_3D,
  solid3D: VISUAL_PROFILES.SOLID_3D,
  '3d': VISUAL_PROFILES.SOLID_3D,

  draft: VISUAL_PROFILES.DRAFT_2D,
  draft2D: VISUAL_PROFILES.DRAFT_2D,
  '2d': VISUAL_PROFILES.DRAFT_2D,

  wire: VISUAL_PROFILES.WIREFRAME,

  stick: VISUAL_PROFILES.LINE_DIAGRAM,
  line: VISUAL_PROFILES.LINE_DIAGRAM,
  lineDiagram: VISUAL_PROFILES.LINE_DIAGRAM,
});

export function isVisualProfile(value) {
  return Object.values(VISUAL_PROFILES).includes(value);
}

export function normalizeVisualProfile(value, fallback = DEFAULT_VISUAL_PROFILE) {
  if (isVisualProfile(value)) return value;

  const key = String(value || '').trim();
  if (Object.prototype.hasOwnProperty.call(LEGACY_PROFILE_ALIASES, key)) {
    return LEGACY_PROFILE_ALIASES[key];
  }

  return fallback;
}

export function isLineDiagramProfile(value) {
  return normalizeVisualProfile(value) === VISUAL_PROFILES.LINE_DIAGRAM;
}

export function isDraft2dProfile(value) {
  return normalizeVisualProfile(value) === VISUAL_PROFILES.DRAFT_2D;
}

export function isWireframeProfile(value) {
  return normalizeVisualProfile(value) === VISUAL_PROFILES.WIREFRAME;
}

export function isSolid3dProfile(value) {
  return normalizeVisualProfile(value) === VISUAL_PROFILES.SOLID_3D;
}

export function resolveVisualProfile(settings = {}) {
  if (settings?.lineDiagram === true || settings?.lineDiagramEnabled === true) {
    return VISUAL_PROFILES.LINE_DIAGRAM;
  }

  if (settings?.visualProfile != null) {
    return normalizeVisualProfile(settings.visualProfile);
  }

  if (settings?.wireframe === true) {
    return VISUAL_PROFILES.WIREFRAME;
  }

  if (settings?.draft2d === true) {
    return VISUAL_PROFILES.DRAFT_2D;
  }

  if (settings?.solid3d === true) {
    return VISUAL_PROFILES.SOLID_3D;
  }

  return DEFAULT_VISUAL_PROFILE;
}

export function makeViewerVisualSettings(settings = {}) {
  const visualProfile = resolveVisualProfile(settings);

  return {
    ...settings,
    visualProfile,
    lineDiagram: visualProfile === VISUAL_PROFILES.LINE_DIAGRAM,
    lineDiagramEnabled: visualProfile === VISUAL_PROFILES.LINE_DIAGRAM,
    wireframe: visualProfile === VISUAL_PROFILES.WIREFRAME,
    draft2d: visualProfile === VISUAL_PROFILES.DRAFT_2D,
    solid3d: visualProfile === VISUAL_PROFILES.SOLID_3D,
  };
}

export function setVisualProfile(settings = {}, profile) {
  return makeViewerVisualSettings({
    ...settings,
    visualProfile: normalizeVisualProfile(profile),
    lineDiagram: false,
    lineDiagramEnabled: false,
    wireframe: false,
    draft2d: false,
    solid3d: false,
  });
}

export function toggleLineDiagram(settings = {}, enabled = undefined) {
  const current = resolveVisualProfile(settings);

  const nextEnabled = enabled == null
    ? current !== VISUAL_PROFILES.LINE_DIAGRAM
    : Boolean(enabled);

  return setVisualProfile(
    settings,
    nextEnabled ? VISUAL_PROFILES.LINE_DIAGRAM : VISUAL_PROFILES.DRAFT_2D
  );
}

export function visualProfileLabel(profile) {
  switch (normalizeVisualProfile(profile)) {
    case VISUAL_PROFILES.LINE_DIAGRAM:
      return 'Line diagram';
    case VISUAL_PROFILES.DRAFT_2D:
      return 'Draft 2D';
    case VISUAL_PROFILES.WIREFRAME:
      return 'Wireframe';
    case VISUAL_PROFILES.SOLID_3D:
    default:
      return 'Solid 3D';
  }
}

export function visualProfileIcon(profile) {
  switch (normalizeVisualProfile(profile)) {
    case VISUAL_PROFILES.LINE_DIAGRAM:
      return 'line';
    case VISUAL_PROFILES.DRAFT_2D:
      return 'plan';
    case VISUAL_PROFILES.WIREFRAME:
      return 'wire';
    case VISUAL_PROFILES.SOLID_3D:
    default:
      return 'solid';
  }
}
