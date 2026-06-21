import * as THREE from 'three';
import { toThree, SCALE } from '../../geometry/pipe-geometry.js';
import { setUserData } from '../../js/vendor/buildDraftingScene.js';

const PALETTES = {
  NavisDark: {
    pipeEdge: 0xe7edf6,
    centerline: 0xf6b161,
    fitting: 0xf6b161,
    support: 0xffd38a,
    guide: 0x60a5fa,
  },
  DraftLight: {
    pipeEdge: 0x243041,
    centerline: 0xb7632f,
    fitting: 0x8a4f24,
    support: 0x8a4f24,
    guide: 0x2563eb,
  },
  DraftDark: {
    pipeEdge: 0xe9eef8,
    centerline: 0xd18b48,
    fitting: 0xd18b48,
    support: 0xf0b56c,
    guide: 0x60a5fa,
  },
  Blueprint: {
    pipeEdge: 0xffffff,
    centerline: 0xffdd8f,
    fitting: 0xffdd8f,
    support: 0xffdd8f,
    guide: 0x93c5fd,
  },
  MonochromeTechnical: {
    pipeEdge: 0xf1f1f1,
    centerline: 0xc8c8c8,
    fitting: 0xd4d4d4,
    support: 0xd4d4d4,
    guide: 0xc8c8c8,
  },
  HighContrastReview: {
    pipeEdge: 0x00ff00,
    centerline: 0xffff00,
    fitting: 0xff00ff,
    support: 0xffff00,
    guide: 0x00ffff,
  },
};

function palette(theme) {
  return PALETTES[theme] || PALETTES.NavisDark;
}
function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function v(point) {
  return point ? toThree(point) : new THREE.Vector3(0, 0, 0);
}
function makeGroup(comp) {
  const root = new THREE.Group();
  setUserData(root, comp);
  root.userData.visualProfile = 'draft2d';
  root.userData.draft2d = true;
  root.renderOrder = 10;
  return root;
}
function makeLine(points, color, comp, options = {}) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = options.dashed
    ? new THREE.LineDashedMaterial({
        color,
        dashSize: options.dashSize ?? 0.12,
        gapSize: options.gapSize ?? 0.06,
        depthTest: true,
        depthWrite: false,
      })
    : new THREE.LineBasicMaterial({
        color,
        depthTest: true,
        depthWrite: false,
      });
  const line = new THREE.Line(geometry, material);
  if (options.dashed) {
    line.computeLineDistances?.();
  }
  line.userData.visualProfile = 'draft2d';
  line.userData.draft2d = true;
  if (comp) setUserData(line, comp);
  return line;
}
function makeSegments(points, color, comp) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: true,
    depthWrite: false,
  });
  const segments = new THREE.LineSegments(geometry, material);
  segments.userData.visualProfile = 'draft2d';
  segments.userData.draft2d = true;
  if (comp) setUserData(segments, comp);
  return segments;
}
function midpoint(a, b) {
  return a.clone().add(b).multiplyScalar(0.5);
}
function direction(a, b) {
  const d = b.clone().sub(a);
  if (d.lengthSq() < 1e-12) return new THREE.Vector3(0, 0, 1);
  return d.normalize();
}
function perpDraftPlane(dir) {
  const p = new THREE.Vector3(-dir.z, 0, dir.x);
  if (p.lengthSq() < 1e-12) return new THREE.Vector3(1, 0, 0);
  return p.normalize();
}
function centerFromGeometry(g = {}) {
  return v(g.origin || g.cp || g.bp || g.supportCoord || g.ep1 || { x: 0, y: 0, z: 0 });
}
function endpoints(g = {}) {
  const ep1 = g.ep1 ? v(g.ep1) : null;
  const ep2 = g.ep2 ? v(g.ep2) : null;
  if (ep1 && ep2) return { ep1, ep2 };
  const c = centerFromGeometry(g);
  const half = 80 * SCALE;
  return {
    ep1: c.clone().add(new THREE.Vector3(0, 0, -half)),
    ep2: c.clone().add(new THREE.Vector3(0, 0, half)),
  };
}
function pipeHalfWidth(comp) {
  const g = comp.geometry || {};
  const bore = finiteNumber(
    g.bore ?? g.od ?? comp.attributes?.OD ?? comp.attributes?.NPS,
    100
  );
  return Math.max(16, Math.min(90, bore / 2)) * SCALE;
}
function addDoubleLinePipe(root, comp, ep1, ep2, edgeColor, centerColor, options = {}) {
  const dir = direction(ep1, ep2);
  const perp = perpDraftPlane(dir);
  const halfWidth = options.halfWidth ?? pipeHalfWidth(comp);
  const a1 = ep1.clone().add(perp.clone().multiplyScalar(halfWidth));
  const a2 = ep2.clone().add(perp.clone().multiplyScalar(halfWidth));
  const b1 = ep1.clone().add(perp.clone().multiplyScalar(-halfWidth));
  const b2 = ep2.clone().add(perp.clone().multiplyScalar(-halfWidth));
  root.add(makeLine([a1, a2], edgeColor, comp));
  root.add(makeLine([b1, b2], edgeColor, comp));
  root.add(makeLine([ep1, ep2], centerColor, comp, {
    dashed: true,
    dashSize: 0.12,
    gapSize: 0.06,
  }));
  if (options.endCaps !== false) {
    root.add(makeSegments([a1, b1, a2, b2], edgeColor, comp));
  }
  return {
    dir,
    perp,
    halfWidth,
    edges: { a1, a2, b1, b2 },
  };
}
function arcSpan(startAngle, endAngle, closed = false) {
  if (closed) return Math.PI * 2;
  let span = finiteNumber(endAngle, 0) - finiteNumber(startAngle, 0);
  if (Math.abs(span) < 1e-9) return Math.PI * 2;
  if (span < 0) span += Math.PI * 2;
  return span;
}
function arcModelPoints(g = {}, segmentCount = 48) {
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
    out.push({
      x: cp.x + Math.cos(a) * radius,
      y: cp.y + Math.sin(a) * radius,
      z: cp.z || 0,
    });
  }
  return out;
}
function offsetPolyline(points, halfWidth) {
  if (!points || points.length < 2) {
    return {
      left: points || [],
      right: points || [],
    };
  }
  const left = [];
  const right = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dir = direction(prev, next);
    const perp = perpDraftPlane(dir);
    left.push(points[i].clone().add(perp.clone().multiplyScalar(halfWidth)));
    right.push(points[i].clone().add(perp.clone().multiplyScalar(-halfWidth)));
  }
  return { left, right };
}
function addDoubleLineCurve(root, comp, points, edgeColor, centerColor) {
  if (!points || points.length < 2) return;
  const halfWidth = pipeHalfWidth(comp);
  const { left, right } = offsetPolyline(points, halfWidth);
  root.add(makeLine(left, edgeColor, comp));
  root.add(makeLine(right, edgeColor, comp));
  root.add(makeLine(points, centerColor, comp, {
    dashed: true,
    dashSize: 0.12,
    gapSize: 0.06,
  }));
}
export function buildDraft2dPipe(comp, theme) {
  const pal = palette(theme);
  const { ep1, ep2 } = endpoints(comp.geometry || {});
  const root = makeGroup(comp);
  addDoubleLinePipe(root, comp, ep1, ep2, pal.pipeEdge, pal.centerline);
  return root;
}
export function buildDraft2dLine(comp, theme) {
  return buildDraft2dPipe(comp, theme);
}
export function buildDraft2dArc(comp, theme) {
  const pal = palette(theme);
  const modelPts = arcModelPoints(comp.geometry || {}, 64);
  const root = makeGroup(comp);
  if (modelPts.length >= 2) {
    addDoubleLineCurve(root, comp, modelPts.map(v), pal.pipeEdge, pal.centerline);
    return root;
  }
  return buildDraft2dPipe(comp, theme);
}
export function buildDraft2dBend(comp, theme) {
  const pal = palette(theme);
  const g = comp.geometry || {};
  const root = makeGroup(comp);
  const modelPts = arcModelPoints(g, 48);
  if (modelPts.length >= 2) {
    addDoubleLineCurve(root, comp, modelPts.map(v), pal.pipeEdge, pal.centerline);
    return root;
  }
  const { ep1, ep2 } = endpoints(g);
  const cp = g.cp ? v(g.cp) : midpoint(ep1, ep2);
  const curvePts = new THREE.QuadraticBezierCurve3(ep1, cp, ep2).getPoints(32);
  addDoubleLineCurve(root, comp, curvePts, pal.pipeEdge, pal.centerline);
  return root;
}
export function buildDraft2dTee(comp, theme) {
  const pal = palette(theme);
  const g = comp.geometry || {};
  const { ep1, ep2 } = endpoints(g);
  const root = makeGroup(comp);
  addDoubleLinePipe(root, comp, ep1, ep2, pal.pipeEdge, pal.centerline, {
    endCaps: false,
  });
  const mid = midpoint(ep1, ep2);
  const branchEnd = g.bp
    ? v(g.bp)
    : mid.clone().add(perpDraftPlane(direction(ep1, ep2)).multiplyScalar(260 * SCALE));
  addDoubleLinePipe(root, comp, mid, branchEnd, pal.pipeEdge, pal.centerline, {
    endCaps: true,
  });
  const branchDir = direction(mid, branchEnd);
  const branchPerp = perpDraftPlane(branchDir);
  const tick = pipeHalfWidth(comp) * 1.15;
  root.add(makeSegments([
    branchEnd.clone().add(branchPerp.clone().multiplyScalar(-tick)),
    branchEnd.clone().add(branchPerp.clone().multiplyScalar( tick)),
  ], pal.fitting, comp));
  return root;
}
export function buildDraft2dValve(comp, theme) {
  const pal = palette(theme);
  const { ep1, ep2 } = endpoints(comp.geometry || {});
  const root = makeGroup(comp);
  addDoubleLinePipe(root, comp, ep1, ep2, pal.pipeEdge, pal.centerline, {
    endCaps: false,
  });
  const mid = midpoint(ep1, ep2);
  const dir = direction(ep1, ep2);
  const perp = perpDraftPlane(dir);
  const halfLen = Math.max(55 * SCALE, Math.min(140 * SCALE, ep1.distanceTo(ep2) * 0.10));
  const halfHt = pipeHalfWidth(comp) * 1.45;
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
  ], pal.fitting, comp));
  const stemTop = top.clone().add(perp.clone().multiplyScalar(55 * SCALE));
  const handLeft = stemTop.clone().add(dir.clone().multiplyScalar(-35 * SCALE));
  const handRight = stemTop.clone().add(dir.clone().multiplyScalar( 35 * SCALE));
  root.add(makeSegments([
    top, stemTop,
    handLeft, handRight,
  ], pal.fitting, comp));
  return root;
}
export function buildDraft2dFlange(comp, theme) {
  const pal = palette(theme);
  const { ep1, ep2 } = endpoints(comp.geometry || {});
  const root = makeGroup(comp);
  addDoubleLinePipe(root, comp, ep1, ep2, pal.pipeEdge, pal.centerline, {
    endCaps: false,
  });
  const mid = midpoint(ep1, ep2);
  const dir = direction(ep1, ep2);
  const perp = perpDraftPlane(dir);
  const tick = pipeHalfWidth(comp) * 1.45;
  const spacing = 25 * SCALE;
  const a = mid.clone().add(dir.clone().multiplyScalar(-spacing));
  const b = mid.clone().add(dir.clone().multiplyScalar( spacing));
  root.add(makeSegments([
    a.clone().add(perp.clone().multiplyScalar(-tick)),
    a.clone().add(perp.clone().multiplyScalar( tick)),
    b.clone().add(perp.clone().multiplyScalar(-tick)),
    b.clone().add(perp.clone().multiplyScalar( tick)),
  ], pal.fitting, comp));
  return root;
}
export function buildDraft2dReducer(comp, theme) {
  const pal = palette(theme);
  const { ep1, ep2 } = endpoints(comp.geometry || {});
  const root = makeGroup(comp);
  const dir = direction(ep1, ep2);
  const perp = perpDraftPlane(dir);
  const h1 = pipeHalfWidth(comp) * 1.20;
  const h2 = h1 * 0.55;
  root.add(makeLine([ep1, ep2], pal.centerline, comp, {
    dashed: true,
    dashSize: 0.12,
    gapSize: 0.06,
  }));
  root.add(makeSegments([
    ep1.clone().add(perp.clone().multiplyScalar( h1)),
    ep2.clone().add(perp.clone().multiplyScalar( h2)),
    ep1.clone().add(perp.clone().multiplyScalar(-h1)),
    ep2.clone().add(perp.clone().multiplyScalar(-h2)),
    ep1.clone().add(perp.clone().multiplyScalar( h1)),
    ep1.clone().add(perp.clone().multiplyScalar(-h1)),
    ep2.clone().add(perp.clone().multiplyScalar( h2)),
    ep2.clone().add(perp.clone().multiplyScalar(-h2)),
  ], pal.pipeEdge, comp));
  return root;
}
export function buildDraft2dSupport(comp, theme) {
  const pal = palette(theme);
  const root = makeGroup(comp);
  const origin = centerFromGeometry(comp.geometry || {});
  const down = new THREE.Vector3(0, -1, 0);
  const right = new THREE.Vector3(1, 0, 0);
  const top = origin.clone();
  const base = origin.clone().add(down.clone().multiplyScalar(100 * SCALE));
  const footLeft = base.clone().add(right.clone().multiplyScalar(-55 * SCALE));
  const footRight = base.clone().add(right.clone().multiplyScalar( 55 * SCALE));
  root.add(makeSegments([
    top, base,
    base, footLeft,
    base, footRight,
    footLeft, footRight,
  ], pal.support, comp));
  return root;
}
export function buildDraft2dGuide(comp, theme) {
  const pal = palette(theme);
  const pts = Array.isArray(comp.geometry?.points)
    ? comp.geometry.points.map(v)
    : [];
  if (pts.length < 2) return null;
  const root = makeGroup(comp);
  const guideType = String(comp.attributes?.guideType || comp.label || '').toUpperCase();
  if (guideType.includes('SPLINE') && pts.length >= 3) {
    const curve = new THREE.CatmullRomCurve3(pts);
    root.add(makeLine(curve.getPoints(Math.max(60, pts.length * 12)), pal.guide, comp, {
      dashed: true,
      dashSize: 0.10,
      gapSize: 0.05,
    }));
    return root;
  }
  root.add(makeLine(pts, pal.guide, comp, {
    dashed: true,
    dashSize: 0.10,
    gapSize: 0.05,
  }));
  return root;
}
export function buildDraft2dGeneric(comp, theme) {
  const pal = palette(theme);
  const { ep1, ep2 } = endpoints(comp.geometry || {});
  const root = makeGroup(comp);
  addDoubleLinePipe(root, comp, ep1, ep2, pal.pipeEdge, pal.centerline, {
    endCaps: true,
  });
  const mid = midpoint(ep1, ep2);
  const dir = direction(ep1, ep2);
  const perp = perpDraftPlane(dir);
  const s = Math.max(28 * SCALE, pipeHalfWidth(comp));
  root.add(makeSegments([
    mid.clone().add(dir.clone().multiplyScalar(-s)),
    mid.clone().add(dir.clone().multiplyScalar( s)),
    mid.clone().add(perp.clone().multiplyScalar(-s)),
    mid.clone().add(perp.clone().multiplyScalar( s)),
  ], pal.fitting, comp));
  return root;
}
export function buildDraft2dMesh(comp, theme) {
  if (!comp) return null;
  const type = String(comp.type || '').toUpperCase();
  if (type === 'PIPE') return buildDraft2dPipe(comp, theme);
  if (type === 'LINE') return buildDraft2dLine(comp, theme);
  if (type === 'ARC' || type === 'ARC_SHAPE' || type === 'CIRCLE_SHAPE') {
    return buildDraft2dArc(comp, theme);
  }
  if (type === 'ELBOW' || type === 'BEND') {
    return buildDraft2dBend(comp, theme);
  }
  if ([
    'TEE',
    'EQUAL-TEE',
    'REDUCING-TEE',
    'OLET',
    'WELDOLET',
    'SOCKOLET',
    'THREADOLET',
  ].includes(type)) {
    return buildDraft2dTee(comp, theme);
  }
  if ([
    'VALVE',
    'CHECK-VALVE',
    'CONTROL-VALVE',
    'SAFETY-VALVE',
  ].includes(type)) {
    return buildDraft2dValve(comp, theme);
  }
  if (type === 'FLANGE' || type === 'BLIND-FLANGE') {
    return buildDraft2dFlange(comp, theme);
  }
  if ([
    'REDUCER',
    'CONCENTRIC-REDUCER',
    'ECCENTRIC-REDUCER',
  ].includes(type)) {
    return buildDraft2dReducer(comp, theme);
  }
  if (type === 'SUPPORT') return buildDraft2dSupport(comp, theme);
  if (type === 'GUIDE') return buildDraft2dGuide(comp, theme);
  if ([
    'PROXY_DXF_ENTITY',
    'ANNOTATION',
    'BLOCK_COMPONENT',
    'MESSAGE-CIRCLE',
    'MESSAGE-SQUARE',
  ].includes(type)) {
    return null;
  }
  return buildDraft2dGeneric(comp, theme);
}
