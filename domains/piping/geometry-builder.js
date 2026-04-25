import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  buildPipeDraft, buildBendDraft, buildTeeDraft,
  buildFlangeDraft, buildValveDraft, buildGenericDraft
} from '../../js/vendor/buildDraftingScene.js';
import {
  createMessageCircleLabel,
  createMessageSquareLabel,
  createSupportLabel,
} from '../../geometry/labels.js';

const MESH_DISPATCH = {
  'PIPE':                buildPipeDraft,
  'ELBOW':               buildBendDraft,
  'BEND':                buildBendDraft,
  'TEE':                 buildTeeDraft,
  'EQUAL-TEE':           buildTeeDraft,
  'REDUCING-TEE':        buildTeeDraft,
  'OLET':                buildTeeDraft,
  'WELDOLET':            buildTeeDraft,
  'SOCKOLET':            buildTeeDraft,
  'THREADOLET':          buildTeeDraft,
  'FLANGE':              buildFlangeDraft,
  'BLIND-FLANGE':        buildFlangeDraft,
  'VALVE':               buildValveDraft,
  'CHECK-VALVE':         buildValveDraft,
  'CONTROL-VALVE':       buildValveDraft,
  'SAFETY-VALVE':        buildValveDraft,
  'REDUCER':             buildGenericDraft,
  'CONCENTRIC-REDUCER':  buildGenericDraft,
  'ECCENTRIC-REDUCER':   buildGenericDraft,
  'CAP':                 buildGenericDraft,
  'COUPLING':            buildGenericDraft,
  'UNION':               buildGenericDraft,
  'CROSS':               buildGenericDraft,
  'GASKET':              buildGenericDraft,
  'STRAINER':            buildGenericDraft,
  'FILTER':              buildGenericDraft,
  'INSTRUMENT':          buildGenericDraft,
  'SUPPORT':             null,           // handled by buildSymbol
  'MESSAGE-CIRCLE':      null,           // label-only
  'MESSAGE-SQUARE':      null,           // label-only
};

export function buildMesh(comp, theme) {
  const builder = MESH_DISPATCH[comp.type];
  if (builder === undefined) return buildGenericDraft(comp, theme);  // unknown type
  if (builder === null)      return null;                             // intentionally no mesh
  return builder(comp, theme);
}

export function buildLabel(comp) {
  switch (comp.type) {
    case 'MESSAGE-CIRCLE':
      return comp.metadata.circleText
        ? createMessageCircleLabel(comp.metadata.circleText, comp.geometry.origin)
        : null;
    case 'MESSAGE-SQUARE':
      return comp.metadata.squareText
        ? createMessageSquareLabel(comp.metadata.squareText, comp.metadata.squarePos || comp.geometry.origin)
        : null;
    case 'SUPPORT': {
      const name = comp.attributes['<SUPPORT_NAME>'] || comp.attributes['SUPPORT_NAME'] || comp.attributes['SUPPORT-NAME'];
      return name ? createSupportLabel(name, comp.geometry.origin) : null;
    }
    default:
      return null;
  }
}
