# Command Contract

The command contract defines the immutable set of edit operations
allowed on a Canonical Edit Graph (CEG).  Commands are dispatched
through the command dispatcher; they are never executed directly by
UI code or renderers.  The dispatcher records before/after hashes of
the CEG and appends an entry to the graph's `commandJournal`.

## Command types

Commands are identified by a `type` property.  Wave 1 defines the
following command types:

| Type | Description |
| --- | --- |
| `MOVE_COMPONENTS` | Translate one or more components by a vector. |
| `MOVE_ANCHORS` | Translate specific anchors by a vector. |
| `EXTEND_LINEAR` | Change the length of a linear component (e.g. PIPE/LINE) by
  moving exactly one endpoint along the component's direction. |
| `STRETCH_ANCHORS` | Move one or more endpoint anchors by a vector without
  automatically adjusting opposite endpoints.  Connected anchors will
  generate diagnostics but are not moved in Wave 1. |
| `DELETE_COMPONENTS` | Remove one or more components from the graph.  Anchors
  referenced by deleted components may be kept if still used by
  another component. |
| `SET_PROPERTY` | Mutate an arbitrary property of a component or anchor
  using a dotted path syntax. |
| `SET_LAYER_VISIBILITY` | Toggle layer visibility flags (reserved for Wave 2). |

## Command schema

Commands are plain JavaScript objects with the following minimum
properties:

- `type` (string) – One of the command types above.
- `target` or `selection` – Identifiers of the components or anchors to
  operate on.  The exact property name depends on the command type
  (`MOVE_COMPONENTS` uses `selection`, while `MOVE_ANCHORS` and
  `STRETCH_ANCHORS` use `anchors`).
- `payload` – A payload object whose shape depends on the command
  type.  For example, `MOVE_COMPONENTS` expects `{ delta: { x, y, z } }`.
- `timestamp` (optional) – A millisecond timestamp for the command
  execution.  If not provided the dispatcher will default to zero.

Additional fields may be present for advanced commands, but
unrecognized fields will be preserved in the command journal.

## Dispatcher semantics

Dispatchers must:

1. Compute a deterministic hash of the CEG *before* applying the
   command.
2. Apply the command to a clone of the CEG using the geometry
   operations defined for each command type.
3. Compute the deterministic hash of the CEG *after* applying the
   command.
4. Append an entry to `ceg.commandJournal` containing the command
   object, `beforeHash`, `afterHash` and a timestamp.
5. Run model validation.  If validation fails with errors the
   dispatcher must revert to the previous state and report
   diagnostics.
6. Return the mutated CEG.

The dispatcher never mutates the original CEG directly; it produces
a new object (or a deep clone) for the next state.  This
functional style simplifies undo/redo and deterministic testing.