# Geometry + Drafting Contract — M0

## Purpose

This document freezes the first shared contract for the geometry-platform and precision drafting upgrade.

M0 does **not** replace the active renderer/parser pipeline. It defines reusable primitives so future Line, Polyline, Spline, Macro, PCF, DXF, GLB, and scaling work use one consistent geometry platform.

## Governing Principle

`ep1`, `ep2`, `cp`, `bp`, and `origin` are compatibility/render fields. They are not the final source of truth for professional editing.

The authoritative model is:

```text
Canonical Edit Graph
  components reference anchors by ID
  anchors own engineering coordinates
  topology links describe real connectivity
```

The compatibility view is:

```text
GenericComponent.geometry.ep1 / ep2 / cp / bp / origin
```

This compatibility view is derived from anchors for renderer/export/legacy code.

## Coordinate Contract

All model-space coordinates are engineering millimetres:

```js
{ x: number, y: number, z: number }
```

Renderer-space conversion remains outside the parser/drafting contract and is handled by `geometry/pipe-geometry.js::toThree()`.

## Anchor Roles

Required canonical roles:

- `EP1` — linear component start endpoint
- `EP2` — linear component end endpoint
- `CP` — bend/arc centre point
- `ORIGIN` — component origin/insertion point
- `RUN_IN` — run inlet port for multi-port fittings
- `RUN_OUT` — run outlet port for multi-port fittings
- `BRANCH_OUT` — branch outlet port for tee/olet/cross-like components
- `SUPPORT_ORIGIN` — support placement point
- `ANNOTATION_ORIGIN` — text/label insertion point
- `GUIDE_POINT` — non-pipe guide/control point

## Geometry View Contract

`core/geometry/geometry-view.js` owns translation from CEG to renderer-compatible geometry.

Rules:

1. Parser/HUD/Macro modules may create anchors and components.
2. Renderer-facing `ep1/ep2/cp/bp/origin` should be generated from anchors where graph data is available.
3. Existing direct `GenericComponent.geometry` remains valid during migration.
4. No new drafting feature should create a private geometry grammar.

## Draft Command Parser Contract

`editor/draft-command-parser.js` is the shared parser for precision drafting tokens.

Supported tokens in M0:

```text
1000
X1000
X-1000
Y750
Y-750
Z500
R500
D500
@1000,0,0
1000,2500,0
@1000<90
```

Common result shape:

```js
{
  ok: true,
  mode: 'length' | 'axis' | 'relative' | 'absolute' | 'bearing',
  commandText,
  fromPoint,
  toPoint,
  delta,
  lengthMm,
  axisLock,
  angleDeg,
  diagnostics: []
}
```

## Shared Consumers

The same parser must be used by:

- Line HUD
- Polyline HUD
- Spline HUD / guide conversion
- Macro terminal
- future command palette
- future script recorder

## M0 Guardrails

- No UI-specific geometry parser.
- No macro-specific geometry parser.
- No direct parser-to-render-only path for new precision drafting.
- `R500` means Z+500 everywhere.
- `D500` means Z-500 everywhere.
- `@1000<90` means bearing/angle token everywhere.

## M0 Acceptance

- Geometry point helpers normalize numeric coordinates deterministically.
- Anchor roles are centralized.
- Geometry view can derive `ep1/ep2/cp/bp/origin` from CEG anchors.
- Draft token parser passes exact endpoint tests for length, axis, relative, absolute, bearing, rise, and drop.
- M0 introduces no breaking runtime rewrite.
