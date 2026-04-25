/**
 * core/component-model.js
 * Defines the GenericComponent shape shared by all domain plugins.
 * Every domain's parse() function must return GenericComponent[].
 *
 * @typedef {Object} GenericComponent
 * @property {string}  id
 * @property {string}  type      - domain-specific: 'PIPE'|'WALL'|'CHAIR'…
 * @property {string}  label     - human display name
 * @property {ComponentGeometry} geometry
 * @property {Record<string,string>} attributes  - all domain key-values
 * @property {ComponentMetadata}    metadata
 */

/**
 * @typedef {Object} ComponentGeometry
 * @property {{x:number,y:number,z:number}}       origin  - primary position (mm)
 * @property {{x:number,y:number,z:number}|null}  ep1
 * @property {{x:number,y:number,z:number}|null}  ep2
 * @property {{x:number,y:number,z:number}|null}  cp      - arc centre / room corner
 * @property {{x:number,y:number,z:number,bore:number}|null} bp  - branch point
 * @property {{w:number,h:number,d:number}|null}  size    - bounding box hint
 * @property {number|null}                         bore    - pipe bore OR door width
 */

/**
 * @typedef {Object} ComponentMetadata
 * @property {Record<string,string>} source     - raw parsed key-values
 * @property {string|null}  squareText
 * @property {{x,y,z}|null} squarePos
 * @property {string|null}  circleText
 * @property {{x,y,z}|null} circleCoord
 * @property {string[]}     warnings
 */

/**
 * Maps a normalised PCF component (from normalizePcfModel) → GenericComponent.
 * @param {object} comp - output of normalizeBlock()
 * @returns {GenericComponent}
 */
export function toGenericComponent(comp) {
  return {
    id:    comp.id,
    type:  comp.type,
    label: `${comp.type} ${comp.id}`,
    geometry: {
      origin: comp.coOrds || comp.ep1 || comp.cp || { x: 0, y: 0, z: 0 },
      ep1:    comp.ep1    || null,
      ep2:    comp.ep2    || null,
      cp:     comp.cp     || null,
      bp:     comp.bp     || null,
      bore:   comp.bore   || null,
      size:   null,
    },
    attributes: comp.attributes || {},
    metadata: {
      source:      comp.raw        || {},
      squareText:  comp.squareText  || null,
      squarePos:   comp.squarePos   || null,
      circleText:  comp.circleText  || null,
      circleCoord: comp.circleCoord || null,
      warnings:    [],
    },
  };
}

/**
 * Creates a minimal GenericComponent from raw key-value data (e.g. from GLB userData).
 * @param {Record<string,any>} userData - Three.js mesh.userData
 * @returns {GenericComponent}
 */
export function componentFromUserData(userData) {
  const u = userData || {};
  return {
    id:    u.pcfId   || u.compId || '',
    type:  u.pcfType || 'UNKNOWN',
    label: `${u.pcfType || 'UNKNOWN'} ${u.pcfId || ''}`,
    geometry: {
      origin: { x: 0, y: 0, z: 0 },
      ep1:    null,
      ep2:    null,
      cp:     null,
      bp:     null,
      bore:   u.bore != null ? Number(u.bore) : null,
      size:   null,
    },
    attributes: Object.fromEntries(
      Object.entries(u)
        .filter(([k]) => !['pcfId', 'compId', 'pcfType', 'bore', 'refNo'].includes(k))
        .map(([k, v]) => [k, String(v)])
    ),
    metadata: {
      source:      u,
      squareText:  null,
      squarePos:   null,
      circleText:  null,
      circleCoord: null,
      warnings:    [],
    },
  };
}
