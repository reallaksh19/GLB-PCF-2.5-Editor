/**
 * @file formats/uxml/ceg-uxml-bridge.js
 * @description CEG ↔ UXML bridge over the vendored pipe-component-data package.
 *              Gives the editor its first save/reopen round-trip:
 *                save:  CEG → fromCeg() → AdapterGraph → toUxmlXml() → .uxml file
 *                open:  .uxml text → fromUxmlXml() → toCeg() → enrich → CEG
 *
 * The round-trip is topology-preserving (per the package loss contract), not a
 * 1:1 generic-component copy. Vendored package files are read-only downstream.
 */

import {
  fromCeg,
  toCeg,
  toUxmlXml,
  fromUxmlXml,
} from '../../vendor/pipe-component-data/src/index.js';
import { enrichCegWithPipeData } from '../../domains/piping/pipe-data-enrichment.js';
import { graphToGenericComponents } from '../../core/geometry/geometry-view.js';

/**
 * Serialize a CEG to UXML XML text.
 * @param {Object} ceg Canonical Edit Graph.
 * @returns {string} UXML XML (schemaVersion uxml-topology-v1).
 */
export function cegToUxmlXml(ceg) {
  if (!ceg) throw new Error('cegToUxmlXml: no CEG provided');
  return toUxmlXml(fromCeg(ceg));
}

/**
 * Parse UXML XML text into a CEG plus renderer-compatible components.
 * Runs PipeData enrichment (miss → diagnostics, never fabricates dimensions).
 *
 * @param {string} text UXML XML text.
 * @param {Object} [options]
 * @param {string} [options.name]        Document name for the CEG.
 * @param {string} [options.idNamespace] Prefix applied to imported ids when
 *                                       merging into a live session.
 * @returns {{ ceg: Object, components: Array, enrichment: { enriched: number, missed: number } }}
 */
export function uxmlToCeg(text, options = {}) {
  const adapterGraph = fromUxmlXml(String(text || ''), {
    idNamespace: options.idNamespace || '',
  });
  const cegRaw = toCeg(adapterGraph, { name: options.name || 'UXML Import' });
  const { ceg, enriched, missed } = enrichCegWithPipeData(cegRaw);
  return { ceg, components: graphToGenericComponents(ceg), enrichment: { enriched, missed } };
}

/**
 * Heuristic: does this text look like a package-dialect UXML document?
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeUxml(text) {
  return /<UXML\b/i.test(String(text || ''));
}

/**
 * Export a CEG as a UXML file download (browser only).
 * Mirrors exportCegToDXF()'s download mechanics.
 *
 * @param {Object} ceg      Canonical Edit Graph.
 * @param {string} filename Download filename.
 */
export function exportCegToUXML(ceg, filename = 'scene.uxml') {
  const xml = cegToUxmlXml(ceg);
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 100);
}
