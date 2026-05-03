import { clampLength } from './hud-format.js';

export function buildAxisDelta(axis = 'X', lengthMm = 1000, sign = 1) {
  const len = clampLength(lengthMm, 1000) * (sign < 0 ? -1 : 1);
  switch (String(axis || 'X').toUpperCase()) {
    case 'Y':
      return { dx: 0, dy: len, dz: 0 };
    case 'Z':
      return { dx: 0, dy: 0, dz: len };
    case 'X':
    default:
      return { dx: len, dy: 0, dz: 0 };
  }
}

export function computePreviewPoint(anchorPoint, axis = 'X', lengthMm = 1000, sign = 1) {
  const anchor = anchorPoint || { x: 0, y: 0, z: 0 };
  const delta = buildAxisDelta(axis, lengthMm, sign);
  return {
    x: anchor.x + delta.dx,
    y: anchor.y + delta.dy,
    z: anchor.z + delta.dz,
  };
}

export function getActiveRouteAnchor(shellApi) {
  const route = shellApi?.getRouteEngine?.()?.getActiveRoute?.();
  if (route?.nodes?.length) return { ...route.nodes[route.nodes.length - 1] };

  const selected = shellApi?.getSelectedComponent?.();
  const selectedOrigin = selected?.geometry?.origin || selected?.geometry?.ep2 || selected?.geometry?.ep1 || null;
  if (selectedOrigin) return { ...selectedOrigin };

  return { x: 0, y: 0, z: 0 };
}

export async function commitLineDraft(hudState, shellApi) {
  const draft = hudState?.draft || {};
  const axis = String(draft.axis || hudState.axisLock || 'X').toUpperCase();
  const sign = draft.sign < 0 ? -1 : 1;
  const lengthMm = clampLength(draft.lengthMm, 1000);
  const anchor = draft.anchorPoint || getActiveRouteAnchor(shellApi);

  let routeId = draft.routeId || shellApi?.getRouteEngine?.()?.getActiveRoute?.()?.id || null;
  if (!routeId) {
    routeId = shellApi?.startRouteAt?.(anchor, {
      size: draft.size || draft.bore || '100',
      rating: draft.rating || '',
      pipelineRef: draft.pipelineRef || '',
    }, { source: 'hud-start-route' });
  }

  if (axis === 'Z') {
    if (sign >= 0) shellApi?.riseRoute?.(lengthMm, routeId, { source: 'hud-enter' });
    else shellApi?.dropRoute?.(lengthMm, routeId, { source: 'hud-enter' });
  } else {
    const delta = buildAxisDelta(axis, lengthMm, sign);
    shellApi?.addRouteDelta?.({ routeId, ...delta }, { source: 'hud-enter' });
  }

  const nextAnchor = getActiveRouteAnchor(shellApi);
  return {
    routeId,
    anchorPoint: nextAnchor,
    previewPoint: computePreviewPoint(nextAnchor, axis, lengthMm, sign),
    lastLengthMm: lengthMm,
  };
}
