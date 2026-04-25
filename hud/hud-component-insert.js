export function getInsertDefaults(component = 'VALVE', shellApi) {
  const selected = shellApi?.getSelectedComponent?.();
  const activeRoute = shellApi?.getRouteEngine?.()?.getActiveRoute?.();
  const routeSpec = activeRoute?.spec || {};
  const point = activeRoute?.nodes?.length
    ? { ...activeRoute.nodes[activeRoute.nodes.length - 1] }
    : { ...(selected?.geometry?.origin || { x: 0, y: 0, z: 0 }) };

  const size = selected?.attributes?.SIZE || selected?.attributes?.BORE || routeSpec.size || '100';
  const rating = selected?.attributes?.RATING || routeSpec.rating || '150';
  const pipelineRef = selected?.attributes?.['PIPELINE-REFERENCE'] || routeSpec.pipelineRef || 'ROUTE-AUTHORED';

  const upper = String(component || 'VALVE').toUpperCase();
  const defaults = {
    component: upper,
    subtype: upper === 'VALVE' ? 'GATE' : upper === 'FLANGE' ? 'WN' : upper === 'ELBOW' ? 'LR' : upper === 'TEE' ? 'EQUAL' : upper === 'REDUCER' ? 'CONCENTRIC' : '',
    size,
    rating,
    angle: upper === 'ELBOW' ? 90 : '',
    branchSize: upper === 'TEE' ? size : '',
    length: '',
    branchLength: '',
    weight: '',
    provenance: 'default',
    alternatives: [],
    pipelineRef,
    point,
    facing: upper === 'FLANGE' ? 'RF' : '',
    endType: upper === 'VALVE' || upper === 'FLANGE' ? 'FLANGED' : '',
    warnings: [],
  };

  if (upper === 'SUPPORT') defaults.subtype = 'REST';
  return defaults;
}

export function applyResolverResult(insertContext = {}, result = null) {
  if (!result?.ok || !result?.resolved) {
    return {
      ...insertContext,
      provenance: result?.source || 'manual',
      warnings: result?.warnings || ['NO_MATCH'],
      alternatives: result?.alternatives || [],
    };
  }
  const resolved = result.resolved || {};
  const keepManual = String(insertContext.provenance || '').toLowerCase() === 'manual';
  return {
    ...insertContext,
    subtype: insertContext.subtype || resolved.subtype || '',
    size: insertContext.size || resolved.size || '',
    rating: insertContext.rating || resolved.rating || '',
    facing: insertContext.facing || resolved.facing || '',
    endType: insertContext.endType || resolved.endType || '',
    angle: insertContext.angle || resolved.angle || '',
    branchSize: insertContext.branchSize || resolved.branchSize || '',
    radiusType: insertContext.radiusType || resolved.radiusType || '',
    centerToEnd: insertContext.centerToEnd || resolved.centerToEnd || '',
    tangentLength: insertContext.tangentLength || resolved.tangentLength || '',
    runSize: insertContext.runSize || resolved.runSize || '',
    runCenterToEnd: insertContext.runCenterToEnd || resolved.runCenterToEnd || '',
    branchCenterToEnd: insertContext.branchCenterToEnd || resolved.branchCenterToEnd || '',
    standard: insertContext.standard || resolved.standard || '',
    boreType: insertContext.boreType || resolved.boreType || '',
    revision: insertContext.revision || resolved.revision || '',
    datasetVersion: insertContext.datasetVersion || resolved.datasetVersion || '',
    length: keepManual && insertContext.length !== '' ? insertContext.length : (resolved.length ?? insertContext.length ?? ''),
    branchLength: keepManual && insertContext.branchLength !== '' ? insertContext.branchLength : (resolved.branchLength ?? insertContext.branchLength ?? ''),
    weight: keepManual && insertContext.weight !== '' ? insertContext.weight : (resolved.weight ?? insertContext.weight ?? ''),
    provenance: result.source || 'master-db',
    alternatives: result.alternatives || [],
    warnings: result.warnings || [],
    resolvedMatchKey: result.matchKey || null,
  };
}

export function resolveInsertContext(insertContext = {}, shellApi, options = {}) {
  const query = {
    component: insertContext.component,
    subtype: insertContext.subtype,
    size: insertContext.size,
    rating: insertContext.rating,
    facing: insertContext.facing,
    endType: insertContext.endType,
    angle: insertContext.angle !== '' ? Number(insertContext.angle) : undefined,
    branchSize: insertContext.branchSize,
  };
  const result = shellApi?.resolveComponent?.(query) || null;
  const next = applyResolverResult(insertContext, result);

  if (options.preserveManual) {
    if (String(insertContext.provenance || '').toLowerCase() === 'manual') {
      next.length = insertContext.length;
      next.weight = insertContext.weight;
      next.provenance = 'manual';
    }
  }

  return { insertContext: next, result };
}

export function buildInsertPayload(insertContext = {}, shellApi) {
  const point = insertContext.point
    || shellApi?.getRouteEngine?.()?.getActiveRoute?.()?.nodes?.slice(-1)?.[0]
    || shellApi?.getSelectedComponent?.()?.geometry?.origin
    || { x: 0, y: 0, z: 0 };

  return {
    component: insertContext.component || 'VALVE',
    subtype: insertContext.subtype || '',
    size: insertContext.size || '',
    rating: insertContext.rating || '',
    length: insertContext.length || '',
    weight: insertContext.weight || '',
    angle: insertContext.angle || '',
    branchSize: insertContext.branchSize || '',
    radiusType: insertContext.radiusType || '',
    centerToEnd: insertContext.centerToEnd || '',
    tangentLength: insertContext.tangentLength || '',
    runSize: insertContext.runSize || '',
    runCenterToEnd: insertContext.runCenterToEnd || '',
    branchCenterToEnd: insertContext.branchCenterToEnd || '',
    standard: insertContext.standard || '',
    boreType: insertContext.boreType || '',
    revision: insertContext.revision || '',
    datasetVersion: insertContext.datasetVersion || '',
    provenance: insertContext.provenance || 'manual',
    pipelineRef: insertContext.pipelineRef || 'ROUTE-AUTHORED',
    facing: insertContext.facing || '',
    endType: insertContext.endType || '',
    point,
  };
}

export function commitInsertDraft(insertContext, shellApi) {
  const payload = buildInsertPayload(insertContext, shellApi);
  const list = shellApi?.insertRouteComponent?.(payload, { source: 'hud-insert' }) || [];
  const inserted = Array.isArray(list) ? list[list.length - 1] : null;
  return { payload, inserted };
}
