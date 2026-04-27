function fmtPt(pt) {
  if (!pt) return '—';
  return `X=${Math.round(pt.x)}  Y=${Math.round(pt.y)}  Z=${Math.round(pt.z)}`;
}

export function getInfoPanelSections(comp) {
  const attrs = comp.attributes || {};
  const g     = comp.geometry   || {};
  const sections = [];

  // ─── ① Common ───────────────────────────────────────────────────────
  sections.push({
    title: 'Common',
    rows: [
      { label: 'Component ID',    value: comp.id   || '—' },
      { label: 'Type',            value: comp.type || '—', highlight: true },
      { label: 'Pipeline Ref',    value: attrs['PIPELINE-REFERENCE'] || '—' },
    ],
  });

  // ─── ② Geometry ─────────────────────────────────────────────────────
  const geoRows = [];
  if (g.bore != null)
    geoRows.push({ label: 'Bore / OD',  value: g.bore.toFixed(2) + ' mm' });
  if (g.ep1)
    geoRows.push({ label: 'Start (ep1)', value: fmtPt(g.ep1) });
  if (g.ep2)
    geoRows.push({ label: 'End (ep2)',   value: fmtPt(g.ep2) });
  if (g.cp)
    geoRows.push({ label: 'Centre (cp)', value: fmtPt(g.cp)  });
  if (g.bp)
    geoRows.push({ label: 'Branch (bp)', value: fmtPt(g.bp)  });
  if (geoRows.length)
    sections.push({ title: 'Geometry', rows: geoRows });

  // ─── ③ Process ──────────────────────────────────────────────────────
  const processRows = [
    { label: 'Temperature',     value: attrs['TEMPERATURE-1'] || attrs['T1'] || '' },
    { label: 'Pressure',        value: attrs['PRESSURE-1']    || attrs['P1'] || '' },
    { label: 'Material',        value: attrs['MATERIAL']      || '' },
    { label: 'Insulation Spec', value: attrs['INSULATION-SPEC'] || '' },
  ].filter(r => r.value);
  if (processRows.length)
    sections.push({ title: 'Process', rows: processRows });

  const insertionRows = [
    { label: 'Subtype',    value: attrs['SUBTYPE'] || '' },
    { label: 'Rating',     value: attrs['RATING'] || '' },
    { label: 'Size',       value: attrs['SIZE'] || '' },
    { label: 'Facing',     value: attrs['FACING'] || '' },
    { label: 'End Type',   value: attrs['ENDTYPE'] || attrs['END_TYPE'] || '' },
    { label: 'Angle',      value: attrs['ANGLE'] || '' },
    { label: 'Length',     value: attrs['LENGTH'] || '' },
    { label: 'Center To End', value: attrs['CENTER_TO_END'] || '' },
    { label: 'Branch Size',value: attrs['BRANCH_SIZE'] || '' },
    { label: 'Branch Len', value: attrs['BRANCH_LENGTH'] || '' },
    { label: 'Run C-E',    value: attrs['RUN_CENTER_TO_END'] || '' },
    { label: 'Branch C-E', value: attrs['BRANCH_CENTER_TO_END'] || '' },
    { label: 'Standard',   value: attrs['STANDARD'] || '' },
    { label: 'Bore Type',  value: attrs['BORE_TYPE'] || '' },
    { label: 'Weight',     value: attrs['WEIGHT'] || '' },
    { label: 'Match Key',  value: attrs['MATCHKEY'] || '' },
    { label: 'Provenance', value: attrs['PROVENANCE'] || '' },
  ].filter(r => r.value);
  if (insertionRows.length)
    sections.push({ title: 'Insertion', rows: insertionRows });

  // ─── ④ Support (only for SUPPORT type) ──────────────────────────────
  if (comp.type === 'SUPPORT') {
    const supportRows = [
      { label: 'Support Name', value: attrs['<SUPPORT_NAME>'] || attrs['SUPPORT_NAME'] || attrs['SUPPORT-NAME'] || '' },
      { label: 'Kind',         value: attrs['SUPPORT-KIND']      || '' },
      { label: 'Direction',    value: attrs['SUPPORT-DIRECTION'] || '' },
      { label: 'Tag',          value: attrs['SUPPORT-TAG']       || '' },
    ].filter(r => r.value);
    if (supportRows.length)
      sections.push({ title: 'Support', rows: supportRows });
  }

  return sections;
}
