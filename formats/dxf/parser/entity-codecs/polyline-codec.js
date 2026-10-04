import { DxfEntity } from '../../model/dxf-entity.js';
import { parseCommonFields, parseNumber } from './codec-utils.js';

export const LwpolylineCodec = {
  type: 'LWPOLYLINE',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let flags = 0;
    let elevation = 0;
    let constantWidth = 0;
    let ex = 0, ey = 0, ez = 1;

    const vertices = [];
    let currentVertex = null;

    for (const tag of tags) {
      switch (tag.code) {
        case 70: flags = parseInt(tag.value, 10); break;
        case 38: elevation = parseNumber(tag.value); break;
        case 43: constantWidth = parseNumber(tag.value); break;
        case 210: ex = parseNumber(tag.value); break;
        case 220: ey = parseNumber(tag.value); break;
        case 230: ez = parseNumber(tag.value); break;
        case 10:
          // New vertex starts
          currentVertex = { x: parseNumber(tag.value), y: 0, bulge: 0, startWidth: 0, endWidth: 0 };
          vertices.push(currentVertex);
          break;
        case 20:
          if (currentVertex) currentVertex.y = parseNumber(tag.value);
          break;
        case 40:
          if (currentVertex) currentVertex.startWidth = parseNumber(tag.value);
          break;
        case 41:
          if (currentVertex) currentVertex.endWidth = parseNumber(tag.value);
          break;
        case 42:
          // PRESERVE BULGE!
          if (currentVertex) currentVertex.bulge = parseNumber(tag.value);
          break;
      }
    }

    const closed = Boolean(flags & 1);

    return new DxfEntity({
      ...common,
      type: 'LWPOLYLINE',
      geometry: {
        vertices,
        closed,
        elevation,
        constantWidth,
        extrusion: { x: ex, y: ey, z: ez },
      },
      attributes: { flags },
      source: { order, rawTags: tags },
    });
  },
};

export const PolylineCodec = {
  type: 'POLYLINE',
  decode(tags, order, subEntities = []) {
    const common = parseCommonFields(tags);
    let flags = 0;
    let ex = 0, ey = 0, ez = 1;

    for (const tag of tags) {
      switch (tag.code) {
        case 70: flags = parseInt(tag.value, 10); break;
        case 210: ex = parseNumber(tag.value); break;
        case 220: ey = parseNumber(tag.value); break;
        case 230: ez = parseNumber(tag.value); break;
      }
    }

    const vertices = subEntities.map((v) => ({
      x: v.geometry?.point?.x ?? 0,
      y: v.geometry?.point?.y ?? 0,
      z: v.geometry?.point?.z ?? 0,
      bulge: v.geometry?.bulge ?? 0,
      startWidth: v.geometry?.startWidth ?? 0,
      endWidth: v.geometry?.endWidth ?? 0,
      flags: v.attributes?.flags ?? 0,
      handle: v.handle || null,
      rawTags: v.source?.rawTags || [],
    }));

    const closed = Boolean(flags & 1);

    return new DxfEntity({
      ...common,
      type: 'POLYLINE',
      geometry: {
        elevation: parseNumber(tags.find(t => t.code === 30)?.value ?? '0'),
        startWidth: parseNumber(tags.find(t => t.code === 40)?.value ?? '0'),
        endWidth: parseNumber(tags.find(t => t.code === 41)?.value ?? '0'),
        vertices,
        closed,
        extrusion: { x: ex, y: ey, z: ez },
      },
      attributes: { flags, subEntities },
      source: { order, rawTags: tags },
    });
  },
};
