# Canonical Edit Graph (CEG) Contract

The Canonical Edit Graph (CEG) is the single source of truth for all
editing operations within the 2.5D editor.  Every import adapter
generates a CEG, and every edit command mutates that CEG through the
command dispatcher.  Renderers and user‑interface code may never
mutate the CEG directly.

## Schema version

All CEG instances MUST declare a `schemaVersion` property.  Wave 1
implements version `CEG‑1.0`:

```js
export const CEG_SCHEMA_VERSION = "CEG-1.0";
```

## Top‑level structure

A minimal CEG object created by `createCanonicalEditGraph()` must
contain the following keys:

- `schemaVersion`: a string equal to `CEG_SCHEMA_VERSION`.
- `document`: metadata about the document (id, name, units, sourceFormat,
  coordinateSystem).
- `components`: a map of component ID → component object.
- `anchors`: a map of anchor ID → anchor object.
- `topologyLinks`: an array of objects describing connectivity between anchors.
- `layers`: a map of layer ID → layer metadata (reserved for Wave 2).
- `sourceRefs`: a map containing format‑specific references for each
  component/anchor (e.g. DXF handle, GLB uuid).
- `renderRefs`: a map used by the render projection to track
  Three.js object references.  Renderers may attach to this object
  but must never write back into the CEG.
- `diagnostics`: an array of diagnostic objects describing mapping
  issues, validation warnings and errors.
- `lossContract`: an object containing arrays that record any loss of
  information during import/export (unsupported entities, downgraded
  entities, proxy representations and export warnings).
- `commandJournal`: an array of journal entries recording each
  dispatched command together with before/after hashes and timestamps.

## Event names

The CEG emits events through the global event bus.  These names are
frozen in Wave 1 and must not be changed without orchestrator approval.

```js
export const CegEvents = Object.freeze({
  MODEL_LOADED:        "ceg:model-loaded",
  MODEL_CHANGED:       "ceg:model-changed",
  SELECTION_CHANGED:   "ceg:selection-changed",
  COMMAND_APPLIED:     "ceg:command-applied",
  VALIDATION_UPDATED:  "ceg:validation-updated",
  EXPORT_COMPLETED:    "ceg:export-completed"
});
```

## Contract rules

1. **Only CEG APIs mutate the CEG.**  Editors and renderers must
   call into CEG functions (e.g. `dispatchCommand()`) rather than
   modifying internal objects directly.
2. **Only the command dispatcher applies edit commands.**  All
   commands listed in the command contract must flow through the
   dispatcher, which computes before/after hashes and appends to the
   command journal.
3. **Format adapters only create/import/export CEGs.**  Wave 2
   adapters (DXF/GLB/DWG) are responsible for producing CEG
   instances but must not implement editing behavior.
4. **Renderers and UI may never mutate the CEG directly.**  They
   consume the graph to build a render projection or update
   interface state but must dispatch commands rather than poking
   into `components`, `anchors` or other internal structures.

Violations of these rules are considered contract breaches and
automatically fail the static boundary scan during continuous
integration.