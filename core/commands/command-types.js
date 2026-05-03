/*
 * core/commands/command-types.js
 *
 * Frozen enumeration of all Wave-1 command types.
 * Editors must use these constants when dispatching commands.
 */

export const CommandType = Object.freeze({
  MOVE_COMPONENTS:     'MOVE_COMPONENTS',
  MOVE_ANCHORS:        'MOVE_ANCHORS',
  EXTEND_LINEAR:       'EXTEND_LINEAR',
  STRETCH_ANCHORS:     'STRETCH_ANCHORS',
  DELETE_COMPONENTS:   'DELETE_COMPONENTS',
  SET_PROPERTY:        'SET_PROPERTY',
  SET_LAYER_VISIBILITY:'SET_LAYER_VISIBILITY'
});
