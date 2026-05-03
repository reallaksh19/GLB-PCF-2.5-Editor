## Recommended adoption method

Adopt a **Hybrid Static-Core + Optional Backend Converter + Canonical Internal Model** method.

That means:

1. **DXF and GLB/GLTF should be first-class supported import/export formats inside the static web app.**
2. **DWG should not become the native browser editing format.** Treat DWG only as an optional input that is converted to DXF or canonical JSON first.
3. **Do not let DXF or GLB directly drive the property panel.** Convert both into your app’s own canonical component model first, then show/edit that model.
4. **For large DXF/GLB, performance must be designed at architecture level**, not fixed later by only adding compression.

This aligns with the attached research summary, which already points toward parsing/converting to an intermediate JS object model, mapping to app data structures, and then exposing metadata in the property panel. 

---

# 1. DWG → DXF: method to adopt

### Final decision

Use this order:

| Priority |                                   Method |            Adopt? | Reason                                          |
| -------- | ---------------------------------------: | ----------------: | ----------------------------------------------- |
| 1        |          **DXF-first static web import** |               Yes | Best fit for GitHub Pages/static deployment.    |
| 2        | **Optional backend DWG → DXF converter** |               Yes | Best production method for DWG reliability.     |
| 3        |    **Browser WASM DWG parser/converter** | Experimental only | Useful, but licensing/version/performance risk. |
| 4        |   **Full native DWG editing in browser** |                No | Too risky for this app scope.                   |

### Why

A true browser-only DWG workflow is possible only through JS/WASM projects such as **libredwg-web**, which is a DWG/DXF JavaScript parser based on LibreDWG and can run in browser or Node.js; however, it is GPL-3.0, so it has serious licensing implications if your app is not also GPL-compatible. ([GitHub][1])

For production, the more reliable method is to keep the static app clean and add an optional converter service. **LibreDWG** provides DWG/DXF/JSON conversion tools, but it is still described as beta and has limits with advanced entities; it is excellent for an open-source/local converter path, not something I would make the only production route. ([GNU][2])

For enterprise-grade DWG reliability, Autodesk **RealDWG** is the most authoritative read/write path, but it is an SDK/licensing route, not a GitHub Pages/static route. ([Autodesk Platform Services][3]) Autodesk APS Model Derivative can translate CAD files, extract metadata, and render web derivatives, but it introduces cloud dependency, cost/account setup, and data-upload implications. ([Autodesk Platform Services][4])

### Adopted method for GLB-PCF-2.5-Editor

Use:

```text
DWG input
  ↓
Optional converter:
  - Backend/local: ODA / LibreDWG / RealDWG / APS
  - Experimental browser: libredwg-web
  ↓
DXF or Canonical JSON
  ↓
GLB-PCF canonical model
  ↓
Viewer + property panel + editor
```

Do **not** make DWG conversion mandatory for GitHub Pages. Add a UI message:

> DWG support requires either browser experimental mode or configured converter service. For best reliability, convert DWG to DXF before import.

---

# 2. DXF: method to adopt

## Final decision

Adopt a **two-layer DXF strategy**:

```text
DXF file
  ↓
DXF parser / preflight
  ↓
DXF raw model
  ↓
DXF-to-PCF canonical mapper
  ↓
App canonical components
  ↓
Property panel / editing / export
```

Do **not** directly edit the parsed DXF object as the main app model.

### Why

`dxf-parser` is suitable for extracting DXF into a JavaScript object and supports headers, many 2D entities, layers, block tables/inserts, text/MTEXT, and some XData, but it does not support all CAD entities such as 3DSolids and some leaders. ([NPM][5]) So it is good as an ingestion parser, but not enough to become your full engineering data model.

For viewing large DXF files, I would prefer studying/adopting ideas from **vagran/dxf-viewer** rather than old `three-dxf`. `dxf-viewer` is designed for huge real-world files, separates parsing/preparation so it can be offloaded to a Web Worker, and uses geometry batching to reduce draw calls. ([GitHub][6]) `three-dxf` is useful as a simple reference, but it is older and explicitly lacks attributes, 3DSolids, leaders, and less common entities. ([GitHub][7])

For export, use a DXF writer approach. `dxfjs/writer` provides a TypeScript DXF generator where entities are added to model space and the final DXF is produced with `writer.stringify()`. ([GitHub][8])

## DXF intelligent-attribute extraction

Adopt this rule:

```text
Exact attributes first, inferred attributes second.
```

### Exact DXF sources

Use these first:

| DXF source                    | Use                                                               |
| ----------------------------- | ----------------------------------------------------------------- |
| BLOCK / INSERT name           | Component type candidate: valve, flange, tee, support, instrument |
| ATTRIB entities               | Tag, size, rating, line number, material, spec                    |
| XDATA                         | Vendor/custom metadata                                            |
| Layer name                    | Discipline, line class, service, insulation, hidden/centerline    |
| Entity handle                 | Stable reference ID                                               |
| Color / linetype / lineweight | Drafting style and semantic hints                                 |
| TEXT / MTEXT near geometry    | Label candidate                                                   |

### Inferred DXF sources

Use only with a confidence score:

| Geometry pattern                  | Possible inference           |
| --------------------------------- | ---------------------------- |
| Long LINE / LWPOLYLINE            | Pipe segment                 |
| ARC between two pipe lines        | Bend/elbow                   |
| T-intersection                    | Tee/branch                   |
| Short parallel double-lines       | Flange/valve body            |
| Symbol block inserted on pipe     | Valve/support/specialty      |
| Text matching line-number pattern | Line number / service / spec |

The app should store:

```js
{
  id,
  sourceFormat: "DXF",
  sourceHandle,
  rawAttributes,
  normalized,
  derived,
  confidence,
  diagnostics
}
```

This matches the architecture direction you have already preferred: raw attributes preserved losslessly, normalized canonical fields, and derived helpers with provenance.

---

# 3. DXF property panel and editing method

## Final decision

Use the property panel as a **canonical component editor**, not a raw DXF editor.

Recommended panel sections:

```text
Identity
- Canonical ID
- Source format
- DXF handle
- Layer
- Block name

Geometry
- Entity type
- Start/end/center points
- Length/radius/angle
- Bounding box

Piping Intelligence
- Component type
- Size
- Rating
- Spec
- Line number
- Material
- Service

CAD Style
- Color
- Linetype
- Lineweight
- Text height

Diagnostics
- Mapping confidence
- Missing attributes
- Inference reason
- Source entity references
```

### Editing rule

When user edits:

```text
Property panel edit
  ↓
Canonical model update
  ↓
Scene update
  ↓
Dirty flag
  ↓
Export adapter writes DXF / GLB / PCFX
```

Do **not** mutate the raw DXF object directly except as a final export step. This prevents corruption and lets you support DXF, GLB, PCF, and PCFX through the same editing pipeline.

---

# 4. Large DXF method

## Final decision

Adopt **preflight + worker parsing + layer virtualization + batched rendering**.

Required design:

```text
File selected
  ↓
Preflight scan:
  - file size
  - entity count estimate
  - layer count
  - block count
  - text count
  ↓
Choose loading mode:
  - normal
  - large-file mode
  - partial/layer-only mode
  ↓
Parse in Web Worker
  ↓
Build spatial index
  ↓
Render by layer/style batches
  ↓
Virtualize property/entity tables
```

Do not simply merge everything into one geometry. Three.js community guidance warns that merging can reduce draw calls but may increase memory pressure and disable frustum culling, causing everything to render even when not visible. ([Autodesk Platform Services][9])

### DXF large-file priority features

| Feature                             |        Priority |
| ----------------------------------- | --------------: |
| Web Worker parser                   |        Critical |
| Layer on/off before full render     |        Critical |
| Entity batching by layer/color/type |        Critical |
| Spatial index for selection         |        Critical |
| Progressive draw                    |            High |
| Text lazy rendering                 |            High |
| Entity table virtualization         |            High |
| Geometry simplification tolerance   |          Medium |
| Partial viewport loading            | Medium/Advanced |

---

# 5. GLB/GLTF: method to adopt

## Final decision

Use **GLTFLoader + canonical metadata mapper + glTF extras on export**.

```text
GLB/GLTF file
  ↓
GLTFLoader
  ↓
Scene traversal
  ↓
Object3D / Mesh / Material metadata extraction
  ↓
Canonical component model
  ↓
Property panel
```

Three.js `GLTFLoader` is the correct loader. It supports glTF 2.0 and extensions including Draco mesh compression, Meshopt compression, KTX2/Basis texture compression, WebP textures, GPU instancing, and many material extensions. ([Three.js][10]) It also preserves unknown glTF extension metadata under `userData.gltfExtensions`, which is useful if you later add app-specific metadata. 

For intelligent attributes, use **glTF `extras`** as the primary metadata carrier. The glTF ecosystem supports application-specific data through `extras`; in three.js this commonly appears as `object.userData`. 

## GLB property panel fields

For every selected mesh/node:

```text
Identity
- Node name
- Mesh name
- UUID
- Source index
- Canonical ID

Geometry
- Vertex count
- Triangle count
- Bounding box
- World position
- Rotation
- Scale

Material
- Material name
- Color
- Metalness/roughness
- Texture references

Piping Intelligence
- Component type
- Line number
- Size
- Spec
- Rating
- Weight
- Source PCF refNo / seqNo

Diagnostics
- Has extras?
- Has glTF extensions?
- Missing canonical fields
- Mapping confidence
```

### Export rule

When exporting GLB from your app, embed this:

```js
node.extras = {
  pcfStudio: {
    canonicalId,
    componentType,
    lineNo,
    size,
    rating,
    spec,
    refNo,
    seqNo,
    sourceFormat,
    rawAttributesHash
  }
}
```

This makes GLB round-trip useful in your own app while still being viewable in external GLB viewers.

---

# 6. Large GLB/GLTF method

## Final decision

Adopt **offline optimization + runtime loader configuration + spatial chunking**.

Use `gltf-transform` for optimization before loading or during export. It supports Draco and Meshopt geometry compression, texture resizing, WebP, KTX2/Basis compression, and other transformations. ([glTF Transform][11])

Runtime loader should include:

```text
GLTFLoader
+ DRACOLoader
+ KTX2Loader
+ MeshoptDecoder
+ dispose manager
+ object count/triangle count diagnostics
```

Important: compression reduces transfer size, but not always runtime memory enough. Large engineering GLBs should also be split by line, area, system, floor, or spatial cells.

Recommended GLB strategy:

```text
Small/medium GLB:
  one file, optimized

Large plant GLB:
  manifest.json
  area-001.glb
  area-002.glb
  pipe-rack-A.glb
  equipment-zone-B.glb
```

Then load only visible/selected chunks.

---

# 7. Compare adoption options

| Option                                       | Static GitHub Pages |     DWG reliability | DXF editability | GLB intelligence | Large file performance | Recommendation                      |
| -------------------------------------------- | ------------------: | ------------------: | --------------: | ---------------: | ---------------------: | ----------------------------------- |
| Pure static with `dxf-parser` + `GLTFLoader` |           Excellent |                Poor |          Medium |             Good |                 Medium | Good base, not enough for DWG       |
| Static + `libredwg-web`                      |                Good |              Medium |          Medium |             Good |            Medium risk | Experimental only                   |
| Static + optional converter backend          |                Good |                High |            High |             Good |                   High | **Best overall**                    |
| Full APS/Autodesk cloud workflow             |          Low/Medium |           Very high |          Medium |    High metadata |                   High | Good enterprise option, not default |
| Adopt whole CAD editor repo                  |              Medium |              Varies |            High |  Weak for piping |                 Varies | Not recommended as core             |
| Canonical PCFX/core model + adapters         |           Excellent | Converter-dependent |            High |             High |                   High | **Adopt this**                      |

---

# 8. Final architecture to adopt

```text
src/
  formats/
    dxf/
      DxfPreflight.ts
      DxfWorkerParser.ts
      DxfToCanonicalMapper.ts
      CanonicalToDxfWriter.ts
      DxfDiagnostics.ts

    gltf/
      GltfLoaderAdapter.ts
      GltfToCanonicalMapper.ts
      CanonicalToGltfExporter.ts
      GltfOptimizationHints.ts

    dwg/
      DwgConversionClient.ts
      DwgBrowserExperimentalAdapter.ts
      DwgBackendApiAdapter.ts

  core/
    CanonicalComponent.ts
    GeometryAnchors.ts
    RawNormalizedDerived.ts
    MappingConfidence.ts

  ui/
    PropertyPanel/
      PropertyPanel.ts
      PropertySections.ts
      AttributeEditor.ts

    Layers/
      LayerManager.ts

    Diagnostics/
      ImportDiagnosticsPanel.ts
```

---

# 9. My final recommendation

For **GLB-PCF-2.5-Editor**, adopt this:

## Phase 1 — DXF and GLB native import

Implement:

```text
DXF import → canonical model → property panel
GLB import → canonical model → property panel
```

Use DXF and GLB as exchange formats, but keep your app’s canonical component model authoritative.

## Phase 2 — intelligent mapping

Add:

```text
DXF block/ATTRIB/XDATA/layer/text inference
GLB extras/userData mapping
confidence scoring
diagnostic panel
```

## Phase 3 — export

Add:

```text
canonical → DXF writer
canonical → GLB exporter with extras
canonical → PCFX
```

## Phase 4 — large-file mode

Add:

```text
DXF worker parsing
layer filtering
batched rendering
GLB Draco/KTX2/Meshopt support
GLB chunk manifest loading
```

## Phase 5 — optional DWG service

Add:

```text
DWG → DXF backend converter
DWG → JSON backend converter
experimental browser libredwg-web only if GPL impact is acceptable
```

---

## One-line decision

**Adopt DXF/GLB as native static-web import/export formats, map both into your canonical PCFX/component architecture, and handle DWG only through an optional converter layer — not as the app’s direct editing format.**

[1]: https://github.com/mlightcad/libredwg-web?utm_source=chatgpt.com "GitHub - mlightcad/libredwg-web: A DWG/DXF JavaScript parser based on libredwg · GitHub"
[2]: https://www.gnu.org/software/libredwg/?utm_source=chatgpt.com "LibreDWG - GNU Project - Free Software Foundation"
[3]: https://forge.autodesk.com/developer/overview/realdwg?utm_source=chatgpt.com "RealDWG API | Autodesk Platform Services"
[4]: https://aps.autodesk.com/developer/overview/model-derivative-api?utm_source=chatgpt.com "Model Derivative API | Autodesk Platform Services (APS)"
[5]: https://www.npmjs.com/package/dxf-parser?utm_source=chatgpt.com "dxf-parser - npm"
[6]: https://github.com/vagran/dxf-viewer?utm_source=chatgpt.com "GitHub - vagran/dxf-viewer: DXF 2D viewer written in JavaScript · GitHub"
[7]: https://github.com/gdsestimating/three-dxf?utm_source=chatgpt.com "GitHub - gdsestimating/three-dxf: A dxf viewer for the browser using three.js"
[8]: https://github.com/dxfjs/writer?utm_source=chatgpt.com "GitHub - dxfjs/writer: A JavaScript dxf generator written in TypeScript."
[9]: https://aps.autodesk.com/blog/call-feedback-optimizing-model-derivative-extraction-3d-polylines?utm_source=chatgpt.com "📢 Call for Feedback: Optimizing Model Derivative Extraction for 3D Polylines | Autodesk Platform Services"
[10]: https://threejs.org/docs/pages/GLTFLoader.html?utm_source=chatgpt.com "GLTFLoader - Three.js Docs"
[11]: https://gltf-transform.dev/?utm_source=chatgpt.com "glTF Transform"
