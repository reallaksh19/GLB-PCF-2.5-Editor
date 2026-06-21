import {
  parseMacroRouteKv,
  routeById,
  routeEditResult,
  routeEngineOrThrow,
  routeIdFromOptsOrActive,
  routeSnapshot,
} from './macro-route-edit-results.js';

export const MACRO_ROUTE_AUTO_FIT_COMMANDS = Object.freeze(['AUTO_BEND', 'AUTOBEND', 'AUTO_TEE', 'AUTOTEE']);

export function registerMacroRouteAutoFitCommands(register) {
  if (typeof register !== 'function') throw new Error('registerMacroRouteAutoFitCommands requires a register function');
  register('AUTO_BEND', (args, ctx) => autoFit('AUTO_BEND', args, ctx, applyAutoBend));
  register('AUTOBEND', (args, ctx) => autoFit('AUTO_BEND', args, ctx, applyAutoBend));
  register('AUTO_TEE', (args, ctx) => autoFit('AUTO_TEE', args, ctx, applyAutoTee));
  register('AUTOTEE', (args, ctx) => autoFit('AUTO_TEE', args, ctx, applyAutoTee));
}

function autoFit(kind, args, ctx, apply) {
  const { opts, values } = parseMacroRouteKv(args);
  const routeEngine = routeEngineOrThrow(ctx);
  const routeId = routeIdFromOptsOrActive(routeEngine, opts, kind, ctx);
  const nodeId = resolveNodeId(values, opts);
  const payload = withoutEmptyValues({
    routeId,
    nodeId,
    subtype: opts.SUBTYPE || opts.TYPE || opts.RADIUS_TYPE,
    radiusType: opts.RADIUS || opts.RADIUS_TYPE,
    endType: opts.END_TYPE || opts.ENDTYPE,
    size: opts.SIZE || opts.NPS,
    branchSize: opts.BRANCH_SIZE || opts.BRANCHSIZE || opts.BRANCH_NPS,
    rating: opts.RATING || opts.CLASS,
    angle: numericOption(opts.ANGLE),
    length: numericOption(opts.LENGTH),
    branchLength: numericOption(opts.BRANCH_LENGTH || opts.BRANCHLENGTH),
    provenance: opts.PROVENANCE || 'macro-route-auto-fit',
    matchKey: opts.MATCHKEY || opts.MATCH_KEY,
  });
  const result = apply(routeEngine, payload);
  const components = Array.isArray(result) ? result : (routeEngine.getInlineComponents?.() || routeEngine.getState?.()?.model?.components || []);
  return routeEditResult(kind, {
    message: `${kind} applied${nodeId ? ` at node ${nodeId}` : ''}`,
    routeId,
    nodeId,
    routeSnapshot: routeSnapshot(routeById(routeEngine, routeId)),
    components,
  });
}

function applyAutoBend(routeEngine, payload) {
  return routeEngine.autoBend(payload, { source: 'macro-auto-bend' });
}

function applyAutoTee(routeEngine, payload) {
  return routeEngine.autoTee(payload, { source: 'macro-auto-tee' });
}

function resolveNodeId(values, opts) {
  return stringValue(values[0] || opts.NODE || opts.NODE_ID || opts.NODEID) || null;
}

function numericOption(value) {
  if (value == null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function withoutEmptyValues(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function stringValue(value) {
  return value == null ? '' : String(value).trim();
}
