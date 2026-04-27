/**
 * symbols.js — Engineering symbols for anchors, guides, and load arrows.
 * Uses THREE.MeshBasicMaterial (no lighting) for paper-iso look.
 */

import * as THREE from 'three';
import { toThree, SCALE } from './pipe-geometry.js';
import { state } from '../core/state.js';

const MAT_LOAD = new THREE.MeshBasicMaterial({ color: 0xe0a000 });

// Support symbol materials
const COLOR_NORMAL = 0x00C853; // Green A700
const COLOR_ANCHOR = 0xff3b30; // Red
const MAT_SUPPORT = new THREE.MeshStandardMaterial({
    color: COLOR_NORMAL,
    roughness: 0.4,
    metalness: 0.1
});
const MAT_ANCHOR = new THREE.MeshStandardMaterial({
    color: COLOR_ANCHOR,
    roughness: 0.45,
    metalness: 0.08
});

const MAT_SPRING = new THREE.LineDashedMaterial({
    color: COLOR_NORMAL,
    linewidth: 2,
    scale: 1,
    dashSize: 3,
    gapSize: 3,
});

/**
 * Helper to build lateral and vertical arrows.
 */
function makeArrow(direction, offset, od, material) {
    const arrowLen = 1.5 * od;
    const shaftR   = 0.075 * od;
    const headLen  = 0.4 * od;
    const headR    = 0.175 * od;
    const shaftLen = arrowLen - headLen;

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 8),
      material
    );
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(headR, headLen, 8),
      material
    );

    const arrowGroup = new THREE.Group();
    arrowGroup.add(shaft);
    arrowGroup.add(head);

    shaft.position.copy(direction).multiplyScalar(offset + shaftLen / 2);
    head.position.copy(direction).multiplyScalar(offset + shaftLen + headLen / 2);

    // Default Cylinder/Cone points up (+Y). Rotate to direction.
    const up = new THREE.Vector3(0, 1, 0);
    // Handle anti-parallel case
    if (up.distanceTo(direction) < 0.001) {
        // already aligned
    } else if (up.distanceTo(direction.clone().negate()) < 0.001) {
        shaft.rotateX(Math.PI);
        head.rotateX(Math.PI);
    } else {
        const quat = new THREE.Quaternion().setFromUnitVectors(up, direction);
        shaft.quaternion.copy(quat);
        head.quaternion.copy(quat);
    }

    return arrowGroup;
}

function _dofToThreeAxis(dof) {
    switch (Number(dof)) {
        case 1: return new THREE.Vector3(0, 0, 1); // CAESAR X
        case 2: return new THREE.Vector3(1, 0, 0); // CAESAR Y
        case 3: return new THREE.Vector3(0, 1, 0); // CAESAR Z
        default: return null;
    }
}

function _dominantAxis(vec) {
    const ax = Math.abs(vec.x);
    const ay = Math.abs(vec.y);
    const az = Math.abs(vec.z);
    if (ax >= ay && ax >= az) return new THREE.Vector3(1, 0, 0);
    if (ay >= ax && ay >= az) return new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3(0, 0, 1);
}

function _supportKindFromText(text = '') {
    const t = String(text).toUpperCase();
    if (/(^|[^A-Z0-9])(RIGID\s+)?ANC(HOR)?([^A-Z0-9]|$)|\bFIXED\b/.test(t)) return 'ANCHOR';
    if (/\bGDE\b|\bGUI\b|GUIDE|SLIDE|SLID/.test(t)) return 'GUIDE';
    if (/\bRST\b|\bREST\b|\+Y\s*SUPPORT|\bY\s*SUPPORT\b|\+Y\b/.test(t)) return 'REST';
    if (/\bSTOP\b/.test(t)) return 'STOP';
    if (/\bSPRING\b|\bHANGER\b/.test(t)) return 'SPRING';
    if (/\bRIGID\b/.test(t)) return 'RIGID';
    return 'UNKNOWN';
}

function _isGenericAccdbSupport(searchStr = '') {
    return /SUPPORT\s*\(ACCDB\)/.test(String(searchStr).toUpperCase());
}

function _supportFrame(pipeAxis) {
    const upAxis = new THREE.Vector3(0, 1, 0);
    const axis = pipeAxis ? pipeAxis.clone().normalize() : null;
    if (!axis) {
        return { upAxis, lateral: null, clearLateral: false };
    }

    const lateral = new THREE.Vector3().crossVectors(axis, upAxis);
    const clearLateral = lateral.length() >= 0.01;
    if (clearLateral) lateral.normalize();

    return {
        upAxis,
        lateral: clearLateral ? lateral : null,
        clearLateral,
    };
}

function _axisFromCosines(axisCosines) {
    if (!axisCosines) return null;
    const x = Number(axisCosines.x ?? axisCosines.X ?? 0);
    const y = Number(axisCosines.y ?? axisCosines.Y ?? 0);
    const z = Number(axisCosines.z ?? axisCosines.Z ?? 0);
    const axis = new THREE.Vector3(y, z, x);
    if (axis.length() < 0.01) return null;
    return axis.normalize();
}

export function classifySupport(supportName, supportKeywords) {
    const restraint = (supportName && typeof supportName === 'object')
        ? supportName
        : null;
    const searchStr = restraint
        ? `${restraint.name || ''} ${restraint.keywords || ''} ${restraint.type || ''}`.toUpperCase()
        : `${supportName || ''} ${supportKeywords || ''}`.toUpperCase();

    if (restraint) {
        if (restraint.isAnchor) return 'ANCHOR';
        const textKind = _supportKindFromText(searchStr);
        if (textKind === 'ANCHOR') return 'ANCHOR';
        const dirAxis = _axisFromCosines(restraint.axisCosines);
        if (dirAxis) {
            const verticalness = Math.abs(dirAxis.dot(new THREE.Vector3(0, 1, 0)));
            if (verticalness > 0.75) return 'REST';
            if (verticalness < 0.35) return 'GUIDE';
            return 'UNKNOWN';
        }
        if (_isGenericAccdbSupport(searchStr)) return 'UNKNOWN';
        if (textKind === 'GUIDE') return 'GUIDE';
        if (textKind === 'REST') return 'REST';
        if (textKind === 'STOP') return 'STOP';
        if (textKind === 'SPRING') return 'SPRING';

        if (Array.isArray(restraint.dofs)) {
            const dofs = restraint.dofs.map(Number).filter(Number.isFinite);
            const dofSet = new Set(dofs);
            if (!dofs.length) return 'UNKNOWN';
            if (_isGenericAccdbSupport(searchStr)) return 'UNKNOWN';
            if (dofSet.size >= 6) return 'ANCHOR';
            if (dofs.includes(2) && dofs.length === 1) return 'REST';
            if (dofs.includes(1) && dofs.includes(3) && !dofs.includes(2)) return 'GUIDE';
            if (dofs.length === 1 && (dofs[0] === 1 || dofs[0] === 3) && /RESTRAINT|SUPPORT/.test(searchStr)) {
                // X/Z single-direction supports are typically lateral guides in the
                // geometry view; keep them as GUIDE so they render with guide iconography.
                return 'GUIDE';
            }
            if (dofSet.size >= 3) return 'ANCHOR';
        }
    }

    if (/CA\d+/.test(searchStr) || searchStr.includes('ANCH') || searchStr.includes('ANCHOR')) {
        return 'ANCHOR';
    }
    if (searchStr.includes('GUI') || searchStr.includes('GUIDE') || searchStr.includes('GDE') || searchStr.includes('SLIDE') || searchStr.includes('SLID')) {
        return 'GUIDE';
    }
    if (searchStr.includes('+Y SUPPORT') || searchStr.includes('Y SUPPORT') || searchStr.includes('+Y') || searchStr.includes('RST') || searchStr.includes('REST')) {
        return 'REST';
    }
    if (searchStr.includes('STOP')) {
        return 'STOP';
    }
    if (searchStr.includes('SPRING') || searchStr.includes('HANGER')) {
        return 'SPRING';
    }
    if (searchStr.includes('RIGID')) {
        return 'RIGID';
    }

    return 'UNKNOWN';
}

export function resolveSupportRenderType(restraint, pipeAxis) {
    const r = restraint && typeof restraint === 'object' ? restraint : null;
    const searchStr = r
        ? `${r.name || ''} ${r.keywords || ''} ${r.type || ''}`.toUpperCase()
        : '';
    const axis = pipeAxis ? pipeAxis.clone().normalize() : null;
    const frame = _supportFrame(axis);
    const dirAxis = _axisFromCosines(r?.axisCosines);

    if (r) {
        if (r.isAnchor) return 'ANCHOR';
        const textKind = _supportKindFromText(searchStr);
        if (textKind === 'ANCHOR') return 'ANCHOR';
        if (_isGenericAccdbSupport(searchStr) && !dirAxis) return null;
        if (dirAxis) {
            const verticalness = Math.abs(dirAxis.dot(frame.upAxis));
            if (verticalness > 0.75) return 'REST';
            if (frame.clearLateral && verticalness < 0.35) return 'GUIDE';
            return null;
        }
        if (textKind === 'GUIDE') return frame.clearLateral ? 'GUIDE' : null;
        if (textKind === 'REST') return 'REST';
        if (textKind === 'STOP') return frame.clearLateral ? 'STOP' : null;
        if (textKind === 'SPRING') return 'SPRING';

        if (Array.isArray(r.dofs) && r.dofs.length) {
            const dofs = r.dofs.map(Number).filter(Number.isFinite);
            const dofSet = new Set(dofs);
            if (_isGenericAccdbSupport(searchStr)) return null;
            if (dofSet.size >= 6) return 'ANCHOR';
            if (dofs.includes(2) && dofs.length === 1) return 'REST';
            if (dofs.includes(1) && dofs.includes(3) && !dofs.includes(2)) return frame.clearLateral ? 'GUIDE' : null;
            if (dofs.length === 1 && axis) {
                const dofVec = _dofToThreeAxis(dofs[0]);
                if (dofVec) {
                    const dot = Math.abs(dofVec.dot(axis));
                    if (dot > 0.7) return 'REST';
                    return frame.clearLateral ? 'GUIDE' : null;
                }
            }
            if (dofSet.size >= 3) return frame.clearLateral ? 'ANCHOR' : null;
        }
    }

    return null;
}

export function createSupportSymbol(pos, type, pipeAxis, odInMM) {
    if (!type || type === 'UNKNOWN') return null;
    const group = new THREE.Group();
    const p = toThree(pos);
    group.position.copy(p);

    // Apply global scale
    const scale = state.viewerSettings.restraintSymbolScale || 1.0;
    group.scale.set(scale, scale, scale);

    // Scale OD to scene units. Minimum viable OD for symbol proportion if missing.
    let od = (odInMM || 100) * SCALE;

    // Fallback axis if none provided
    const axis = pipeAxis ? pipeAxis.clone().normalize() : new THREE.Vector3(1, 0, 0);

    // Up axis based on convention. If scene is rotated, World Up is Three's Y.
    const isZup = state.viewerSettings.axisConvention === 'Z-up';
    const upAxis = isZup ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 1, 0); // World Y is up in both due to scene rotation

    // Lateral direction
    let lateral = new THREE.Vector3().crossVectors(axis, upAxis);
    if (lateral.length() < 0.01) {
        // pipe is vertical, pick arbitrary lateral
        lateral.set(1, 0, 0);
    }
    lateral.normalize();

    const leftDir = lateral.clone().negate();
    const rightDir = lateral.clone();
    const upDir = upAxis.clone();
    const downDir = upAxis.clone().negate();

    if (type === 'ANCHOR') {
        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(od * 0.95, od * 0.95, od * 0.18),
            MAT_ANCHOR
        );
        plate.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
        group.add(plate);
        return group;
    }

    if (type === 'GUIDE') {
        group.add(makeArrow(rightDir, -od * 0.9, od, MAT_SUPPORT));
        group.add(makeArrow(leftDir, -od * 0.9, od, MAT_SUPPORT));
        group.add(makeArrow(upDir, -od * 0.45, od, MAT_SUPPORT));
    }
    else if (type === 'REST') {
        group.add(makeArrow(upDir, -od * 0.45, od, MAT_SUPPORT));
    }
    else if (type === 'SPRING') {
        // Vertical dashed arrow
        const arrowLen = 1.5 * od;
        const headLen = 0.4 * od;
        const shaftLen = arrowLen - headLen;

        const pts = [];
        pts.push(upDir.clone().multiplyScalar(-od / 2));
        pts.push(upDir.clone().multiplyScalar(-od / 2 + shaftLen));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geo, MAT_SPRING);
        line.computeLineDistances();
        group.add(line);

        const head = new THREE.Mesh(new THREE.ConeGeometry(0.175 * od, headLen, 8), MAT_SUPPORT);
        head.position.copy(upDir).multiplyScalar(-od / 2 + shaftLen + headLen / 2);
        group.add(head);
    }
    else if (type === 'STOP') {
        group.add(makeArrow(rightDir, -od * 0.7, od, MAT_SUPPORT));
        group.add(makeArrow(leftDir, -od * 0.7, od, MAT_SUPPORT));
    }
    else if (type === 'RIGID') {
        // Cross symbol in pipe plane
        const rLen = od * 1.2;
        const m1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05*od, 0.05*od, rLen*2), MAT_SUPPORT);
        const m2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05*od, 0.05*od, rLen*2), MAT_SUPPORT);
        m1.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), lateral.clone().add(upAxis).normalize());
        m2.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), lateral.clone().sub(upAxis).normalize());
        group.add(m1);
        group.add(m2);
    }

    return group;
}

// Kept for backward compatibility if needed, but IsometricRenderer should now use createSupportSymbol

/**
 * Applied force arrow — yellow ArrowHelper pointing in force direction.
 * @param {object} pos  node position {x, y, z} in mm
 * @param {object} force  {fx, fy, fz} in N
 */
export function createForceArrow(pos, force) {
  const dir = new THREE.Vector3(force.fy, force.fz, force.fx).normalize();
  if (dir.length() < 0.01) return null;

  const origin = toThree(pos);
  const length = 0.05;
  const arrow = new THREE.ArrowHelper(dir, origin, length, 0xe0a000, 0.015, 0.01);
  return arrow;
}
