import { nativeTags } from '../dxf-source-index.js';
/**
 * formats/dxf/parser/entity-codecs/index.js
 *
 * Entity Codec Registry.
 * Decodes any entity tag block into an authoritative DxfEntity record.
 */

import { LineCodec } from './line-codec.js';
import { CircleCodec, ArcCodec } from './circle-arc-codec.js';
import { LwpolylineCodec, PolylineCodec } from './polyline-codec.js';
import { VertexCodec } from './vertex-codec.js';
import { AttribCodec } from './attrib-codec.js';
import { TextCodec, MtextCodec } from './text-codec.js';
import { InsertCodec } from './insert-codec.js';
import {
  SplineCodec,
  EllipseCodec,
  SolidCodec,
  PointCodec,
  LeaderCodec,
  DimensionCodec,
  UnknownCodec,
} from './misc-codecs.js';

const CODEC_MAP = new Map([
  ['LINE', LineCodec],
  ['CIRCLE', CircleCodec],
  ['ARC', ArcCodec],
  ['LWPOLYLINE', LwpolylineCodec],
  ['POLYLINE', PolylineCodec],
  ['VERTEX', VertexCodec],
  ['ATTRIB', AttribCodec],
  ['TEXT', TextCodec],
  ['MTEXT', MtextCodec],
  ['INSERT', InsertCodec],
  ['SPLINE', SplineCodec],
  ['ELLIPSE', EllipseCodec],
  ['SOLID', SolidCodec],
  ['POINT', PointCodec],
  ['LEADER', LeaderCodec],
  ['DIMENSION', DimensionCodec],
]);

export function decodeEntity(type, tags, order, subEntities = []) {
  const upperType = String(type).trim().toUpperCase();
  const codec = CODEC_MAP.get(upperType);
  const fields = nativeTags(tags);
  const entity = codec ? codec.decode(fields, order, subEntities) : UnknownCodec.decode(fields, order, upperType);
  entity.source.rawTags = tags; // Opaque control groups/XDATA remain authoritative.
  if (!entity.geometry.extrusion) entity.geometry.extrusion = {
    x: Number(fields.find(t => t.code === 210)?.value || 0),
    y: Number(fields.find(t => t.code === 220)?.value || 0),
    z: Number(fields.find(t => t.code === 230)?.value ?? 1),
  };
  return entity;
}

export function registerCodec(type, codec) {
  CODEC_MAP.set(String(type).trim().toUpperCase(), codec);
}
