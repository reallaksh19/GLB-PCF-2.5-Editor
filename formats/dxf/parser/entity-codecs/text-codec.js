import { DxfEntity } from '../../model/dxf-entity.js';
import { parseCommonFields, parseNumber } from './codec-utils.js';

export const TextCodec = {
  type: 'TEXT',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let x = 0, y = 0, z = 0;
    let ax = 0, ay = 0, az = 0;
    let height = 2.5;
    let text = '';
    let rotation = 0;
    let widthFactor = 1.0;
    let obliqueAngle = 0;
    let styleName = 'STANDARD';
    let textGenFlags = 0; // 71
    let horizJust = 0;    // 72
    let vertJust = 0;     // 73
    let hasAlign = false;

    for (const tag of tags) {
      switch (tag.code) {
        case 10: x = parseNumber(tag.value); break;
        case 20: y = parseNumber(tag.value); break;
        case 30: z = parseNumber(tag.value); break;
        case 11: ax = parseNumber(tag.value); hasAlign = true; break;
        case 21: ay = parseNumber(tag.value); hasAlign = true; break;
        case 31: az = parseNumber(tag.value); hasAlign = true; break;
        case 40: height = parseNumber(tag.value, 2.5); break;
        case 1: text = tag.value; break;
        case 50: rotation = parseNumber(tag.value); break;
        case 41: widthFactor = parseNumber(tag.value, 1.0); break;
        case 51: obliqueAngle = parseNumber(tag.value); break;
        case 7: styleName = tag.value.trim(); break;
        case 71: textGenFlags = parseInt(tag.value, 10); break;
        case 72: horizJust = parseInt(tag.value, 10); break;
        case 73: vertJust = parseInt(tag.value, 10); break;
      }
    }

    return new DxfEntity({
      ...common,
      type: 'TEXT', // PRESERVED EXACTLY: not collapsed to ANNOTATION
      geometry: {
        insertionPoint: { x, y, z },
        alignmentPoint: hasAlign ? { x: ax, y: ay, z: az } : null,
      },
      attributes: {
        text,
        height,
        rotation,
        widthFactor,
        obliqueAngle,
        styleName,
        textGenFlags,
        horizJust,
        vertJust,
      },
      source: { order, rawTags: tags },
    });
  },
};

export const MtextCodec = {
  type: 'MTEXT',
  decode(tags, order) {
    const common = parseCommonFields(tags);
    let x = 0, y = 0, z = 0;
    let height = 2.5;
    let rectWidth = 0;
    let text = '';
    let attachmentPoint = 1; // 71: 1 = Top left, 5 = Middle center, etc.
    let drawingDir = 1;     // 72
    let rotation = 0;
    let styleName = 'STANDARD';

    const textParts = [];

    for (const tag of tags) {
      switch (tag.code) {
        case 10: x = parseNumber(tag.value); break;
        case 20: y = parseNumber(tag.value); break;
        case 30: z = parseNumber(tag.value); break;
        case 40: height = parseNumber(tag.value, 2.5); break;
        case 41: rectWidth = parseNumber(tag.value); break;
        case 3:
          textParts.push(tag.value);
          break;
        case 1:
          textParts.push(tag.value);
          break;
        case 71: attachmentPoint = parseInt(tag.value, 10); break;
        case 72: drawingDir = parseInt(tag.value, 10); break;
        case 50: rotation = parseNumber(tag.value); break;
        case 7: styleName = tag.value.trim(); break;
      }
    }

    text = textParts.join('');

    return new DxfEntity({
      ...common,
      type: 'MTEXT',
      geometry: {
        insertionPoint: { x, y, z },
      },
      attributes: {
        text,
        height,
        rectWidth,
        rotation,
        attachmentPoint,
        drawingDir,
        styleName,
      },
      source: { order, rawTags: tags },
    });
  },
};
