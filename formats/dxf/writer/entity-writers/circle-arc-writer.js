import { pushTag, fmtNum, writeCommonEntityTags } from './writer-utils.js';

export const CircleWriter = {
  type: 'CIRCLE',
  write(entity, lines) {
    pushTag(lines, 0, 'CIRCLE');
    writeCommonEntityTags(entity, lines);

    const c = entity.geometry?.center || { x: 0, y: 0, z: 0 };
    pushTag(lines, 10, fmtNum(c.x));
    pushTag(lines, 20, fmtNum(c.y));
    pushTag(lines, 30, fmtNum(c.z));
    pushTag(lines, 40, fmtNum(entity.geometry?.radius ?? 0));

    const ex = entity.geometry?.extrusion;
    if (ex && (ex.x !== 0 || ex.y !== 0 || ex.z !== 1)) {
      pushTag(lines, 210, fmtNum(ex.x));
      pushTag(lines, 220, fmtNum(ex.y));
      pushTag(lines, 230, fmtNum(ex.z, 1));
    }
  },
};

export const ArcWriter = {
  type: 'ARC',
  write(entity, lines) {
    pushTag(lines, 0, 'ARC');
    writeCommonEntityTags(entity, lines);

    const c = entity.geometry?.center || { x: 0, y: 0, z: 0 };
    pushTag(lines, 10, fmtNum(c.x));
    pushTag(lines, 20, fmtNum(c.y));
    pushTag(lines, 30, fmtNum(c.z));
    pushTag(lines, 40, fmtNum(entity.geometry?.radius ?? 0));
    pushTag(lines, 50, fmtNum(entity.geometry?.startAngle ?? 0));
    pushTag(lines, 51, fmtNum(entity.geometry?.endAngle ?? 360));

    const ex = entity.geometry?.extrusion;
    if (ex && (ex.x !== 0 || ex.y !== 0 || ex.z !== 1)) {
      pushTag(lines, 210, fmtNum(ex.x));
      pushTag(lines, 220, fmtNum(ex.y));
      pushTag(lines, 230, fmtNum(ex.z, 1));
    }
  },
};
