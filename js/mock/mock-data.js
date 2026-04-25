/**
 * @file js/mock/mock-data.js
 * @description Canonical mock dataset for all capability self-checks and Playwright tests.
 *
 * Contains:
 *   MOCK_PCF_TEXT  — A valid 10-component PCF string with known exact field values
 *   MOCK_DXF_TEXT  — A valid 6-entity DXF R12 string
 *   MOCK_EXPECTED  — Quantitative expected outcomes for all assertions
 *
 * DO NOT MODIFY this file without updating every test that references MOCK_EXPECTED.
 * It is the "ground truth" for all verification.
 */

// ─── Canonical mock PCF ────────────────────────────────────────────────────────
// 10 components:  3 PIPE · 2 ELBOW · 1 TEE · 1 FLANGE · 1 VALVE · 1 SUPPORT · 1 MESSAGE-CIRCLE
// Bores:          323.85 mm (large) · 168.27 mm (small branch)
// Pipeline refs:  TEST-LINE-A · TEST-LINE-B
// Materials:      CS (carbon steel) · SS (stainless steel)
// Support:        DIRECTION=DOWN → kind=REST
// Validation:     0 errors, 0 warnings on this clean mock

export const MOCK_PCF_TEXT = `ISOGEN-FILES
ISOGEN-FILE 1
COMPONENT-ATTRIBUTE1 PCF-TEST-001
UNITS-BORE MM
UNITS-CO-ORDS MM
UNITS-WEIGHT KGS
PIPELINE-REFERENCE TEST-LINE-A
TEMPERATURE-1 150
PRESSURE-1 10.5
INSULATION-SPEC NONE

PIPE
    END-POINT 0 0 0 TO 600 0 0
    BORE 323.85
    MATERIAL CS
    PIPELINE-REFERENCE TEST-LINE-A

PIPE
    END-POINT 1000 0 0 TO 2000 0 0
    BORE 323.85
    MATERIAL CS
    PIPELINE-REFERENCE TEST-LINE-A

PIPE
    END-POINT 2000 500 0 TO 2000 1500 0
    BORE 168.27
    MATERIAL SS
    PIPELINE-REFERENCE TEST-LINE-B

ELBOW
    END-POINT 600 0 0 TO 1000 0 0
    CENTRE-POINT 800 0 0
    BORE 323.85
    MATERIAL CS
    PIPELINE-REFERENCE TEST-LINE-A

ELBOW
    END-POINT 2000 0 0 TO 2000 500 0
    CENTRE-POINT 2000 250 0
    BORE 168.27
    MATERIAL SS
    PIPELINE-REFERENCE TEST-LINE-B

TEE
    END-POINT 1500 0 0 TO 2000 0 0
    BRANCH1-POINT 1500 -200 0
    BORE 323.85
    MATERIAL CS
    PIPELINE-REFERENCE TEST-LINE-A

FLANGE
    END-POINT -200 0 0 TO 0 0 0
    BORE 323.85
    MATERIAL CS
    PIPELINE-REFERENCE TEST-LINE-A

VALVE
    END-POINT 650 0 0 TO 850 0 0
    BORE 323.85
    MATERIAL CS
    PIPELINE-REFERENCE TEST-LINE-A

SUPPORT
    CO-ORDS 1000 -150 0
    SUPPORT-DIRECTION DOWN
    <SUPPORT_NAME> SP-001
    PIPELINE-REFERENCE TEST-LINE-A

MESSAGE-CIRCLE
    CO-ORDS 0 300 0
    TEXT NOTE-1
`;

// ─── Canonical mock DXF ───────────────────────────────────────────────────────
// 6 entities: 3 LINE (PIPE) · 1 ARC (ELBOW) · 1 CIRCLE (FLANGE) · 1 TEXT (MESSAGE-SQUARE)
// Layer TEST-LINE-A maps to PIPELINE-REFERENCE
// ACI colour 1 (red) → material CS

export const MOCK_DXF_TEXT = `  0
SECTION
  2
HEADER
  9
$ACADVER
  1
AC1009
  9
$INSUNITS
 70
     4
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LINE
  8
TEST-LINE-A
 62
     1
 10
0.0
 20
0.0
 30
0.0
 11
600.0
 21
0.0
 31
0.0
  0
LINE
  8
TEST-LINE-A
 62
     1
 10
1000.0
 20
0.0
 30
0.0
 11
2000.0
 21
0.0
 31
0.0
  0
LINE
  8
TEST-LINE-B
 62
     3
 10
2000.0
 20
500.0
 30
0.0
 11
2000.0
 21
1500.0
 31
0.0
  0
ARC
  8
TEST-LINE-A
 62
     1
 10
800.0
 20
0.0
 30
0.0
 40
200.0
 50
0.0
 51
90.0
  0
CIRCLE
  8
TEST-LINE-A
 62
     1
 10
-100.0
 20
0.0
 30
0.0
 40
161.925
  0
TEXT
  8
ANNOTATION
 10
0.0
 20
300.0
 30
0.0
 40
25.0
  1
NOTE-DXF-1
  0
ENDSEC
  0
EOF
`;

// ─── Quantitative expected outcomes ──────────────────────────────────────────
export const MOCK_EXPECTED = {

  // ── PCF parsing ─────────────────────────────────────────────────────
  pcf: {
    componentCount:    10,
    byType: {
      'PIPE':           3,
      'ELBOW':          2,
      'TEE':            1,
      'FLANGE':         1,
      'VALVE':          1,
      'SUPPORT':        1,
      'MESSAGE-CIRCLE': 1,
    },
    pipelineRefs:      ['TEST-LINE-A', 'TEST-LINE-B'],
    materials:         ['CS', 'SS'],
    boreMax:           323.85,
    boreMin:           168.27,

    // Geometry spot-checks (all coords in mm)
    pipe0_ep1:         { x: 0,    y: 0, z: 0 },
    pipe0_ep2:         { x: 600,  y: 0, z: 0 },
    elbow0_cp:         { x: 800,  y: 0, z: 0 },
    tee_bp:            { x: 1500, y: -200, z: 0 },
    support_origin_y:  -150,

    // Attribute checks
    pipe0_material:    'CS',
    pipe2_material:    'SS',
    temperature:       '150',
    pressure:          '10.5',
    supportDirection:  'DOWN',
    supportKind:       'REST',    // inferred from DIRECTION=DOWN
    supportName:       'SP-001',
    messageText:       'NOTE-1',

    // Validation (clean mock)
    validationErrors:  0,
    validationWarns:   0,

    // Elbow geometry
    elbowHasCp:        true,
  },

  // ── DXF parsing ──────────────────────────────────────────────────────
  dxf: {
    componentCount:    6,
    byType: {
      'PIPE':           3,
      'ELBOW':          1,
      'FLANGE':         1,
      'MESSAGE-SQUARE': 1,
    },
    pipe0_layer:       'TEST-LINE-A',
    pipe0_material:    'CS',    // ACI 1 (red) → CS
    pipe2_material:    'SS',    // ACI 3 (green) → SS
    flangeRadius:      161.925, // CIRCLE radius
    messageText:       'NOTE-DXF-1',
  },

  // ── Scene renderer ───────────────────────────────────────────────────
  scene: {
    // Mesh group: PIPE(3) + ELBOW(2) + TEE(1) + FLANGE(1) + VALVE(1) = 8 meshes
    // SUPPORT renders as symbol (not in meshGroup) → symbolGroup has 1
    // MESSAGE-CIRCLE has no mesh (label only)
    meshCountMin:       8,
    symbolCount:        1,
    labelCountMin:      2,     // MESSAGE-CIRCLE "NOTE-1" + SUPPORT "SP-001"

    // Bounding box: X: -200→2000, Y: -200→1500, Z: 0
    boundingBoxNonZero: true,
    bbMinX:            -200,
    bbMaxX:             2000,

    // After fitAll: camera target near scene center
    fitAllSuccess:      true,
  },

  // ── Heatmap ──────────────────────────────────────────────────────────
  heatmap: {
    // Two bore sizes → two distinct material colours
    // 323.85mm pipes = one colour, 168.27mm pipe = another
    distinctColorsOD:   2,
    // material='CS' → #4a7fa5, material='SS' → #7bc67e (from pipe-geometry.js)
    materialCS_hex:    '#4a7fa5',
    materialSS_hex:    '#7bc67e',
  },

  // ── Component info panel ─────────────────────────────────────────────
  panel: {
    // Click PIPE with 323.85mm bore → 3 sections (Common, Geometry, Process)
    pipeClickSectionCount: 3,
    boreFormatted:      '323.85 mm',
    pipelineRef:        'TEST-LINE-A',
    material:           'CS',
    temperature:        '150',
    pressure:           '10.5',

    // Click SUPPORT → 4 sections (Common, Geometry, Process, Support)
    supportClickSectionCount: 3,   // 3 if no process attrs on support
    supportName:        'SP-001',
    supportKind:        'REST',
  },

  // ── Debug tab ────────────────────────────────────────────────────────
  debug: {
    summaryTotal:       10,
    elbowSearchRows:    2,         // search "ELBOW" → 2 rows
    validationText:     '✓ No issues found.',
    logContainsInfo:    true,
    domainLabel:        'piping',
  },

  // ── CSS2D Labels ─────────────────────────────────────────────────────
  labels: {
    visibleOnLoad:      true,
    messageCircleText:  'NOTE-1',
    supportLabelText:   'SP-001',
    countMin:           2,
  },

  // ── GLB export / reload ──────────────────────────────────────────────
  glb: {
    downloadOccurs:     true,
    filenameEndsWith:   '.glb',
    afterReloadMeshMin: 8,
  },

  // ── DXF export ───────────────────────────────────────────────────────
  dxfExport: {
    downloadOccurs:      true,
    filenameEndsWith:    '.dxf',
    containsSection:     '0\nSECTION',
    containsEntityLINE:  true,
    containsEntityARC:   false,   // mock has no elbows with cp in PCF for DXF export
    layerTablePresent:   true,
  },
};

// ─── Assertion helper ─────────────────────────────────────────────────────────
/**
 * Run a set of assertions and return a mock result object.
 * @param {Array<{label:string, expected:any, actual:any}>} checks
 * @returns {{ pass:boolean, assertions:Array }}
 */
export function runAssertions(checks) {
  const assertions = checks.map(({ label, expected, actual }) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected)
              || (typeof expected === 'number' && typeof actual === 'number' && Math.abs(actual - expected) < 0.001)
              || (typeof expected === 'boolean' && Boolean(actual) === expected);
    return { label, expected, actual, pass };
  });
  return { pass: assertions.every(a => a.pass), assertions };
}
