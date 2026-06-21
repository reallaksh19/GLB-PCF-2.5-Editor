import { BM1_CENTERLINE_FIXTURE } from './bm1-centerline.fixture.js';
import { normalizeBenchmark } from './benchmark-normalizer.js';
import { collectBenchmarkPcdDiagnostics } from './benchmark-pcd-diagnostics.js';
import { createBm1ExportReadinessReport } from './bm1-export-readiness-report.js';

export const BM1_REAL_PORT_PREREQUISITES_VERSION = 'bm1-real-port-prerequisites/v1';

export const BM1_REAL_PORT_REQUIREMENTS = Object.freeze([
  requirement('FLANGE_PAIR_PORTS', 'FLANGE_PAIR', ['flange face-to-face length', 'raised-face projection', 'hub/neck length', 'outside diameter', 'bolt circle diameter', 'bolt count', 'bolt size']),
  requirement('GASKET_BOLT_SET', 'FLANGE_PAIR', ['gasket thickness', 'gasket outside diameter', 'gasket inside diameter', 'bolt count', 'bolt diameter', 'nut height']),
  requirement('ELBOW_REAL_RADIUS', 'AUTO_BEND_CANDIDATE', ['center-to-end radius', 'bend angle', 'end preparation allowance', 'weld gap policy']),
  requirement('TEE_TRIM_PORTS', 'AUTO_TEE_CANDIDATE', ['run center-to-end A', 'run center-to-end B', 'branch center-to-end', 'run/branch bore compatibility', 'solid trimming policy']),
]);

export function createBm1RealPortPrerequisiteReport() {
  const canonical = normalizeBenchmark(BM1_CENTERLINE_FIXTURE);
  const exportReadiness = createBm1ExportReadinessReport();
  const pcd = collectBenchmarkPcdDiagnostics(canonical);
  const missingCatalogTargets = pcd.diagnostics.map((item) => ({ targetId: item.targetId, kind: item.kind, lookupKey: item.lookupKey, message: item.message }));
  const requirements = BM1_REAL_PORT_REQUIREMENTS.map((item) => evaluateRequirement(item, canonical, pcd));
  const blockers = [
    ...requirements.filter((item) => item.status !== 'SATISFIED').map((item) => blocker('BM1_REAL_PORT_REQUIREMENT_NOT_SATISFIED', `${item.id} is ${item.status}.`, { requirementId: item.id })),
    ...missingCatalogTargets.map((item) => blocker('BM1_REAL_PORT_CATALOG_ROW_MISSING', item.message, item)),
  ];

  return {
    version: BM1_REAL_PORT_PREREQUISITES_VERSION,
    benchmarkId: canonical.id,
    exportReadinessStatus: exportReadiness.targets.FABRICATION_REAL_PORTS.status,
    status: blockers.length ? 'BLOCKED' : 'READY',
    requirements,
    pcdSummary: pcd.summary,
    missingCatalogTargets,
    blockers,
    policy: {
      noFallbackDimensions: true,
      noNearestSizeFallback: true,
      noFabricatedDefaults: true,
      geometryImplementationAllowed: blockers.length === 0,
    },
  };
}

export function assertBm1RealPortGeometryMustRemainBlocked(report = createBm1RealPortPrerequisiteReport()) {
  return report.status === 'BLOCKED'
    && report.exportReadinessStatus === 'DEFERRED'
    && report.policy.geometryImplementationAllowed === false
    && report.blockers.some((item) => item.code === 'BM1_REAL_PORT_CATALOG_ROW_MISSING');
}

function evaluateRequirement(req, canonical, pcd) {
  const matchingFeatures = canonical.features.filter((feature) => feature.type === req.featureType);
  const exactCatalogResolved = matchingFeatures.every((feature) => pcd.resolved.some((item) => item.targetId === feature.id));
  return {
    ...req,
    featureCount: matchingFeatures.length,
    exactCatalogResolved,
    status: matchingFeatures.length && exactCatalogResolved ? 'SATISFIED' : 'BLOCKED',
  };
}

function requirement(id, featureType, fields) {
  return Object.freeze({ id, featureType, requiredFields: Object.freeze(fields) });
}

function blocker(code, message, details = {}) {
  return { severity: 'BLOCKER', code, message, details };
}
