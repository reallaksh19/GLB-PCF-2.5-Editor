# Geometry + Drafting Contract — M0

## Purpose

This contract freezes the shared geometry/drafting platform before professional Line, Polyline, Spline, Macro, parser, topology, and future scaling work proceeds.

## Governing rule

`ep1`, `ep2`, `cp`, `bp`, and `origin` are compatibility/render fields. They are not the long-term source of truth for editable geometry.

The authoritative model is:

```text
Canonical Edit Graph
  components
  anchors
  topologyLinks
  sourceRefs
  diagnostics
  lossContract
```

## Architecture

```text
PCF / DXF / HUD / Macro / Command Palette
        ↓
Shared Precision Draft Parser
        ↓
CEG Anchors + Components + Topology
        ↓
Derived GenericComponent geometry view
        ↓
Renderer / DXF Export / GLB Export / Inspector / Debug
```

## Contract rules

1. New drafting commands must resolve through the shared draft parser.
2. HUD and Macro must not implement separate token parsers for the same drafting syntax.
3. New editable geometry should be created as anchors + components first.
4. Render fields are derived through `geometry-view.js`.
5. Parser adapters must preserve raw source metadata.
6. No unsupported source entity should create a runtime popup failure when a loss-contract diagnostic is possible.
7. Coordinate model space is engineering millimetres with `{ x, y, z }`.
8. Renderer axis remapping remains outside the canonical model.
9. Scaling policy must be explicit before any physical 3D scale operation is exposed.

## Supported M0 draft tokens

```text
1000
X1000
X-1000
Y750
Y-750
Z500
Z-500
R500
D500
@1000,0,0
1000,2500,0
@1000<90
```

## Draft parser output

```js
{
  ok: true,
  mode: 'length' | 'axis' | 'relative' | 'absolute' | 'bearing',
  fromPoint,
  toPoint,
  delta,
  lengthMm,
  axisLock,
  angleDeg,
  commandText,
  diagnostics: []
}
```

## Anchor role policy

Core roles:

```text
EP1
EP2
CP
ORIGIN
RUN_IN
RUN_OUT
BRANCH_OUT
SUPPORT_ORIGIN
ANNOTATION_ORIGIN
CONTROL_POINT
FIT_POINT
```

## Scaling policy placeholders

```text
COORDINATE_ONLY
SYMBOL_ONLY
PHYSICAL_SIZE
SPEC_RECALCULATE
LOCKED
```

Default piping policy:

```text
Route coordinates may scale when explicitly requested.
Bore/OD stays locked by default.
Standard fittings are spec/Master DB driven.
Annotations/support symbols use display scale.
```

## M0 acceptance

- Shared parser exists.
- Geometry-view generator exists.
- Anchor roles are centralized.
- Static guardrail script exists.
- Runtime drafting behavior is not changed in M0.
