/**
 * formats/dxf/parser/entity-codecs/codec-utils.js
 *
 * Common group-code parsing utilities for entity codecs.
 */

export function parseCommonFields(tags) {
  let handle = null;
  let ownerHandle = null;
  let layerId = '0';
  let space = 'model';
  let colorIndex = 256; // BYLAYER
  let trueColor = null;
  let lineType = 'BYLAYER';
  let lineWeight = -2; // BYLAYER
  let transparency = null;

  for (const tag of tags) {
    switch (tag.code) {
      case 5:
      case 105:
        handle = tag.value.trim().toUpperCase();
        break;
      case 330:
        ownerHandle = tag.value.trim().toUpperCase();
        break;
      case 8:
        layerId = tag.value.trim();
        break;
      case 67:
        space = parseInt(tag.value, 10) === 1 ? 'paper' : 'model';
        break;
      case 62:
        colorIndex = parseInt(tag.value, 10);
        break;
      case 420:
        trueColor = parseInt(tag.value, 10);
        break;
      case 6:
        lineType = tag.value.trim();
        break;
      case 370:
        lineWeight = parseInt(tag.value, 10);
        break;
      case 440:
        transparency = parseInt(tag.value, 10);
        break;
    }
  }

  const colorMode = (colorIndex === 0)
    ? 'BYBLOCK'
    : (colorIndex === 256)
      ? 'BYLAYER'
      : (trueColor !== null)
        ? 'TRUECOLOR'
        : 'INDEX';

  return {
    handle,
    ownerHandle,
    layerId,
    space,
    style: {
      colorMode,
      colorIndex,
      trueColor,
      lineTypeMode: lineType === 'BYLAYER' ? 'BYLAYER' : 'EXPLICIT',
      lineType,
      lineWeightMode: lineWeight === -2 ? 'BYLAYER' : 'EXPLICIT',
      lineWeight,
      transparency,
    },
  };
}

export function parseNumber(val, defaultVal = 0) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : defaultVal;
}
