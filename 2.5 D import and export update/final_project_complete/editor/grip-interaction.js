/**
 * Grip Interaction Handler.
 *
 * Implements drag behaviour for editing anchor positions and component
 * bodies.  These functions are intended to be called by the host
 * application when pointer events occur.  They rely on shared
 * modules for preview state, HUD display, snapping and command
 * dispatch.  Each function returns the updated canonical edit graph.
 */

import { beginPreview, updatePreview, endPreview, getPreviewState } from './drag-preview.js';
import { showHud, hideHud } from './hud-lite.js';
import { snapPoint } from './snap-lite.js';
import { getTool } from './active-tool-controller.js';
import { getSelection, selectComponent, selectAnchor, clearSelection } from './selection-controller.js';
import { dispatchCommand } from '../core/commands/command-dispatcher.js';
import { CommandType } from '../core/commands/command-types.js';
import { linearLength } from '../core/geometry/linear-ops.js';

/**
 * Begin dragging a grip.  Stores the start point in preview state and
 * displays the HUD.  Does not mutate the graph.  Selection is
 * updated to include the anchor being dragged.
 *
 * @param {Object} graph Current CEG
 * @param {string} anchorId The anchor id being dragged
 * @param {Object} startPoint {x,y,z} coordinate of pointer
 * @returns {Object} Unchanged graph
 */
export function handleGripDragStart(graph, anchorId, startPoint) {
  const snapped = snapPoint(startPoint);
  beginPreview(anchorId, snapped);
  // Update selection to the anchor
  clearSelection();
  selectAnchor(anchorId);
  // Show HUD with selected anchor
  showHud({ selectedAnchorId: anchorId, deltaX: 0, deltaY: 0, deltaZ: 0 });
  return graph;
}

/**
 * Update a grip drag.  Updates preview state, computes the delta
 * relative to the start point and updates the HUD.  Does not mutate
 * the graph.
 *
 * @param {Object} graph Current CEG
 * @param {string} anchorId The anchor id being dragged
 * @param {Object} currentPoint Current pointer position {x,y,z}
 * @returns {Object} Unchanged graph
 */
export function handleGripDragMove(graph, anchorId, currentPoint) {
  const snapped = snapPoint(currentPoint);
  updatePreview(snapped);
  const preview = getPreviewState();
  if (!preview.startPoint) return graph;
  const dx = snapped.x - preview.startPoint.x;
  const dy = snapped.y - preview.startPoint.y;
  const dz = snapped.z - preview.startPoint.z;
  showHud({ deltaX: dx, deltaY: dy, deltaZ: dz });
  return graph;
}

/**
 * Finish a grip drag.  Computes the movement delta and dispatches
 * the appropriate command based on the current tool.  Clears the
 * preview and hides the HUD.  Returns the next graph.
 *
 * @param {Object} graph Current CEG
 * @param {string} anchorId Anchor id that was dragged
 * @param {Object} endPoint End point {x,y,z}
 * @returns {Object} Updated CEG after applying the drag command
 */
export function handleGripDragEnd(graph, anchorId, endPoint) {
  const snapped = snapPoint(endPoint);
  const preview = getPreviewState();
  endPreview();
  const start = preview.startPoint;
  // Compute delta
  let dx = 0, dy = 0, dz = 0;
  if (start) {
    dx = snapped.x - start.x;
    dy = snapped.y - start.y;
    dz = snapped.z - start.z;
  }
  hideHud();
  const tool = getTool();
  let next = graph;
  // Determine which command to dispatch based on the active tool
  if (tool === 'EXTEND') {
    // Find the component that owns this anchor
    let componentId = null;
    let fixedAnchorId = null;
    for (const compId of Object.keys(graph.components)) {
      const comp = graph.components[compId];
      if (comp.anchorIds && comp.anchorIds.includes(anchorId)) {
        componentId = compId;
        // Determine fixed anchor (the other anchor)
        const otherIds = comp.anchorIds.filter(id => id !== anchorId);
        fixedAnchorId = otherIds[0] || null;
        break;
      }
    }
    if (componentId && fixedAnchorId) {
      // Compute new length from fixed anchor to endPoint
      const fixedPt = graph.anchors[fixedAnchorId].point;
      const newLen = linearLength(fixedPt, snapped);
      next = dispatchCommand(graph, {
        type: CommandType.EXTEND_LINEAR,
        payload: { componentId, endpoint: anchorId, newLength: newLen }
      });
    }
  } else if (tool === 'STRETCH') {
    next = dispatchCommand(graph, {
      type: CommandType.STRETCH_ANCHORS,
      payload: { anchors: [anchorId], delta: { x: dx, y: dy, z: dz } }
    });
  } else {
    // Default behaviour for MOVE_ANCHOR and other tools: move anchor
    next = dispatchCommand(graph, {
      type: CommandType.MOVE_ANCHORS,
      payload: { anchors: [anchorId], delta: { x: dx, y: dy, z: dz } }
    });
  }
  // Clear selection after commit
  clearSelection();
  return next;
}

/**
 * Begin dragging one or more components.  Creates a preview and
 * displays the HUD.  Does not mutate the graph.  Selection is
 * updated to include the components being dragged.
 *
 * @param {Object} graph Current CEG
 * @param {string[]} componentIds List of component ids
 * @param {Object} startPoint {x,y,z}
 * @returns {Object} Unchanged graph
 */
export function handleBodyDragStart(graph, componentIds, startPoint) {
  const snapped = snapPoint(startPoint);
  // Use a synthetic anchor id for body preview
  beginPreview('body', snapped);
  clearSelection();
  componentIds.forEach(id => selectComponent(id));
  showHud({ selectedComponentId: componentIds.join(','), deltaX: 0, deltaY: 0, deltaZ: 0 });
  return graph;
}

/**
 * Update a body drag.  Updates preview and HUD but does not mutate the graph.
 *
 * @param {Object} graph Current CEG
 * @param {string[]} componentIds Components being dragged
 * @param {Object} currentPoint {x,y,z}
 * @returns {Object} Unchanged graph
 */
export function handleBodyDragMove(graph, componentIds, currentPoint) {
  const snapped = snapPoint(currentPoint);
  updatePreview(snapped);
  const preview = getPreviewState();
  if (!preview.startPoint) return graph;
  const dx = snapped.x - preview.startPoint.x;
  const dy = snapped.y - preview.startPoint.y;
  const dz = snapped.z - preview.startPoint.z;
  showHud({ deltaX: dx, deltaY: dy, deltaZ: dz });
  return graph;
}

/**
 * Finish dragging components.  Computes delta and dispatches
 * MOVE_COMPONENTS if the active tool is MOVE.  Hides HUD and clears
 * the preview.  Returns the updated graph.
 *
 * @param {Object} graph Current CEG
 * @param {string[]} componentIds Components that were dragged
 * @param {Object} endPoint {x,y,z}
 * @returns {Object} Updated CEG
 */
export function handleBodyDragEnd(graph, componentIds, endPoint) {
  const snapped = snapPoint(endPoint);
  const preview = getPreviewState();
  endPreview();
  const start = preview.startPoint;
  let dx = 0, dy = 0, dz = 0;
  if (start) {
    dx = snapped.x - start.x;
    dy = snapped.y - start.y;
    dz = snapped.z - start.z;
  }
  hideHud();
  let next = graph;
  const tool = getTool();
  if (tool === 'MOVE') {
    next = dispatchCommand(graph, {
      type: CommandType.MOVE_COMPONENTS,
      selection: componentIds,
      payload: { delta: { x: dx, y: dy, z: dz } }
    });
  }
  clearSelection();
  return next;
}