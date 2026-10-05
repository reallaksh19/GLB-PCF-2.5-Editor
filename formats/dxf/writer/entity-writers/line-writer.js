import { pushTag, fmtNum, writeCommonEntityTags } from './writer-utils.js';

export const LineWriter = {
  type: 'LINE',
  write(entity, lines) {
    pushTag(lines, 0, 'LINE');
    writeCommonEntityTags(entity, lines);

    const s = entity.geometry?.start || { x: 0, y: 0, z: 0 };
    const e = entity.geometry?.end || { x: 0, y: 0, z: 0 };

    pushTag(lines, 10, fmtNum(s.x));
    pushTag(lines, 20, fmtNum(s.y));
    pushTag(lines, 30, fmtNum(s.z));
    pushTag(lines, 11, fmtNum(e.x));
    pushTag(lines, 21, fmtNum(e.y));
    pushTag(lines, 31, fmtNum(e.z));

    const ex = entity.geometry?.extrusion;
    if (ex && (ex.x !== 0 || ex.y !== 0 || ex.z !== 1)) {
      pushTag(lines, 210, fmtNum(ex.x));
      pushTag(lines, 220, fmtNum(ex.y));
      pushTag(lines, 230, fmtNum(ex.z, 1));
    }
  },
};
