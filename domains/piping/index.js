import { parsePcf }            from './parser.js';
import { parseDxf }            from './dxf-importer.js';
import { buildMesh, buildLabel } from './geometry-builder.js';
import { buildSupportSymbol }  from './symbol-library.js';
import { getInfoPanelSections } from './info-panel.js';

export const domain = {
  name:      'piping',
  label:     'PCF Piping',
  fileTypes: ['.pcf', '.pcfx', '.dxf'],

  parse(text, fileName, log) {
    if (!text) {
      log.error('PARSE_FAIL', { message: 'Input text is empty' });
      return [];
    }
    const ext = (fileName || '').toLowerCase().split('.').pop();
    return ext === 'dxf' ? parseDxf(text, log) : parsePcf(text, log);
  },

  buildMesh(comp, theme) {
    return buildMesh(comp, theme);
  },

  buildSymbol(comp) {
    if (!comp || !comp.type) return null;
    if (comp.type === 'SUPPORT') return buildSupportSymbol(comp);
    return null;
  },

  buildLabel(comp) {
    return buildLabel(comp);
  },

  getHeatmapFields() {
    return ['OD', 'material', 'T1', 'P1', 'PIPELINE-REFERENCE'];
  },

  getInfoPanelSections(comp) {
    return getInfoPanelSections(comp);
  },

  validate(components) {
    if (!Array.isArray(components)) return [];

    const results = [];
    components.forEach(comp => {
      const g = comp.geometry;
      if (!g) return;

      // PIPE/ELBOW/TEE must have ep1 and ep2
      if (['PIPE','ELBOW','BEND','TEE','EQUAL-TEE','REDUCING-TEE'].includes(comp.type)) {
        if (!g.ep1) results.push({ severity:'error', code:'MISSING_EP1', message:'Missing start point (ep1)', compId: comp.id });
        if (!g.ep2) results.push({ severity:'error', code:'MISSING_EP2', message:'Missing end point (ep2)',   compId: comp.id });
      }
      // ELBOW/BEND should have cp
      if (['ELBOW','BEND'].includes(comp.type) && !g.cp) {
        results.push({ severity:'warn', code:'MISSING_CP', message:'Bend/Elbow has no CENTRE-POINT — will render as straight pipe', compId: comp.id });
      }
      // SUPPORT at origin
      if (comp.type === 'SUPPORT') {
        const o = g.origin;
        if (!o || (o.x === 0 && o.y === 0 && o.z === 0)) {
          results.push({ severity:'warn', code:'SUPPORT_AT_ORIGIN', message:'Support placed at world origin (0,0,0)', compId: comp.id });
        }
      }
      // Zero-length PIPE
      if (comp.type === 'PIPE' && g.ep1 && g.ep2) {
        const dx = g.ep2.x - g.ep1.x, dy = g.ep2.y - g.ep1.y, dz = g.ep2.z - g.ep1.z;
        if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 1) {
          results.push({ severity:'warn', code:'ZERO_LENGTH_PIPE', message:'Pipe has zero (or near-zero) length', compId: comp.id });
        }
      }
      // No attributes
      if (!comp.attributes || Object.keys(comp.attributes).length === 0) {
        results.push({ severity:'info', code:'NO_ATTRIBUTES', message:'Component has no attributes', compId: comp.id });
      }
    });
    return results;
  },
};
