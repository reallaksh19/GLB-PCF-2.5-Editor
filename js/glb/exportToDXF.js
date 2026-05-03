import { cegToDxf } from '../../formats/dxf/ceg-to-dxf.js';

/**
 * Export a Canonical Edit Graph to a DXF file download.
 * Preferred over exportToDXF() when a CEG is available because it
 * preserves all entity types round-trip.
 *
 * @param {Object} ceg      Canonical Edit Graph.
 * @param {string} filename Download filename.
 */
export function exportCegToDXF(ceg, filename = 'scene-ceg.dxf') {
  const dxfString = cegToDxf(ceg);
  const blob = new Blob([dxfString], { type: 'application/dxf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 100);
  import('../capabilities/capability-registry.js').then(({ capabilities }) => {
    capabilities.ready('dxf-export');
  }).catch(() => {});
}

function lineLayer(comp) {
  return comp.attributes?.['PIPELINE-REFERENCE'] || '0';
}

function appendLineEntity(dxf, layer, a, b) {
  dxf += '0\nLINE\n';
  dxf += `8\n${layer}\n`;
  dxf += `10\n${a.x}\n20\n${a.y}\n30\n${a.z || 0}\n`;
  dxf += `11\n${b.x}\n21\n${b.y}\n31\n${b.z || 0}\n`;
  return dxf;
}

function appendCircleEntity(dxf, layer, center, radius) {
  dxf += '0\nCIRCLE\n';
  dxf += `8\n${layer}\n`;
  dxf += `10\n${center.x}\n20\n${center.y}\n30\n${center.z || 0}\n`;
  dxf += `40\n${radius}\n`;
  return dxf;
}

function appendArcEntity(dxf, layer, center, radius, startDeg, endDeg) {
  dxf += '0\nARC\n';
  dxf += `8\n${layer}\n`;
  dxf += `10\n${center.x}\n20\n${center.y}\n30\n${center.z || 0}\n`;
  dxf += `40\n${radius}\n50\n${startDeg}\n51\n${endDeg}\n`;
  return dxf;
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

export function exportToDXF(components, filename = 'scene.dxf') {
  let dxf = '';
  dxf += '0\nSECTION\n2\nENTITIES\n';

  for (const c of components) {
    const layer = lineLayer(c);

    if (c.type === 'PIPE' && c.geometry?.ep1 && c.geometry?.ep2) {
      dxf = appendLineEntity(dxf, layer, c.geometry.ep1, c.geometry.ep2);
      continue;
    }

    if (['ELBOW', 'BEND'].includes(c.type) && c.geometry?.ep1 && c.geometry?.cp && c.geometry?.ep2) {
      const { ep1, cp, ep2 } = c.geometry;
      const radius = Math.hypot((ep1.x || 0) - cp.x, (ep1.y || 0) - cp.y);
      const startDeg = toDegrees(Math.atan2((ep1.y || 0) - cp.y, (ep1.x || 0) - cp.x));
      const endDeg = toDegrees(Math.atan2((ep2.y || 0) - cp.y, (ep2.x || 0) - cp.x));
      dxf = appendArcEntity(dxf, layer, cp, radius, startDeg, endDeg);
      continue;
    }

    if (['FLANGE', 'VALVE'].includes(c.type)) {
      const origin = c.geometry?.origin || c.geometry?.ep1 || c.geometry?.cp;
      if (!origin) continue;
      const radius = Math.max((c.geometry?.bore || 25) * 0.5, 8);
      dxf = appendCircleEntity(dxf, layer, origin, radius);
      continue;
    }
  }

  dxf += '0\nENDSEC\n0\nEOF\n';

  const blob = new Blob([dxf], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  import('../capabilities/capability-registry.js').then(({ capabilities }) => {
    capabilities.ready('dxf-export');
  }).catch(() => {});
}
