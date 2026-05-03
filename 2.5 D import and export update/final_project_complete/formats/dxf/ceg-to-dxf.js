/*
 * formats/dxf/ceg-to-dxf.js
 *
 * Serializes a Canonical Edit Graph (CEG) back into a DXF string.
 * This exporter reads only from the CEG state; it does not refer
 * to the original raw DXF model.  Only a subset of entities is
 * supported: LINE/PIPE, ARC, BLOCK_COMPONENT, ANNOTATION and
 * proxies.  Unsupported component types are emitted as simple
 * TEXT notes indicating that export is not fully supported.
 */

import { linearLength } from '../../core/geometry/linear-ops.js';

/**
 * Convert a CEG into a DXF file string.  A minimal DXF section is
 * emitted with only ENTITIES.  No HEADER, TABLES or BLOCKS sections
 * are generated, since Wave 2 only requires basic round‑trip support.
 *
 * @param {Object} graph Canonical Edit Graph.
 * @returns {string} DXF file contents.
 */
export function cegToDxf(graph) {
  const lines = [];
  // Begin ENTITIES section
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('ENTITIES');
  // Iterate components
  for (const compId of Object.keys(graph.components)) {
    const comp = graph.components[compId];
    const anchors = graph.anchors;
    const layer = comp.layerId || '0';
    switch (comp.type) {
      case 'LINE':
      case 'PIPE': {
        // Linear component: expects two anchors
        const [a1Id, a2Id] = comp.anchorIds || [];
        const a1 = anchors[a1Id];
        const a2 = anchors[a2Id];
        if (!a1 || !a2) break;
        lines.push('0');
        lines.push('LINE');
        // No handle (group code 5) is written to allow DXF reader to assign one.
        lines.push('8');
        lines.push(layer);
        lines.push('10');
        lines.push(formatNumber(a1.point.x));
        lines.push('20');
        lines.push(formatNumber(a1.point.y));
        lines.push('30');
        lines.push(formatNumber(a1.point.z));
        lines.push('11');
        lines.push(formatNumber(a2.point.x));
        lines.push('21');
        lines.push(formatNumber(a2.point.y));
        lines.push('31');
        lines.push(formatNumber(a2.point.z));
        break;
      }
      case 'ARC': {
        // Arc component: expects three anchors (ep1, cp, ep2)
        const [ep1Id, cpId, ep2Id] = comp.anchorIds || [];
        const ep1 = anchors[ep1Id];
        const cp = anchors[cpId];
        const ep2 = anchors[ep2Id];
        if (!ep1 || !cp || !ep2) break;
        // Compute radius and angles
        const radius = comp.derived?.radius || distance2D(cp.point, ep1.point);
        const startAngle = angleDeg(cp.point, ep1.point);
        const endAngle = angleDeg(cp.point, ep2.point);
        lines.push('0');
        lines.push('ARC');
        lines.push('8');
        lines.push(layer);
        lines.push('10');
        lines.push(formatNumber(cp.point.x));
        lines.push('20');
        lines.push(formatNumber(cp.point.y));
        lines.push('30');
        lines.push(formatNumber(cp.point.z));
        lines.push('40');
        lines.push(formatNumber(radius));
        lines.push('50');
        lines.push(formatNumber(startAngle));
        lines.push('51');
        lines.push(formatNumber(endAngle));
        break;
      }
      case 'BLOCK_COMPONENT': {
        // Map to INSERT entity at origin anchor
        const [aId] = comp.anchorIds || [];
        const a = anchors[aId];
        if (!a) break;
        lines.push('0');
        lines.push('INSERT');
        lines.push('8');
        lines.push(layer);
        // Block name: use stored blockName or component type
        const blockName = comp.attributes?.blockName || comp.type;
        lines.push('2');
        lines.push(blockName);
        lines.push('10');
        lines.push(formatNumber(a.point.x));
        lines.push('20');
        lines.push(formatNumber(a.point.y));
        lines.push('30');
        lines.push(formatNumber(a.point.z));
        break;
      }
      case 'ANNOTATION': {
        const [aId] = comp.anchorIds || [];
        const a = anchors[aId];
        if (!a) break;
        lines.push('0');
        lines.push('TEXT');
        lines.push('8');
        lines.push(layer);
        lines.push('10');
        lines.push(formatNumber(a.point.x));
        lines.push('20');
        lines.push(formatNumber(a.point.y));
        lines.push('30');
        lines.push(formatNumber(a.point.z));
        lines.push('1');
        lines.push(String(comp.attributes?.text || ''));
        break;
      }
      case 'PROXY_DXF_ENTITY': {
        // Emit a comment-like TEXT to preserve proxy existence
        lines.push('0');
        lines.push('TEXT');
        lines.push('8');
        lines.push(layer);
        lines.push('10');
        lines.push('0');
        lines.push('20');
        lines.push('0');
        lines.push('30');
        lines.push('0');
        lines.push('1');
        lines.push(`PROXY:${comp.id}`);
        break;
      }
      default: {
        // Unknown component type; skip or write as diagnostic
        lines.push('0');
        lines.push('TEXT');
        lines.push('8');
        lines.push(layer);
        lines.push('10');
        lines.push('0');
        lines.push('20');
        lines.push('0');
        lines.push('30');
        lines.push('0');
        lines.push('1');
        lines.push(`UNSUPPORTED:${comp.id}`);
        break;
      }
    }
  }
  // End section
  lines.push('0');
  lines.push('ENDSEC');
  lines.push('0');
  lines.push('EOF');
  return lines.join('\n');
}

// Helper: compute 2D distance between two points (ignoring z)
function distance2D(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

// Helper: compute angle in degrees from center to point (0–360)
function angleDeg(center, point) {
  const dx = (point.x || 0) - (center.x || 0);
  const dy = (point.y || 0) - (center.y || 0);
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}

// Format numbers to remove trailing zeros and ensure at least one digit
function formatNumber(num) {
  const n = Number(num) || 0;
  // Use fixed precision for DXF; remove unnecessary trailing zeros
  const s = n.toFixed(6);
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}