# Native DXF parser foundation

Governing roadmap #85 and execution contracts #86; preservation/indexing work contributes to A01/#88 and preliminary codec views to A02/#89. Neither owner issue is closed by this foundation PR.

`DxfDocumentParser.parse(input, { documentId, fileName })` accepts Uint8Array/ArrayBuffer original bytes, or an already decoded string. Byte input is copied once into private source storage. `originalBytes` returns a defensive copy; token code/value spans refer to immutable source bytes. Values decode lazily using native version/codepage metadata. String input is explicitly `provided-utf8-text`; it cannot recover bytes lost before this call.

`raw.records` and `raw.sectionRecords` are ordered preservation inventories; lookup Maps are conveniences, not writer authority. All supported and opaque record handles are indexed before any session allocation. Unique native handles identify records within the document; duplicate/missing handles use record ordinals without rewriting source. `entityIndex` includes block/sequence children; `modelSpace` and `paperSpaces` partition root entities.

Malformed source is recoverable with diagnostics and restricted capabilities. Structurally malformed input is not reinterpreted as a drawing; semantic-invalid but inspectable records may have typed views while remaining read-only. The existing fid07 visual fixture has nonhex L/T/I handles and is explicitly not a valid native-Save acceptance oracle.

The parser never allocates source handles. BigInt allocation avoids 64-bit collisions and treats HANDSEED as the next available value. Transaction-safe reservations, exact history, source overlays and same-format writer integration remain work for the command/writer owners.

Typed views retain raw source tags, source record spans/IDs, native coordinates/type/layer, standard styles and compound ownership. They are not complete rendering/editing codecs: full OCS/INSERT transforms, geometry capabilities and version-aware field patches remain A02 work. No writer may reconstruct an untouched document from these typed views.

`nativeEditing` and `nativeSave` capabilities remain false until those services are implemented; successful parsing is not a claim that source-based viewer/Save cutover has happened. AutoCAD reopen, image fidelity, browser responsiveness and the calibrated CAD85 benchmark matrix are still unrun.

Tests: `node --test tests/cad/A01/*.test.mjs` plus `node tests/dxf/dxf-document-parser.test.mjs`. Supply `CAD_SXN_PATH` to run the authorized exact-hash SXN gate; absence is an explicit UNRUN skip. No user drawing is committed by this PR.
