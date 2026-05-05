/*
 * core/commands/geometry-commands.js
 *
 * Pure geometry mutations for each command type.
 * Every function takes a CEG and returns a NEW CEG — no in-place mutation.
 */

import { add as addVec }                          from '../geometry/vectors.js';
import { updateAnchor, isAnchorReferenced }       from '../geometry/anchors.js';
import { extendLinear }                           from '../geometry/linear-ops.js';

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ── moveAnchors ────────────────────────────────────────────────────────────

export function moveAnchors(graph, anchorIds, delta) {
  let anchors     = graph.anchors;
  const diags     = [];

  for (const id of anchorIds) {
    const anchor = anchors[id];
    if (!anchor) {
      diags.push({ code: 'ANCHOR_NOT_FOUND', message: `Anchor ${id} does not exist`, anchorId: id });
      continue;
    }
    if (anchor.locked) {
      diags.push({ code: 'ANCHOR_LOCKED', message: `Anchor ${id} is locked`, anchorId: id });
      continue;
    }
    const newAnchor = { ...anchor, point: addVec(anchor.point, delta) };
    anchors = updateAnchor({ anchors }, id, newAnchor);
  }

  const next = { ...graph, anchors };
  if (diags.length) next.diagnostics = (graph.diagnostics || []).concat(diags);
  return next;
}

// ── moveComponents ─────────────────────────────────────────────────────────

export function moveComponents(graph, componentIds, delta) {
  const anchorIds = [];
  for (const compId of componentIds) {
    const comp = graph.components[compId];
    if (comp && Array.isArray(comp.anchorIds)) anchorIds.push(...comp.anchorIds);
  }
  return moveAnchors(graph, anchorIds, delta);
}

// ── extendLinearComponent ──────────────────────────────────────────────────

export function extendLinearComponent(graph, componentId, endpoint, newLength) {
  const diag = (code, message, extra = {}) => {
    const next = { ...graph };
    next.diagnostics = (graph.diagnostics || []).concat({ code, message, componentId, ...extra });
    return next;
  };

  const comp = graph.components[componentId];
  if (!comp)                              return diag('COMPONENT_NOT_FOUND', `Component ${componentId} not found`);
  if (!comp.capabilities?.canExtend)      return diag('EXTEND_NOT_SUPPORTED', `Component ${componentId} cannot be extended`);
  if (newLength <= 0 || !Number.isFinite(newLength)) return diag('INVALID_LENGTH', 'Length must be positive');

  const [aId, bId] = comp.anchorIds || [];
  if (!aId || !bId) return diag('MISSING_ANCHORS', `Component ${componentId} does not have two anchors`);

  const movingId = endpoint || bId;
  const fixedId  = movingId === aId ? bId : aId;
  const fixed    = graph.anchors[fixedId];
  const moving   = graph.anchors[movingId];
  if (!fixed || !moving) return diag('ANCHOR_NOT_FOUND', `Anchors missing on component ${componentId}`);
  if (moving.locked)     return diag('ANCHOR_LOCKED', `Anchor ${movingId} is locked`, { anchorId: movingId });

  const newPos = extendLinear(fixed.point, moving.point, newLength);
  return { ...graph, anchors: { ...graph.anchors, [movingId]: { ...moving, point: newPos } } };
}

// ── stretchAnchors ─────────────────────────────────────────────────────────

export function stretchAnchors(graph, anchorIds, delta) {
  let anchors  = { ...graph.anchors };
  const warns  = [];

  for (const id of anchorIds) {
    const anchor = anchors[id];
    if (!anchor) {
      warns.push({ code: 'ANCHOR_NOT_FOUND', message: `Anchor ${id} not found`, anchorId: id });
      continue;
    }
    if (anchor.locked) {
      warns.push({ code: 'ANCHOR_LOCKED', message: `Anchor ${id} is locked`, anchorId: id });
      continue;
    }
    if (Array.isArray(anchor.connectedTo) && anchor.connectedTo.length) {
      warns.push({ code: 'CONNECTED_ANCHOR', message: `Anchor ${id} has connected anchors; they will not move`, anchorId: id });
    }
    anchors[id] = { ...anchor, point: addVec(anchor.point, delta) };
  }

  const next = { ...graph, anchors };
  if (warns.length) next.diagnostics = (graph.diagnostics || []).concat(warns);
  return next;
}

// ── deleteComponents ───────────────────────────────────────────────────────

export function deleteComponents(graph, componentIds) {
  const components  = { ...graph.components };
  const anchors     = { ...graph.anchors };
  const renderRefs  = { ...graph.renderRefs };
  const diags       = [];

  for (const compId of componentIds) {
    if (!components[compId]) {
      diags.push({ code: 'COMPONENT_NOT_FOUND', message: `Component ${compId} does not exist`, componentId: compId });
      continue;
    }
    delete components[compId];
    delete renderRefs[compId];
  }

  // Prune orphaned anchors
  for (const anchorId of Object.keys(anchors)) {
    const fakeGraph = { components };
    if (!isAnchorReferenced(fakeGraph, anchorId)) delete anchors[anchorId];
  }

  const next = { ...graph, components, anchors, renderRefs };
  if (diags.length) next.diagnostics = (graph.diagnostics || []).concat(diags);
  return next;
}

// ── setProperty ───────────────────────────────────────────────────────────

export function setProperty(graph, payload) {
  const { componentId, anchorId, path, value } = payload;
  const next = { ...graph };

  if (componentId) {
    const comp = graph.components[componentId];
    if (!comp) {
      next.diagnostics = (graph.diagnostics || []).concat({ code: 'COMPONENT_NOT_FOUND', message: `Component ${componentId} not found`, componentId });
      return next;
    }
    const c = clone(comp);
    applyPath(c, path, value);
    next.components = { ...graph.components, [componentId]: c };
    return next;
  }

  if (anchorId) {
    const anchor = graph.anchors[anchorId];
    if (!anchor) {
      next.diagnostics = (graph.diagnostics || []).concat({ code: 'ANCHOR_NOT_FOUND', message: `Anchor ${anchorId} not found`, anchorId });
      return next;
    }
    const a = clone(anchor);
    applyPath(a, path, value);
    next.anchors = { ...graph.anchors, [anchorId]: a };
    return next;
  }

  next.diagnostics = (graph.diagnostics || []).concat({ code: 'INVALID_SET_PROPERTY', message: 'No componentId or anchorId provided' });
  return next;
}

function applyPath(obj, path, value) {
  if (!path) return;
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

// ── setLayerVisibility ─────────────────────────────────────────────────────

export function setLayerVisibility(graph, payload) {
  const { layerId, visible } = payload;
  return { ...graph, layers: { ...graph.layers, [layerId]: { visible: !!visible } } };
}
