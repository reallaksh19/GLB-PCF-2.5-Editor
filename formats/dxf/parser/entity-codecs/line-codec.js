import { DxfEntity } from '../../model/dxf-entity.js';
import { parseCommonFields, parseNumber } from './codec-utils.js';

export const LineCodec = {
  type: 'LINE',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let x1 = 0, y1 = 0, z1 = 0;
    let x2 = 0, y2 = 0, z2 = 0;
    let ex = 0, ey = 0, ez = 1;

    for (const tag of tags) {
      switch (tag.code) {
        case 10: x1 = parseNumber(tag.value); break;
        case 20: y1 = parseNumber(tag.value); break;
        case 30: z1 = parseNumber(tag.value); break;
        case 11: x2 = parseNumber(tag.value); break;
        case 21: y2 = parseNumber(tag.value); break;
        case 31: z2 = parseNumber(tag.value); break;
        case 210: ex = parseNumber(tag.value); break;
        case 220: ey = parseNumber(tag.value); break;
        case 230: ez = parseNumber(tag.value); break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'LINE',
      geometry: {
        start: { x: x1, y: y1, z: z1 },
        end: { x: x2, y: y2, z: z2 },
        extrusion: { x: ex, y: ey, z: ez },
      },
      source: { order, rawTags: tags },
    });
  },
};
