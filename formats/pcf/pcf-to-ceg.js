/**
 * formats/pcf/pcf-to-ceg.js
 * Convert PCF-derived GenericComponent[] into a Canonical Edit Graph.
 */

import { createCanonicalEditGraph } from '../../core/ceg/canonical-edit-graph.js';
import { createAnchor } from '../../core/ceg/canonical-anchor.js';
import { createComponent } from '../../core/ceg/canonical-component.js';
import { defaultCapabilities } from '../../core/ceg/capabilities.js';
import { AnchorRoles } from '../../core/geometry/anchor-roles.js';
import { graphToGenericComponents } from '../../core/geometry/geometry-view.js';

function normalizePoint(value) {
  return {
    x: Number(value?.x ?? 0),
    y: Number(value?.y ?? 0),
    z: Number(value?.z ?? 0),
  };
}

function geometryRoleForType(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'PIPE' || t === 'LINE') return 'LINEAR';
  if (t === 'ELBOW' || t === 'BEND' || t === 'ARC') return 'CURVE';
  if (t === 'TEE' || t === 'EQUAL-TEE' || t === 'REDUCING-TEE') return 'BRANCH';
  return 'POINT';
}

function originRoleForType(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'SUPPORT') return AnchorRoles.SUPPORT_ORIGIN;
  if (t.includes('MESSAGE') || t === 'ANNOTATION') return AnchorRoles.ANNOTATION_ORIGIN;
  return AnchorRoles.ORIGIN;
}

function buildComponentAnchors(component) {
  const geometry = component?.geometry || {};
  const points = [];
  if (geometry.ep1) points.push({ role: AnchorRoles.EP1, point: normalizePoint(geometry.ep1) });
  if (geometry.cp) points.push({ role: AnchorRoles.CP, point: normalizePoint(geometry.cp) });
  if (geometry.ep2) points.push({ role: AnchorRoles.EP2, point: normalizePoint(geometry.ep2) });
  if (geometry.bp) points.push({ role: AnchorRoles.BRANCH_OUT, point: normalizePoint(geometry.bp) });
  if (!points.length && geometry.origin) {
    points.push({ role: originRoleForType(component.type), point: normalizePoint(geometry.origin) });
  }
  if (!points.length) {
    points.push({ role: originRoleForType(component.type), point: { x: 0, y: 0, z: 0 } });
  }
  return points;
}

/**
 * Convert GenericComponent[] to CEG and derived renderer components.
 */
export function pcfComponentsToCeg(components, options) {
  const list = Array.isArray(components) ? components : [];
  const opts = options && typeof options === 'object' ? options : {};
  const graph = createCanonicalEditGraph({
    sourceFormat: 'PCF',
    name: opts.name || 'PCF Import',
  });

  let anchorCounter = 0;
  for (const sourceComponent of list) {
    const component = sourceComponent && typeof sourceComponent === 'object' ? sourceComponent : null;
    if (!component) continue;

    const componentId = String(component.id || `pcf_comp_${Object.keys(graph.components).length + 1}`);
    const anchorSpecs = buildComponentAnchors(component);
    const anchorIds = [];
    for (const spec of anchorSpecs) {
      anchorCounter += 1;
      const anchorId = `${componentId}:a${anchorCounter}`;
      graph.anchors[anchorId] = createAnchor({
        id: anchorId,
        role: spec.role,
        point: spec.point,
      });
      anchorIds.push(anchorId);
    }

    graph.components[componentId] = createComponent({
      id: componentId,
      type: String(component.type || 'UNKNOWN'),
      layerId: String(component.attributes?.['PIPELINE-REFERENCE'] || component.attributes?.LAYER || 'default'),
      anchorIds,
      geometryRole: geometryRoleForType(component.type),
      attributes: { ...(component.attributes || {}) },
      rawAttributes: { ...(component.metadata?.source || {}) },
      derived: {
        bore: component.geometry?.bore ?? null,
      },
      capabilities: defaultCapabilities(component.type),
      sourceRef: {
        format: 'PCF',
        componentId,
        sourceId: component.metadata?.source?.id || component.id || null,
      },
    });
  }

  return {
    graph,
    components: graphToGenericComponents(graph),
  };
}
