/**
 * gen-benchmark-dxf.js
 * Generates test/benchmark-piping-rack.dxf — a large real-world piping rack
 * exercising every entity type handled by domains/piping/dxf-importer.js.
 *
 * Run: node tools/gen-benchmark-dxf.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---------------------------------------------------------------------------
// DXF record helpers
// ---------------------------------------------------------------------------
/** Each DXF record = group-code (right-padded to 3 chars) + '\n' + value + '\n' */
function rec(code, value) {
  const c = String(code).padStart(3, ' ');
  return `${c}\n${value}\n`;
}

function r0(value)  { return rec(0,   value); }  // entity/section type
function r1(value)  { return rec(1,   value); }  // text string
function r2(value)  { return rec(2,   value); }  // name
function r3(value)  { return rec(3,   value); }  // extra string
function r5(value)  { return rec(5,   value); }  // handle
function r6(value)  { return rec(6,   value); }  // linetype name
function r8(value)  { return rec(8,   value); }  // layer
function r10(v)     { return rec(10,  fmt(v)); }  // X
function r11(v)     { return rec(11,  fmt(v)); }  // X2
function r20(v)     { return rec(20,  fmt(v)); }  // Y
function r21(v)     { return rec(21,  fmt(v)); }  // Y2
function r30(v)     { return rec(30,  fmt(v)); }  // Z
function r31(v)     { return rec(31,  fmt(v)); }  // Z2
function r40(v)     { return rec(40,  fmt(v)); }  // radius / size
function r41(v)     { return rec(41,  fmt(v)); }  // start angle / scale X
function r42(v)     { return rec(42,  fmt(v)); }  // end angle / scale Y
function r43(v)     { return rec(43,  fmt(v)); }  // scale Z
function r50(v)     { return rec(50,  fmt(v)); }  // angle
function r62(v)     { return rec(62,  v); }       // color index
function r70(v)     { return rec(70,  v); }       // flags / vertex count
function r100(v)    { return rec(100, v); }       // subclass marker

function fmt(v) { return Number(v).toFixed(4); }

let handleSeq = 1;
function nextHandle() {
  return (handleSeq++).toString(16).toUpperCase().padStart(4, '0');
}

// ---------------------------------------------------------------------------
// Layer definitions
// ---------------------------------------------------------------------------
const LAYERS = [
  { name: '0',           color: 7,  ltype: 'Continuous' },
  { name: 'PIPE-DN200',  color: 5,  ltype: 'Continuous' },
  { name: 'PIPE-DN150',  color: 3,  ltype: 'Continuous' },
  { name: 'PIPE-DN100',  color: 1,  ltype: 'Continuous' },
  { name: 'VALVE',       color: 6,  ltype: 'Continuous' },
  { name: 'FLANGE',      color: 2,  ltype: 'Continuous' },
  { name: 'SUPPORT',     color: 4,  ltype: 'Continuous' },
  { name: 'INSTRUMENT',  color: 30, ltype: 'Continuous' },
  { name: 'ANNOTATION',  color: 7,  ltype: 'Continuous' },
];

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------
function buildHeader() {
  let s = '';
  s += r0('SECTION');
  s += r2('HEADER');

  s += rec(9, '$ACADVER');
  s += r1('AC1015');

  s += rec(9, '$INSUNITS');
  s += r70(4);         // millimetres

  s += rec(9, '$EXTMIN');
  s += r10(-1000);
  s += r20(-15000);
  s += r30(-1000);

  s += rec(9, '$EXTMAX');
  s += r10(55000);
  s += r20(15000);
  s += r30(7000);

  s += rec(9, '$LUNITS');
  s += r70(2);         // decimal

  s += rec(9, '$ANGBASE');
  s += r50(0);

  s += r0('ENDSEC');
  return s;
}

function buildTables() {
  let s = '';
  s += r0('SECTION');
  s += r2('TABLES');

  // --- LTYPE table (minimal) ---
  s += r0('TABLE');
  s += r2('LTYPE');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTable');
  s += r70(1);

  s += r0('LTYPE');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTableRecord');
  s += r100('AcDbLinetypeTableRecord');
  s += r2('Continuous');
  s += r70(64);
  s += r3('Solid line');
  s += r72(65);
  s += r73(0);
  s += r40(0);

  s += r0('ENDTAB');

  // --- LAYER table ---
  s += r0('TABLE');
  s += r2('LAYER');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTable');
  s += r70(LAYERS.length);

  for (const lyr of LAYERS) {
    s += r0('LAYER');
    s += r5(nextHandle());
    s += r100('AcDbSymbolTableRecord');
    s += r100('AcDbLayerTableRecord');
    s += r2(lyr.name);
    s += r70(0);
    s += r62(lyr.color);
    s += r6(lyr.ltype);
  }
  s += r0('ENDTAB');

  // --- STYLE table (minimal, required by AC1015) ---
  s += r0('TABLE');
  s += r2('STYLE');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTable');
  s += r70(1);

  s += r0('STYLE');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTableRecord');
  s += r100('AcDbTextStyleTableRecord');
  s += r2('Standard');
  s += r70(0);
  s += r40(0);
  s += r41(1);
  s += r50(0);
  s += r71(0);
  s += r42(2.5);
  s += r1('');
  s += r3('');

  s += r0('ENDTAB');

  // --- VIEW table (empty, required) ---
  s += r0('TABLE');
  s += r2('VIEW');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTable');
  s += r70(0);
  s += r0('ENDTAB');

  // --- UCS table (empty, required) ---
  s += r0('TABLE');
  s += r2('UCS');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTable');
  s += r70(0);
  s += r0('ENDTAB');

  // --- APPID table ---
  s += r0('TABLE');
  s += r2('APPID');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTable');
  s += r70(1);
  s += r0('APPID');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTableRecord');
  s += r100('AcDbRegAppTableRecord');
  s += r2('ACAD');
  s += r70(0);
  s += r0('ENDTAB');

  // --- DIMSTYLE table (minimal) ---
  s += r0('TABLE');
  s += r2('DIMSTYLE');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTable');
  s += r70(1);
  s += r0('DIMSTYLE');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTableRecord');
  s += r100('AcDbDimStyleTableRecord');
  s += r2('Standard');
  s += r70(0);
  s += r0('ENDTAB');

  // --- BLOCK_RECORD table ---
  const blockNames = [
    '*Model_Space',
    '*Paper_Space',
    'GATE_VALVE',
    'BALL_VALVE',
    'CHECK_VALVE',
    'PIPE_SUPPORT',
    'TEE_FITTING',
    'PUMP_NOZZLE',
  ];
  s += r0('TABLE');
  s += r2('BLOCK_RECORD');
  s += r5(nextHandle());
  s += r100('AcDbSymbolTable');
  s += r70(blockNames.length);

  for (const bn of blockNames) {
    s += r0('BLOCK_RECORD');
    s += r5(nextHandle());
    s += r100('AcDbSymbolTableRecord');
    s += r100('AcDbBlockTableRecord');
    s += r2(bn);
  }
  s += r0('ENDTAB');

  s += r0('ENDSEC');
  return s;
}

// Helper missing functions
function r71(v) { return rec(71, v); }
function r72(v) { return rec(72, v); }
function r73(v) { return rec(73, v); }

// ---------------------------------------------------------------------------
// Block entity helpers
// ---------------------------------------------------------------------------
function blockDef(name, x, y, z, contents) {
  let s = '';
  s += r0('BLOCK');
  s += r5(nextHandle());
  s += r8('0');
  s += r100('AcDbEntity');
  s += r100('AcDbBlockBegin');
  s += r2(name);
  s += r70(0);
  s += r10(x); s += r20(y); s += r30(z);
  s += r3(name);
  s += r1('');
  s += contents;
  s += r0('ENDBLK');
  s += r5(nextHandle());
  s += r8('0');
  s += r100('AcDbEntity');
  s += r100('AcDbBlockEnd');
  return s;
}

/** A tiny cross-hair LINE for block visibility */
function crosshairLines(size) {
  let s = '';
  // horizontal
  s += r0('LINE');
  s += r5(nextHandle());
  s += r8('0');
  s += r100('AcDbEntity');
  s += r100('AcDbLine');
  s += r10(-size); s += r20(0); s += r30(0);
  s += r11(size);  s += r21(0); s += r31(0);
  // vertical
  s += r0('LINE');
  s += r5(nextHandle());
  s += r8('0');
  s += r100('AcDbEntity');
  s += r100('AcDbLine');
  s += r10(0); s += r20(-size); s += r30(0);
  s += r11(0); s += r21(size);  s += r31(0);
  return s;
}

function buildBlocks() {
  let s = '';
  s += r0('SECTION');
  s += r2('BLOCKS');

  s += blockDef('*Model_Space', 0, 0, 0, '');
  s += blockDef('*Paper_Space', 0, 0, 0, '');
  s += blockDef('GATE_VALVE',   0, 0, 0, crosshairLines(200));
  s += blockDef('BALL_VALVE',   0, 0, 0, crosshairLines(150));
  s += blockDef('CHECK_VALVE',  0, 0, 0, crosshairLines(150));
  s += blockDef('PIPE_SUPPORT', 0, 0, 0, crosshairLines(300));
  s += blockDef('TEE_FITTING',  0, 0, 0, crosshairLines(150));
  s += blockDef('PUMP_NOZZLE',  0, 0, 0, crosshairLines(250));

  s += r0('ENDSEC');
  return s;
}

// ---------------------------------------------------------------------------
// Entity builders
// ---------------------------------------------------------------------------
function eLine(layer, x1, y1, z1, x2, y2, z2) {
  let s = '';
  s += r0('LINE');
  s += r5(nextHandle());
  s += r8(layer);
  s += r100('AcDbEntity');
  s += r100('AcDbLine');
  s += r10(x1); s += r20(y1); s += r30(z1);
  s += r11(x2); s += r21(y2); s += r31(z2);
  return s;
}

/**
 * LWPOLYLINE — dxf-parser exposes vertices with x,y properties (z from elevation).
 * Group 10/20 pairs for each vertex, group 38 for elevation (z).
 */
function eLwPolyline(layer, vertices, elevation) {
  let s = '';
  s += r0('LWPOLYLINE');
  s += r5(nextHandle());
  s += r8(layer);
  s += r100('AcDbEntity');
  s += r100('AcDbPolyline');
  s += r70(0);           // open polyline
  s += r90(vertices.length);
  s += rec(38, fmt(elevation || 0));  // elevation (z for all vertices)
  for (const v of vertices) {
    s += r10(v.x); s += r20(v.y);
  }
  return s;
}

function r90(v) { return rec(90, v); }

/** ARC in XY plane */
function eArc(layer, cx, cy, cz, radius, startDeg, endDeg) {
  let s = '';
  s += r0('ARC');
  s += r5(nextHandle());
  s += r8(layer);
  s += r100('AcDbEntity');
  s += r100('AcDbCircle');
  s += r10(cx); s += r20(cy); s += r30(cz);
  s += r40(radius);
  s += r100('AcDbArc');
  s += r50(startDeg);
  s += r51(endDeg);
  return s;
}

function r51(v) { return rec(51, fmt(v)); }

function eCircle(layer, cx, cy, cz, radius) {
  let s = '';
  s += r0('CIRCLE');
  s += r5(nextHandle());
  s += r8(layer);
  s += r100('AcDbEntity');
  s += r100('AcDbCircle');
  s += r10(cx); s += r20(cy); s += r30(cz);
  s += r40(radius);
  return s;
}

function eInsert(layer, blockName, x, y, z, sx, sy, sz, rotDeg) {
  let s = '';
  s += r0('INSERT');
  s += r5(nextHandle());
  s += r8(layer);
  s += r100('AcDbEntity');
  s += r100('AcDbBlockReference');
  s += r2(blockName);
  s += r10(x); s += r20(y); s += r30(z);
  s += r41(sx || 1);
  s += r42(sy || 1);
  s += r43(sz || 1);
  s += r50(rotDeg || 0);
  return s;
}

function eText(layer, x, y, z, height, text) {
  let s = '';
  s += r0('TEXT');
  s += r5(nextHandle());
  s += r8(layer);
  s += r100('AcDbEntity');
  s += r100('AcDbText');
  s += r10(x); s += r20(y); s += r30(z);
  s += r40(height);
  s += r1(text);
  s += r100('AcDbText');   // second AcDbText subclass (required for TEXT)
  return s;
}

function eMtext(layer, x, y, z, height, text) {
  let s = '';
  s += r0('MTEXT');
  s += r5(nextHandle());
  s += r8(layer);
  s += r100('AcDbEntity');
  s += r100('AcDbMText');
  s += r10(x); s += r20(y); s += r30(z);
  s += r40(height);   // char height
  s += r41(5000);     // reference rect width
  s += r71(1);        // attachment point TL
  s += r72(1);        // drawing direction L->R
  s += r1(text);
  return s;
}

function ePoint(layer, x, y, z) {
  let s = '';
  s += r0('POINT');
  s += r5(nextHandle());
  s += r8(layer);
  s += r100('AcDbEntity');
  s += r100('AcDbPoint');
  s += r10(x); s += r20(y); s += r30(z);
  return s;
}

/** SPLINE — unsupported in importer, exercises the skip path */
function eSpline(layer, controlPts) {
  let s = '';
  s += r0('SPLINE');
  s += r5(nextHandle());
  s += r8(layer);
  s += r100('AcDbEntity');
  s += r100('AcDbSpline');
  s += rec(70, 8);   // flags: planar
  s += rec(71, 3);   // degree
  s += rec(72, controlPts.length + 4); // knot count = n+degree+1 for clamped
  s += rec(73, controlPts.length);
  s += rec(74, 0);   // fit points
  s += rec(42, '0.0000000001');  // knot tolerance
  s += rec(43, '0.0000000001');  // control-pt tolerance
  // knot vector (clamped cubic: 0,0,0,0, ... ,1,1,1,1)
  const n = controlPts.length;
  s += rec(40, 0); s += rec(40, 0); s += rec(40, 0); s += rec(40, 0);
  for (let i = 1; i < n - 3; i++) {
    s += rec(40, fmt(i / (n - 3)));
  }
  s += rec(40, 1); s += rec(40, 1); s += rec(40, 1); s += rec(40, 1);
  // control points
  for (const pt of controlPts) {
    s += r10(pt.x); s += r20(pt.y); s += r30(pt.z);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Main layout — piping rack
// ---------------------------------------------------------------------------
function buildEntities() {
  const e = [];

  // =========================================================================
  // MAIN HEADER DN200  (LINE along X, y=0, z=0)
  // OD=219.1 → flange radius ≈ 109.55
  // =========================================================================
  const OD_DN200 = 219.1;
  const OD_DN150 = 168.3;
  const OD_DN100 = 114.3;
  const L_MAIN   = 'PIPE-DN200';
  const L_150    = 'PIPE-DN150';
  const L_100    = 'PIPE-DN100';

  // Main pipe run 0→50000
  e.push(eLine(L_MAIN, 0, 0, 0, 50000, 0, 0));

  // Flanges at main header ends
  e.push(eCircle('FLANGE', 0, 0, 0, OD_DN200 / 2));
  e.push(eCircle('FLANGE', 50000, 0, 0, OD_DN200 / 2));

  // PIPE_SUPPORT every 6000 on header
  for (let x = 0; x <= 50000; x += 6000) {
    e.push(eInsert('SUPPORT', 'PIPE_SUPPORT', x, 0, 0));
  }

  // GATE_VALVEs on header
  e.push(eInsert('VALVE', 'GATE_VALVE', 8000, 0, 0));
  e.push(eInsert('VALVE', 'GATE_VALVE', 20000, 0, 0));
  e.push(eInsert('VALVE', 'GATE_VALVE', 40000, 0, 0));

  // =========================================================================
  // BRANCH A DN150 — LWPOLYLINE L-shape at x=5000, north 8000 then east 5000
  // =========================================================================
  e.push(eLwPolyline(L_150, [
    { x: 5000, y: 0 },
    { x: 5000, y: 8000 },
    { x: 10000, y: 8000 },
  ], 0));
  // ARC elbow at corner (5000,8000) — quarter-circle from 270° to 0°
  // centre at (6500,8000) radius=1500
  e.push(eArc(L_150, 6500, 6500, 0, 1500, 270, 360));

  // Flanges at branch A ends
  e.push(eCircle('FLANGE', 5000, 0, 0, OD_DN150 / 2));
  e.push(eCircle('FLANGE', 10000, 8000, 0, OD_DN150 / 2));

  // BALL_VALVE on branch A
  e.push(eInsert('VALVE', 'BALL_VALVE', 5000, 4000, 0));

  // TEE at branch A take-off
  e.push(eInsert('0', 'TEE_FITTING', 5000, 0, 0));

  // PIPE_SUPPORT on branch A midpoint
  e.push(eInsert('SUPPORT', 'PIPE_SUPPORT', 5000, 4000, 0));
  e.push(eInsert('SUPPORT', 'PIPE_SUPPORT', 7500, 8000, 0));

  // =========================================================================
  // BRANCH B DN150 — straight LINE at x=12500 going north 12000
  // =========================================================================
  e.push(eLine(L_150, 12500, 0, 0, 12500, 12000, 0));

  // ARC elbow at top (make it a 90° elbow going east)
  e.push(eArc(L_150, 14000, 12000, 0, 1500, 90, 180));

  // Flanges at branch B ends
  e.push(eCircle('FLANGE', 12500, 0, 0, OD_DN150 / 2));
  e.push(eCircle('FLANGE', 12500, 12000, 0, OD_DN150 / 2));

  // BALL_VALVE on branch B
  e.push(eInsert('VALVE', 'BALL_VALVE', 12500, 6000, 0));

  // TEE at branch B take-off
  e.push(eInsert('0', 'TEE_FITTING', 12500, 0, 0));

  // PIPE_SUPPORT
  e.push(eInsert('SUPPORT', 'PIPE_SUPPORT', 12500, 6000, 0));

  // =========================================================================
  // BRANCH C DN150 — LWPOLYLINE Z-shape at x=25000 (3 segments)
  // =========================================================================
  e.push(eLwPolyline(L_150, [
    { x: 25000, y: 0 },
    { x: 25000, y: 5000 },
    { x: 30000, y: 5000 },
    { x: 30000, y: 10000 },
  ], 0));

  // ARC elbow at first corner (25000,5000)→east
  e.push(eArc(L_150, 26500, 5000, 0, 1500, 180, 270));
  // ARC elbow at second corner (30000,5000)→north
  e.push(eArc(L_150, 30000, 6500, 0, 1500, 270, 360));

  // Flanges
  e.push(eCircle('FLANGE', 25000, 0, 0, OD_DN150 / 2));
  e.push(eCircle('FLANGE', 30000, 10000, 0, OD_DN150 / 2));

  // CHECK_VALVE on branch C
  e.push(eInsert('VALVE', 'CHECK_VALVE', 25000, 2500, 0));

  // TEE at branch C take-off
  e.push(eInsert('0', 'TEE_FITTING', 25000, 0, 0));

  // PIPE_SUPPORT
  e.push(eInsert('SUPPORT', 'PIPE_SUPPORT', 25000, 2500, 0));
  e.push(eInsert('SUPPORT', 'PIPE_SUPPORT', 27500, 5000, 0));
  e.push(eInsert('SUPPORT', 'PIPE_SUPPORT', 30000, 7500, 0));

  // =========================================================================
  // BRANCH D DN100 — short LINE at x=37500 going north 3000
  // =========================================================================
  e.push(eLine(L_100, 37500, 0, 0, 37500, 3000, 0));

  // Flanges
  e.push(eCircle('FLANGE', 37500, 0, 0, OD_DN100 / 2));
  e.push(eCircle('FLANGE', 37500, 3000, 0, OD_DN100 / 2));

  // TEE at branch D take-off
  e.push(eInsert('0', 'TEE_FITTING', 37500, 0, 0));

  // PIPE_SUPPORT
  e.push(eInsert('SUPPORT', 'PIPE_SUPPORT', 37500, 1500, 0));

  // =========================================================================
  // INSTRUMENT LEADS DN100
  // =========================================================================
  // From branch A at (5000,4000)
  e.push(eLine('INSTRUMENT', 5000, 4000, 0, 3000, 4000, 0));
  // From branch B at (12500,6000)
  e.push(eLine('INSTRUMENT', 12500, 6000, 0, 14500, 6000, 0));
  // From branch C at (27500,5000)
  e.push(eLine('INSTRUMENT', 27500, 5000, 0, 27500, 7000, 0));
  // From branch D at (37500,1500)
  e.push(eLine('INSTRUMENT', 37500, 1500, 0, 39500, 1500, 0));

  // Flanges on instrument leads
  e.push(eCircle('FLANGE', 3000, 4000, 0, OD_DN100 / 2));
  e.push(eCircle('FLANGE', 14500, 6000, 0, OD_DN100 / 2));
  e.push(eCircle('FLANGE', 27500, 7000, 0, OD_DN100 / 2));
  e.push(eCircle('FLANGE', 39500, 1500, 0, OD_DN100 / 2));

  // =========================================================================
  // VERTICAL RISER DN150 — z variation at (25000,0,0) → (25000,0,6000)
  // =========================================================================
  e.push(eLine(L_150, 25000, 0, 0, 25000, 0, 6000));
  e.push(eCircle('FLANGE', 25000, 0, 6000, OD_DN150 / 2));

  // =========================================================================
  // PUMP_NOZZLE INSERT → FITTING
  // =========================================================================
  e.push(eInsert('0', 'PUMP_NOZZLE', 50000, 0, 0));
  e.push(eInsert('0', 'PUMP_NOZZLE', 0, 0, 0, 1, 1, 1, 180));

  // =========================================================================
  // TEXT annotations
  // =========================================================================
  e.push(eText('ANNOTATION', 0, -1500, 0, 500, 'HEADER-DN200-CS-GAS'));
  e.push(eText('ANNOTATION', 5000, 8500, 0, 400, 'BRANCH-A-DN150'));
  e.push(eText('ANNOTATION', 12500, 12500, 0, 400, 'BRANCH-B-DN150'));
  e.push(eText('ANNOTATION', 25000, 10500, 0, 400, 'BRANCH-C-DN150'));
  e.push(eText('ANNOTATION', 37500, 3500, 0, 400, 'BRANCH-D-DN100'));
  e.push(eText('ANNOTATION', 8000, 500, 0, 350, 'GV-001'));
  e.push(eText('ANNOTATION', 20000, 500, 0, 350, 'GV-002'));
  e.push(eText('ANNOTATION', 40000, 500, 0, 350, 'GV-003'));
  e.push(eText('ANNOTATION', 5000, 4500, 0, 350, 'BV-A01'));
  e.push(eText('ANNOTATION', 12500, 6500, 0, 350, 'BV-B01'));
  e.push(eText('ANNOTATION', 25000, 3000, 0, 350, 'CV-C01'));

  // =========================================================================
  // MTEXT with service descriptions
  // =========================================================================
  e.push(eMtext('ANNOTATION', 0, -3000, 0, 600, 'PIPING RACK PR-01\\nSERVICE: NATURAL GAS\\nDESIGN PRESS: 50 barg\\nDESIGN TEMP: 65 degC'));
  e.push(eMtext('ANNOTATION', 25000, -3000, 0, 500, 'ISOMETRIC REF: ISO-PR01-001\\nLINE CLASS: 150-CS-G1-N'));
  e.push(eMtext('ANNOTATION', 50000, -1500, 0, 450, 'BATTERY LIMIT\\nTIE-IN POINT: TI-001'));

  // =========================================================================
  // POINT survey markers
  // =========================================================================
  e.push(ePoint('ANNOTATION', 0, 0, 0));
  e.push(ePoint('ANNOTATION', 50000, 0, 0));
  e.push(ePoint('ANNOTATION', 25000, 0, 0));
  e.push(ePoint('ANNOTATION', 5000, 8000, 0));
  e.push(ePoint('ANNOTATION', 12500, 12000, 0));
  e.push(ePoint('ANNOTATION', 30000, 10000, 0));
  e.push(ePoint('ANNOTATION', 37500, 3000, 0));
  e.push(ePoint('ANNOTATION', 25000, 0, 6000));

  // =========================================================================
  // SPLINE — sine-wave guide route, NOT supported → exercises skip path
  // =========================================================================
  const splineCtrl = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    splineCtrl.push({
      x: t * 50000,
      y: -5000 + Math.sin(t * Math.PI * 2) * 2000,
      z: 0,
    });
  }
  e.push(eSpline('ANNOTATION', splineCtrl));

  return r0('SECTION') + r2('ENTITIES') + e.join('') + r0('ENDSEC');
}

// ---------------------------------------------------------------------------
// Assemble full DXF
// ---------------------------------------------------------------------------
function buildDxf() {
  let dxf = '';
  dxf += buildHeader();
  dxf += buildTables();
  dxf += buildBlocks();
  dxf += buildEntities();
  dxf += r0('EOF');
  return dxf;
}

// ---------------------------------------------------------------------------
// Count entity types in output for verification
// ---------------------------------------------------------------------------
function countEntities(dxf) {
  const counts = {};
  const re = /^\s*0\s*\n([A-Z_]+)\s*$/gm;
  let m;
  const skip = new Set(['SECTION', 'ENDSEC', 'TABLE', 'ENDTAB', 'BLOCK', 'ENDBLK', 'EOF']);
  while ((m = re.exec(dxf)) !== null) {
    const t = m[1].trim();
    if (!skip.has(t) && t !== 'BLOCK_RECORD' && t !== 'LAYER' && t !== 'LTYPE'
        && t !== 'STYLE' && t !== 'VIEW' && t !== 'UCS' && t !== 'APPID'
        && t !== 'DIMSTYLE') {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
const outDir  = path.resolve(__dirname, '..', 'test');
const outFile = path.join(outDir, 'benchmark-piping-rack.dxf');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const dxf = buildDxf();
fs.writeFileSync(outFile, dxf, 'utf8');

const counts = countEntities(dxf);
const total  = Object.values(counts).reduce((a, b) => a + b, 0);

console.log('DXF written to:', outFile);
console.log('File size     :', (fs.statSync(outFile).size / 1024).toFixed(1), 'KB');
console.log('\nEntity counts:');
for (const [k, v] of Object.entries(counts).sort()) {
  console.log(`  ${k.padEnd(20)} ${v}`);
}
console.log(`  ${'TOTAL'.padEnd(20)} ${total}`);
console.log('\nSUCCESS — benchmark DXF generated.');
