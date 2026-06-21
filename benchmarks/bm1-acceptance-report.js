import { BM1_CENTERLINE_FIXTURE } from './bm1-centerline.fixture.js';
import { BM1_PIPE_LIST_FIXTURE } from './bm1-pipe-list.fixture.js';
import { BM1_CSV_REPLAY_FIXTURE } from './bm1-csv-replay.fixture.js';
import { normalizeBenchmark } from './benchmark-normalizer.js';
import { normalizePipeListBenchmark } from './benchmark-pipe-list-normalizer.js';
import { csvRowsToMacroScript, parseBenchmarkCsv } from './benchmark-csv-replay.js';
import { assertBm1UiHudNoGeometryBuilders, getBm1UiHudContract } from './bm1-ui-hud-command-contract.js';

export const BM1_ACCEPTANCE_REPORT_VERSION = 'bm1-final-acceptance-parity/v1';
export const BM1_ACCEPTANCE_PHASES = Object.freeze(['BM1-1', 'BM1-2', 'BM1-3', 'BM1-4', 'BM1-5', 'BM1-6', 'BM1-7', 'BM1-8']);
export const REQUIRED_BM1_MACRO_INTENTS = Object.freeze(['AUTO_BEND', 'AUTO_TEE', 'FLANGE_PAIR', 'SUPPORT_ATTACH']);

export function createBm1AcceptanceReport() {
  const declarative = normalizeBenchmark(BM1_CENTERLINE_FIXTURE);
  const pipeList = normalizePipeListBenchmark(BM1_PIPE_LIST_FIXTURE);
  const csvRows = parseBenchmarkCsv(BM1_CSV_REPLAY_FIXTURE);
  const csvMacroScript = csvRowsToMacroScript(BM1_CSV_REPLAY_FIXTURE);
  const uiHudContract = getBm1UiHudContract();

  const report = {
    version: BM1_ACCEPTANCE_REPORT_VERSION,
    benchmarkId: 'BM1',
    phases: BM1_ACCEPTANCE_PHASES.map((phase) => ({ phase, status: 'covered' })),
    paths: {
      declarative: declarativePath(declarative),
      pipeList: pipeListPath(pipeList, declarative),
      csvReplay: csvReplayPath(csvRows, csvMacroScript),
      uiHud: uiHudPath(uiHudContract),
    },
    parity: {
      declarativeVsPipeList: sameSignature(signatureFromCanonical(declarative), signatureFromCanonical(pipeList.canonical)),
      macroIntentCoverage: macroIntentCoverage(csvMacroScript, uiHudContract),
      noCustomGeometryBuilders: assertBm1UiHudNoGeometryBuilders(uiHudContract),
    },
  };

  return { ...report, ok: report.paths.declarative.ok && report.paths.pipeList.ok && report.paths.csvReplay.ok && report.paths.uiHud.ok && Object.values(report.parity).every(Boolean) };
}

export function signatureFromCanonical(canonical) {
  return {
    id: canonical.id,
    schemaVersion: canonical.schemaVersion,
    mode: canonical.mode,
    units: canonical.units,
    summary: {
      nodeCount: canonical.summary.nodeCount,
      originalSegmentCount: canonical.summary.originalSegmentCount,
      supportCount: canonical.summary.supportCount,
      featureCounts: canonical.summary.featureCounts,
    },
    nodes: canonical.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, z: node.z })).sort(byId),
    segments: canonical.segments.map((segment) => ({ id: segment.id, from: segment.from, to: segment.to, spec: segment.spec, orientation: segment.orientation, lengthMm: roundMm(segment.lengthMm) })).sort(byId),
    splits: canonical.derivedSplits.map((split) => ({ segmentId: split.segmentId, atNode: split.atNode, spans: split.spans.map((span) => ({ from: span.from, to: span.to, lengthMm: roundMm(span.lengthMm) })) })).sort((a, b) => a.segmentId.localeCompare(b.segmentId)),
  };
}

function declarativePath(canonical) {
  return {
    ok: canonical.summary.structuralValid && canonical.diagnostics.length === 0,
    structuralValid: canonical.summary.structuralValid,
    diagnostics: canonical.diagnostics.length,
    signature: signatureFromCanonical(canonical),
  };
}

function pipeListPath(pipeList, declarative) {
  return {
    ok: pipeList.canonical.summary.structuralValid && pipeList.canonical.diagnostics.length === 0 && !pipeList.pipeListDiagnostics.some((item) => item.severity === 'ERROR') && sameSignature(signatureFromCanonical(declarative), signatureFromCanonical(pipeList.canonical)),
    structuralValid: pipeList.canonical.summary.structuralValid,
    pipeListErrors: pipeList.pipeListDiagnostics.filter((item) => item.severity === 'ERROR').length,
    pipeListInfos: pipeList.pipeListDiagnostics.filter((item) => item.severity === 'INFO').length,
    signature: signatureFromCanonical(pipeList.canonical),
  };
}

function csvReplayPath(rows, macroScript) {
  const commands = rows.map((row) => String(row.command || '').toUpperCase()).filter(Boolean);
  return {
    ok: rows.length === 6 && commands.filter((item) => item === 'POLYLINE').length === 2 && REQUIRED_BM1_MACRO_INTENTS.every((intent) => macroScript.includes(intent)),
    rowCount: rows.length,
    routeRows: commands.filter((item) => item === 'POLYLINE').length,
    macroRows: commands.filter((item) => item !== 'POLYLINE').length,
    commands,
  };
}

function uiHudPath(contract) {
  const actions = [...contract.dashboardActions, ...contract.hudSteps];
  const macros = actions.filter((item) => item.kind === 'macro').map((item) => item.payload.macro || '').join('\n');
  return {
    ok: contract.version === 'bm1-ui-hud-command-contract/v1' && actions.length >= 20 && assertBm1UiHudNoGeometryBuilders(contract) && REQUIRED_BM1_MACRO_INTENTS.every((intent) => macros.includes(intent)),
    dashboardActions: contract.dashboardActions.length,
    hudSteps: contract.hudSteps.length,
    actionKinds: [...new Set(actions.map((item) => item.kind))].sort(),
  };
}

function macroIntentCoverage(csvMacroScript, contract) {
  const contractMacros = [...contract.dashboardActions, ...contract.hudSteps].filter((item) => item.kind === 'macro').map((item) => item.payload.macro || '').join('\n');
  return REQUIRED_BM1_MACRO_INTENTS.every((intent) => csvMacroScript.includes(intent) && contractMacros.includes(intent));
}

function sameSignature(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function roundMm(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function byId(a, b) {
  return a.id.localeCompare(b.id);
}
