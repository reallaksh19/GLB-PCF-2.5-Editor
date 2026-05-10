import * as THREE from 'three';
import { toThree, SCALE } from '../../geometry/pipe-geometry.js';
import { setUserData } from '../../js/vendor/buildDraftingScene.js';

const COLORS = {
  NavisDark:           { pipe: 0xb8c4d2, fitting: 0x8899aa, support: 0xf6b161 },
  DraftLight:          { pipe: 0x2d3748, fitting: 0x334455, support: 0xb7632f },
  DraftDark:           { pipe: 0xcbd5e1, fitting: 0x94a3b8, support: 0xd18b48 },
  Blueprint:           { pipe: 0xffffff, fitting: 0x93c5fd, support: 0xffdd8f },
  MonochromeTechnical: { pipe: 0xf5f5f5, fitting: 0xa3a3a3, support: 0xc8c8c8 },
  HighContrastReview:  { pipe: 0x00ff00, fitting: 0xff00ff, support: 0xffff00 },
};

function palette(theme) {
  return COLORS[theme] || COLORS.NavisDark;
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function makeGroup(comp) {
  const root = new THREE.Group();
  setUserData(root, comp);
  root.userData.visualProfile = 'lineDiagram';
  root.userData.lineDiagram = true;
  return root;
}

function makeLine(points, color, comp) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    depthTest: true,
    depthWrite: false,
  });

  const line = new THREE.Line(geo, mat);
  line.userData.visualProfile = 'lineDiagram';
  line.userData.lineDiagram = true;
  if (comp) setUserData(line, comp);
  return line;
}

function makeSegments(points, color, comp) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    depthTest: true,
    depthWrite: false,
  });

  const seg = new THREE.LineSegments(geo, mat);
  seg.userData.visualProfile = 'lineDiagram';
  seg.userData.lineDiagram = true;
  if (comp) setUserData(seg, comp);
  return seg;
}

function v(point) {
  return point ? toThree(point) : new THREE.Vector3(0, 0, 0);
}

function midpoint(a, b) {
  return a.clone().add(b).multiplyScalar(0.5);
}

function direction(a, b) {
  const d = b.clone().sub(a);
  if (d.lengthSq() < 1e-12) return new THREE.Vector3(1, 0, 0);
  return d.normalize();
}

function perpDraftPlane(dir) {
  const p = new THREE.Vector3(-dir.z, 0, dir.x);
  if (p.lengthSq() < 1e-12) return new THREE.Vector3(1, 0, 0);
  return p.normalize();
}

function centerFromGeometry(g = {}) {
  return v(g.origin || g.cp || g.bp || g.ep1 || { x: 0, y: 0, z: 0 });
}

function endpoints(g = {}) {
  const ep1 = g.ep1 ? v(g.ep1) : null;
  const ep2 = g.ep2 ? v(g.ep2) : null;

  if (ep1 && ep2) return { ep1, ep2 };

  const c = centerFromGeometry(g);
  const half = 80 * SCALE;

  return {
    ep1: c.clone().add(new THREE.Vector3(-half, 0, 0)),
    ep2: c.clone().add(new THREE.Vector3( half, 0, 0)),
  };
}

function symbolSizeFromSpan(a, b, minMm = 45, maxMm = 140, factor = 0.12) {
  const mm = a.distanceTo(b) / SCALE;
  return Math.max(minMm, Math.min(maxMm, mm * factor)) * SCALE;
}

function arcSpan(startAngle, endAngle, closed = false) {
  if (closed) return Math.PI * 2;

  let span = finiteNumber(endAngle, 0) - finiteNumber(startAngle, 0);

  if (Math.abs(span) < 1e-9) return Math.PI * 2;
  if (span < 0) span += Math.PI * 2;

  return span;
}

function arcPoints(g = {}, segmentCount = 32) {
  const cp = g.cp || g.origin || g.center;
  const ep1 = g.ep1;
  const ep2 = g.ep2;

  if (!cp) return [];

  const startAngle = Number.isFinite(Number(g.startAngle))
    ? Number(g.startAngle)
    : ep1 ? Math.atan2(ep1.y - cp.y, ep1.x - cp.x) : 0;

  const endAngle = Number.isFinite(Number(g.endAngle))
    ? Number(g.endAngle)
    : ep2 ? Math.atan2(ep2.y - cp.y, ep2.x - cp.x) : startAngle + Math.PI / 2;

  const radius = Number.isFinite(Number(g.radius))
    ? Number(g.radius)
    : ep1
      ? Math.sqrt(
          (ep1.x - cp.x) ** 2 +
          (ep1.y - cp.y) ** 2 +
          (ep1.z - cp.z) ** 2
        )
      : 0;

  if (!radius || radius <= 0) return [];

  const span = arcSpan(startAngle, endAngle, Boolean(g.closed));
  const n = Math.max(8, segmentCount);
  const out = [];

  for (let i = 0; i <= n; i += 1) {
    const a = startAngle + (i / n) * span;
    out.push(toThree({
      x: cp.x + Math.cos(a) * radius,
      y: cp.y + Math.sin(a) * radius,
      z: cp.z || 0,
    }));
  }

  return out;
}

export function buildLineStick(comp, theme) {
  const c = palette(theme);
  const { ep1, ep2 } = endpoints(comp.geometry || {});
  const root = makeGroup(comp);

  root.add(makeLine([ep1, ep2], c.pipe, comp));
  return root;
}

export function buildArcStick(comp, theme) {
  const c = palette(theme);
  const pts = arcPoints(comp.geometry || {}, 48);

  if (pts.length < 2) return buildLineStick(comp, theme);

  const root = makeGroup(comp);
  root.add(makeLine(pts, c.pipe, comp));
  return root;
}

export function buildBendStick(comp, theme) {
  const c = palette(theme);
  const g = comp.geometry || {};
  const pts = arcPoints(g, 32);

  const root = makeGroup(comp);

  if (pts.length >= 2) {
    root.add(makeLine(pts, c.pipe, comp));
    return root;
  }

  const { ep1, ep2 } = endpoints(g);
  const cp = g.cp ? v(g.cp) : midpoint(ep1, ep2);
  const curvePts = new THREE.QuadraticBezierCurve3(ep1, cp, ep2).getPoints(16);

  root.add(makeLine(curvePts, c.pipe, comp));
  return root;
}

export function buildTeeStick(comp, theme) {
  const c = palette(theme);
  const g = comp.geometry || {};
  const { ep1, ep2 } = endpoints(g);
  const root = makeGroup(comp);

  root.add(makeLine([ep1, ep2], c.pipe, comp));

  const mid = midpoint(ep1, ep2);
  const branchEnd = g.bp
    ? v(g.bp)
    : mid.clone().add(perpDraftPlane(direction(ep1, ep2)).multiplyScalar(140 * SCALE));

  root.add(makeLine([mid, branchEnd], c.pipe, comp));

  const dir = direction(mid, branchEnd);
  const perp = perpDraftPlane(dir);
  const tick = 18 * SCALE;

  root.add(makeSegments([
    branchEnd.clone().add(perp.clone().multiplyScalar(-tick)),
    branchEnd.clone().add(perp.clone().multiplyScalar( tick)),
  ], c.fitting, comp));

  return root;
}

export function buildValveStick(comp, theme) {
  const c = palette(theme);
  const { ep1, ep2 } = endpoints(comp.geometry || {});
  const root = makeGroup(comp);

  root.add(makeLine([ep1, ep2], c.pipe, comp));

  const mid = midpoint(ep1, ep2);
  const dir = direction(ep1, ep2);
  const perp = perpDraftPlane(dir);
  const halfLen = symbolSizeFromSpan(ep1, ep2, 50, 110, 0.10);
  const halfHt = Math.max(28 * SCALE, halfLen * 0.48);

  const left = mid.clone().add(dir.clone().multiplyScalar(-halfLen));
  const right = mid.clone().add(dir.clone().multiplyScalar( halfLen));
  const top = mid.clone().add(perp.clone().multiplyScalar(halfHt));
  const bottom = mid.clone().add(perp.clone().multiplyScalar(-halfHt));

  root.add(makeSegments([
    left, top,
    top, right,
    right, bottom,
    bottom, left,
    left, right,
    top, bottom,
  ], c.fitting, comp));

  const stemTop = top.clone().add(perp.clone().multiplyScalar(45 * SCALE));
  root.add(makeSegments([top, stemTop], c.fitting, comp));

  return root;
}

export function buildFlangeStick(comp, theme) {
  const c = palette(theme);
  const { ep1, ep2 } = endpoints(comp.geometry || {});
  const root = makeGroup(comp);

  root.add(makeLine([ep1, ep2], c.pipe, comp));

  const mid = midpoint(ep1, ep2);
  const dir = direction(ep1, ep2);
  const perp = perpDraftPlane(dir);
  const tickHalf = 42 * SCALE;
  const spacing = 25 * SCALE;

  const a = mid.clone().add(dir.clone().multiplyScalar(-spacing));
  const b = mid.clone().add(dir.clone().multiplyScalar( spacing));

  root.add(makeSegments([
    a.clone().add(perp.clone().multiplyScalar(-tickHalf)),
    a.clone().add(perp.clone().multiplyScalar( tickHalf)),
    b.clone().add(perp.clone().multiplyScalar(-tickHalf)),
    b.clone().add(perp.clone().multiplyScalar( tickHalf)),
  ], c.fitting, comp));

  return root;
}

export function buildReducerStick(comp, theme) {
  const c = palette(theme);
  const { ep1, ep2 } = endpoints(comp.geometry || {});
  const root = makeGroup(comp);

  root.add(makeLine([ep1, ep2], c.pipe, comp));

  const mid = midpoint(ep1, ep2);
  const dir = direction(ep1, ep2);
  const perp = perpDraftPlane(dir);
  const len = symbolSizeFromSpan(ep1, ep2, 60, 140, 0.16);
  const h1 = 44 * SCALE;
  const h2 = 22 * SCALE;

  const left = mid.clone().add(dir.clone().multiplyScalar(-len));
  const right = mid.clone().add(dir.clone().multiplyScalar(len));

  root.add(makeSegments([
    left.clone().add(perp.clone().multiplyScalar( h1)),
    right.clone().add(perp.clone().multiplyScalar( h2)),
    left.clone().add(perp.clone().multiplyScalar(-h1)),
    right.clone().add(perp.clone().multiplyScalar(-h2)),
  ], c.fitting, comp));

  return root;
}

export function buildSupportStick(comp, theme) {
  const c = palette(theme);
  const root = makeGroup(comp);

  const origin = centerFromGeometry(comp.geometry || {});
  const down = new THREE.Vector3(0, -1, 0);
  const right = new THREE.Vector3(1, 0, 0);

  const top = origin.clone();
  const base = origin.clone().add(down.clone().multiplyScalar(80 * SCALE));
  const footL = base.clone().add(right.clone().multiplyScalar(-45 * SCALE));
  const footR = base.clone().add(right.clone().multiplyScalar( 45 * SCALE));

  root.add(makeSegments([
    top, base,
    base, footL,
    base, footR,
    footL, footR,
  ], c.support, comp));

  return root;
}

export function buildGenericFittingStick(comp, theme) {
  const c = palette(theme);
  const { ep1, ep2 } = endpoints(comp.geometry || {});
  const root = makeGroup(comp);

  root.add(makeLine([ep1, ep2], c.pipe, comp));

  const mid = midpoint(ep1, ep2);
  const dir = direction(ep1, ep2);
  const perp = perpDraftPlane(dir);
  const size = 35 * SCALE;

  root.add(makeSegments([
    mid.clone().add(dir.clone().multiplyScalar(-size)),
    mid.clone().add(dir.clone().multiplyScalar( size)),
    mid.clone().add(perp.clone().multiplyScalar(-size)),
    mid.clone().add(perp.clone().multiplyScalar( size)),
  ], c.fitting, comp));

  return root;
}

export function buildLineDiagramMesh(comp, theme) {
  if (!comp) return null;

  const type = String(comp.type || '').toUpperCase();

  if (type === 'PIPE' || type === 'LINE') return buildLineStick(comp, theme);
  if (type === 'ARC' || type === 'ARC_SHAPE' || type === 'CIRCLE_SHAPE') return buildArcStick(comp, theme);
  if (type === 'ELBOW' || type === 'BEND') return buildBendStick(comp, theme);

  if ([
    'TEE',
    'EQUAL-TEE',
    'REDUCING-TEE',
    'OLET',
    'WELDOLET',
    'SOCKOLET',
    'THREADOLET',
  ].includes(type)) {
    return buildTeeStick(comp, theme);
  }

  if ([
    'VALVE',
    'CHECK-VALVE',
    'CONTROL-VALVE',
    'SAFETY-VALVE',
  ].includes(type)) {
    return buildValveStick(comp, theme);
  }

  if (type === 'FLANGE' || type === 'BLIND-FLANGE') return buildFlangeStick(comp, theme);

  if ([
    'REDUCER',
    'CONCENTRIC-REDUCER',
    'ECCENTRIC-REDUCER',
  ].includes(type)) {
    return buildReducerStick(comp, theme);
  }

  if (type === 'SUPPORT') return buildSupportStick(comp, theme);

  if ([
    'PROXY_DXF_ENTITY',
    'ANNOTATION',
    'BLOCK_COMPONENT',
    'MESSAGE-CIRCLE',
    'MESSAGE-SQUARE',
  ].includes(type)) {
    return null;
  }

  return buildGenericFittingStick(comp, theme);
}
