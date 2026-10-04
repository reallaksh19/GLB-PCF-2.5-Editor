import { DxfEntity } from '../../model/dxf-entity.js';
import { parseCommonFields, parseNumber } from './codec-utils.js';

export const CircleCodec = {
  type: 'CIRCLE',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let cx = 0, cy = 0, cz = 0;
    let radius = 0;
    let ex = 0, ey = 0, ez = 1;

    for (const tag of tags) {
      switch (tag.code) {
        case 10: cx = parseNumber(tag.value); break;
        case 20: cy = parseNumber(tag.value); break;
        case 30: cz = parseNumber(tag.value); break;
        case 40: radius = parseNumber(tag.value); break;
        case 210: ex = parseNumber(tag.value); break;
        case 220: ey = parseNumber(tag.value); break;
        case 230: ez = parseNumber(tag.value); break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'CIRCLE', // PRESERVED EXACTLY: never collapsed to ARC
      geometry: {
        center: { x: cx, y: cy, z: cz },
        radius,
        extrusion: { x: ex, y: ey, z: ez },
      },
      source: { order, rawTags: tags },
    });
  },
};

export const ArcCodec = {
  type: 'ARC',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let cx = 0, cy = 0, cz = 0;
    let radius = 0;
    let startAngle = 0;
    let endAngle = 360;
    let ex = 0, ey = 0, ez = 1;

    for (const tag of tags) {
      switch (tag.code) {
        case 10: cx = parseNumber(tag.value); break;
        case 20: cy = parseNumber(tag.value); break;
        case 30: cz = parseNumber(tag.value); break;
        case 40: radius = parseNumber(tag.value); break;
        case 50: startAngle = parseNumber(tag.value); break;
        case 51: endAngle = parseNumber(tag.value); break;
        case 210: ex = parseNumber(tag.value); break;
        case 220: ey = parseNumber(tag.value); break;
        case 230: ez = parseNumber(tag.value); break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'ARC',
      geometry: {
        center: { x: cx, y: cy, z: cz },
        radius,
        startAngle,
        endAngle,
        extrusion: { x: ex, y: ey, z: ez },
      },
      source: { order, rawTags: tags },
    });
  },
};
