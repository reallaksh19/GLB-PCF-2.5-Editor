# DXF Fidelity Report — FID-01 / FID-02

## Scope
This report covers only:

- **DXF-FID-01** — DXF entity inventory
- **DXF-FID-02** — AutoCAD reference view vs current app canvas import comparison

M0/M2 architecture work is explicitly out of scope for this report.

## Source files under review

```text
Comments/dxf-1/actual geometry dxf _in AutoCad dwg viewer.jpg
Comments/dxf-1/dxf on canvas upon import.jpg
Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf
```

## Current connector evidence

The latest `main` branch contains an upload commit for the three evidence files.

However, the GitHub connector content API returned an empty text payload for the DXF file path. Raw fetch also failed through the connector for this DXF artifact. Therefore the inventory cannot be executed inside the connector session even though the file path exists in the repository.

Local/CI command to run DXF-FID-01:

```bash
node tools/dxf-fidelity-inventory.mjs "Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf" --json reports/dxf-fid-01.inventory.json
```

If the command exits with:

```text
DXF file is empty
```

then the repository artifact must be re-uploaded as the actual DXF, not only as an empty placeholder/blob.

---

# DXF-FID-01 — Entity Inventory

## Added tool

```text
tools/dxf-fidelity-inventory.mjs
```

## Purpose
The tool scans raw DXF group codes directly, without using the app browser importer. This is intentional. It gives an independent inventory before runtime parser/render logic is debugged.

## Inventory outputs

- file size
- total entity count
- entity counts by type
- entity counts by layer
- coordinate extents
- fidelity-risk list
- per-entity detail list in JSON

## Entity fidelity risks detected by the scanner

The scanner flags:

| Risk | Why it matters |
|---|---|
| `POLYLINE_BULGE_PRESENT` | AutoCAD shows curved polyline arcs; straight segmentation will look wrong. |
| `SPLINE_PRESENT` | Requires curve rendering or controlled curve-to-segment conversion. |
| `INSERT_PRESENT` | Blocks must be expanded to match AutoCAD view. |
| `HATCH_PRESENT` | May affect visual fidelity, though usually not pipe centerline topology. |

## Required inventory acceptance

After local/CI run, record:

```text
entityCount: <fill>
LINE: <fill>
LWPOLYLINE: <fill>
POLYLINE: <fill>
SPLINE: <fill>
ARC: <fill>
CIRCLE: <fill>
INSERT: <fill>
TEXT: <fill>
MTEXT: <fill>
HATCH: <fill>
POINT: <fill>
extents: <fill>
fidelityRiskCount: <fill>
```

## Initial expectation based on previous app log

Previous runtime log showed:

```text
DXF_PARSE_START { entityCount: 7300 }
DXF_ENTITY_SKIP { type: "POLYLINE", reason: "Unsupported" }
```

Therefore the first inventory check should confirm whether the DXF contains many `POLYLINE` entities and whether those polylines contain bulge values or nested vertex records.

---

# DXF-FID-02 — AutoCAD vs Canvas Visual Comparison

## Evidence files

- AutoCAD/DWG viewer reference: `actual geometry dxf _in AutoCad dwg viewer.jpg`
- Current app canvas import: `dxf on canvas upon import.jpg`

## Comparison purpose

The comparison is not just visual style. It must isolate **geometry fidelity** failures:

1. Missing geometry
2. Distorted geometry
3. Wrong extents / scaling
4. Wrong projection / axis mapping
5. Missing curved polyline arcs
6. Missing block content from `INSERT`
7. Lost layer visibility or color/linetype semantics
8. Text/annotation loss affecting drawing interpretation

## Required FID-02 checklist

| Check | Expected professional behavior | Status |
|---|---|---|
| Overall extents | Canvas model bounds match AutoCAD extents after fit-to-view. | Pending local screenshot measurement |
| Entity coverage | All major visible AutoCAD entities appear in canvas. | Pending inventory result |
| Polyline shape | Polylines preserve straight and bulged arc segments. | Pending inventory result |
| Spline shape | Splines are rendered or converted with tolerance. | Pending inventory result |
| Blocks/INSERT | Symbols/blocks appear, not just insertion points. | Pending inventory result |
| Layer/color | Layer visibility and color are preserved enough for review. | Pending inventory result |
| Text/MTEXT | Readable drawing text/labels are placed at correct coordinates. | Pending visual check |
| View fit | Canvas should center/fit the whole drawing like AutoCAD reference. | Pending visual check |

## High-probability defects to verify

### 1. Polyline bulge loss
If `LWPOLYLINE` or `POLYLINE` contains group code `42`, straight segmentation will not match AutoCAD. Fix will require bulge-to-arc expansion.

### 2. Block expansion missing
If many `INSERT` entities exist, the app must resolve block definitions and render nested geometry. Rendering only a cross/origin at insert point is not enough.

### 3. Extents / fit mismatch
If app canvas shows a tiny, cropped, offset, or collapsed shape while AutoCAD shows a full drawing, compare raw DXF extents and renderer fit bounds.

### 4. Axis/projection mismatch
The app maps engineering coordinates to Three.js viewer axes. For pure DXF drafting, a separate 2D DXF projection may be needed instead of piping 3D axis remap.

## FID-02 output requirement

After running the inventory and opening both screenshots, add:

```text
AutoCAD visible geometry summary:
- <fill>

Canvas visible geometry summary:
- <fill>

Mismatch class:
- Missing entities / distorted entities / scale-fit / axis-projection / block expansion / curve support

Primary fix target:
- <fill>
```

---

# Next repair phases after FID-01/02

Do not start these until FID-01 and FID-02 are populated with actual evidence:

```text
DXF-FID-03: Polyline bulge and curve support
DXF-FID-04: Block INSERT expansion
DXF-FID-05: Units/extents/view-fit repair
DXF-FID-06: Layer/linetype/text rendering fidelity
DXF-FID-07: Visual regression screenshot test
```
