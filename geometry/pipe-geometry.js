/**
 * pipe-geometry.js - Helpers to build Three.js geometry for pipe segments and bends.
 * All coordinates are in millimetres; scene scale: 1 unit = 1 mm.
 */

import * as THREE from 'three';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Line2 }        from 'three/addons/lines/Line2.js';
import { state } from '../core/state.js';

/** Colour palette by OD (mm) - matches legend */
export const OD_COLORS = [
  { od: 406.4,   color: 0xe07020, label: 'Ø406.4 mm' },  // orange
  { od: 323.85,  color: 0x1a6ec7, label: 'Ø323.85 mm' }, // blue
  { od: 168.275, color: 0x1a9c7a, label: 'Ø168.275 mm' },// teal
];
const FALLBACK_COLOR = 0x444444;

export function colorForOD(od) {
  const match = OD_COLORS.find(c => Math.abs(c.od - od) < 1);
  return match ? match.color : FALLBACK_COLOR;
}

const MATERIAL_COLORS = [
  { key: 'CS',  color: 0x3a7bd5, label: 'Carbon Steel' },
  { key: 'SS',  color: 0x27ae60, label: 'Stainless Steel' },
  { key: 'AS',  color: 0xe67e22, label: 'Alloy Steel' },
  { key: 'CU',  color: 0x8e44ad, label: 'Copper' },
  { key: 'AL',  color: 0x16a085, label: 'Aluminium' },
];

export function colorForMaterial(material = 'CS') {
  const k = material.toUpperCase().slice(0, 2);
  const match = MATERIAL_COLORS.find(m => m.key === k);
  return match ? match.color : FALLBACK_COLOR;
}

export function heatMapColor(t) {
  t = Math.max(0, Math.min(1, t));
  let r, g, b;
  if (t < 0.25) {
    const s = t / 0.25;
    r = 0; g = Math.round(255 * s); b = 255;
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = 0; g = 255; b = Math.round(255 * (1 - s));
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = Math.round(255 * s); g = 255; b = 0;
  } else {
    const s = (t - 0.75) / 0.25;
    r = 255; g = Math.round(255 * (1 - s)); b = 0;
  }
  return (r << 16) | (g << 8) | b;
}

const discreteColorCache = new Map();
export function generateDiscreteColor(val) {
  if (discreteColorCache.has(val)) return discreteColorCache.get(val);
  const hue = ((val * 137.508) % 360) / 360;
  const color = new THREE.Color().setHSL(hue, 0.7, 0.5);
  const hex = color.getHex();
  discreteColorCache.set(val, hex);
  return hex;
}

export function colorForMode(el, mode, range = { min: 0, max: 100 }) {
  const theme = state.viewerSettings?.themePreset || 'NavisDark';
  const pipeTheme = {
    NavisDark: {
      default: 0xb8c4d2,
      material: { CS: 0xcbd5e1, SS: 0x9bd3c0, AS: 0xf0b36b, CU: 0xb79dd6, AL: 0x8dd7cc },
      od: {
        '406.4': 0xd68a4b,
        '323.9': 0x7cb1e3,
        '168.3': 0x86ccb6,
      }
    },
    DrawLight: {
      default: 0x2d3748,
      material: { CS: 0x3a7bd5, SS: 0x27ae60, AS: 0xe67e22, CU: 0x8e44ad, AL: 0x16a085 },
      od: {
        '406.4': 0xe07020,
        '323.9': 0x1a6ec7,
        '168.3': 0x1a9c7a,
      }
    },
    DrawDark: {
      default: 0xcbd5e1,
      material: { CS: 0x7db0ff, SS: 0x82d8a1, AS: 0xffba75, CU: 0xc59cff, AL: 0x7ce7d8 },
      od: {
        '406.4': 0xf39b54,
        '323.9': 0x74aef0,
        '168.3': 0x76c9b2,
      }
    }
  }[theme] || {
      default: FALLBACK_COLOR,
      material: { CS: 0x3a7bd5, SS: 0x27ae60, AS: 0xe67e22, CU: 0x8e44ad, AL: 0x16a085 },
      od: {},
  };

  if (mode.startsWith('HeatMap:')) {
    const field = mode.split(':')[1];
    const val = el[field] ?? 0;
    return generateDiscreteColor(val);
  }
  switch (mode) {
    case 'material': {
      const k = (el.material || 'CS').toUpperCase().slice(0, 2);
      return pipeTheme.material[k] ?? pipeTheme.default;
    }
    case 'T1':
    case 'T2':
    case 'P1': {
      const exact = pipeTheme.od[Number(el.od).toFixed(1)];
      return exact ?? pipeTheme.default;
    }
    default: {
      if (theme === 'NavisDark') return pipeTheme.default;
      return colorForOD(el.od);
    }
  }
}

export function createPipeLine(a, b, color, lineWidth = 3, renderer) {
  const geo = new LineGeometry();
  geo.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);

  const mat = new LineMaterial({
    color,
    linewidth: lineWidth,
    resolution: renderer
      ? new THREE.Vector2(renderer.domElement.clientWidth, renderer.domElement.clientHeight)
      : new THREE.Vector2(800, 600),
  });

  const line = new Line2(geo, mat);
  line.computeLineDistances();
  return line;
}

export function createSolidCylinder(startVec, endVec, radius, color) {
    const diff = new THREE.Vector3().subVectors(endVec, startVec);
    const length = diff.length();
    if (length < 0.1) return null;

    const mid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
    const axis = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(axis, diff.clone().normalize());

    const geo = new THREE.CylinderGeometry(radius, radius, length, 12);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid);
    mesh.quaternion.copy(quat);
    return mesh;
}

export function createSolidBend(startPt, midPt, endPt, radius, color, segments = 8) {
    const curve = new THREE.CatmullRomCurve3([startPt, midPt, endPt]);
    const geo = new THREE.TubeGeometry(curve, segments, radius, 8, false);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    return new THREE.Mesh(geo, mat);
}

export function createBendArc(startPt, midPt, endPt, color, lineWidth = 3, renderer, segments = 12) {
  const curve = new THREE.CatmullRomCurve3([startPt, midPt, endPt]);
  const pts = curve.getPoints(segments);

  const pairPositions = [];
  for (let i = 0; i < pts.length - 1; i++) {
    pairPositions.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
  }

  const geo = new LineGeometry();
  geo.setPositions(pairPositions);

  const mat = new LineMaterial({
    color,
    linewidth: lineWidth,
    resolution: renderer
      ? new THREE.Vector2(renderer.domElement.clientWidth, renderer.domElement.clientHeight)
      : new THREE.Vector2(800, 600),
  });

  const line = new Line2(geo, mat);
  line.computeLineDistances();
  return line;
}

/**
 * Scale coordinates from mm to scene units.
 * PCF/CAESAR: X = East, Y = North (horizontal), Z = Up (elevation).
 * Viewer axes (requested): X = North, Y = Up, Z = East.
 * So: threeX = caesarY, threeY = caesarZ, threeZ = caesarX
 */
export const SCALE = 1 / 1000;

export function toThree(pos) {
  return new THREE.Vector3(
    pos.y * SCALE,
    pos.z * SCALE,
    pos.x * SCALE
  );
}
