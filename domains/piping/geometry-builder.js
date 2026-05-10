import * as THREE from 'three';
import { toThree, SCALE } from '../../geometry/pipe-geometry.js';
import {
  buildPipeDraft, buildBendDraft, buildTeeDraft,
  buildFlangeDraft, buildValveDraft, buildGenericDraft,
  setUserData,
} from '../../js/vendor/buildDraftingScene.js';
import {
  createMessageCircleLabel,
  createMessageSquareLabel,
  createSupportLabel,
} from '../../geometry/labels.js';
import {
  resolveVisualProfile,
  isLineDiagramProfile,
  isDraft2dProfile,
} from '../../core/view/visual-profile.js';
import {
  buildLineDiagramMesh as buildSchematicLineDiagramMesh,
} from './line-diagram-symbols.js';

// ── Line-diagram colour table (mirrors buildDraftingScene COLORS) ─────────────
const LD_COLORS = {
  NavisDark:           { pipe: 0xb8c4d2, fitting: 0x8899aa },
  DraftLight:          { pipe: 0x2d3748, fitting: 0x334455 },
  DraftDark:           { pipe: 0xcbd5e1, fitting: 0x94a3b8 },
  Blueprint:           { pipe: 0xffffff, fitting: 0x93c5fd },
  MonochromeTechnical: { pipe: 0xf5f5f5, fitting: 0xa3a3a3 },
  HighContrastReview:  { pipe: 0x00ff00, fitting: 0xff00ff },
};

function ldColor(theme, key) {
  return (LD_COLORS[theme] || LD_COLORS.NavisDark)[key];
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function _lineSeg(points, color, comp) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(geo, mat);
  if (comp) setUserData(line, comp);
  return line;
}

function normalizeArcSpan(startAngle, endAngle, { clockwise = false, closed = false } = {}) {
  if (closed) return Math.PI * 2;
  let span = endAngle - startAngle;
  if (Math.abs(span) < 1e-9) return Math.PI * 2;

  if (clockwise && span > 0) span -= Math.PI * 2;
  if (!clockwise && span < 0) span += Math.PI * 2;
  return span;
}

/**
 * Generate arc/circle points in MODEL space then convert each with toThree().
 * DXF arcs live in the model XY plane for the drawings handled here.
 */
function _arcPoints(centerMm, radiusMm, aStart, aEnd, segments = 64, options = {}) {
  const center = centerMm || { x: 0, y: 0, z: 0 };
  const radius = finiteNumber(radiusMm, 0);
  if (radius <= 0) return [];

  const span = normalizeArcSpan(
    finiteNumber(aStart, 0),
    finiteNumber(aEnd, 0),
    options
  );
  const segCount = Math.max(8, Math.ceil(Math.abs(span) / (Math.PI * 2) * segments));
  const pts = [];
  for (let i = 0; i <= segCount; i += 1) {
    const a = finiteNumber(aStart, 0) + (i / segCount) * span;
    pts.push(toThree({
      x: center.x + Math.cos(a) * radius,
      y: center.y + Math.sin(a) * radius,
      z: center.z,
    }));
  }
  return pts;
}

/** Build a flat circle ring using model-space generation. */
function _circleRing(centerPt, radiusMm, color, comp, segments = 64) {
  const pts = _arcPoints(centerPt, radiusMm, 0, Math.PI * 2, segments, { closed: true });
  if (!pts.length) return null;
  return _lineSeg(pts, color, comp);
}

function _crossLines(center, halfSize, color, comp) {
  const pts = [
    center.clone().add(new THREE.Vector3(-halfSize, 0, 0)),
    center.clone().add(new THREE.Vector3( halfSize, 0, 0)),
    center.clone().add(new THREE.Vector3(0, -halfSize, 0)),
    center.clone().add(new THREE.Vector3(0,  halfSize, 0)),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color });
  const cross = new THREE.LineSegments(geo, mat);
  if (comp) setUserData(cross, comp);
  return cross;
}

function arcAnglesFromGeometry(g = {}) {
  const cp = g.cp || g.origin;
  const ep1 = g.ep1;
  const ep2 = g.ep2;
  const startAngle = Number.isFinite(Number(g.startAngle))
    ? Number(g.startAngle)
    : ep1 && cp ? Math.atan2(ep1.y - cp.y, ep1.x - cp.x) : 0;
  const endAngle = Number.isFinite(Number(g.endAngle))
    ? Number(g.endAngle)
    : ep2 && cp ? Math.atan2(ep2.y - cp.y, ep2.x - cp.x) : startAngle;
  const radius = Number.isFinite(Number(g.radius))
    ? Number(g.radius)
    : ep1 && cp
      ? Math.sqrt((ep1.x - cp.x) ** 2 + (ep1.y - cp.y) ** 2 + (ep1.z - cp.z) ** 2)
      : 0;
  return { cp, radius, startAngle, endAngle };
}

function buildLineDiagramMesh(comp, theme) {
  const toV = pt => pt ? toThree(pt) : new THREE.Vector3(0, 0, 0);
  const pipeColor    = ldColor(theme, 'pipe');
  const fittingColor = ldColor(theme, 'fitting');
  const g = comp.geometry || {};

  if ((comp.type === 'PIPE' || comp.type === 'LINE') && g.ep1 && g.ep2) {
    return _lineSeg([toV(g.ep1), toV(g.ep2)], pipeColor, comp);
  }

  if (comp.type === 'ARC' || comp.type === 'ARC_SHAPE' || comp.type === 'CIRCLE_SHAPE') {
    return buildArcMesh(comp, theme);
  }

  if (['ELBOW', 'BEND'].includes(comp.type) && g.ep1 && g.ep2) {
    const ep1 = toV(g.ep1);
    const ep2 = toV(g.ep2);
    const cp  = g.cp ? toV(g.cp) : ep1.clone().add(ep2).multiplyScalar(0.5);
    const pts = new THREE.QuadraticBezierCurve3(ep1, cp, ep2).getPoints(8);
    return _lineSeg(pts, pipeColor, comp);
  }

  if (['TEE', 'EQUAL-TEE', 'REDUCING-TEE', 'OLET', 'WELDOLET', 'SOCKOLET', 'THREADOLET'].includes(comp.type)
      && g.ep1 && g.ep2) {
    const ep1 = toV(g.ep1);
    const ep2 = toV(g.ep2);
    const group = new THREE.Group();
    group.add(_lineSeg([ep1, ep2], pipeColor, comp));
    if (g.bp) {
      const mid = ep1.clone().add(ep2).multiplyScalar(0.5);
      group.add(_lineSeg([mid, toV(g.bp)], pipeColor, comp));
    }
    setUserData(group, comp);
    return group;
  }

  // Suppress DXF proxy / annotation / block types — no meaningful stick geometry
  const NO_STICK = new Set(['PROXY_DXF_ENTITY', 'ANNOTATION', 'BLOCK_COMPONENT', 'MESSAGE-CIRCLE', 'MESSAGE-SQUARE', 'SUPPORT']);
  if (NO_STICK.has(comp.type)) return null;

  // Fittings (flange, valve, support, generic) — small cross at origin
  const origin = toV(g.origin || g.ep1 || g.cp || null);
  const halfSize = 25 * SCALE; // 25 mm
  return _crossLines(origin, halfSize, fittingColor, comp);
}

function draft2dColor(theme) {
  const table = {
    NavisDark: { fill: 0x8fa4bc, edge: 0xe7edf6, symbol: 0xf6b161, opacity: 0.2 },
    DraftLight: { fill: 0xbec7d1, edge: 0x2f3f52, symbol: 0xb7632f, opacity: 0.22 },
    DraftDark: { fill: 0xa4b4c8, edge: 0xe9eef8, symbol: 0xd18b48, opacity: 0.2 },
    Blueprint: { fill: 0x6aa3d9, edge: 0xffffff, symbol: 0xffdd8f, opacity: 0.2 },
    MonochromeTechnical: { fill: 0x969696, edge: 0xf1f1f1, symbol: 0xc8c8c8, opacity: 0.2 },
    HighContrastReview: { fill: 0x2f2f2f, edge: 0x00ff00, symbol: 0xff00ff, opacity: 0.15 },
  };
  return table[theme] || table.NavisDark;
}

function decorateAsDraft2d(mesh, comp, theme) {
  if (!mesh) return null;
  const palette = draft2dColor(theme);
  const root = new THREE.Group();
  root.add(mesh);
  mesh.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    const fillColor = ['VALVE', 'FLANGE', 'TEE', 'REDUCER', 'SUPPORT'].includes(comp.type) ? palette.symbol : palette.fill;
    node.material = new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: palette.opacity,
      depthTest: true,
      depthWrite: false,
    });
    const edgesGeo = new THREE.EdgesGeometry(node.geometry);
    const edgesMat = new THREE.LineBasicMaterial({ color: palette.edge, transparent: true, opacity: 0.95 });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    edges.renderOrder = 5;
    setUserData(edges, comp);
    node.add(edges);
  });
  setUserData(root, comp);
  root.renderOrder = 2;
  return root;
}

function buildGuideMesh(comp, theme) {
  const pts = comp.geometry?.points || [];
  if (pts.length < 2) return null;
  const toV = (p) => toThree(p);
  const vecs = pts.map(toV);
  const guideType = String(comp.attributes?.guideType || comp.label || '').toUpperCase().includes('SPLINE') ? 'SPLINE' : 'LINE';
  const color = 0x3b82f6; // blue
  if (guideType === 'SPLINE') {
    const curve = new THREE.CatmullRomCurve3(vecs);
    const curvePts = curve.getPoints(Math.max(60, vecs.length * 12));
    return _lineSeg(curvePts, color, comp);
  }
  return _lineSeg(vecs, color, comp);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a DXF LINE component (or any LINEAR geometry-role component) as a
 * plain line segment between ep1 and ep2.  Falls back to a dot if geometry
 * is missing so the fallback cross/generic draft is never used for lines.
 */
function buildLineMesh(comp, theme) {
  const g = comp.geometry || {};
  if (g.ep1 && g.ep2) {
    const color = ldColor(theme, 'pipe');
    const toV = pt => toThree(pt);
    return _lineSeg([toV(g.ep1), toV(g.ep2)], color, comp);
  }
  const origin = g.origin || g.ep1 || { x: 0, y: 0, z: 0 };
  const o = toThree(origin);
  const halfSize = 5 * SCALE;
  return _crossLines(o, halfSize, ldColor(theme, 'fitting'), comp);
}

/** Render a CIRCLE_SHAPE (drawn with Circle tool) as a flat ring. */
function buildCircleMesh(comp, theme) {
  const g = comp.geometry || {};
  const center = g.origin || g.cp || { x: 0, y: 0, z: 0 };
  const radius = finiteNumber(g.radius, g.bore ? g.bore / 2 : 0);
  if (!radius || radius < 1) return null;
  return _circleRing(center, radius, ldColor(theme, 'pipe'), comp);
}

/** Render an ARC_SHAPE (drawn with Arc tool: center + startPt + endPt). */
function buildArcShapeMesh(comp, theme) {
  return buildArcMesh(comp, theme);
}

/** Render a DXF ARC / CIRCLE entity using model-space arc generation. */
function buildArcMesh(comp, theme) {
  const g = comp.geometry || {};
  if (comp.type === 'CIRCLE_SHAPE') return buildCircleMesh(comp, theme);
  const { cp, radius, startAngle, endAngle } = arcAnglesFromGeometry(g);
  if (!cp || radius < 1) return null;

  const pts = _arcPoints(cp, radius, startAngle, endAngle, 64, {
    clockwise: Boolean(g.clockwise),
    closed: Boolean(g.closed),
  });
  if (!pts.length) return null;
  return _lineSeg(pts, ldColor(theme, 'pipe'), comp);
}

const MESH_DISPATCH = {
  'GUIDE':               buildGuideMesh,
  'LINE':                buildLineMesh,
  'CIRCLE_SHAPE':        buildCircleMesh,
  'ARC_SHAPE':           buildArcShapeMesh,
  'ARC':                 buildArcMesh,
  'PIPE':                buildPipeDraft,
  'ELBOW':               buildBendDraft,
  'BEND':                buildBendDraft,
  'TEE':                 buildTeeDraft,
  'EQUAL-TEE':           buildTeeDraft,
  'REDUCING-TEE':        buildTeeDraft,
  'OLET':                buildTeeDraft,
  'WELDOLET':            buildTeeDraft,
  'SOCKOLET':            buildTeeDraft,
  'THREADOLET':          buildTeeDraft,
  'FLANGE':              buildFlangeDraft,
  'BLIND-FLANGE':        buildFlangeDraft,
  'VALVE':               buildValveDraft,
  'CHECK-VALVE':         buildValveDraft,
  'CONTROL-VALVE':       buildValveDraft,
  'SAFETY-VALVE':        buildValveDraft,
  'REDUCER':             buildGenericDraft,
  'CONCENTRIC-REDUCER':  buildGenericDraft,
  'ECCENTRIC-REDUCER':   buildGenericDraft,
  'CAP':                 buildGenericDraft,
  'COUPLING':            buildGenericDraft,
  'UNION':               buildGenericDraft,
  'CROSS':               buildGenericDraft,
  'GASKET':              buildGenericDraft,
  'STRAINER':            buildGenericDraft,
  'FILTER':              buildGenericDraft,
  'INSTRUMENT':          buildGenericDraft,
  'SUPPORT':             null,           // handled by buildSymbol
  'MESSAGE-CIRCLE':      null,           // label-only
  'MESSAGE-SQUARE':      null,           // label-only
  'PROXY_DXF_ENTITY':    null,           // unsupported DXF entity — no geometry to show
  'ANNOTATION':          null,           // DXF TEXT/MTEXT — label only, no mesh
  'BLOCK_COMPONENT':     null,           // DXF INSERT — no standalone geometry
};

export function buildMesh(comp, theme, options = {}) {
  const visualProfile = resolveVisualProfile({
    visualProfile: options.visualProfile,
    lineDiagram: options.lineDiagram,
    lineDiagramEnabled: options.lineDiagramEnabled,
    wireframe: options.wireframe,
    draft2d: options.draft2d,
    solid3d: options.solid3d,
  });

  if (isLineDiagramProfile(visualProfile)) {
    return buildSchematicLineDiagramMesh(comp, theme);
  }

  const draft2d = isDraft2dProfile(visualProfile);
  const builder = MESH_DISPATCH[comp.type];

  if (builder === undefined) {
    const fallback = buildGenericDraft(comp, theme);
    return draft2d ? decorateAsDraft2d(fallback, comp, theme) : fallback;
  }

  if (builder === null) return null;

  const mesh = builder(comp, theme);
  return draft2d ? decorateAsDraft2d(mesh, comp, theme) : mesh;
}

export function buildLabel(comp) {
  switch (comp.type) {
    case 'MESSAGE-CIRCLE':
      return comp.metadata.circleText
        ? createMessageCircleLabel(comp.metadata.circleText, comp.geometry.origin)
        : null;
    case 'MESSAGE-SQUARE':
      return comp.metadata.squareText
        ? createMessageSquareLabel(comp.metadata.squareText, comp.metadata.squarePos || comp.geometry.origin)
        : null;
    case 'SUPPORT': {
      const name = comp.attributes['<SUPPORT_NAME>'] || comp.attributes['SUPPORT_NAME'] || comp.attributes['SUPPORT-NAME'];
      return name ? createSupportLabel(name, comp.geometry.origin) : null;
    }
    default:
      return null;
  }
}
