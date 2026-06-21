import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fmt = v => Number(v).toFixed(4);
const rec = (code, value) => `${String(code).padStart(3, ' ')}\n${value}\n`;
const r0 = v => rec(0, v), r1 = v => rec(1, v), r2 = v => rec(2, v), r3 = v => rec(3, v), r5 = v => rec(5, v), r6 = v => rec(6, v), r8 = v => rec(8, v);
const r10 = v => rec(10, fmt(v)), r11 = v => rec(11, fmt(v)), r20 = v => rec(20, fmt(v)), r21 = v => rec(21, fmt(v)), r30 = v => rec(30, fmt(v)), r31 = v => rec(31, fmt(v));
const r40 = v => rec(40, fmt(v)), r41 = v => rec(41, fmt(v)), r42 = v => rec(42, fmt(v)), r43 = v => rec(43, fmt(v)), r50 = v => rec(50, fmt(v)), r51 = v => rec(51, fmt(v));
const r62 = v => rec(62, v), r70 = v => rec(70, v), r71 = v => rec(71, v), r72 = v => rec(72, v), r73 = v => rec(73, v), r90 = v => rec(90, v), r100 = v => rec(100, v);
let handleSeq = 1;
const nextHandle = () => (handleSeq++).toString(16).toUpperCase().padStart(4, '0');
const join = (...parts) => parts.join('');
const LAYERS = [
  ['0', 7], ['PIPE-DN200', 5], ['PIPE-DN150', 3], ['PIPE-DN100', 1],
  ['VALVE', 6], ['FLANGE', 2], ['SUPPORT', 4], ['INSTRUMENT', 30], ['ANNOTATION', 7],
];
function buildHeader() {
  return join(
    r0('SECTION'), r2('HEADER'),
    rec(9, '$ACADVER'), r1('AC1015'),
    rec(9, '$INSUNITS'), r70(4),
    rec(9, '$EXTMIN'), r10(-1000), r20(-15000), r30(-1000),
    rec(9, '$EXTMAX'), r10(55000), r20(15000), r30(7000),
    rec(9, '$LUNITS'), r70(2),
    rec(9, '$ANGBASE'), r50(0),
    r0('ENDSEC')
  );
}
function table(name, max, body = '') {
  return join(r0('TABLE'), r2(name), r5(nextHandle()), r100('AcDbSymbolTable'), r70(max), body, r0('ENDTAB'));
}
function buildTables() {
  const ltype = join(
    r0('LTYPE'), r5(nextHandle()), r100('AcDbSymbolTableRecord'), r100('AcDbLinetypeTableRecord'),
    r2('Continuous'), r70(64), r3('Solid line'), r72(65), r73(0), r40(0)
  );
  const layerRows = LAYERS.map(([name, color]) => join(
    r0('LAYER'), r5(nextHandle()), r100('AcDbSymbolTableRecord'), r100('AcDbLayerTableRecord'),
    r2(name), r70(0), r62(color), r6('Continuous')
  )).join('');
  const style = join(
    r0('STYLE'), r5(nextHandle()), r100('AcDbSymbolTableRecord'), r100('AcDbTextStyleTableRecord'),
    r2('Standard'), r70(0), r40(0), r41(1), r50(0), r71(0), r42(2.5), r1(''), r3('')
  );
  const appid = join(
    r0('APPID'), r5(nextHandle()), r100('AcDbSymbolTableRecord'), r100('AcDbRegAppTableRecord'), r2('ACAD'), r70(0)
  );
  const dimstyle = join(
    r0('DIMSTYLE'), r5(nextHandle()), r100('AcDbSymbolTableRecord'), r100('AcDbDimStyleTableRecord'), r2('Standard'), r70(0)
  );
  const blockNames = ['*Model_Space', '*Paper_Space', 'GATE_VALVE', 'BALL_VALVE', 'CHECK_VALVE', 'PIPE_SUPPORT', 'TEE_FITTING', 'PUMP_NOZZLE'];
  const blockRecords = blockNames.map(name => join(
    r0('BLOCK_RECORD'), r5(nextHandle()), r100('AcDbSymbolTableRecord'), r100('AcDbBlockTableRecord'), r2(name)
  )).join('');
  return join(
    r0('SECTION'), r2('TABLES'),
    table('LTYPE', 1, ltype),
    table('LAYER', LAYERS.length, layerRows),
    table('STYLE', 1, style),
    table('VIEW', 0),
    table('UCS', 0),
    table('APPID', 1, appid),
    table('DIMSTYLE', 1, dimstyle),
    table('BLOCK_RECORD', blockNames.length, blockRecords),
    r0('ENDSEC')
  );
}
function blockDef(name, x, y, z, contents) {
  return join(
    r0('BLOCK'), r5(nextHandle()), r8('0'), r100('AcDbEntity'), r100('AcDbBlockBegin'),
    r2(name), r70(0), r10(x), r20(y), r30(z), r3(name), r1(''), contents,
    r0('ENDBLK'), r5(nextHandle()), r8('0'), r100('AcDbEntity'), r100('AcDbBlockEnd')
  );
}
function eLine(layer, x1, y1, z1, x2, y2, z2) {
  return join(r0('LINE'), r5(nextHandle()), r8(layer), r100('AcDbEntity'), r100('AcDbLine'), r10(x1), r20(y1), r30(z1), r11(x2), r21(y2), r31(z2));
}
const crosshairLines = size => eLine('0', -size, 0, 0, size, 0, 0) + eLine('0', 0, -size, 0, 0, size, 0);
function buildBlocks() {
  return join(
    r0('SECTION'), r2('BLOCKS'),
    blockDef('*Model_Space', 0, 0, 0, ''),
    blockDef('*Paper_Space', 0, 0, 0, ''),
    blockDef('GATE_VALVE', 0, 0, 0, crosshairLines(200)),
    blockDef('BALL_VALVE', 0, 0, 0, crosshairLines(150)),
    blockDef('CHECK_VALVE', 0, 0, 0, crosshairLines(150)),
    blockDef('PIPE_SUPPORT', 0, 0, 0, crosshairLines(300)),
    blockDef('TEE_FITTING', 0, 0, 0, crosshairLines(150)),
    blockDef('PUMP_NOZZLE', 0, 0, 0, crosshairLines(250)),
    r0('ENDSEC')
  );
}
function eLwPolyline(layer, vertices, elevation) {
  return join(
    r0('LWPOLYLINE'), r5(nextHandle()), r8(layer), r100('AcDbEntity'), r100('AcDbPolyline'),
    r70(0), r90(vertices.length), rec(38, fmt(elevation || 0)),
    vertices.map(v => r10(v.x) + r20(v.y)).join('')
  );
}
function eArc(layer, cx, cy, cz, radius, startDeg, endDeg) {
  return join(r0('ARC'), r5(nextHandle()), r8(layer), r100('AcDbEntity'), r100('AcDbCircle'), r10(cx), r20(cy), r30(cz), r40(radius), r100('AcDbArc'), r50(startDeg), r51(endDeg));
}
function eCircle(layer, cx, cy, cz, radius) {
  return join(r0('CIRCLE'), r5(nextHandle()), r8(layer), r100('AcDbEntity'), r100('AcDbCircle'), r10(cx), r20(cy), r30(cz), r40(radius));
}
function eInsert(layer, blockName, x, y, z, sx = 1, sy = 1, sz = 1, rotDeg = 0) {
  return join(r0('INSERT'), r5(nextHandle()), r8(layer), r100('AcDbEntity'), r100('AcDbBlockReference'), r2(blockName), r10(x), r20(y), r30(z), r41(sx), r42(sy), r43(sz), r50(rotDeg));
}
function eText(layer, x, y, z, height, text) {
  return join(r0('TEXT'), r5(nextHandle()), r8(layer), r100('AcDbEntity'), r100('AcDbText'), r10(x), r20(y), r30(z), r40(height), r1(text), r100('AcDbText'));
}
function eMtext(layer, x, y, z, height, text) {
  return join(r0('MTEXT'), r5(nextHandle()), r8(layer), r100('AcDbEntity'), r100('AcDbMText'), r10(x), r20(y), r30(z), r40(height), r41(5000), r71(1), r72(1), r1(text));
}
function ePoint(layer, x, y, z) {
  return join(r0('POINT'), r5(nextHandle()), r8(layer), r100('AcDbEntity'), r100('AcDbPoint'), r10(x), r20(y), r30(z));
}
function eSpline(layer, controlPts) {
  const n = controlPts.length;
  const knots = [0, 0, 0, 0];
  for (let i = 1; i < n - 3; i++) knots.push(i / (n - 3));
  knots.push(1, 1, 1, 1);
  return join(
    r0('SPLINE'), r5(nextHandle()), r8(layer), r100('AcDbEntity'), r100('AcDbSpline'),
    rec(70, 8), rec(71, 3), rec(72, controlPts.length + 4), rec(73, controlPts.length), rec(74, 0),
    rec(42, '0.0000000001'), rec(43, '0.0000000001'),
    knots.map(k => rec(40, fmt(k))).join(''),
    controlPts.map(pt => r10(pt.x) + r20(pt.y) + r30(pt.z)).join('')
  );
}
function buildEntities() {
  const e = [];
  const OD_DN200 = 219.1, OD_DN150 = 168.3, OD_DN100 = 114.3;
  const L_MAIN = 'PIPE-DN200', L_150 = 'PIPE-DN150', L_100 = 'PIPE-DN100';
  e.push(eLine(L_MAIN, 0, 0, 0, 50000, 0, 0));
  e.push(eCircle('FLANGE', 0, 0, 0, OD_DN200 / 2), eCircle('FLANGE', 50000, 0, 0, OD_DN200 / 2));
  for (let x = 0; x <= 50000; x += 6000) e.push(eInsert('SUPPORT', 'PIPE_SUPPORT', x, 0, 0));
  e.push(eInsert('VALVE', 'GATE_VALVE', 8000, 0, 0), eInsert('VALVE', 'GATE_VALVE', 20000, 0, 0), eInsert('VALVE', 'GATE_VALVE', 40000, 0, 0));
  e.push(eLwPolyline(L_150, [{ x: 5000, y: 0 }, { x: 5000, y: 8000 }, { x: 10000, y: 8000 }], 0));
  e.push(eArc(L_150, 6500, 6500, 0, 1500, 270, 360));
  e.push(eCircle('FLANGE', 5000, 0, 0, OD_DN150 / 2), eCircle('FLANGE', 10000, 8000, 0, OD_DN150 / 2));
  e.push(eInsert('VALVE', 'BALL_VALVE', 5000, 4000, 0), eInsert('0', 'TEE_FITTING', 5000, 0, 0));
  e.push(eInsert('SUPPORT', 'PIPE_SUPPORT', 5000, 4000, 0), eInsert('SUPPORT', 'PIPE_SUPPORT', 7500, 8000, 0));
  e.push(eLine(L_150, 12500, 0, 0, 12500, 12000, 0));
  e.push(eArc(L_150, 14000, 12000, 0, 1500, 90, 180));
  e.push(eCircle('FLANGE', 12500, 0, 0, OD_DN150 / 2), eCircle('FLANGE', 12500, 12000, 0, OD_DN150 / 2));
  e.push(eInsert('VALVE', 'BALL_VALVE', 12500, 6000, 0), eInsert('0', 'TEE_FITTING', 12500, 0, 0), eInsert('SUPPORT', 'PIPE_SUPPORT', 12500, 6000, 0));
  e.push(eLwPolyline(L_150, [{ x: 25000, y: 0 }, { x: 25000, y: 5000 }, { x: 30000, y: 5000 }, { x: 30000, y: 10000 }], 0));
  e.push(eArc(L_150, 26500, 5000, 0, 1500, 180, 270), eArc(L_150, 30000, 6500, 0, 1500, 270, 360));
  e.push(eCircle('FLANGE', 25000, 0, 0, OD_DN150 / 2), eCircle('FLANGE', 30000, 10000, 0, OD_DN150 / 2));
  e.push(eInsert('VALVE', 'CHECK_VALVE', 25000, 2500, 0), eInsert('0', 'TEE_FITTING', 25000, 0, 0));
  e.push(eInsert('SUPPORT', 'PIPE_SUPPORT', 25000, 2500, 0), eInsert('SUPPORT', 'PIPE_SUPPORT', 27500, 5000, 0), eInsert('SUPPORT', 'PIPE_SUPPORT', 30000, 7500, 0));
  e.push(eLine(L_100, 37500, 0, 0, 37500, 3000, 0));
  e.push(eCircle('FLANGE', 37500, 0, 0, OD_DN100 / 2), eCircle('FLANGE', 37500, 3000, 0, OD_DN100 / 2));
  e.push(eInsert('0', 'TEE_FITTING', 37500, 0, 0), eInsert('SUPPORT', 'PIPE_SUPPORT', 37500, 1500, 0));
  e.push(eLine('INSTRUMENT', 5000, 4000, 0, 3000, 4000, 0), eLine('INSTRUMENT', 12500, 6000, 0, 14500, 6000, 0), eLine('INSTRUMENT', 27500, 5000, 0, 27500, 7000, 0), eLine('INSTRUMENT', 37500, 1500, 0, 39500, 1500, 0));
  e.push(eCircle('FLANGE', 3000, 4000, 0, OD_DN100 / 2), eCircle('FLANGE', 14500, 6000, 0, OD_DN100 / 2), eCircle('FLANGE', 27500, 7000, 0, OD_DN100 / 2), eCircle('FLANGE', 39500, 1500, 0, OD_DN100 / 2));
  e.push(eLine(L_150, 25000, 0, 0, 25000, 0, 6000), eCircle('FLANGE', 25000, 0, 6000, OD_DN150 / 2));
  e.push(eInsert('0', 'PUMP_NOZZLE', 50000, 0, 0), eInsert('0', 'PUMP_NOZZLE', 0, 0, 0, 1, 1, 1, 180));
  for (const [x, y, z, h, text] of [
    [0, -1500, 0, 500, 'HEADER-DN200-CS-GAS'], [5000, 8500, 0, 400, 'BRANCH-A-DN150'], [12500, 12500, 0, 400, 'BRANCH-B-DN150'],
    [25000, 10500, 0, 400, 'BRANCH-C-DN150'], [37500, 3500, 0, 400, 'BRANCH-D-DN100'], [8000, 500, 0, 350, 'GV-001'],
    [20000, 500, 0, 350, 'GV-002'], [40000, 500, 0, 350, 'GV-003'], [5000, 4500, 0, 350, 'BV-A01'], [12500, 6500, 0, 350, 'BV-B01'], [25000, 3000, 0, 350, 'CV-C01'],
  ]) e.push(eText('ANNOTATION', x, y, z, h, text));
  e.push(eMtext('ANNOTATION', 0, -3000, 0, 600, 'PIPING RACK PR-01\nSERVICE: NATURAL GAS\nDESIGN PRESS: 50 barg\nDESIGN TEMP: 65 degC'));
  e.push(eMtext('ANNOTATION', 25000, -3000, 0, 500, 'ISOMETRIC REF: ISO-PR01-001\nLINE CLASS: 150-CS-G1-N'));
  e.push(eMtext('ANNOTATION', 50000, -1500, 0, 450, 'BATTERY LIMIT\nTIE-IN POINT: TI-001'));
  for (const [x, y, z] of [[0, 0, 0], [50000, 0, 0], [25000, 0, 0], [5000, 8000, 0], [12500, 12000, 0], [30000, 10000, 0], [37500, 3000, 0], [25000, 0, 6000]]) e.push(ePoint('ANNOTATION', x, y, z));
  const splineCtrl = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    splineCtrl.push({ x: t * 50000, y: -5000 + Math.sin(t * Math.PI * 2) * 2000, z: 0 });
  }
  e.push(eSpline('ANNOTATION', splineCtrl));
  return r0('SECTION') + r2('ENTITIES') + e.join('') + r0('ENDSEC');
}
const buildDxf = () => buildHeader() + buildTables() + buildBlocks() + buildEntities() + r0('EOF');
function countEntities(dxf) {
  const counts = {}, re = /^\s*0\s*\n([A-Z_]+)\s*$/gm;
  const skip = new Set(['SECTION', 'ENDSEC', 'TABLE', 'ENDTAB', 'BLOCK', 'ENDBLK', 'EOF', 'BLOCK_RECORD', 'LAYER', 'LTYPE', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE']);
  let m;
  while ((m = re.exec(dxf)) !== null) {
    const t = m[1].trim();
    if (!skip.has(t)) counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}
const outDir = path.resolve(__dirname, '..', 'test');
const outFile = path.join(outDir, 'benchmark-piping-rack.dxf');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const dxf = buildDxf();
fs.writeFileSync(outFile, dxf, 'utf8');
const counts = countEntities(dxf);
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log('DXF written to:', outFile);
console.log('File size     :', (fs.statSync(outFile).size / 1024).toFixed(1), 'KB');
console.log('\nEntity counts:');
for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(20)} ${v}`);
console.log(`  ${'TOTAL'.padEnd(20)} ${total}`);
console.log('\nSUCCESS — benchmark DXF generated.');
