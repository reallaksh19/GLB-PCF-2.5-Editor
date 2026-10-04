# CAD Document Architecture Contract

## Status & Authority
- **Governing Issue**: [Issue #85](https://github.com/reallaksh19/GLB-PCF-2.5-Editor/issues/85)
- **Supersedes**: The DXF-specific "CEG is authoritative" portions of Issue #11 and `docs/GEOMETRY_DRAFTING_CONTRACT.md`.
- **Preserves**: CEG as the authoritative model for native piping/route semantics, topology, and PCF-derived engineering geometry.

---

## 1. Core Architectural Principle

> **Source documents own source-format fidelity. CEG owns engineering semantics. Render models own presentation. Commands own edits. Same-format Save serializes the source document; Export is an explicit conversion.**

```text
                    +----------------------+
DXF bytes ----------> DxfDocument          |
                    | authoritative source |
                    +----------+-----------+
                               |
              +----------------+----------------+
              |                                 |
              v                                 v
       DxfRenderAdapter                 DxfSemanticAdapter
              |                                 |
              v                                 v
         RenderModel                         Piping CEG
              |                                 |
              +---------------+-----------------+
                              |
                         CadCommands
                              |
                              v
                         DxfDocument
                              |
                              v
                       DxfDocumentWriter
                              |
                              v
                          DXF / AutoCAD
```

---

## 2. Non-Negotiable Invariants

1. **Same-Format Save Serializes the Source Document**:
   - `DXF` ➔ `DxfDocument` ➔ `DXF` (preserves all sections: HEADER, CLASSES, TABLES, BLOCKS, ENTITIES, OBJECTS).
   - `PCF` ➔ `PcfDocument` ➔ `PCF`.
   - `GLB` ➔ `GlbDocument` ➔ `GLB`.
   - The Canonical Edit Graph (CEG) is **never** serialized as the primary representation for imported CAD drawings.

2. **Cross-Format Export Is Explicitly Lossy**:
   - `DXF` ➔ `GLB` (visual scene generation).
   - `DXF` ➔ `PCF` (semantic pipe extraction).
   - `PCF` ➔ `DXF` (engineering drawing generation).
   - `CEG` ➔ `GLB` / `DXF` (derived export).

3. **Source Coordinates Are Preserved Exactly**:
   - Coordinates from group codes `10, 20, 30` (and `11, 21, 31`) must be stored without transformation.
   - `$INSUNITS` and `$MEASUREMENT` are document-level metadata only.
   - Authoritative source coordinates must **never** be multiplied by conversion scale factors (e.g. `scalePointToMm`) upon import. Display/renderer transforms remain strictly external to source storage.

4. **Entity Identity Preservation**:
   - `CIRCLE` remains `CIRCLE` (never converted to `ARC`).
   - `TEXT` and `MTEXT` retain their CAD-specific justification, height, and style attributes (never collapsed to generic `ANNOTATION`).
   - `DIMENSION`, `LEADER`, and `HATCH` are preserved as native entity records (never discarded or replaced by dummy proxy text tags).
   - `INSERT` remains an instance reference; `BLOCK` remains a shared definition.

5. **Unknown and Unmodified Entity Passthrough**:
   - Any valid DXF entity or section not interpreted by current tools must be preserved structurally.
   - Unmodified entities retain their raw group-code tokens (`source.rawTags`) so they round-trip byte-for-byte.

6. **Stable Identity for Selection**:
   - Selection sets store stable source identifiers (`dxf:entity:<HANDLE>`), **never** Three.js object references or volatile indices.

7. **Transactional Command Edits**:
   - All mutations occur via undoable `CadCommand` instances modifying the authoritative document model.
   - Presentation (render scene) and semantic projections (CEG) update incrementally as downstream subscribers.

---

## 3. Separation of Concerns & Ownership Matrix

| Responsibility | Authoritative Model | Projections / Consumers | Invariant Rules |
|---|---|---|---|
| **DXF File Truth** | `DxfDocument` | `DxfRenderAdapter`, `DxfSemanticAdapter`, `DxfDocumentWriter` | Holds all tables, blocks, handles, raw tags, and untouched records. |
| **Piping Semantics** | `CanonicalEditGraph` (CEG) | 3D Pipe Router, PCF Generator, Flow Checkers | Derived projection when imported from DXF. Links to CAD via `sourceRef.cadEntityId`. |
| **Presentation / GPU** | `RenderModel` | Three.js Viewport, WebGL Canvas | Purely visual. Primitives point back to `sourceEntityId`. Never authoritative for edits. |
| **User Mutations** | `CadCommand` Engine | Undo/Redo Stacks, ChangeSet Dispatcher | Mutates `DxfDocument` directly. UI listens to `ChangeSet` to trigger partial re-renders. |

---

## 4. Target Editor Document Schema

```javascript
EditorDocument {
  id: string,                       // UUID or file URI
  sourceFormat: 'DXF' | 'PCF' | 'GLB',
  sourceDocument: DxfDocument | PcfDocument | GlbDocument,
  renderModel: RenderModel,         // Unified render primitives with sourceEntityId
  semanticModels: {
    piping: CanonicalEditGraph | null
  },
  selection: {
    ids: Set<string>,               // e.g. Set(['dxf:entity:A12B'])
    primaryId: string | null
  },
  history: CommandHistory,
  viewState: ViewState,
  dirty: boolean
}
```

### Format Adapter Interface Contract

```javascript
interface FormatAdapter {
  id: string; // 'dxf' | 'pcf' | 'glb'

  // Document lifecycle
  parse(input: string | ArrayBuffer, options?: object): Promise<SourceDocument>;
  createEditorDocument(sourceDocument: SourceDocument): EditorDocument;
  serialize(sourceDocument: SourceDocument, options?: object): string | Uint8Array;

  // Projections
  buildRenderModel(sourceDocument: SourceDocument, options?: object): RenderModel;
  buildSemanticModels(sourceDocument: SourceDocument, options?: object): object;

  // Edit dispatch
  applyEdit(sourceDocument: SourceDocument, command: CadCommand): ChangeSet;

  // Declared capabilities
  capabilities: {
    losslessRoundTrip: boolean;
    nativeEditing: boolean;
    layers: boolean;
    blocks: boolean;
    nodeHierarchy: boolean;
    semanticProjection: boolean;
  };
}
```

---

## 5. Legacy Path Inventory (Marked for Deprecation)

The following paths belong to the legacy pipeline where DXF was forced through CEG. They are frozen and scheduled for retirement in **Phase 12**:

| Legacy File Path | Current Role (Legacy) | Target Replacement | Scheduled Deprecation |
|---|---|---|---|
| `formats/dxf/dxf-parser-adapter.js` | npm `dxf-parser` wrapper; scales coordinates to mm; expands inserts. | `formats/dxf/parser/dxf-document-parser.js` | Phase 12 |
| `formats/dxf/dxf-to-ceg.js` | Collapses CIRCLE➔ARC, TEXT➔ANNOTATION; strips tables/headers. | `formats/dxf/dxf-semantic-adapter.js` (projection only) | Phase 12 |
| `formats/dxf/ceg-to-dxf.js` | Emits minimal ENTITIES section; emits PROXY/UNSUPPORTED text tags. | `formats/dxf/writer/dxf-document-writer.js` | Phase 12 |
| `formats/dxf/dxf-block-expander.js` | Explodes blocks destructively into model space entities. | `formats/dxf/render/dxf-block-renderer.js` (transform stack) | Phase 12 |
| `core/geometry/geometry-view.js` | Derives render views strictly from CEG components. | Format-specific render adapters (`DxfRenderAdapter`) | Phase 12 |
| `js/tabs/viewer-tab.js` | Wires viewer directly to CEG components. | Wires viewer to `EditorDocument.renderModel` | Phase 12 |
| `js/glb/exportToDXF.js` | Serializes scene meshes into simplistic DXF lines. | Kept as explicit lossy cross-format export only. | Retained as export utility |

---

## 6. Anti-Drift Compliance Checklist

Every phase PR must pass the following mechanical checks before delivery:
- [ ] **No Cross-Layer Boundary Violations**: Model and parser packages (`formats/dxf/model/**`, `formats/dxf/parser/**`) do not import Three.js, DOM APIs, or `core/ceg/**`.
- [ ] **Coordinate Invariant Maintained**: Zero calls to `scalePointToMm` or unit multiplication in source coordinate storage.
- [ ] **Entity Identity Preserved**: Codecs strictly preserve entity types (`CIRCLE` != `ARC`).
- [ ] **Untouched Entity Passthrough**: Entities not modified in the session preserve their original group-code tag sequence.
- [ ] **Automated Boundary Tool Passes**: `node tools/verify-cad-boundaries.mjs` exits with code 0.
