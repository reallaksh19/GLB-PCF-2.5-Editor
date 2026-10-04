/**
 * formats/dxf/parser/entity-codecs/attrib-codec.js
 *
 * Codec for ATTRIB entities following INSERT records.
 */

import { DxfEntity } from '../../model/dxf-entity.js';
import { parseCommonFields, parseNumber } from './codec-utils.js';

export const AttribCodec = {
  type: 'ATTRIB',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let x = 0, y = 0, z = 0;
    let ax = 0, ay = 0, az = 0;
    let height = 2.5;
    let text = '';
    let tag = '';
    let flags = 0;
    let rotation = 0;
    let widthFactor = 1.0;
    let styleName = 'STANDARD';
    let textGenFlags = 0;
    let horizJust = 0;
    let vertJust = 0;
    let hasAlign = false;

    for (const t of tags) {
      switch (t.code) {
        case 10: x = parseNumber(t.value); break;
        case 20: y = parseNumber(t.value); break;
        case 30: z = parseNumber(t.value); break;
        case 11: ax = parseNumber(t.value); hasAlign = true; break;
        case 21: ay = parseNumber(t.value); hasAlign = true; break;
        case 31: az = parseNumber(t.value); hasAlign = true; break;
        case 40: height = parseNumber(t.value, 2.5); break;
        case 1: text = t.value; break;
        case 2: tag = t.value.trim(); break;
        case 70: flags = parseInt(t.value, 10); break;
        case 50: rotation = parseNumber(t.value); break;
        case 41: widthFactor = parseNumber(t.value, 1.0); break;
        case 7: styleName = t.value.trim(); break;
        case 71: textGenFlags = parseInt(t.value, 10); break;
        case 72: horizJust = parseInt(t.value, 10); break;
        case 73: vertJust = parseInt(t.value, 10); break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'ATTRIB',
      geometry: {
        insertionPoint: { x, y, z },
        alignmentPoint: hasAlign ? { x: ax, y: ay, z: az } : null,
      },
      attributes: {
        tag,
        text,
        height,
        flags,
        rotation,
        widthFactor,
        styleName,
        textGenFlags,
        horizJust,
        vertJust,
      },
      source: { order, rawTags: tags },
    });
  },
};
