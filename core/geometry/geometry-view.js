/**
 * core/geometry/geometry-view.js
 * Derive renderer-compatible geometry fields from Canonical Edit Graph anchors.
 */

import { AnchorRoles } from './anchor-roles.js';
import { clonePoint3, midpointPoint3, toPoint3 } from './point3.js';

export const GEOMETRY_VIEW_VERSION = 'M1-GEOMETRY-VIEW-1.0.0';

function safeObj(value) {
  return value && typeof value === 'object' ? value : {};
}

function mapComponentAnchors(component, graph) {
  const anchorIds = Array.isArray(component?.anchorIds) ? component.anchorIds : [];
  return anchorIds
    .map((anchorId) => {
      const anchor = graph?.anchors?.[anchorId];
      if (!anchor || !anchor.point) return null;
      return {
        id: anchorId,
        role: String(anchor.role || ''),
        point: toPoint3(anchor.point),
      };
    })
    .filter(Boolean);
}

function pickAnchorByRoles(mappedAnchors, roles) {
  const roleSet = new Set((roles || []).map((role) => String(role)));
  return mappedAnchors.find((anchor) => roleSet.has(anchor.role)) || null;
}

function pickNthAnchor(mappedAnchors, index) {
  if (!Array.isArray(mappedAnchors)) return null;
  if (!Number.isInteger(index)) return null;
  return mappedAnchors[index] || null;
}

function deriveOrigin(derived) {
  if (derived.origin) return derived.origin;
  if (derived.cp) return clonePoint3(derived.cp);
  if (derived.ep1 && derived.ep2) return midpointPoint3(derived.ep1, derived.ep2);
  if (derived.ep1) return clonePoint3(derived.ep1);
  if (derived.bp) return clonePoint3(derived.bp);
  return { x: 0, y: 0, z: 0 };
}

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function deriveLinear(mappedAnchors) {
  const ep1Anchor = pickAnchorByRoles(mappedAnchors, [AnchorRoles.EP1, AnchorRoles.RUN_IN]) || pickNthAnchor(mappedAnchors, 0);
  const ep2Anchor = pickAnchorByRoles(mappedAnchors, [AnchorRoles.EP2, AnchorRoles.RUN_OUT]) || pickNthAnchor(mappedAnchors, 1);
  return {
    ep1: ep1Anchor ? clonePoint3(ep1Anchor.point) : null,
    ep2: ep2Anchor ? clonePoint3(ep2Anchor.point) : null,
    cp: null,
    bp: null,
    origin: null,
  };
}

function deriveCurve(mappedAnchors) {
  const ep1Anchor = pickAnchorByRoles(mappedAnchors, [AnchorRoles.EP1, AnchorRoles.RUN_IN]) || pickNthAnchor(mappedAnchors, 0);
  const cpAnchor = pickAnchorByRoles(mappedAnchors, [AnchorRoles.CP]) || pickNthAnchor(mappedAnchors, 1);
  const ep2Anchor = pickAnchorByRoles(mappedAnchors, [AnchorRoles.EP2, AnchorRoles.RUN_OUT]) || pickNthAnchor(mappedAnchors, 2);
  return {
    ep1: ep1Anchor ? clonePoint3(ep1Anchor.point) : null,
    ep2: ep2Anchor ? clonePoint3(ep2Anchor.point) : null,
    cp: cpAnchor ? clonePoint3(cpAnchor.point) : null,
    bp: null,
    origin: null,
  };
}

function deriveTee(mappedAnchors) {
  const runInAnchor = pickAnchorByRoles(mappedAnchors, [AnchorRoles.RUN_IN, AnchorRoles.EP1]) || pickNthAnchor(mappedAnchors, 0);
  const runOutAnchor = pickAnchorByRoles(mappedAnchors, [AnchorRoles.RUN_OUT, AnchorRoles.EP2]) || pickNthAnchor(mappedAnchors, 1);
  const branchAnchor = pickAnchorByRoles(mappedAnchors, [AnchorRoles.BRANCH_OUT]) || pickNthAnchor(mappedAnchors, 2);
  return {
    ep1: runInAnchor ? clonePoint3(runInAnchor.point) : null,
    ep2: runOutAnchor ? clonePoint3(runOutAnchor.point) : null,
    cp: null,
    bp: branchAnchor ? clonePoint3(branchAnchor.point) : null,
    origin: null,
  };
}

function deriveOriginOnly(mappedAnchors) {
  const originAnchor = pickAnchorByRoles(mappedAnchors, [
    AnchorRoles.ORIGIN,
    AnchorRoles.SUPPORT_ORIGIN,
    AnchorRoles.ANNOTATION_ORIGIN,
  ]) || pickNthAnchor(mappedAnchors, 0);
  return {
    ep1: null,
    ep2: null,
    cp: null,
    bp: null,
    origin: originAnchor ? clonePoint3(originAnchor.point) : { x: 0, y: 0, z: 0 },
  };
}

function deriveGuidePoints(mappedAnchors) {
  const guideRoles = new Set([AnchorRoles.CONTROL_POINT, AnchorRoles.FIT_POINT, AnchorRoles.ORIGIN]);
  const points = mappedAnchors
    .filter((anchor) => guideRoles.has(anchor.role) || !anchor.role)
    .map((anchor) => clonePoint3(anchor.point));
  return points;
}

function deriveGeometryByType(component, mappedAnchors) {
  const type = String(component?.type || '').toUpperCase();
  if (type === 'LINE' || type === 'PIPE') return deriveLinear(mappedAnchors);
  if (type === 'ARC' || type === 'ELBOW' || type === 'BEND') return deriveCurve(mappedAnchors);
  if (type === 'TEE' || type === 'EQUAL-TEE' || type === 'REDUCING-TEE' || type === 'OLET') return deriveTee(mappedAnchors);
  if (type === 'GUIDE' || type === 'SPLINE') {
    const linear = deriveLinear(mappedAnchors);
    return {
      ...linear,
      points: deriveGuidePoints(mappedAnchors),
      origin: null,
    };
  }
  return deriveOriginOnly(mappedAnchors);
}

function buildWarnings(component, mappedAnchors) {
  const warnings = [];
  const type = String(component?.type || '').toUpperCase();
  if ((type === 'LINE' || type === 'PIPE') && mappedAnchors.length < 2) {
    warnings.push('LINEAR_COMPONENT_HAS_FEWER_THAN_TWO_ANCHORS');
  }
  if ((type === 'ARC' || type === 'ELBOW' || type === 'BEND') && mappedAnchors.length < 3) {
    warnings.push('CURVE_COMPONENT_HAS_FEWER_THAN_THREE_ANCHORS');
  }
  return warnings;
}

function copyCurveDerivedFields(geometry, component) {
  const derived = safeObj(component?.derived);
  const radius = toNumberOrNull(derived.radius);
  const startAngle = toNumberOrNull(derived.startAngle);
  const endAngle = toNumberOrNull(derived.endAngle);
  const bulge = toNumberOrNull(derived.bulge);

  if (radius !== null) geometry.radius = radius;
  if (startAngle !== null) geometry.startAngle = startAngle;
  if (endAngle !== null) geometry.endAngle = endAngle;
  if (bulge !== null) geometry.bulge = bulge;
  if (derived.clockwise != null) geometry.clockwise = Boolean(derived.clockwise);
  if (derived.closed != null) geometry.closed = Boolean(derived.closed);
}

/**
 * Derive renderer-compatible geometry for one CEG component.
 */
export function componentToGeometryView(component, graph) {
  const mappedAnchors = mapComponentAnchors(component, graph);
  const raw = deriveGeometryByType(component, mappedAnchors);
  const attributes = safeObj(component?.attributes);
  const derived = safeObj(component?.derived);
  const geometry = {
    origin: deriveOrigin(raw),
    ep1: raw.ep1 || null,
    ep2: raw.ep2 || null,
    cp: raw.cp || null,
    bp: raw.bp || null,
    bore: toNumberOrNull(derived.bore ?? attributes.BORE ?? attributes.OD ?? null),
    size: null,
  };
  if (Array.isArray(raw.points) && raw.points.length) {
    geometry.points = raw.points;
  }
  if (['ARC', 'ELBOW', 'BEND'].includes(String(component?.type || '').toUpperCase())) {
    copyCurveDerivedFields(geometry, component);
  }
  return {
    geometry,
    warnings: buildWarnings(component, mappedAnchors),
    anchorMap: mappedAnchors.map((anchor) => ({
      id: anchor.id,
      role: anchor.role,
      point: clonePoint3(anchor.point),
    })),
  };
}

/**
 * Convert an entire CEG into GenericComponent[] for existing renderer/export paths.
 */
export function graphToGenericComponents(graph) {
  const components = Object.values(graph?.components || {});
  return components.map((component) => {
    const derivedView = componentToGeometryView(component, graph);
    const sourceRef = safeObj(component.sourceRef);
    const diagnostics = Array.isArray(component.diagnostics) ? component.diagnostics.map((item) => String(item)) : [];
    return {
      id: String(component.id),
      type: String(component.type || 'UNKNOWN'),
      label: component.label || `${component.type || 'UNKNOWN'} ${component.id}`,
      geometry: derivedView.geometry,
      attributes: safeObj(component.attributes),
      metadata: {
        source: {
          ...sourceRef,
          componentId: component.id,
          anchorIds: Array.isArray(component.anchorIds) ? [...component.anchorIds] : [],
        },
        squareText: null,
        squarePos: null,
        circleText: null,
        circleCoord: null,
        warnings: [...derivedView.warnings, ...diagnostics],
      },
    };
  });
}
