/**
 * Pure route-render reconciliation helpers.
 *
 * This module intentionally has no THREE/browser dependency so it can be tested
 * with Node smoke tests.
 */

function stableNormalize(value) {
  if (value == null) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }

  if (typeof value === 'object') {
    const out = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        const normalized = stableNormalize(value[key]);
        if (normalized !== undefined) out[key] = normalized;
      });
    return out;
  }

  return String(value);
}

export function stableComponentFingerprint(comp = {}) {
  return JSON.stringify(stableNormalize({
    id: comp.id || '',
    type: comp.type || '',
    label: comp.label || '',
    geometry: comp.geometry || {},
    attributes: comp.attributes || {},
    metadataSource: comp.metadata?.source || null,
  }));
}

export function isRouteDerivedComponent(comp = {}) {
  const id = String(comp.id || '');
  const attrs = comp.attributes || {};
  const source = attrs.SOURCE || attrs.source || comp.metadata?.source?.source || '';

  return (
    id.startsWith('route:') ||
    source === 'route-engine' ||
    source === 'route-engine-inline' ||
    Boolean(attrs.ROUTE_ID || attrs['ROUTE_ID'] || comp.metadata?.source?.routeId)
  );
}

export function buildRouteRenderSnapshot(components = []) {
  const snapshot = new Map();

  for (const comp of components || []) {
    if (!comp?.id) continue;
    if (!isRouteDerivedComponent(comp)) continue;

    snapshot.set(comp.id, stableComponentFingerprint(comp));
  }

  return snapshot;
}

export function normalizeRouteRenderSnapshot(snapshot) {
  if (snapshot instanceof Map) return new Map(snapshot);

  if (snapshot && typeof snapshot === 'object') {
    return new Map(Object.entries(snapshot));
  }

  return new Map();
}

export function diffRouteRenderSnapshot(previousSnapshot, nextRouteComponents = []) {
  const prev = normalizeRouteRenderSnapshot(previousSnapshot);
  const nextSnapshot = buildRouteRenderSnapshot(nextRouteComponents);

  const added = [];
  const updated = [];
  const removedIds = [];

  for (const comp of nextRouteComponents || []) {
    if (!comp?.id) continue;
    if (!isRouteDerivedComponent(comp)) continue;

    const nextFp = nextSnapshot.get(comp.id);
    const prevFp = prev.get(comp.id);

    if (!prev.has(comp.id)) {
      added.push(comp);
    } else if (prevFp !== nextFp) {
      updated.push(comp);
    }
  }

  for (const id of prev.keys()) {
    if (!nextSnapshot.has(id)) {
      removedIds.push(id);
    }
  }

  return {
    added,
    updated,
    removedIds,
    nextSnapshot,
    changed: added.length > 0 || updated.length > 0 || removedIds.length > 0,
  };
}

export function summarizeRouteRenderDiff(diff = {}) {
  return {
    added: diff.added?.length || 0,
    updated: diff.updated?.length || 0,
    removed: diff.removedIds?.length || 0,
    changed: Boolean(diff.changed),
  };
}
