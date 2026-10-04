import { DxfEntity } from '../../model/dxf-entity.js';
import { parseCommonFields, parseNumber } from './codec-utils.js';

export const InsertCodec = {
  type: 'INSERT',
  decode(tags, order, subEntities = []) {
    const common = parseCommonFields(tags);
    let blockName = '';
    let x = 0, y = 0, z = 0;
    let xScale = 1.0, yScale = 1.0, zScale = 1.0;
    let rotation = 0;
    let ex = 0, ey = 0, ez = 1;

    for (const tag of tags) {
      switch (tag.code) {
        case 2: blockName = tag.value.trim(); break;
        case 10: x = parseNumber(tag.value); break;
        case 20: y = parseNumber(tag.value); break;
        case 30: z = parseNumber(tag.value); break;
        case 41: xScale = parseNumber(tag.value, 1.0); break;
        case 42: yScale = parseNumber(tag.value, 1.0); break;
        case 43: zScale = parseNumber(tag.value, 1.0); break;
        case 50: rotation = parseNumber(tag.value); break;
        case 210: ex = parseNumber(tag.value); break;
        case 220: ey = parseNumber(tag.value); break;
        case 230: ez = parseNumber(tag.value); break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'INSERT', // PRESERVED EXACTLY: instance reference to block
      geometry: {
        insertionPoint: { x, y, z },
        scale: { x: xScale, y: yScale, z: zScale },
        rotation,
        extrusion: { x: ex, y: ey, z: ez },
      },
      attributes: {
        blockName,
        attribs: subEntities,
      },
      source: { order, rawTags: tags },
    });
  },
};
