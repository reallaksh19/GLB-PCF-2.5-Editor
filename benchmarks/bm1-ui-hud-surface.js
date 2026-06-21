import { getBm1UiHudContract } from './bm1-ui-hud-command-contract.js';
import { createBm1ExportReadinessReport } from './bm1-export-readiness-report.js';
import { createBm1RealPortPrerequisiteReport } from './bm1-real-port-prerequisites.js';

export const BM1_UI_HUD_SURFACE_VERSION = 'bm1-ui-hud-surface/v1';

export function createBm1UiHudSurface() {
  const contract = getBm1UiHudContract();
  const exportReadiness = createBm1ExportReadinessReport();
  const realPort = createBm1RealPortPrerequisiteReport();
  const actionById = new Map([...contract.dashboardActions, ...contract.hudSteps].map((item) => [item.id, item]));

  const surface = {
    version: BM1_UI_HUD_SURFACE_VERSION,
    benchmarkId: 'BM1',
    title: 'BM1 Centerline Benchmark',
    mode: 'CENTERLINE',
    cards: [
      card('bm1-surface-benchmark', 'Benchmark', 'BM1 validation and topology', ['bm1.load', 'bm1.validate', 'bm1.diagnostics', 'bm1.topology'], actionById),
      card('bm1-surface-fittings', 'Auto fittings', 'Bend, tee, and flange intent commands', ['bm1.auto-bend', 'bm1.auto-tee', 'bm1.flange-pair'], actionById),
      card('bm1-surface-supports', 'Supports', 'Break and attach REST support', ['bm1.break-support'], actionById),
      statusCard('bm1-surface-export', 'Export readiness', exportSummary(exportReadiness)),
      statusCard('bm1-surface-real-port', 'Real-port gate', realPortSummary(realPort)),
    ],
    hudSequence: contract.hudSteps.map((step, index) => ({ index: index + 1, id: step.id, label: step.label, kind: step.kind, actionId: step.id })),
    safety: {
      noGeometryBuilders: true,
      noRendererDependency: true,
      noDomDependency: true,
      realPortGeometryAllowed: realPort.policy.geometryImplementationAllowed,
    },
  };

  return { ...surface, ok: surface.cards.every((item) => item.ok !== false) && surface.safety.noGeometryBuilders && !surface.safety.realPortGeometryAllowed };
}

export function assertBm1UiHudSurfaceReady(surface = createBm1UiHudSurface()) {
  return surface.version === BM1_UI_HUD_SURFACE_VERSION
    && surface.ok === true
    && surface.cards.length >= 5
    && surface.hudSequence.length >= 15
    && surface.safety.noGeometryBuilders === true
    && surface.safety.noDomDependency === true
    && surface.safety.noRendererDependency === true
    && surface.safety.realPortGeometryAllowed === false;
}

function card(id, title, description, actionIds, actionById) {
  const actions = actionIds.map((actionId) => actionById.get(actionId)).filter(Boolean).map((action) => ({ id: action.id, label: action.label, kind: action.kind }));
  return { id, title, description, type: 'actions', ok: actions.length === actionIds.length, actions };
}

function statusCard(id, title, summary) {
  return { id, title, type: 'status', ok: summary.ok, summary };
}

function exportSummary(report) {
  return {
    ok: report.targets.DXF_CENTERLINE.status === 'READY' && report.targets.GLB_CENTERLINE.status === 'READY' && report.targets.RVM_CENTERLINE.status === 'READY' && report.targets.ATT_METADATA.status === 'READY',
    dxf: report.targets.DXF_CENTERLINE.status,
    glb: report.targets.GLB_CENTERLINE.status,
    rvm: report.targets.RVM_CENTERLINE.status,
    att: report.targets.ATT_METADATA.status,
    fabrication: report.targets.FABRICATION_REAL_PORTS.status,
  };
}

function realPortSummary(report) {
  return {
    ok: report.status === 'BLOCKED' && report.policy.geometryImplementationAllowed === false,
    status: report.status,
    implementationAllowed: report.policy.geometryImplementationAllowed,
    blockerCount: report.blockers.length,
    missingCatalogTargets: report.missingCatalogTargets.length,
  };
}
