import { pushTag, fmtNum, writeCommonEntityTags } from './writer-utils.js';

export const LwpolylineWriter = {
  type: 'LWPOLYLINE',
  write(entity, lines) {
    pushTag(lines, 0, 'LWPOLYLINE');
    writeCommonEntityTags(entity, lines);

    const vertices = entity.geometry?.vertices || [];
    pushTag(lines, 90, vertices.length);

    let flags = entity.attributes?.flags ?? 0;
    if (entity.geometry?.closed) {
      flags |= 1;
    }
    pushTag(lines, 70, flags);

    if (entity.geometry?.constantWidth) {
      pushTag(lines, 43, fmtNum(entity.geometry.constantWidth));
    }
    if (entity.geometry?.elevation) {
      pushTag(lines, 38, fmtNum(entity.geometry.elevation));
    }

    for (const v of vertices) {
      pushTag(lines, 10, fmtNum(v.x));
      pushTag(lines, 20, fmtNum(v.y));
      if (v.startWidth) pushTag(lines, 40, fmtNum(v.startWidth));
      if (v.endWidth) pushTag(lines, 41, fmtNum(v.endWidth));
      if (v.bulge) pushTag(lines, 42, fmtNum(v.bulge));
    }

    const ex = entity.geometry?.extrusion;
    if (ex && (ex.x !== 0 || ex.y !== 0 || ex.z !== 1)) {
      pushTag(lines, 210, fmtNum(ex.x));
      pushTag(lines, 220, fmtNum(ex.y));
      pushTag(lines, 230, fmtNum(ex.z, 1));
    }
  },
};

export const PolylineWriter = {
  type: 'POLYLINE',
  write(entity, lines) {
    if (!entity.state.modified && entity.source?.rawTags && entity.source.rawTags.length > 0) {
      for (const t of entity.source.rawTags) {
        pushTag(lines, t.code, t.value);
      }
    } else {
      pushTag(lines, 0, 'POLYLINE');
      writeCommonEntityTags(entity, lines);

      let flags = entity.attributes?.flags ?? 0;
      if (entity.geometry?.closed) {
        flags |= 1;
      }
      pushTag(lines, 70, flags);
    }

    const vertices = entity.geometry?.vertices || [];
    for (const v of vertices) {
      if (!entity.state.modified && v.rawTags && v.rawTags.length > 0) {
        // Untouched vertex passthrough
        for (const t of v.rawTags) {
          pushTag(lines, t.code, t.value);
        }
      } else {
        // Emit VERTEX
        pushTag(lines, 0, 'VERTEX');
        if (v.handle) pushTag(lines, 5, v.handle);
        pushTag(lines, 8, entity.layerId || '0');
        pushTag(lines, 10, fmtNum(v.x));
        pushTag(lines, 20, fmtNum(v.y));
        pushTag(lines, 30, fmtNum(v.z));
        if (v.startWidth) pushTag(lines, 40, fmtNum(v.startWidth));
        if (v.endWidth) pushTag(lines, 41, fmtNum(v.endWidth));
        if (v.bulge) pushTag(lines, 42, fmtNum(v.bulge));
        if (v.flags) pushTag(lines, 70, v.flags);
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
  },
};
