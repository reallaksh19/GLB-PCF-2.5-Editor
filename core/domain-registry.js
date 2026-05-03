/**
 * core/domain-registry.js
 * Lightweight registry for domain plugins.
 *
 * Each domain plugin must export an object matching this interface:
 * {
 *   name:    string,
 *   label:   string,
 *   fileTypes: string[],               // e.g. ['.pcf', '.pcfx', '.dxf']
 *   parse(text, fileName, log): GenericComponent[],
 *   buildMesh(comp, theme): THREE.Object3D | null,
 *   buildSymbol(comp): THREE.Object3D | null,
 *   buildLabel(comp): CSS2DObject | null,
 *   getHeatmapFields(): string[],
 *   getInfoPanelSections(comp): PanelSection[],
 *   validate(components, log): ValidationResult[],
 * }
 *
 * Usage:
 *   import { registerDomain, getActiveDomain } from './domain-registry.js';
 *   registerDomain(myDomain);
 *   const d = getActiveDomain();
 */

/** @type {Map<string, object>} */
const _registry = new Map();

/** @type {object|null} */
let _active = null;

/**
 * Register a domain plugin. The first domain registered becomes the default active domain.
 * @param {object} domain
 */
export function registerDomain(domain) {
  if (!domain?.name) throw new Error('Domain must have a name');
  _registry.set(domain.name, domain);
  if (!_active) _active = domain;
}

/**
 * Get the currently active domain plugin.
 * @returns {object}
 */
export function getActiveDomain() {
  if (!_active) throw new Error('No domain registered. Call registerDomain() before using the viewer.');
  return _active;
}

/**
 * Switch the active domain by name.
 * @param {string} name
 */
export function setActiveDomain(name) {
  const d = _registry.get(name);
  if (!d) throw new Error(`Domain '${name}' not registered`);
  _active = d;
}

/**
 * List all registered domain plugins.
 * @returns {object[]}
 */
export function listDomains() {
  return [..._registry.values()];
}

/**
 * Check whether a file extension is supported by the active domain.
 * @param {string} fileName
 * @returns {boolean}
 */
export function supportsFile(fileName) {
  if (!_active) return false;
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return _active.fileTypes.includes(ext);
}
