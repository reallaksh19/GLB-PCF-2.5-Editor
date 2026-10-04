import { DxfEntity } from '../../model/dxf-entity.js';
import { parseCommonFields, parseNumber } from './codec-utils.js';

export const SplineCodec = {
  type: 'SPLINE',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let degree = 3;
    let flags = 0;
    const controlPoints = [];
    const fitPoints = [];
    const knots = [];
    const weights = [];

    let currentCP = null;
    let currentFP = null;

    for (const tag of tags) {
      switch (tag.code) {
        case 71: degree = parseInt(tag.value, 10); break;
        case 70: flags = parseInt(tag.value, 10); break;
        case 40: knots.push(parseNumber(tag.value)); break;
        case 41: weights.push(parseNumber(tag.value)); break;
        case 10:
          currentCP = { x: parseNumber(tag.value), y: 0, z: 0 };
          controlPoints.push(currentCP);
          break;
        case 20: if (currentCP) currentCP.y = parseNumber(tag.value); break;
        case 30: if (currentCP) currentCP.z = parseNumber(tag.value); break;
        case 11:
          currentFP = { x: parseNumber(tag.value), y: 0, z: 0 };
          fitPoints.push(currentFP);
          break;
        case 21: if (currentFP) currentFP.y = parseNumber(tag.value); break;
        case 31: if (currentFP) currentFP.z = parseNumber(tag.value); break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'SPLINE',
      geometry: { controlPoints, fitPoints, knots, weights, degree },
      attributes: { flags },
      source: { order, rawTags: tags },
    });
  },
};

export const EllipseCodec = {
  type: 'ELLIPSE',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let cx = 0, cy = 0, cz = 0;
    let mx = 0, my = 0, mz = 0;
    let ratio = 1.0;
    let startParam = 0;
    let endParam = Math.PI * 2;

    for (const tag of tags) {
      switch (tag.code) {
        case 10: cx = parseNumber(tag.value); break;
        case 20: cy = parseNumber(tag.value); break;
        case 30: cz = parseNumber(tag.value); break;
        case 11: mx = parseNumber(tag.value); break;
        case 21: my = parseNumber(tag.value); break;
        case 31: mz = parseNumber(tag.value); break;
        case 40: ratio = parseNumber(tag.value, 1.0); break;
        case 41: startParam = parseNumber(tag.value, 0); break;
        case 42: endParam = parseNumber(tag.value, Math.PI * 2); break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'ELLIPSE',
      geometry: {
        center: { x: cx, y: cy, z: cz },
        majorAxis: { x: mx, y: my, z: mz },
        ratio,
        startParam,
        endParam,
      },
      source: { order, rawTags: tags },
    });
  },
};

export const SolidCodec = {
  type: 'SOLID',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ];

    for (const tag of tags) {
      switch (tag.code) {
        case 10: points[0].x = parseNumber(tag.value); break;
        case 20: points[0].y = parseNumber(tag.value); break;
        case 30: points[0].z = parseNumber(tag.value); break;
        case 11: points[1].x = parseNumber(tag.value); break;
        case 21: points[1].y = parseNumber(tag.value); break;
        case 31: points[1].z = parseNumber(tag.value); break;
        case 12: points[2].x = parseNumber(tag.value); break;
        case 22: points[2].y = parseNumber(tag.value); break;
        case 32: points[2].z = parseNumber(tag.value); break;
        case 13: points[3].x = parseNumber(tag.value); break;
        case 23: points[3].y = parseNumber(tag.value); break;
        case 33: points[3].z = parseNumber(tag.value); break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'SOLID',
      geometry: { points },
      source: { order, rawTags: tags },
    });
  },
};

export const PointCodec = {
  type: 'POINT',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let x = 0, y = 0, z = 0;
    for (const tag of tags) {
      switch (tag.code) {
        case 10: x = parseNumber(tag.value); break;
        case 20: y = parseNumber(tag.value); break;
        case 30: z = parseNumber(tag.value); break;
      }
    }
    return new DxfEntity({
      ...common,
      type: 'POINT',
      geometry: { point: { x, y, z } },
      source: { order, rawTags: tags },
    });
  },
};

export const LeaderCodec = {
  type: 'LEADER',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    const vertices = [];
    let currentV = null;

    for (const tag of tags) {
      switch (tag.code) {
        case 10:
          currentV = { x: parseNumber(tag.value), y: 0, z: 0 };
          vertices.push(currentV);
          break;
        case 20: if (currentV) currentV.y = parseNumber(tag.value); break;
        case 30: if (currentV) currentV.z = parseNumber(tag.value); break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'LEADER',
      geometry: { vertices },
      source: { order, rawTags: tags },
    });
  },
};

export const DimensionCodec = {
  type: 'DIMENSION',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let blockName = '';
    let dimType = 0;
    let text = '';
    const defPoints = {};

    for (const tag of tags) {
      switch (tag.code) {
        case 2: blockName = tag.value.trim(); break;
        case 70: dimType = parseInt(tag.value, 10); break;
        case 1: text = tag.value; break;
        case 10: defPoints.p10 = { ...(defPoints.p10 || {}), x: parseNumber(tag.value) }; break;
        case 20: defPoints.p10 = { ...(defPoints.p10 || {}), y: parseNumber(tag.value) }; break;
        case 30: defPoints.p10 = { ...(defPoints.p10 || {}), z: parseNumber(tag.value) }; break;
        case 11: defPoints.p11 = { ...(defPoints.p11 || {}), x: parseNumber(tag.value) }; break;
        case 21: defPoints.p11 = { ...(defPoints.p11 || {}), y: parseNumber(tag.value) }; break;
        case 31: defPoints.p11 = { ...(defPoints.p11 || {}), z: parseNumber(tag.value) }; break;
        case 13: defPoints.p13 = { ...(defPoints.p13 || {}), x: parseNumber(tag.value) }; break;
        case 23: defPoints.p13 = { ...(defPoints.p13 || {}), y: parseNumber(tag.value) }; break;
        case 33: defPoints.p13 = { ...(defPoints.p13 || {}), z: parseNumber(tag.value) }; break;
        case 14: defPoints.p14 = { ...(defPoints.p14 || {}), x: parseNumber(tag.value) }; break;
        case 24: defPoints.p14 = { ...(defPoints.p14 || {}), y: parseNumber(tag.value) }; break;
        case 34: defPoints.p14 = { ...(defPoints.p14 || {}), z: parseNumber(tag.value) }; break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'DIMENSION',
      geometry: { defPoints },
      attributes: { blockName, dimType, text },
      source: { order, rawTags: tags },
    });
  },
};

export const UnknownCodec = {
  type: 'UNKNOWN',
  decode(tags, order, originalType = 'UNKNOWN') {
    const common = parseCommonFields(tags);
    return new DxfEntity({
      ...common,
      type: originalType, // retains original CAD entity type!
      attributes: { isPreservedUnknown: true },
      source: { order, rawTags: tags },
    });
  },
};
