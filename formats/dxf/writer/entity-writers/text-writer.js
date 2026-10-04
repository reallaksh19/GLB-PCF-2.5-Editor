import { pushTag, fmtNum, writeCommonEntityTags } from './writer-utils.js';

export const TextWriter = {
  type: 'TEXT',
  write(entity, lines) {
    pushTag(lines, 0, 'TEXT');
    writeCommonEntityTags(entity, lines);

    const ip = entity.geometry?.insertionPoint || { x: 0, y: 0, z: 0 };
    pushTag(lines, 10, fmtNum(ip.x));
    pushTag(lines, 20, fmtNum(ip.y));
    pushTag(lines, 30, fmtNum(ip.z));

    const height = entity.attributes?.height ?? 2.5;
    pushTag(lines, 40, fmtNum(height));

    const text = entity.attributes?.text ?? '';
    pushTag(lines, 1, text);

    if (entity.attributes?.rotation) {
      pushTag(lines, 50, fmtNum(entity.attributes.rotation));
    }
    if (entity.attributes?.widthFactor != null && entity.attributes.widthFactor !== 1.0) {
      pushTag(lines, 41, fmtNum(entity.attributes.widthFactor));
    }
    if (entity.attributes?.obliqueAngle) {
      pushTag(lines, 51, fmtNum(entity.attributes.obliqueAngle));
    }
    if (entity.attributes?.styleName) {
      pushTag(lines, 7, entity.attributes.styleName);
    }
    if (entity.attributes?.textGenFlags) {
      pushTag(lines, 71, entity.attributes.textGenFlags);
    }
    if (entity.attributes?.horizJust) {
      pushTag(lines, 72, entity.attributes.horizJust);
    }
    if (entity.attributes?.vertJust) {
      pushTag(lines, 73, entity.attributes.vertJust);
    }

    const ap = entity.geometry?.alignmentPoint;
    if (ap) {
      pushTag(lines, 11, fmtNum(ap.x));
      pushTag(lines, 21, fmtNum(ap.y));
      pushTag(lines, 31, fmtNum(ap.z));
    }
  },
};

export const MtextWriter = {
  type: 'MTEXT',
  write(entity, lines) {
    pushTag(lines, 0, 'MTEXT');
    writeCommonEntityTags(entity, lines);

    const ip = entity.geometry?.insertionPoint || { x: 0, y: 0, z: 0 };
    pushTag(lines, 10, fmtNum(ip.x));
    pushTag(lines, 20, fmtNum(ip.y));
    pushTag(lines, 30, fmtNum(ip.z));

    const height = entity.attributes?.height ?? 2.5;
    pushTag(lines, 40, fmtNum(height));

    if (entity.attributes?.rectWidth) {
      pushTag(lines, 41, fmtNum(entity.attributes.rectWidth));
    }
    if (entity.attributes?.attachmentPoint) {
      pushTag(lines, 71, entity.attributes.attachmentPoint);
    }
    if (entity.attributes?.drawingDir) {
      pushTag(lines, 72, entity.attributes.drawingDir);
    }

    const text = entity.attributes?.text ?? '';
    pushTag(lines, 1, text);

    if (entity.attributes?.styleName) {
      pushTag(lines, 7, entity.attributes.styleName);
    }
    if (entity.attributes?.rotation) {
      pushTag(lines, 50, fmtNum(entity.attributes.rotation));
    }
  },
};
