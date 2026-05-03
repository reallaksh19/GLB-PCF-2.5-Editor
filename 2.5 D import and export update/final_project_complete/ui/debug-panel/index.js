/**
 * Debug panel module.
 *
 * Collects and stores diagnostic and count information about the
 * canonical edit graph and the render projection.  This information
 * can be displayed by a host application to aid in development and
 * troubleshooting.  The panel does not render UI; it simply holds
 * computed values.
 */

let _debugInfo = null;

/**
 * Populate the debug panel with computed information.  This helper
 * builds an object with counts of components, anchors, topology links,
 * render bodies, grips and labels, selected IDs, command journal
 * length, loss contract entries and validation diagnostics.
 *
 * @param {Object} graph Canonical edit graph
 * @param {Object} renderIndex Render index created by buildRenderProjection
 * @param {Object} selection Selection snapshot with componentIds and anchorIds
 */
export function updateDebugPanel(graph, renderIndex, selection = {}) {
  const info = {};
  if (graph) {
    info.componentCount = graph.components ? Object.keys(graph.components).length : 0;
    info.anchorCount = graph.anchors ? Object.keys(graph.anchors).length : 0;
    info.topologyLinkCount = Array.isArray(graph.topologyLinks) ? graph.topologyLinks.length : 0;
    info.commandJournalLength = Array.isArray(graph.commandJournal) ? graph.commandJournal.length : 0;
    // Loss contract
    const lc = graph.lossContract || {};
    info.lossContract = {
      unsupportedEntities: lc.unsupportedEntities ? lc.unsupportedEntities.length : 0,
      downgradedEntities: lc.downgradedEntities ? lc.downgradedEntities.length : 0,
      proxyEntities: lc.proxyEntities ? lc.proxyEntities.length : 0,
      exportWarnings: lc.exportWarnings ? lc.exportWarnings.length : 0
    };
    // Diagnostics
    info.diagnostics = Array.isArray(graph.diagnostics) ? graph.diagnostics.slice() : [];
  }
  if (renderIndex) {
    // Count render objects by role
    let bodyCount = 0;
    let gripCount = 0;
    let labelCount = 0;
    for (const objs of renderIndex.componentToObjects.values()) {
      objs.forEach(obj => {
        if (obj.userData.renderRole === 'BODY') bodyCount++;
        if (obj.userData.renderRole === 'LABEL') labelCount++;
      });
    }
    renderIndex.anchorToGrip.forEach(() => {
      gripCount++;
    });
    info.renderBodies = bodyCount;
    info.renderGrips = gripCount;
    info.renderLabels = labelCount;
    // Orphans: any render object that has no component entry
    let orphanCount = 0;
    for (const [obj, compId] of renderIndex.objectToComponent.entries()) {
      if (!graph || !graph.components || !graph.components[compId]) {
        orphanCount++;
      }
    }
    info.orphanRenderObjects = orphanCount;
  }
  // Selection
  info.selectedComponentIds = selection.componentIds ? Array.from(selection.componentIds) : [];
  info.selectedAnchorIds = selection.anchorIds ? Array.from(selection.anchorIds) : [];
  _debugInfo = info;
}

/**
 * Retrieve the current debug information object.
 *
 * @returns {Object|null}
 */
export function getDebugInfo() {
  return _debugInfo;
}