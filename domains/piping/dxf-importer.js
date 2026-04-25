import DxfParser from 'dxf-parser';

let nextId = 1;

function AciToMaterial(aci) {
  switch (aci) {
    case 1: return 'CS';
    case 3: return 'SS';
    case 5: return 'CU';
    default: return 'UNKNOWN';
  }
}

export function parseDxf(text, log) {
  const parser = new DxfParser();
  let dxf;
  try {
    dxf = parser.parseSync(text);
  } catch (err) {
    log.error('DXF_PARSE_FAIL', { message: err.message });
    return [];
  }

  const insunits = dxf.header?.$INSUNITS;
  if (insunits !== undefined && insunits !== 4) {
    log.warn('DXF_UNIT_WARN', { insunits });
  }

  const entities = dxf.entities || [];
  log.info('DXF_PARSE_START', { entityCount: entities.length });

  const components = [];
  let warnCount = 0;

  for (const ent of entities) {
    const layer = ent.layer || '0';
    const material = AciToMaterial(ent.colorIndex || 256);
    const attributes = {
      'PIPELINE-REFERENCE': layer,
      'MATERIAL': material
    };

    let comp = null;
    const g = {};

    if (ent.type === 'LINE') {
      comp = { type: 'PIPE' };
      g.ep1 = { x: ent.vertices[0].x, y: ent.vertices[0].y, z: ent.vertices[0].z };
      g.ep2 = { x: ent.vertices[1].x, y: ent.vertices[1].y, z: ent.vertices[1].z };
    } else if (ent.type === 'LWPOLYLINE') {
      comp = { type: 'PIPE' };
      const v = ent.vertices;
      g.ep1 = { x: v[0].x, y: v[0].y, z: v[0].z || 0 };
      const last = v[v.length - 1];
      g.ep2 = { x: last.x, y: last.y, z: last.z || 0 };
    } else if (ent.type === 'ARC') {
      comp = { type: 'ELBOW' };
      g.cp = { x: ent.center.x, y: ent.center.y, z: ent.center.z };
      // start and end angles are in radians
      const r = ent.radius;
      g.ep1 = {
        x: g.cp.x + r * Math.cos(ent.startAngle),
        y: g.cp.y + r * Math.sin(ent.startAngle),
        z: g.cp.z
      };
      g.ep2 = {
        x: g.cp.x + r * Math.cos(ent.endAngle),
        y: g.cp.y + r * Math.sin(ent.endAngle),
        z: g.cp.z
      };
    } else if (ent.type === 'CIRCLE') {
      comp = { type: 'FLANGE' };
      g.origin = { x: ent.center.x, y: ent.center.y, z: ent.center.z };
      g.bore = ent.radius * 2;
    } else if (ent.type === 'INSERT') {
      const bn = (ent.name || '').toUpperCase();
      if (bn.includes('VALVE')) comp = { type: 'VALVE' };
      else if (bn.includes('SUPPORT')) comp = { type: 'SUPPORT' };
      else if (bn.includes('TEE')) comp = { type: 'TEE' };
      else comp = { type: 'FITTING' };
      g.origin = { x: ent.position.x, y: ent.position.y, z: ent.position.z };
    } else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
      comp = { type: 'MESSAGE-SQUARE' };
      comp.metadata = {
        squareText: ent.text,
        squarePos: { x: ent.startPoint?.x ?? 0, y: ent.startPoint?.y ?? 0, z: ent.startPoint?.z ?? 0 }
      };
    } else if (ent.type === 'POINT') {
      comp = { type: 'FITTING' };
      g.origin = { x: ent.position.x, y: ent.position.y, z: ent.position.z };
    } else {
      log.warn('DXF_ENTITY_SKIP', { type: ent.type, reason: 'Unsupported' });
      warnCount++;
      continue;
    }

    comp.id = `DXF-${nextId++}`;
    comp.attributes = attributes;
    comp.geometry = g;
    if (!comp.metadata) comp.metadata = {};
    components.push(comp);
  }

  log.info('DXF_PARSE_DONE', { componentCount: components.length, warnCount });

  if (components.length > 0) {
    import('../../js/capabilities/capability-registry.js').then(({ capabilities }) => {
      capabilities.ready('dxf-import');
    }).catch(() => {});
  }

  return components;
}
