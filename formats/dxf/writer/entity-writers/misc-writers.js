import { pushTag, fmtNum, writeCommonEntityTags } from './writer-utils.js';

export const SplineWriter = {
  type: 'SPLINE',
  write(entity, lines) {
    pushTag(lines, 0, 'SPLINE');
    writeCommonEntityTags(entity, lines);

    const degree = entity.geometry?.degree ?? 3;
    pushTag(lines, 71, degree);

    const flags = entity.attributes?.flags ?? 0;
    pushTag(lines, 70, flags);

    const knots = entity.geometry?.knots || [];
    pushTag(lines, 72, knots.length);

    const cp = entity.geometry?.controlPoints || [];
    pushTag(lines, 73, cp.length);

    const fp = entity.geometry?.fitPoints || [];
    pushTag(lines, 74, fp.length);

    for (const k of knots) {
      pushTag(lines, 40, fmtNum(k));
    }
    for (const p of cp) {
      pushTag(lines, 10, fmtNum(p.x));
      pushTag(lines, 20, fmtNum(p.y));
      pushTag(lines, 30, fmtNum(p.z));
    }
    for (const p of fp) {
      pushTag(lines, 11, fmtNum(p.x));
      pushTag(lines, 21, fmtNum(p.y));
      pushTag(lines, 31, fmtNum(p.z));
    }
  },
};

export const EllipseWriter = {
  type: 'ELLIPSE',
  write(entity, lines) {
    pushTag(lines, 0, 'ELLIPSE');
    writeCommonEntityTags(entity, lines);

    const c = entity.geometry?.center || { x: 0, y: 0, z: 0 };
    pushTag(lines, 10, fmtNum(c.x));
    pushTag(lines, 20, fmtNum(c.y));
    pushTag(lines, 30, fmtNum(c.z));

    const m = entity.geometry?.majorAxis || { x: 1, y: 0, z: 0 };
    pushTag(lines, 11, fmtNum(m.x));
    pushTag(lines, 21, fmtNum(m.y));
    pushTag(lines, 31, fmtNum(m.z));

    pushTag(lines, 40, fmtNum(entity.geometry?.ratio || 1.0));
    pushTag(lines, 41, fmtNum(entity.geometry?.startParam || 0));
    pushTag(lines, 42, fmtNum(entity.geometry?.endParam || (Math.PI * 2)));
  },
};

export const SolidWriter = {
  type: 'SOLID',
  write(entity, lines) {
    pushTag(lines, 0, 'SOLID');
    writeCommonEntityTags(entity, lines);

    const pts = entity.geometry?.points || [];
    for (let i = 0; i < 4; i++) {
      const p = pts[i] || { x: 0, y: 0, z: 0 };
      pushTag(lines, 10 + i, fmtNum(p.x));
      pushTag(lines, 20 + i, fmtNum(p.y));
      pushTag(lines, 30 + i, fmtNum(p.z));
    }
  },
};

export const PointWriter = {
  type: 'POINT',
  write(entity, lines) {
    pushTag(lines, 0, 'POINT');
    writeCommonEntityTags(entity, lines);

    const p = entity.geometry?.point || { x: 0, y: 0, z: 0 };
    pushTag(lines, 10, fmtNum(p.x));
    pushTag(lines, 20, fmtNum(p.y));
    pushTag(lines, 30, fmtNum(p.z));
  },
};

export const LeaderWriter = {
  type: 'LEADER',
  write(entity, lines) {
    pushTag(lines, 0, 'LEADER');
    writeCommonEntityTags(entity, lines);

    const verts = entity.geometry?.vertices || [];
    pushTag(lines, 76, verts.length);
    for (const v of verts) {
      pushTag(lines, 10, fmtNum(v.x));
      pushTag(lines, 20, fmtNum(v.y));
      pushTag(lines, 30, fmtNum(v.z));
    }
  },
};

export const DimensionWriter = {
  type: 'DIMENSION',
  write(entity, lines) {
    pushTag(lines, 0, 'DIMENSION');
    writeCommonEntityTags(entity, lines);

    if (entity.attributes?.blockName) {
      pushTag(lines, 2, entity.attributes.blockName);
    }
    if (entity.attributes?.dimType != null) {
      pushTag(lines, 70, entity.attributes.dimType);
    }
    if (entity.attributes?.text != null) {
      pushTag(lines, 1, entity.attributes.text);
    }

    const dp = entity.geometry?.defPoints || {};
    for (const [key, codeOffset] of [['p10', 0], ['p11', 1], ['p13', 3], ['p14', 4]]) {
      const pt = dp[key];
      if (pt) {
        pushTag(lines, 10 + codeOffset, fmtNum(pt.x));
        pushTag(lines, 20 + codeOffset, fmtNum(pt.y));
        pushTag(lines, 30 + codeOffset, fmtNum(pt.z));
      }
    }
  },
};
