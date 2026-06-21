import { BM1_CENTERLINE_FIXTURE } from './bm1-centerline.fixture.js';
import { normalizeBenchmark } from './benchmark-normalizer.js';
import { createBm1AcceptanceReport } from './bm1-acceptance-report.js';

export const BM1_EXPORT_READINESS_VERSION = 'bm1-export-readiness/v1';
export const BM1_EXPORT_TARGETS = Object.freeze(['DXF_CENTERLINE', 'GLB_CENTERLINE', 'RVM_CENTERLINE', 'ATT_METADATA', 'FABRICATION_REAL_PORTS']);

export function createBm1ExportReadinessReport() {
  const canonical = normalizeBenchmark(BM1_CENTERLINE_FIXTURE);
  const acceptance = createBm1AcceptanceReport();
  const diagnostics = [
    ...structuralDiagnostics(canonical),
    ...targetDiagnostics(canonical),
    ...fabricationBlockers(canonical),
  ];
  const targets = Object.fromEntries(BM1_EXPORT_TARGETS.map((target) => [target, targetStatus(target, diagnostics, canonical, acceptance)]));

  return {
    version: BM1_EXPORT_READINESS_VERSION,
    benchmarkId: canonical.id,
    canonicalSchemaVersion: canonical.schemaVersion,
    acceptanceOk: acceptance.ok,
    targets,
    diagnostics,
    summary: {
      readyTargets: Object.values(targets).filter((item) => item.status === 'READY').length,
      blockedTargets: Object.values(targets).filter((item) => item.status === 'BLOCKED').length,
      deferredTargets: Object.values(targets).filter((item) => item.status === 'DEFERRED').length,
      warningCount: diagnostics.filter((item) => item.severity === 'WARNING').length,
      errorCount: diagnostics.filter((item) => item.severity === 'ERROR').length,
    },
  };
}

export function assertBm1ExportReadiness(report = createBm1ExportReadinessReport()) {
  return report.acceptanceOk === true
    && report.targets.DXF_CENTERLINE.status === 'READY'
    && report.targets.GLB_CENTERLINE.status === 'READY'
    && report.targets.RVM_CENTERLINE.status === 'READY'
    && report.targets.ATT_METADATA.status === 'READY'
    && report.targets.FABRICATION_REAL_PORTS.status === 'DEFERRED'
    && report.summary.errorCount === 0;
}

function structuralDiagnostics(canonical) {
  const items = [];
  if (!canonical.summary.structuralValid) items.push(error('BM1_EXPORT_STRUCTURAL_INVALID', 'BM1 canonical topology is structurally invalid.'));
  if (canonical.units !== 'MM') items.push(error('BM1_EXPORT_UNITS_NOT_MM', 'BM1 export readiness requires millimetre units.'));
  if (canonical.mode !== 'CENTERLINE') items.push(error('BM1_EXPORT_MODE_NOT_CENTERLINE', 'BM1 export readiness requires CENTERLINE mode.'));
  if (canonical.diagnostics.length) items.push(error('BM1_EXPORT_CANONICAL_DIAGNOSTICS', 'Canonical diagnostics must be resolved before export readiness.'));
  return items;
}

function targetDiagnostics(canonical) {
  const items = [];
  const missing = requiredTopology(canonical);
  if (missing.length) items.push(error('BM1_EXPORT_TOPOLOGY_INCOMPLETE', `Missing required topology items: ${missing.join(', ')}`));
  if (!canonical.derivedSplits.some((split) => split.segmentId === 'P3')) items.push(error('BM1_EXPORT_P3_SPLIT_MISSING', 'P3 split at M is required for export topology.'));
  if (!canonical.derivedSplits.some((split) => split.segmentId === 'P6')) items.push(error('BM1_EXPORT_P6_SPLIT_MISSING', 'P6 split at S is required for export topology.'));
  return items;
}

function fabricationBlockers(canonical) {
  const featureTypes = new Set((canonical.features || []).map((item) => item.type));
  const blockers = [];
  if (featureTypes.has('FLANGE_PAIR')) blockers.push(warning('BM1_EXPORT_REAL_PORTS_DEFERRED', 'FLANGE_PAIR is centerline-only; real flange port offsets require verified PCD dimensions.'));
  if (featureTypes.has('AUTO_TEE_CANDIDATE')) blockers.push(warning('BM1_EXPORT_TEE_SOLID_TRIM_DEFERRED', 'AUTO_TEE is topology-ready; true solid trimming is deferred until real fabrication geometry exists.'));
  if (featureTypes.has('AUTO_BEND_CANDIDATE')) blockers.push(warning('BM1_EXPORT_BEND_RADIUS_DEFERRED', 'AUTO_BEND topology is ready; fabricated elbow radius/detail remains catalog-dependent.'));
  return blockers;
}

function targetStatus(target, diagnostics, canonical, acceptance) {
  const hasErrors = diagnostics.some((item) => item.severity === 'ERROR');
  if (hasErrors || !acceptance.ok) return { status: 'BLOCKED', reason: 'BM1 acceptance or topology errors must be resolved first.' };
  if (target === 'FABRICATION_REAL_PORTS') return { status: 'DEFERRED', reason: 'Requires real PCD/catalog dimensions for flange ports, gasket/bolt geometry, elbow radius, and tee trimming.' };
  if (target === 'DXF_CENTERLINE') return { status: 'READY', reason: 'Canonical segments, derived splits, fitting intent, and support metadata are available for 2D/3D centerline export.' };
  if (target === 'GLB_CENTERLINE') return { status: 'READY', reason: 'Canonical centerline topology is available for non-fabricated GLB guide/intent export.' };
  if (target === 'RVM_CENTERLINE') return { status: 'READY', reason: 'Canonical centerline topology and metadata are available for RVM benchmark intent export.' };
  if (target === 'ATT_METADATA') return { status: 'READY', reason: 'Canonical feature/support IDs and spec references are available for ATT metadata sidecar export.' };
  return { status: 'BLOCKED', reason: `Unknown BM1 export target: ${target}` };
}

function requiredTopology(canonical) {
  const nodeIds = new Set(canonical.nodes.map((node) => node.id));
  const segmentIds = new Set(canonical.segments.map((segment) => segment.id));
  const featureTypes = new Set(canonical.features.map((feature) => feature.type));
  const supportIds = new Set(canonical.supports.map((support) => support.id));
  const missing = [];
  for (const id of ['A', 'B', 'C', 'M', 'D', 'E', 'F', 'S', 'G']) if (!nodeIds.has(id)) missing.push(`node:${id}`);
  for (const id of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) if (!segmentIds.has(id)) missing.push(`segment:${id}`);
  for (const type of ['AUTO_BEND_CANDIDATE', 'FLANGE_PAIR', 'AUTO_TEE_CANDIDATE', 'BREAK']) if (!featureTypes.has(type)) missing.push(`feature:${type}`);
  if (!supportIds.has('PS-001')) missing.push('support:PS-001');
  return missing;
}

function warning(code, message) {
  return { severity: 'WARNING', code, message };
}

function error(code, message) {
  return { severity: 'ERROR', code, message };
}
