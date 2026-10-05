import { nativeTags } from '../parser/dxf-source-index.js';
import { encodeDxfText } from './dxf-encoding.js';

const point = (name, x) => ['x', 'y', 'z'].map((axis, i) => [name + '.' + axis, x + i * 10]);
const COMMON = [['layerId', 8], ['style.colorIndex', 62], ['style.trueColor', 420],
  ['style.lineType', 6], ['style.lineWeight', 370], ['style.transparency', 440]];
const FIELDS = {
  LINE: [...point('geometry.start', 10), ...point('geometry.end', 11)],
  CIRCLE: [...point('geometry.center', 10), ['geometry.radius', 40]],
  ARC: [...point('geometry.center', 10), ['geometry.radius', 40],
    ['geometry.startAngle', 50], ['geometry.endAngle', 51]],
  POINT: point('geometry.point', 10),
  ELLIPSE: [...point('geometry.center', 10), ...point('geometry.majorAxis', 11),
    ['geometry.ratio', 40], ['geometry.startParam', 41], ['geometry.endParam', 42]],
  MTEXT: [...point('geometry.insertionPoint', 10), ['attributes.text', 1], ['attributes.height', 40],
    ['attributes.rectWidth', 41], ['attributes.attachmentPoint', 71], ['attributes.drawingDir', 72],
    ['attributes.rotation', 50], ['attributes.styleName', 7]],
  DIMENSION: [...point('geometry.defPoints.p10',10), ...point('geometry.defPoints.p11',11),
    ...point('geometry.defPoints.p13',13), ...point('geometry.defPoints.p14',14),
    ['attributes.blockName',2], ['attributes.dimType',70], ['attributes.text',1]],
  SPLINE: [['geometry.degree',71], ['attributes.flags',70]],
  SOLID: [], LEADER: [],
  TEXT: [...point('geometry.insertionPoint', 10), ...point('geometry.alignmentPoint', 11),
    ['attributes.text', 1], ['attributes.height', 40], ['attributes.rotation', 50],
    ['attributes.widthFactor', 41], ['attributes.obliqueAngle', 51], ['attributes.styleName', 7],
    ['attributes.textGenFlags', 71], ['attributes.horizJust', 72], ['attributes.vertJust', 73]],
  INSERT: [...point('geometry.insertionPoint', 10), ['geometry.scale.x', 41],
    ['geometry.scale.y', 42], ['geometry.scale.z', 43], ['geometry.rotation', 50],
    ['attributes.blockName', 2], ['attributes.columns', 70], ['attributes.rows', 71],
    ['attributes.columnSpacing', 44], ['attributes.rowSpacing', 45]],
  POLYLINE: [['geometry.elevation', 30], ['geometry.startWidth', 40], ['geometry.endWidth', 41]],
  LWPOLYLINE: [['geometry.elevation', 38], ['geometry.constantWidth', 43]],
  VERTEX: [...point('geometry.point', 10), ['geometry.bulge', 42],
    ['geometry.startWidth', 40], ['geometry.endWidth', 41], ['attributes.flags', 70]],
};
FIELDS.ATTRIB = FIELDS.TEXT.filter(([p]) => !['attributes.obliqueAngle', 'attributes.vertJust'].includes(p))
  .concat([['attributes.vertJust', 74], ['attributes.tag', 2], ['attributes.flags', 70], ['attributes.fieldLength', 73]]);
const get = (v, path) => path.split('.').reduce((o, key) => o?.[key], v);
const set = (v, path, value) => {
  const parts = path.split('.'); const key = parts.pop();
  let o = v;
  for (const part of parts) o = o[part] ||= {};
  if (value === undefined) delete o[key]; else o[key] = value;
};

// Compare semantic fields, excluding immutable source tokens and derived identity links.
export function semantic(value) {
  if (value instanceof Map) return [...value].map(semantic);
  if (Array.isArray(value)) return value.map(semantic);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.start === 'number' && 'code' in value && 'value' in value) return { code: value.code, value: value.value };
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['source', 'state', 'id', 'documentId', 'definitionId', 'spaceId',
      'rawTags', 'sourceEntityId'].includes(key)).map(([key, v]) => [key, semantic(v)]));
}
export function same(a, b) { return JSON.stringify(semantic(a)) === JSON.stringify(semantic(b)); }

export function encodeValue(value, encoding) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid non-finite DXF field');
  const text = String(value);
  if (/[\r\n\0]/.test(text)) throw new Error('Invalid multiline DXF field value');
  return encodeDxfText(text, encoding);
}

/** Patch only changed, uniquely selected native fields. Opaque control groups/XDATA never participate. */
export function fieldOverlays(before, after, tags, stream, newline, patches) {
  const fields = FIELDS[before.type];
  if (!fields || before.type !== after.type) throw new Error('Unsupported modified entity type: ' + after.type);
  const expected = semantic(before), actual = semantic(after);
  const native = nativeTags(tags);
  const extra = [];
  const plans = [...COMMON, ...fields, ...point('geometry.extrusion', 210)];
  if (['POLYLINE', 'LWPOLYLINE'].includes(before.type)) {
    if (typeof after.geometry.closed !== 'boolean' || !Number.isInteger(after.attributes.flags)) throw new Error('Invalid POLYLINE flags');
    // Closed is one bit of the native flags; never drop the other bits.
    const flags = (after.attributes.flags & ~1) | (after.geometry.closed ? 1 : 0);
    const prior = (before.attributes.flags & ~1) | (before.geometry.closed ? 1 : 0);
    if (flags !== prior) change(70, flags);
    expected.attributes.flags = actual.attributes.flags;
    expected.geometry.closed = actual.geometry.closed;
    if (before.type === 'LWPOLYLINE') patchVertices();
    else expected.geometry.vertices = actual.geometry.vertices; // Separate VERTEX records patched by caller.
  }
  for (const [path, code] of plans) {
    const old = get(before, path), value = get(after, path);
    if (old === value) continue;
    if (value === undefined || value === null) throw new Error('Unsupported field removal: ' + path);
    if (path === 'attributes.height' && !(value > 0)) throw new Error('Invalid text height');
    if (path === 'geometry.radius' && !(value > 0)) throw new Error('Invalid circle/arc radius');
    if (before.type === 'MTEXT' && path === 'attributes.text') {
      encodeValue(value,stream.encoding);
      const textTags = native.filter(t => t.code === 1 || t.code === 3);
      for (const token of textTags) patches.push({start:token.start,end:token.end,bytes:new Uint8Array()});
      const at = textTags[0]?.start ?? tags.at(-1).end;
      const chars=Array.from(value), chunks = []; for (let i=0;i<chars.length;i+=250) chunks.push(chars.slice(i,i+250).join(''));
      if (!chunks.length) chunks.push('');
      patches.push({start:at,end:at,bytes:encodeDxfText(chunks.map((s,i)=>(i===chunks.length-1?1:3)+newline+s+newline).join(''),stream.encoding)});
    } else change(code, value);
    set(expected, path, value);
  }
  // These modes are derived from the fields above; inconsistent mode-only edits are rejected.
  for (const [mode, value, derive] of [
    ['colorMode', 'colorIndex', s => s.trueColor !== null ? 'TRUECOLOR' : s.colorIndex === 0 ? 'BYBLOCK' : s.colorIndex === 256 ? 'BYLAYER' : 'INDEX'],
    ['lineTypeMode', 'lineType', s => ['BYLAYER', 'BYBLOCK'].includes(s.lineType.toUpperCase()) ? s.lineType.toUpperCase() : 'EXPLICIT'],
    ['lineWeightMode', 'lineWeight', s => ({ '-1': 'BYLAYER', '-2': 'BYBLOCK', '-3': 'DEFAULT' })[s.lineWeight] || 'EXPLICIT'],
  ]) {
    if (before.style[mode] !== after.style[mode]) {
      if (after.style[mode] !== derive(after.style) || (before.style[value] === after.style[value] && before.style.trueColor === after.style.trueColor)) {
        throw new Error('Unsupported inconsistent style mode: ' + mode);
      }
      expected.style[mode] = actual.style[mode];
    }
  }
  // Compound children have their own source spans and validation.
  for (const [path,codes] of (before.type === 'SPLINE' ? [['geometry.controlPoints',[10,20,30]],['geometry.fitPoints',[11,21,31]],['geometry.knots',[40]],['geometry.weights',[41]]] :
    before.type === 'SOLID' ? [['geometry.points',[10,20,30]]] : before.type === 'LEADER' ? [['geometry.vertices',[10,20,30]]] : [])) {
    const old=get(before,path), values=get(after,path);
    if (old.length!==values.length) throw new Error('Unsupported array topology requires a record conversion plan');
    for (let i=0;i<old.length;i++) for (let a=0;a<codes.length;a++) {
      const axis=['x','y','z'][a], prior=codes.length===1?old[i]:old[i][axis], value=codes.length===1?values[i]:values[i][axis];
      if(prior===value) continue;
      const code=before.type==='SOLID'?codes[a]+i:codes[a];
      const hits=native.filter(t=>t.code===code), token=hits[before.type==='SOLID'?0:i];
      if(!token) throw new Error('Unsupported missing repeated native field');
      validateField(code,value,stream.acadVersion);
      patches.push({start:token.valueStart,end:token.valueEnd,bytes:encodeValue(value,stream.encoding)});
    }
    set(expected,path,values);
  }
  for (const key of ['attribs', 'subEntities']) {
    if (expected.attributes[key]) expected.attributes[key] = actual.attributes[key];
  }
  if (!same(expected, actual)) throw new Error('Unsupported mutation outside field overlay contract: ' + before.type);
  if (extra.length) {
    const last = tags.at(-1);
    const suffix = stream.decodeSpan(last.valueEnd, last.end) ? '' : newline;
    // Insert before XDATA; never append a native field into an opaque application payload.
    const xdata = tags.find(t => t.code >= 1000);
    const at = xdata?.start ?? last.end;
    patches.push({ start: at, end: at, bytes: encodeValueBlock((xdata ? '' : suffix) + extra.join(''), stream.encoding) });
  }
  function change(code, value, scoped = native) {
    validateField(code, value, stream.acadVersion);
    const hits = scoped.filter(t => t.code === code);
    if (hits.length > 1) throw new Error('Unsupported ambiguous native field selector: ' + code);
    const bytes = encodeValue(value, stream.encoding);
    if (hits.length) patches.push({ start: hits[0].valueStart, end: hits[0].valueEnd, bytes });
    else extra.push(code + newline + String(value) + newline);
  }
  function patchVertices() {
    const old = before.geometry.vertices, vertices = after.geometry.vertices;
    if (old.length !== vertices.length) throw new Error('Unsupported LWPOLYLINE vertex topology change');
    const groups = []; let group;
    for (const t of native) {
      if (t.code === 10) { group = []; groups.push(group); }
      if (group) group.push(t);
    }
    for (let i = 0; i < old.length; i++) {
      const want = semantic(old[i]);
      for (const [key, code] of [['x', 10], ['y', 20], ['startWidth', 40], ['endWidth', 41], ['bulge', 42]]) {
        if (old[i][key] === vertices[i][key]) continue;
        const hits = groups[i]?.filter(t => t.code === code) || [];
        if (hits.length > 1) throw new Error('Unsupported ambiguous vertex field');
        if (hits.length) change(code, vertices[i][key], groups[i]);
        else {
          const at = groups[i].at(-1).end;
          validateField(code, vertices[i][key], stream.acadVersion);
          encodeValue(vertices[i][key], stream.encoding);
          patches.push({ start: at, end: at, bytes: encodeValueBlock(code + newline + String(vertices[i][key]) + newline, stream.encoding) });
        }
        want[key] = vertices[i][key];
      }
      if (!same(want, vertices[i])) throw new Error('Unsupported LWPOLYLINE vertex mutation');
    }
    expected.geometry.vertices = actual.geometry.vertices;
  }
}

function validateField(code, value, version) {
  const numeric = (code >= 10 && code <= 99) || (code >= 210 && code <= 239) ||
    (code >= 370 && code <= 389) || (code >= 420 && code <= 459);
  const integer = (code >= 60 && code <= 99) || code >= 370;
  if (numeric && (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value)))) {
    throw new Error('Invalid finite native numeric field: ' + code);
  }
  const minimum = ({ 370: 1015, 420: 1018, 440: 1024 })[code];
  const sourceVersion = Number(String(version).replace('AC', ''));
  if (minimum && (!Number.isFinite(sourceVersion) || sourceVersion < minimum)) {
    throw new Error('Unsupported field for source DXF version: ' + code);
  }
}

function encodeValueBlock(text, encoding) {
  return encodeDxfText(text,encoding);
}

export function composeBytes(original, patches) {
  patches.sort((a, b) => a.start - b.start || a.end - b.end);
  let end = 0, size = original.length;
  for (const p of patches) {
    if (!Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < end || p.end < p.start || p.end > original.length) {
      throw new Error('Invalid or overlapping DXF byte overlays');
    }
    end = p.end; size += p.bytes.length - (p.end - p.start);
  }
  const output = new Uint8Array(size);
  let source = 0, target = 0;
  for (const p of patches) {
    output.set(original.subarray(source, p.start), target); target += p.start - source;
    output.set(p.bytes, target); target += p.bytes.length; source = p.end;
  }
  output.set(original.subarray(source), target);
  return output;
}
