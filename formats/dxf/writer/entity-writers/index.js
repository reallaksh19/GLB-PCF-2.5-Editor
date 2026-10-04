/**
 * formats/dxf/writer/entity-writers/index.js
 *
 * Entity Writer Registry.
 * Implements the non-negotiable write strategy from Issue #85:
 * - Unmodified entity with raw tags -> emit preserved source tags byte-for-byte.
 * - Modified or generated typed entity -> encode using entity codec writer.
 * - Compound entities (POLYLINE, INSERT) -> include sub-entities and SEQEND.
 */

import { LineWriter } from './line-writer.js';
import { CircleWriter, ArcWriter } from './circle-arc-writer.js';
import { LwpolylineWriter, PolylineWriter } from './polyline-writer.js';
import { TextWriter, MtextWriter } from './text-writer.js';
import { InsertWriter } from './insert-writer.js';
import {
  SplineWriter,
  EllipseWriter,
  SolidWriter,
  PointWriter,
  LeaderWriter,
  DimensionWriter,
} from './misc-writers.js';
import { pushTag } from './writer-utils.js';

const WRITER_MAP = new Map([
  ['LINE', LineWriter],
  ['CIRCLE', CircleWriter],
  ['ARC', ArcWriter],
  ['LWPOLYLINE', LwpolylineWriter],
  ['POLYLINE', PolylineWriter],
  ['TEXT', TextWriter],
  ['MTEXT', MtextWriter],
  ['INSERT', InsertWriter],
  ['SPLINE', SplineWriter],
  ['ELLIPSE', EllipseWriter],
  ['SOLID', SolidWriter],
  ['POINT', PointWriter],
  ['LEADER', LeaderWriter],
  ['DIMENSION', DimensionWriter],
]);

export function writeEntity(entity, lines) {
  if (!entity) return;

  // Compound entities with sub-entities (POLYLINE, INSERT) manage their own sub-entities & SEQEND
  const upperType = String(entity.type).trim().toUpperCase();
  if (upperType === 'POLYLINE' || (upperType === 'INSERT' && entity.attributes?.attribs?.length > 0)) {
    const writer = WRITER_MAP.get(upperType);
    if (writer) {
      writer.write(entity, lines);
      return;
    }
  }

  // 1. Unmodified entity with preserved raw tags -> exact passthrough!
  if (!entity.state.modified && entity.source?.rawTags && entity.source.rawTags.length > 0) {
    for (const tag of entity.source.rawTags) {
      pushTag(lines, tag.code, tag.value);
    }
    if (entity.source.seqendRawTags && entity.source.seqendRawTags.length > 0) {
      for (const tag of entity.source.seqendRawTags) {
        pushTag(lines, tag.code, tag.value);
      }
    }
    return;
  }

  // 2. Modified or new typed entity -> encode via entity writer
  const writer = WRITER_MAP.get(upperType);

  if (writer) {
    writer.write(entity, lines);
    return;
  }

  // 3. Fallback: if untouched raw tags exist, write them
  if (entity.source?.rawTags && entity.source.rawTags.length > 0) {
    for (const tag of entity.source.rawTags) {
      pushTag(lines, tag.code, tag.value);
    }
  } else {
    // If unknown entity was modified with no writer, throw or write safe fallback
    throw new Error(`Cannot serialize modified entity of unsupported type: ${upperType}`);
  }
}
