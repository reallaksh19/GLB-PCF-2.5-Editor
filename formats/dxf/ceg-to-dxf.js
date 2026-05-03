/*
 * formats/dxf/ceg-to-dxf.js
 *
 * Serializes a Canonical Edit Graph back to a DXF string.
 * Only ENTITIES section is emitted (no HEADER/TABLES/BLOCKS).
 * Component types covered: LINE/PIPE, ARC, BLOCK_COMPONENT,
 * ANNOTATION, PROXY_DXF_ENTITY, and any unknown type.
 */

/**
 * Convert a CEG to a DXF file string.
 *
 * @param {Object} graph Canonical Edit Graph.
 * @returns {string} DXF file contents.
 */
export function cegToDxf(graph) {
  const lines = [];
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  for (const compId of Object.keys(graph.components)) {
    const comp    = graph.components[compId];
    const anchors = graph.anchors;
    const layer   = comp.layerId || '0';

    switch (comp.type) {
      case 'LINE':
      case 'PIPE': {
        const [a1Id, a2Id] = comp.anchorIds || [];
        const a1 = anchors[a1Id]; const a2 = anchors[a2Id];
        if (!a1 || !a2) break;
        lines.push('0','LINE','8',layer,
          '10', fmt(a1.point.x), '20', fmt(a1.point.y), '30', fmt(a1.point.z),
          '11', fmt(a2.point.x), '21', fmt(a2.point.y), '31', fmt(a2.point.z));
        break;
      }
      case 'ARC': {
        const [ep1Id, cpId, ep2Id] = comp.anchorIds || [];
        const ep1 = anchors[ep1Id]; const cp = anchors[cpId]; const ep2 = anchors[ep2Id];
        if (!ep1 || !cp || !ep2) break;
        const radius     = comp.derived?.radius || dist2D(cp.point, ep1.point);
        const startAngle = angleDeg(cp.point, ep1.point);
        const endAngle   = angleDeg(cp.point, ep2.point);
        lines.push('0','ARC','8',layer,
          '10', fmt(cp.point.x), '20', fmt(cp.point.y), '30', fmt(cp.point.z),
          '40', fmt(radius), '50', fmt(startAngle), '51', fmt(endAngle));
        break;
      }
      case 'BLOCK_COMPONENT': {
        const [aId] = comp.anchorIds || [];
        const a = anchors[aId];
        if (!a) break;
        const blockName = comp.attributes?.blockName || comp.type;
        lines.push('0','INSERT','8',layer,'2',blockName,
          '10', fmt(a.point.x), '20', fmt(a.point.y), '30', fmt(a.point.z));
        break;
      }
      case 'ANNOTATION': {
        const [aId] = comp.anchorIds || [];
        const a = anchors[aId];
        if (!a) break;
        lines.push('0','TEXT','8',layer,
          '10', fmt(a.point.x), '20', fmt(a.point.y), '30', fmt(a.point.z),
          '1', String(comp.attributes?.text || ''));
        break;
      }
      case 'PROXY_DXF_ENTITY':
        lines.push('0','TEXT','8',layer,'10','0','20','0','30','0','1',`PROXY:${comp.id}`);
        break;
      default:
        lines.push('0','TEXT','8',layer,'10','0','20','0','30','0','1',`UNSUPPORTED:${comp.id}`);
        break;
    }
  }

  lines.push('0','ENDSEC','0','EOF');
  return lines.join('\n');
}

function dist2D(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function angleDeg(center, point) {
  let a = Math.atan2((point.y || 0) - (center.y || 0), (point.x || 0) - (center.x || 0)) * (180 / Math.PI);
  if (a < 0) a += 360;
  return a;
}

function fmt(num) {
  const n = Number(num) || 0;
  return n.toFixed(6).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}
