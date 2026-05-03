/*
 * core/commands/geometry-commands.js
 *
 * Implements the geometry modifications for each command type.  Each
 * operation takes a CEG and returns a new CEG with modifications
 * applied.  The original graph is never mutated.
 */

import { add as addVec } from '../geometry/vectors.js';
import { getAnchor, updateAnchor, isAnchorReferenced } from '../geometry/anchors.js';
import { linearLength, extendLinear } from '../geometry/linear-ops.js';
import { defaultCapabilities } from '../ceg/capabilities.js';

// Utility to clone simple objects deeply enough for our usage
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Move a set of anchors by the given delta vector.  Locked anchors
 * are not moved and generate a diagnostic entry.
 *
 * @param {Object} graph The current CEG.
 * @param {string[]} anchorIds Anchor IDs to move.
 * @param {Object} delta Vector with x,y,z offsets.
 * @returns {Object} The new CEG.
 */
export function moveAnchors(graph, anchorIds, delta) {
  const next = { ...graph };
  let anchors = graph.anchors;
  const diagnostics = [];
  for (const id of anchorIds) {
    const anchor = anchors[id];
    if (!anchor) {
      diagnostics.push({ code: 'ANCHOR_NOT_FOUND', message: `Anchor ${id} does not exist`, anchorId: id });
      continue;
    }
    if (anchor.locked) {
      diagnostics.push({ code: 'ANCHOR_LOCKED', message: `Anchor ${id} is locked`, anchorId: id });
      continue;
    }
    const newPoint = addVec(anchor.point, delta);
    const newAnchor = { ...anchor, point: newPoint };
    anchors = updateAnchor({ anchors }, id, newAnchor);
  }
  next.anchors = anchors;
  // Append diagnostics
  if (diagnostics.length) {
    next.diagnostics = (graph.diagnostics || []).concat(diagnostics);
  }
  return next;
}

/**
 * Move multiple components by translating all their anchors.  Locked
 * anchors are not moved and generate diagnostics.  If a component
 * references no anchors, no action is taken.
 *
 * @param {Object} graph The current CEG.
 * @param {string[]} componentIds Component IDs to move.
 * @param {Object} delta Vector with x,y,z offsets.
 * @returns {Object} The new CEG.
 */
export function moveComponents(graph, componentIds, delta) {
  const anchorIds = [];
  for (const compId of componentIds) {
    const comp = graph.components[compId];
    if (!comp) continue;
    if (Array.isArray(comp.anchorIds)) {
      anchorIds.push(...comp.anchorIds);
    }
  }
  return moveAnchors(graph, anchorIds, delta);
}

/**
 * Extend a linear component to a new length.  Requires exactly two
 * anchors and a positive new length.  The moving anchor is
 * determined by comparing the provided `endpoint` ID with the
 * component's `anchorIds`.  If no endpoint is provided, the second
 * anchor in `anchorIds` is treated as moving.
 *
 * @param {Object} graph The current CEG.
 * @param {string} componentId ID of the component to extend.
 * @param {string} endpoint Anchor ID of the endpoint to move.
 * @param {number} newLength The target length (>0).
 * @returns {Object} The new CEG.
 */
export function extendLinearComponent(graph, componentId, endpoint, newLength) {
  const comp = graph.components[componentId];
  if (!comp) {
    const next = { ...graph };
    next.diagnostics = (graph.diagnostics || []).concat({ code: 'COMPONENT_NOT_FOUND', message: `Component ${componentId} not found`, componentId });
    return next;
  }
  if (!comp.capabilities?.canExtend) {
    const next = { ...graph };
    next.diagnostics = (graph.diagnostics || []).concat({ code: 'EXTEND_NOT_SUPPORTED', message: `Component ${componentId} cannot be extended`, componentId });
    return next;
  }
  if (newLength <= 0 || !Number.isFinite(newLength)) {
    const next = { ...graph };
    next.diagnostics = (graph.diagnostics || []).concat({ code: 'INVALID_LENGTH', message: `Length must be positive`, componentId });
    return next;
  }
  const [aId, bId] = comp.anchorIds || [];
  if (!aId || !bId) {
    const next = { ...graph };
    next.diagnostics = (graph.diagnostics || []).concat({ code: 'MISSING_ANCHORS', message: `Component ${componentId} does not have two anchors`, componentId });
    return next;
  }
  // Determine moving and fixed anchors
  const movingId = endpoint || bId;
  const fixedId = movingId === aId ? bId : aId;
  const fixed = graph.anchors[fixedId];
  const moving = graph.anchors[movingId];
  if (!fixed || !moving) {
    const next = { ...graph };
    next.diagnostics = (graph.diagnostics || []).concat({ code: 'ANCHOR_NOT_FOUND', message: `Anchors missing on component ${componentId}`, componentId });
    return next;
  }
  if (moving.locked) {
    const next = { ...graph };
    next.diagnostics = (graph.diagnostics || []).concat({ code: 'ANCHOR_LOCKED', message: `Anchor ${movingId} is locked`, anchorId: movingId });
    return next;
  }
  // Compute new position
  const newPos = extendLinear(fixed.point, moving.point, newLength);
  // Create updated anchors
  let anchors = { ...graph.anchors };
  anchors[movingId] = { ...moving, point: newPos };
  // Build next graph
  const next = { ...graph, anchors };
  return next;
}

/**
 * Stretch a set of endpoint anchors by a delta vector.  In Wave 1
 * stretching does not propagate to connected anchors.  If an anchor
 * has connectedTo entries a diagnostic warning is recorded.
 *
 * @param {Object} graph The current CEG.
 * @param {string[]} anchorIds IDs of the anchors to move.
 * @param {Object} delta Vector with x,y,z offsets.
 */
export function stretchAnchors(graph, anchorIds, delta) {
  const next = { ...graph };
  let anchors = { ...graph.anchors };
  const warnings = [];
  for (const id of anchorIds) {
    const anchor = anchors[id];
    if (!anchor) {
      warnings.push({ code: 'ANCHOR_NOT_FOUND', message: `Anchor ${id} not found`, anchorId: id });
      continue;
    }
    if (anchor.locked) {
      warnings.push({ code: 'ANCHOR_LOCKED', message: `Anchor ${id} is locked`, anchorId: id });
      continue;
    }
    if (Array.isArray(anchor.connectedTo) && anchor.connectedTo.length > 0) {
      warnings.push({ code: 'CONNECTED_ANCHOR', message: `Anchor ${id} has connected anchors and will not move them`, anchorId: id });
    }
    const newPoint = addVec(anchor.point, delta);
    anchors[id] = { ...anchor, point: newPoint };
  }
  next.anchors = anchors;
  if (warnings.length) {
    next.diagnostics = (graph.diagnostics || []).concat(warnings);
  }
  return next;
}

/**
 * Delete one or more components.  Anchors that are no longer
 * referenced by any component are removed.  Render references are
 * invalidated.
 *
 * @param {Object} graph The current CEG.
 * @param {string[]} componentIds IDs of components to delete.
 */
export function deleteComponents(graph, componentIds) {
  const next = { ...graph };
  const components = { ...graph.components };
  const anchors = { ...graph.anchors };
  const diagnostics = [];
  // Remove components
  for (const compId of componentIds) {
    if (!components[compId]) {
      diagnostics.push({ code: 'COMPONENT_NOT_FOUND', message: `Component ${compId} does not exist`, componentId: compId });
      continue;
    }
    delete components[compId];
  }
  // Prune anchors not referenced by remaining components
  for (const anchorId of Object.keys(anchors)) {
    if (!isAnchorReferenced(next, anchorId, components)) {
      delete anchors[anchorId];
    }
  }
  // Invalidate renderRefs for deleted components
  const renderRefs = { ...graph.renderRefs };
  for (const compId of componentIds) {
    delete renderRefs[compId];
  }
  next.components = components;
  next.anchors = anchors;
  next.renderRefs = renderRefs;
  if (diagnostics.length) {
    next.diagnostics = (graph.diagnostics || []).concat(diagnostics);
  }
  return next;
}

/**
 * Set an arbitrary property on a component or anchor using a dotted
 * path.  The command payload must include `componentId` or
 * `anchorId`, a `path` string and a `value`.  Nested objects are
 * created as needed.  This function does not perform validation.
 *
 * @param {Object} graph The current CEG.
 * @param {Object} payload Object with componentId or anchorId,
 *   path and value.
 */
export function setProperty(graph, payload) {
  const { componentId, anchorId, path, value } = payload;
  const next = { ...graph };
  if (componentId) {
    const comp = graph.components[componentId];
    if (!comp) {
      next.diagnostics = (graph.diagnostics || []).concat({ code: 'COMPONENT_NOT_FOUND', message: `Component ${componentId} not found`, componentId });
      return next;
    }
    const compClone = clone(comp);
    applyPath(compClone, path, value);
    next.components = { ...graph.components, [componentId]: compClone };
    return next;
  }
  if (anchorId) {
    const anchor = graph.anchors[anchorId];
    if (!anchor) {
      next.diagnostics = (graph.diagnostics || []).concat({ code: 'ANCHOR_NOT_FOUND', message: `Anchor ${anchorId} not found`, anchorId });
      return next;
    }
    const anchorClone = clone(anchor);
    applyPath(anchorClone, path, value);
    next.anchors = { ...graph.anchors, [anchorId]: anchorClone };
    return next;
  }
  // If no target specified, add diagnostic
  next.diagnostics = (graph.diagnostics || []).concat({ code: 'INVALID_SET_PROPERTY', message: 'No componentId or anchorId provided' });
  return next;
}

// Helper: set dotted path
function applyPath(obj, path, value) {
  if (!path) return;
  const parts = String(path).split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Set layer visibility.  In Wave 1 this operation simply records
 * visibility flags on the graph’s `layers` map.  It does not
 * affect rendering because render layer support is introduced in
 * Wave 3.  payload: { layerId: string, visible: boolean }
 */
export function setLayerVisibility(graph, payload) {
  const { layerId, visible } = payload;
  const next = { ...graph };
  next.layers = { ...graph.layers, [layerId]: { visible: !!visible } };
  return next;
}