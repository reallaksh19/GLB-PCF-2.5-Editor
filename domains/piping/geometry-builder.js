import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
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

function _lineSeg(points, color, comp) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(geo, mat);
  if (comp) setUserData(line, comp);
  return line;
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

function buildLineDiagramMesh(comp, theme) {
  const toV = pt => pt ? toThree(pt) : new THREE.Vector3(0, 0, 0);
  const pipeColor    = ldColor(theme, 'pipe');
  const fittingColor = ldColor(theme, 'fitting');
  const g = comp.geometry || {};

  if (comp.type === 'PIPE' && g.ep1 && g.ep2) {
    return _lineSeg([toV(g.ep1), toV(g.ep2)], pipeColor, comp);
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
  const guideType = comp.label?.includes('SPLINE') ? 'SPLINE' : 'LINE';
  const color = 0x3b82f6; // blue
  if (guideType === 'SPLINE') {
    const curve = new THREE.CatmullRomCurve3(vecs);
    const curvePts = curve.getPoints(Math.max(60, vecs.length * 12));
    return _lineSeg(curvePts, color, comp);
  }
  return _lineSeg(vecs, color, comp);
}

// ─────────────────────────────────────────────────────────────────────────────

const MESH_DISPATCH = {
  'GUIDE':               buildGuideMesh,
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
};

export function buildMesh(comp, theme, options = {}) {
  if (options.visualProfile === 'stick' || options.lineDiagram) return buildLineDiagramMesh(comp, theme);
  const builder = MESH_DISPATCH[comp.type];
  if (builder === undefined) {
    const fallback = buildGenericDraft(comp, theme);
    return options.visualProfile === 'draft2d' ? decorateAsDraft2d(fallback, comp, theme) : fallback;
  }
  if (builder === null)      return null;                             // intentionally no mesh
  const mesh = builder(comp, theme);
  return options.visualProfile === 'draft2d' ? decorateAsDraft2d(mesh, comp, theme) : mesh;
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
