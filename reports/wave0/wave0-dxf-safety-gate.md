# Slice 1 / Wave 0 DXF Safety Gate

Generated: 2026-05-10T14:18:27.887Z

Overall result: **PASS**

## Gate Summary

| Step | Script | Status |
|---|---|---:|
| Real DXF file gate | `npm run dxf:real-gate` | PASS |
| DXF fidelity smoke tests | `npm run test:dxf-fidelity` | PASS |
| DXF inventory scan | `npm run dxf:fid01` | PASS |

## Inventory Summary

```json
{
  "exists": true,
  "parseError": null,
  "contract": "DXF-FID-01-INVENTORY-1.0.0",
  "file": "Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf",
  "fileSizeBytes": 1458568,
  "entityCount": 34061,
  "byType": {
    "POLYLINE": 7050,
    "VERTEX": 19711,
    "SEQEND": 7050,
    "TEXT": 250
  },
  "issueCount": 0,
  "highRiskCount": 0,
  "mediumRiskCount": 0,
  "lowRiskCount": 0,
  "extents": {
    "min": {
      "x": 0,
      "y": 0,
      "z": 0
    },
    "max": {
      "x": 420,
      "y": 297,
      "z": 0
    },
    "size": {
      "x": 420,
      "y": 297,
      "z": 0
    }
  }
}
```

## Failure Notes

None.

## Step Output

### S1-001 — Real DXF file gate

Script: `npm run dxf:real-gate`

Status: **PASS**

STDOUT:
```text
> glb-pcf-editor@1.0.0 dxf:real-gate
> node tools/dxf-real-file-gate.mjs "Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf"

PASS dxf-real-file-gate {
  file: 'Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf',
  bytes: 1458568,
  ascii: true,
  entityMarkerCount: 34087
}
```

STDERR:
```text
(empty)
```

### S1-002 — DXF fidelity smoke tests

Script: `npm run test:dxf-fidelity`

Status: **PASS**

STDOUT:
```text
> glb-pcf-editor@1.0.0 test:dxf-fidelity
> node tests/dxf-bulge-utils.smoke.mjs && node tests/dxf-ceg-curve-guide.smoke.mjs && node tests/dxf-block-expander.smoke.mjs

DXF bulge utility smoke passed {
  radius: 50,
  center: { x: 50, y: 0, z: 0 },
  expanded: [ 'ARC', 'LINE' ],
  closedSegments: 3
}
DXF CEG curve/guide smoke passed { arcs: 3, guides: 1, generic: 4 }
DXF block expansion smoke passed { expanded: 2, components: 3, diagnostics: 2 }
```

STDERR:
```text
(empty)
```

### S1-003 — DXF inventory scan

Script: `npm run dxf:fid01`

Status: **PASS**

STDOUT:
```text
> glb-pcf-editor@1.0.0 dxf:fid01
> node tools/dxf-fidelity-inventory.mjs "Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf" --json reports/dxf-fid-01.inventory.json


DXF-FID-01 Entity Inventory
================================
File: Comments/dxf-1/STD-98-103440-MP-2343-00001-0018-GG1000SR0523-01.dxf
Size: 1458568 bytes
Entities: 34061

By type:
  VERTEX         19711
  POLYLINE       7050
  SEQEND         7050
  TEXT           250

Top layers:
  GT_1                             27011
  <none>                           7050

Extents:
  min {"x":0,"y":0,"z":0}
  max {"x":420,"y":297,"z":0}
  size {"x":420,"y":297,"z":0}

Fidelity risks:
  none detected by inventory scanner

Wrote JSON inventory: reports/dxf-fid-01.inventory.json
```

STDERR:
```text
(empty)
```
