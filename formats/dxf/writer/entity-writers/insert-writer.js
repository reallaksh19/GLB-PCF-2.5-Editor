import { pushTag, fmtNum, writeCommonEntityTags } from './writer-utils.js';

export const InsertWriter = {
  type: 'INSERT',
  write(entity, lines) {
    if (!entity.state.modified && entity.source?.rawTags && entity.source.rawTags.length > 0) {
      for (const t of entity.source.rawTags) {
        pushTag(lines, t.code, t.value);
      }
    } else {
      pushTag(lines, 0, 'INSERT');
      writeCommonEntityTags(entity, lines);

      pushTag(lines, 2, entity.attributes?.blockName || '');

      const ip = entity.geometry?.insertionPoint || { x: 0, y: 0, z: 0 };
      pushTag(lines, 10, fmtNum(ip.x));
      pushTag(lines, 20, fmtNum(ip.y));
      pushTag(lines, 30, fmtNum(ip.z));

      const s = entity.geometry?.scale;
      if (s) {
        if (s.x !== 1.0) pushTag(lines, 41, fmtNum(s.x));
        if (s.y !== 1.0) pushTag(lines, 42, fmtNum(s.y));
        if (s.z !== 1.0) pushTag(lines, 43, fmtNum(s.z));
      }

      if (entity.geometry?.rotation) {
        pushTag(lines, 50, fmtNum(entity.geometry.rotation));
      }

      const ex = entity.geometry?.extrusion;
      if (ex && (ex.x !== 0 || ex.y !== 0 || ex.z !== 1)) {
        pushTag(lines, 210, fmtNum(ex.x));
        pushTag(lines, 220, fmtNum(ex.y));
        pushTag(lines, 230, fmtNum(ex.z, 1));
      }
    }

    const attribs = entity.attributes?.attribs || [];
    if (attribs.length > 0) {
      if (entity.state.modified || !entity.source?.rawTags?.some(t => t.code === 66)) pushTag(lines, 66, 1);
      for (const a of attribs) {
        if (a.source?.rawTags && a.source.rawTags.length > 0) {
          for (const t of a.source.rawTags) {
            pushTag(lines, t.code, t.value);
          }
        } else {
          pushTag(lines, 0, 'ATTRIB');
          writeCommonEntityTags(a, lines);
          const aIp = a.geometry?.insertionPoint || { x: 0, y: 0, z: 0 };
          pushTag(lines, 10, fmtNum(aIp.x));
          pushTag(lines, 20, fmtNum(aIp.y));
          pushTag(lines, 30, fmtNum(aIp.z));
          pushTag(lines, 40, fmtNum(a.attributes?.height || 2.5));
          pushTag(lines, 1, a.attributes?.text || '');
          pushTag(lines, 2, a.attributes?.tag || '');
          if (a.attributes?.flags) pushTag(lines, 70, a.attributes.flags);
        }
      }

      // SEQEND
      if (entity.source.seqendRawTags && entity.source.seqendRawTags.length > 0) {
        for (const t of entity.source.seqendRawTags) {
          pushTag(lines, t.code, t.value);
        }
      } else {
        pushTag(lines, 0, 'SEQEND');
        pushTag(lines, 8, entity.layerId || '0');
      }
    }
  },
};
