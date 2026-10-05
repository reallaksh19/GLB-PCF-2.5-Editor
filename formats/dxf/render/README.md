# Native render projection checkpoint

`DxfRenderAdapter.buildRenderModel(document)` projects native records without modifying source geometry or bytes. Primitive selection uses the document's actual source entity ID; block geometry also carries a root INSERT ID, leaf entity ID and instance path. MINSERT row/column occurrences have distinct stable primitive IDs.

The shared affine and curve ports in `geometry/cad/` retain nested base points, OCS, nonuniform scale, shear and reflections. Source curves are evaluated before affine transformation. Splines use the native degree, knots and rational weights. Positive bulges traverse counterclockwise: for a horizontal left-to-right chord, the positive semicircle lies below the chord. The sign convention follows [Autodesk's bulge definition](https://help.autodesk.com/cloudhelp/2018/ENU/OARX-RefGuide/files/OREF-AcDb2dVertex__bulge.html).

Text corner bounds use the complete affine transform, but font metrics and flattened MTEXT formatting are approximate. MTEXT group 50 is interpreted in radians, as specified in the [native MTEXT reference](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-5E5DB93B-F8D3-4433-ADF7-E92E250D2BAB.htm). Native lineweight codes are -1 BYLAYER, -2 BYBLOCK and -3 DEFAULT; numeric source codes govern inheritance.

Invalid or unsupported spline bases produce an explicitly marked control/fit polygon preview with diagnostics. Missing hatch boundaries produce a diagnostic rather than an empty claimed hatch. A05 GPU batching, error-controlled LOD, dependency caches, full native fonts/MTEXT, annotation coverage, UI cutover and independent A12 visual/performance gates remain unfinished. This checkpoint does not complete child #93 or parent #85.

Verification: `node --test tests/cad/A05/*.test.mjs` and `node tests/dxf/dxf-render-adapter.test.mjs`; producer/source integration also runs the A01 parser and A03 writer regressions and `npm run cad:contracts`.
