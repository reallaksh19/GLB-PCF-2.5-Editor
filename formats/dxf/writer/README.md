# Native DXF writer — #91 / PR #103

`DxfDocumentWriter.writeBytes(document)` preserves every original byte for a valid unchanged source. Supported edits compose byte overlays against immutable source spans; control groups, XDATA, unknown records/sections, lexemes, BOM and newline style survive. `write` is a decoded-text convenience; file/download code uses the byte API.

`serialize(document, request)` validates native-save mode, target format, document identity and revision/content checkpoint; captures bytes before asynchronous hashing; and returns SHA-256 output/untouched-record digests with captured revision/content IDs. Cancellation before delivery rejects. Serialization does not allocate handles, mutate the document or acknowledge delivery. `document.acknowledgeSave(result, true)` records an observed successful delivery only; later edits stay dirty. It does not assert disk persistence beyond the caller's actual delivery observation.

Typed field edits support LINE/CIRCLE/ARC/POINT/TEXT/MTEXT/ATTRIB/INSERT/POLYLINE/LWPOLYLINE/ELLIPSE/SPLINE/SOLID/LEADER/DIMENSION. Topology/type changes use a typed record plan. New records consume transaction-committed IDs/handles/owners/sequence resources; deleting records verifies surviving native handle references. Unknown modified types, ambiguous selectors, missing sequence resources, invalid numeric/text values and unsupported implicit format/version/codepage conversions reject before output.

Existing header variables retain original group codes; INSUNITS/MEASUREMENT and committed HANDSEED are updated deliberately. Existing layer off/frozen/locked/style fields use native overlays. New block/table/resource authoring needs its own committed resource plan and is explicitly unsupported by this checkpoint.

UTF-8 and representable legacy codepage text edits use explicit encoders; unencodable characters reject without replacement. Opaque copied bytes are never decoded or transcoded. Fatal source documents permit only explicit `recoverOriginalBytes` recovery. [Autodesk MTEXT chunk contract](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-5E5DB93B-F8D3-4433-ADF7-E92E250D2BAB.htm) and [SPLINE fields](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm) govern native text/curve records.

The writer emits total N output bytes and caches the immutable before image. No O(k) whole-file Save or independent benchmark certification is claimed. Independent A12 AutoCAD/SXN/browser fidelity evidence remains separate from these deterministic writer tests.

Verification: `node --test tests/cad/A03/*.test.mjs`, `node tests/dxf/dxf-document-roundtrip.test.mjs`, `node tools/verify-cad-boundaries.mjs`, parser regressions and existing Phase0 gates. Current parent START/END evidence records exact tested commits and actual provider states; this document does not grant merge or child closure.
