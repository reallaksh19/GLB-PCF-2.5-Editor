import { BM1_CENTERLINE_FIXTURE } from './bm1-centerline.fixture.js';
import { normalizeBenchmark } from './benchmark-normalizer.js';

export const BM1_UI_HUD_CONTRACT_VERSION = 'bm1-ui-hud-command-contract/v1';

export const BM1_DASHBOARD_ACTIONS = Object.freeze([
  action('bm1.load', 'Benchmark', 'Load BM1', 'service', { service: 'benchmark.loadFixture' }),
  action('bm1.validate', 'Benchmark', 'Validate BM1', 'service', { service: 'benchmark.validate' }),
  action('bm1.diagnostics', 'Benchmark', 'Show BM1 Diagnostics', 'service', { service: 'benchmark.diagnostics' }),
  action('bm1.topology', 'Benchmark', 'Show BM1 Topology', 'service', { service: 'benchmark.topology' }),
  action('bm1.clear', 'Benchmark', 'Clear BM1', 'service', { service: 'benchmark.clear' }),
  action('bm1.auto-bend', 'Auto fitting', 'Auto Bend', 'macro', { macro: 'AUTO_BEND ROUTE=BM1-MAIN-ROUTE SUBTYPE=LR END_TYPE=BW SIZE=150NB CLASS=300 PROVENANCE=BM1-HUD' }),
  action('bm1.auto-tee', 'Auto fitting', 'Auto Tee', 'macro', { macro: 'AUTO_TEE ROUTE=BM1-MAIN-ROUTE SUBTYPE=REDUCING END_TYPE=BW SIZE=150NB BRANCH_SIZE=4IN CLASS=300 PROVENANCE=BM1-HUD' }),
  action('bm1.flange-pair', 'Auto fitting', 'Flange Pair', 'macro', { macro: 'FLANGE_PAIR 1000,1000,0 ROUTE=BM1-MAIN-ROUTE TYPE=WN FACING=RF CLASS=300 SIZE=150NB NAME=FLG-001 PROVENANCE=BM1-HUD' }),
  action('bm1.break-support', 'Support', 'Break + REST Support', 'macro', { macro: 'SUPPORT_ATTACH 1000,3500,1250 ROUTE=BM1-BRANCH-ROUTE SEGMENT=P6 KIND=REST NAME=PS-001 ATTACH=BRANCH PROVENANCE=BM1-HUD' }),
]);

export const BM1_HUD_STEPS = Object.freeze([
  routeStep('hud.start-main', 'Start route at A', 'startRoute', { routeId: 'BM1-MAIN-ROUTE', point: point('A') }),
  routeStep('hud.add-b', 'Add point B', 'addToPoint', { routeId: 'BM1-MAIN-ROUTE', point: point('B') }),
  routeStep('hud.add-c', 'Add point C', 'addToPoint', { routeId: 'BM1-MAIN-ROUTE', point: point('C') }),
  macroStep('hud.auto-bend-b', 'Auto Bend B', 'AUTO_BEND ROUTE=BM1-MAIN-ROUTE SUBTYPE=LR END_TYPE=BW SIZE=150NB CLASS=300 PROVENANCE=BM1-HUD'),
  macroStep('hud.flange-c', 'Add flange pair C', 'FLANGE_PAIR 1000,1000,0 ROUTE=BM1-MAIN-ROUTE TYPE=WN FACING=RF CLASS=300 SIZE=150NB NAME=FLG-001 PROVENANCE=BM1-HUD'),
  routeStep('hud.add-d', 'Add point D', 'addToPoint', { routeId: 'BM1-MAIN-ROUTE', point: point('D') }),
  routeStep('hud.break-m', 'Break M', 'breakSegment', { routeId: 'BM1-MAIN-ROUTE', point: point('M'), preferredSegmentFrom: 'C', preferredSegmentTo: 'D' }),
  routeStep('hud.add-e', 'Add point E', 'addToPoint', { routeId: 'BM1-MAIN-ROUTE', point: point('E') }),
  routeStep('hud.start-branch', 'Start branch at E', 'startRoute', { routeId: 'BM1-BRANCH-ROUTE', point: point('E') }),
  routeStep('hud.add-f', 'Add point F', 'addToPoint', { routeId: 'BM1-BRANCH-ROUTE', point: point('F') }),
  routeStep('hud.add-g', 'Add point G', 'addToPoint', { routeId: 'BM1-BRANCH-ROUTE', point: point('G') }),
  macroStep('hud.auto-tee-e', 'Auto Tee E', 'AUTO_TEE ROUTE=BM1-MAIN-ROUTE SUBTYPE=REDUCING END_TYPE=BW SIZE=150NB BRANCH_SIZE=4IN CLASS=300 PROVENANCE=BM1-HUD'),
  routeStep('hud.break-s', 'Break S', 'breakSegment', { routeId: 'BM1-BRANCH-ROUTE', point: point('S'), preferredSegmentFrom: 'F', preferredSegmentTo: 'G' }),
  macroStep('hud.support-s', 'REST support S', 'SUPPORT_ATTACH 1000,3500,1250 ROUTE=BM1-BRANCH-ROUTE KIND=REST NAME=PS-001 ATTACH=BRANCH PROVENANCE=BM1-HUD'),
  action('hud.validate', 'Benchmark', 'Validate BM1', 'service', { service: 'benchmark.validate' }),
]);

export function getBm1UiHudContract() {
  return {
    version: BM1_UI_HUD_CONTRACT_VERSION,
    dashboardActions: BM1_DASHBOARD_ACTIONS,
    hudSteps: BM1_HUD_STEPS,
  };
}

export function executeBm1UiHudAction(actionDescriptor, context = {}) {
  const descriptor = typeof actionDescriptor === 'string' ? findAction(actionDescriptor) : actionDescriptor;
  if (!descriptor) throw new Error(`Unknown BM1 UI/HUD action: ${actionDescriptor}`);
  if (descriptor.kind === 'macro') return runMacro(descriptor.payload.macro, context);
  if (descriptor.kind === 'route') return runRouteAction(descriptor.payload, context);
  if (descriptor.kind === 'service') return runService(descriptor.payload.service, context);
  throw new Error(`Unsupported BM1 UI/HUD action kind: ${descriptor.kind}`);
}

export function assertBm1UiHudNoGeometryBuilders(contract = getBm1UiHudContract()) {
  const actions = [...contract.dashboardActions, ...contract.hudSteps];
  return actions.every((item) => ['macro', 'route', 'service'].includes(item.kind) && !item.payload?.geometryBuilder && !item.payload?.customMeshBuilder);
}

function runMacro(macro, context) {
  if (typeof context.executeMacro !== 'function') throw new Error('BM1 macro action requires context.executeMacro');
  return context.executeMacro(macro, context.macroContext || context);
}

function runService(service, context) {
  if (service === 'benchmark.loadFixture') return BM1_CENTERLINE_FIXTURE;
  if (service === 'benchmark.validate') return normalizeBenchmark(BM1_CENTERLINE_FIXTURE);
  if (service === 'benchmark.diagnostics') return normalizeBenchmark(BM1_CENTERLINE_FIXTURE).diagnostics;
  if (service === 'benchmark.topology') return buildAsciiTopology();
  if (service === 'benchmark.clear') return context.clearBenchmark?.() ?? { cleared: true };
  throw new Error(`Unsupported BM1 service action: ${service}`);
}

function runRouteAction(payload, context) {
  const routeEngine = context.getRouteEngine?.();
  if (!routeEngine) throw new Error('BM1 route action requires context.getRouteEngine');
  if (payload.method === 'startRoute') return routeEngine.startRoute(payload.point, {}, { source: 'bm1-hud', routeId: payload.routeId });
  if (payload.method === 'addToPoint') return routeEngine.addToPoint(payload.routeId, payload.point, { source: 'bm1-hud' });
  if (payload.method === 'breakSegment') return routeEngine.breakSegment(payload.routeId, resolveSegmentId(routeEngine, payload), payload.point, { source: 'bm1-hud' });
  throw new Error(`Unsupported BM1 route method: ${payload.method}`);
}

function resolveSegmentId(routeEngine, payload) {
  if (payload.segmentId) return payload.segmentId;
  const route = (routeEngine.getRoutes?.() || []).find((item) => item.id === payload.routeId);
  const match = (route?.segments || []).find((segment) => {
    const from = (route.nodes || []).find((node) => node.id === segment.from);
    const to = (route.nodes || []).find((node) => node.id === segment.to);
    return samePoint(from, point(payload.preferredSegmentFrom)) && samePoint(to, point(payload.preferredSegmentTo));
  });
  if (!match) throw new Error(`Unable to resolve BM1 segment for ${payload.routeId}`);
  return match.id;
}

function findAction(id) {
  return [...BM1_DASHBOARD_ACTIONS, ...BM1_HUD_STEPS].find((item) => item.id === id) || null;
}

function action(id, group, label, kind, payload) {
  return Object.freeze({ id, group, label, kind, payload: Object.freeze(payload) });
}

function routeStep(id, label, method, payload) {
  return action(id, 'HUD Route', label, 'route', { method, ...payload });
}

function macroStep(id, label, macro) {
  return action(id, 'HUD Route', label, 'macro', { macro });
}

function point(id) {
  const node = BM1_CENTERLINE_FIXTURE.nodes.find((item) => item.id === id);
  if (!node) throw new Error(`Unknown BM1 node ${id}`);
  return { x: node.x, y: node.y, z: node.z };
}

function samePoint(a, b) {
  return !!a && !!b && Math.abs(a.x - b.x) <= 0.001 && Math.abs(a.y - b.y) <= 0.001 && Math.abs(a.z - b.z) <= 0.001;
}

function buildAsciiTopology() {
  return 'A--P1--B--P2--C||--P3--M--P3b--D--P4--E | TEE | E--P5--F--P6a--S--P6b--G | REST PS-001';
}
