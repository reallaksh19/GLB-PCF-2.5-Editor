import * as THREE from 'three';
import { toThree, SCALE as MM_TO_SCENE } from '../../geometry/pipe-geometry.js';

const COLORS = {
  NavisDark: { pipe: 0xb8c4d2, flange: 0x8899aa, valve: 0x6699aa, generic: 0x9aabb8 },
  DrawLight:  { pipe: 0x2d3748, flange: 0x1a2535, valve: 0x334455, generic: 0x3d4f62 },
};

function themeColor(theme, key) {
  return (COLORS[theme] || COLORS.NavisDark)[key];
}

function toVec3(pt) {
  if (!pt) return new THREE.Vector3(0, 0, 0);
  return toThree(pt);
}

function minBore(bore) {
  return Math.max(bore || 25, 16); // radius = bore/2, so min radius 8 -> min bore 16
}

function mmToScene(mm) {
  return mm * MM_TO_SCENE;
}

export function setUserData(mesh, comp) {
  mesh.userData = {
    compId:  comp.id,
    pcfType: comp.type,
    bore:    comp.geometry.bore || 0,
    ep1str:  comp.geometry.ep1 ? JSON.stringify(comp.geometry.ep1) : null,
    ep2str:  comp.geometry.ep2 ? JSON.stringify(comp.geometry.ep2) : null,
    ...(comp.attributes || {}),
  };
}

function orientCylinder(mesh, from, to) {
  const dir = to.clone().sub(from).normalize();
  const yAxis = new THREE.Vector3(0, 1, 0);
  if (Math.abs(dir.dot(yAxis)) > 0.9999) {
    mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), dir.y < 0 ? Math.PI : 0);
  } else {
    const axis  = new THREE.Vector3().crossVectors(yAxis, dir).normalize();
    const angle = Math.acos(yAxis.dot(dir));
    mesh.quaternion.setFromAxisAngle(axis, angle);
  }
}

export function buildGenericDraft(comp, theme) {
  const s = mmToScene(50);
  const geo = new THREE.BoxGeometry(s, s, s);
  const mat = new THREE.MeshStandardMaterial({ color: themeColor(theme, 'generic') });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(toVec3(comp.geometry.origin));
  setUserData(mesh, comp);
  return mesh;
}

export function buildPipeDraft(comp, theme) {
  if (!comp.geometry.ep1 || !comp.geometry.ep2) return buildGenericDraft(comp, theme);

  const ep1V = toVec3(comp.geometry.ep1);
  const ep2V = toVec3(comp.geometry.ep2);
  const dir = ep2V.clone().sub(ep1V);
  const len = dir.length();

  if (len < 0.001) return null;

  const radius = mmToScene(minBore(comp.geometry.bore) / 2);
  const geo = new THREE.CylinderGeometry(radius, radius, len, 16, 1);
  const mat = new THREE.MeshStandardMaterial({ color: themeColor(theme, 'pipe') });
  const mesh = new THREE.Mesh(geo, mat);

  mesh.position.copy(ep1V).addScaledVector(dir.normalize(), len / 2);
  orientCylinder(mesh, ep1V, ep2V);

  setUserData(mesh, comp);
  return mesh;
}

export function buildBendDraft(comp, theme) {
  if (!comp.geometry.ep1 || !comp.geometry.ep2 || !comp.geometry.cp) {
    return buildPipeDraft(comp, theme);
  }

  const ep1V = toVec3(comp.geometry.ep1);
  const ep2V = toVec3(comp.geometry.ep2);
  const cpV  = toVec3(comp.geometry.cp);

  const curve = new THREE.QuadraticBezierCurve3(ep1V, cpV, ep2V);
  const tubeSegments = 24;
  const radialSegments = 12;
  const radius = minBore(comp.geometry.bore) / 2;

  const geo = new THREE.TubeGeometry(curve, tubeSegments, radius, radialSegments, false);
  const mat = new THREE.MeshStandardMaterial({ color: themeColor(theme, 'pipe') });
  const mesh = new THREE.Mesh(geo, mat);

  setUserData(mesh, comp);
  return mesh;
}

export function buildTeeDraft(comp, theme) {
  if (!comp.geometry.ep1 || !comp.geometry.ep2) return buildGenericDraft(comp, theme);

  const group = new THREE.Group();
  const run = buildPipeDraft(comp, theme);
  if (run) group.add(run);

  if (comp.geometry.bp) {
    const ep1V = toVec3(comp.geometry.ep1);
    const ep2V = toVec3(comp.geometry.ep2);
    const midV = ep1V.clone().add(ep2V).multiplyScalar(0.5);
    const bpV = toVec3(comp.geometry.bp);
    const dir = bpV.clone().sub(midV);
    const len = dir.length();

    if (len >= 0.001) {
      const branchBore = comp.geometry.bp.bore || comp.geometry.bore;
      const radius = mmToScene(minBore(branchBore) / 2);
      const geo = new THREE.CylinderGeometry(radius, radius, len, 16, 1);
      const mat = new THREE.MeshStandardMaterial({ color: themeColor(theme, 'pipe') });
      const branch = new THREE.Mesh(geo, mat);

      branch.position.copy(midV).addScaledVector(dir.normalize(), len / 2);
      orientCylinder(branch, midV, bpV);
      setUserData(branch, comp);
      group.add(branch);
    }
  }

  setUserData(group, comp);
  return group;
}

export function buildFlangeDraft(comp, theme) {
  const bore = comp.geometry.bore;
  const OD = mmToScene(minBore(bore) * 1.8);
  const thickness = mmToScene(minBore(bore) * 0.2);

  const geo1 = new THREE.CylinderGeometry(OD / 2, OD / 2, thickness, 24);
  const mat  = new THREE.MeshStandardMaterial({ color: themeColor(theme, 'flange') });

  const m1 = new THREE.Mesh(geo1, mat);
  const m2 = new THREE.Mesh(geo1, mat);

  m1.position.set(0, thickness / 2, 0);
  m2.position.set(0, -thickness / 2, 0);

  const group = new THREE.Group();
  group.add(m1, m2);

  const origin = toVec3(comp.geometry.origin);
  group.position.copy(origin);

  // Orient flange if we have ep1/ep2
  if (comp.geometry.ep1 && comp.geometry.ep2) {
      const ep1V = toVec3(comp.geometry.ep1);
      const ep2V = toVec3(comp.geometry.ep2);
      orientCylinder(group, ep1V, ep2V);
      // reposition to origin since orientCylinder just sets quaternion
      group.position.copy(origin);
  } else if (comp.geometry.ep1) {
      group.position.copy(toVec3(comp.geometry.ep1));
  }

  setUserData(group, comp);
  return group;
}

export function buildValveDraft(comp, theme) {
  let origin;
  if (comp.geometry.ep1 && comp.geometry.ep2) {
    const ep1V = toVec3(comp.geometry.ep1);
    const ep2V = toVec3(comp.geometry.ep2);
    origin = ep1V.clone().add(ep2V).multiplyScalar(0.5);
  } else {
    origin = toVec3(comp.geometry.origin);
  }

  const r = mmToScene((minBore(comp.geometry.bore) / 2) * 1.5);
  const geo = new THREE.SphereGeometry(r, 12, 8);
  const mat = new THREE.MeshStandardMaterial({ color: themeColor(theme, 'valve') });
  const sphere = new THREE.Mesh(geo, mat);

  sphere.position.copy(origin);
  setUserData(sphere, comp);
  return sphere;
}
