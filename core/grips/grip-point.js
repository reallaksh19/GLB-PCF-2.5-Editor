/**
 * core/grips/grip-point.js
 *
 * Grip Point Data Model for CAD interactive editing (Issue #85 Phase 6 P1 & Phase 7).
 * Represents interactive manipulation handles extracted from selected CAD entities.
 *
 * Invariant: Does NOT import Three.js, DOM APIs, or CEG.
 */

export const GripRole = Object.freeze({
  START: 'START',
  END: 'END',
  MID: 'MID',
  CENTER: 'CENTER',
  QUADRANT: 'QUADRANT',
  VERTEX: 'VERTEX',
  INSERTION: 'INSERTION',
});

export const GripState = Object.freeze({
  COLD: 'COLD', // Unselected grip on selected entity (blue square in CAD)
  WARM: 'WARM', // Hovered cursor over grip
  HOT: 'HOT',   // Active / clicked grip being stretched or dragged (red square in CAD)
});

export class GripPoint {
  /**
   * @param {Object} params
   * @param {string} params.id Unique grip ID (e.g. "grip:handle:ROLE:index")
   * @param {string} params.entityId Source entity ID / handle
   * @param {string} params.role Grip role from GripRole enum
   * @param {{x: number, y: number, z?: number}} params.point CAD coordinates
   * @param {number|null} [params.vertexIndex=null] Index for multi-vertex entities (polylines, quadrants)
   * @param {string} [params.state=GripState.COLD] Current interaction state
   * @param {Object} [params.metadata={}] Additional entity-specific parameters
   */
  constructor({
    id,
    entityId,
    role,
    point,
    vertexIndex = null,
    state = GripState.COLD,
    metadata = {},
  }) {
    if (!id) throw new Error('GripPoint requires an id');
    if (!entityId) throw new Error('GripPoint requires an entityId');
    if (!role) throw new Error('GripPoint requires a role');
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z ?? 0)) {
      throw new Error('GripPoint requires valid point coordinates {x, y}');
    }

    this.id = id;
    this.entityId = entityId;
    this.role = role;
    this.point = {
      x: Number(point.x),
      y: Number(point.y),
      z: Number(point.z ?? 0),
    };
    this.vertexIndex = vertexIndex != null ? Number(vertexIndex) : null;
    this.state = state;
    this.metadata = metadata ? { ...metadata } : {};
  }

  /**
   * Clone the grip point with optional overrides.
   */
  clone(overrides = {}) {
    return new GripPoint({
      id: overrides.id ?? this.id,
      entityId: overrides.entityId ?? this.entityId,
      role: overrides.role ?? this.role,
      point: overrides.point ? { ...overrides.point } : { ...this.point },
      vertexIndex: overrides.vertexIndex !== undefined ? overrides.vertexIndex : this.vertexIndex,
      state: overrides.state ?? this.state,
      metadata: overrides.metadata ? { ...overrides.metadata } : { ...this.metadata },
    });
  }
}
