# Native writer checkpoint for #91 / PR #103

`DxfDocumentWriter.writeBytes(document)` is the native byte API. Unchanged valid
documents retain all original bytes, including BOM, newline style, source order,
unknown records/sections, group-code padding and numeric/text lexemes.
`write(document)` returns decoded text for text consumers; file/download code
must use the byte API to retain a BOM and non-UTF-8 codepage bytes.

The writer reparses the original bytes to validate the before image, compares
actual semantic fields, then composes nonoverlapping byte overlays. It does not
allocate handles, clear modified flags or mutate the live document. Marking an
entity modified does not permit arbitrary fields to be silently discarded.

Supported field edits cover LINE, CIRCLE, ARC, POINT, TEXT, ATTRIB, INSERT,
LWPOLYLINE and POLYLINE/VERTEX. Compound children use their own preserved spans;
opaque control groups and XDATA are excluded from native field selectors.
Changed supported resource references are validated; ambiguous selectors,
nonfinite values, invalid integer fields and unsupported source-version fields
fail before output delivery. Existing untouched warnings remain source warnings.

Unchanged documents retain every supported source encoding. UTF-8 text edits and
ASCII edits in other supported codepages are available; non-ASCII edits in other
codepages reject explicitly. Implicit newline/version/codepage conversions reject.
Fatal source errors prevent ordinary Save; `recoverOriginalBytes(document)` is
an explicit recovery operation and does not serialize edits.

This checkpoint does **not** complete #91. Creation/deletion/topology changes,
header/resource write plans, other entity codecs and codepage conversions require
further implementation and currently reject explicitly. The A00 SerializeRequest/
SerializeResult revision/checkpoint/digest/cancellation boundary, streaming output,
performance budgets and independent A12 AutoCAD/SXN gates remain incomplete.
The writer currently reparses and compares the full document and allocates the
full output buffer; no O(k) whole-file Save or budget compliance is claimed.

Tests: `node --test tests/cad/A03/*.test.mjs` and
`node tests/dxf/dxf-document-roundtrip.test.mjs`. The latter explicitly verifies
unsupported creation rejection/purity and invalid-source recovery, rather than
claiming creation or invalid-document native Save succeeds.
