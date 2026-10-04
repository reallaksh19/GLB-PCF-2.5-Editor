/**
 * formats/dxf/parser/entity-codecs/vertex-codec.js
 *
 * Codec for VERTEX entities within classic POLYLINE structures.
 */

import { DxfEntity } from '../../model/dxf-entity.js';
import { parseCommonFields, parseNumber } from './codec-utils.js';

export const VertexCodec = {
  type: 'VERTEX',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let x = 0, y = 0, z = 0;
    let startWidth = 0;
    let endWidth = 0;
    let bulge = 0;
    let flags = 0;
    let tangentDir = 0;

    for (const tag of tags) {
      switch (tag.code) {
        case 10: x = parseNumber(tag.value); break;
        case 20: y = parseNumber(tag.value); break;
        case 30: z = parseNumber(tag.value); break;
        case 40: startWidth = parseNumber(tag.value); break;
        case 41: endWidth = parseNumber(tag.value); break;
        case 42: bulge = parseNumber(tag.value); break;
        case 70: flags = parseInt(tag.value, 10); break;
        case 50: tangentDir = parseNumber(tag.value); break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'VERTEX',
      geometry: {
        point: { x, y, z },
        bulge,
        startWidth,
        endWidth,
        tangentDir,
      },
      attributes: { flags },
      source: { order, rawTags: tags },
    });
  },
};
