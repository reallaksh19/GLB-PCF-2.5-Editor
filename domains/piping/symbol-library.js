import { createSupportSymbol } from '../../geometry/symbols.js';
import { capabilities } from '../../js/capabilities/capability-registry.js';

const _DIR_TO_KIND = {
  DOWN: 'REST', UP: 'REST',
  NORTH: 'GUIDE', SOUTH: 'GUIDE', EAST: 'GUIDE', WEST: 'GUIDE',
  NORTHEAST: 'GUIDE', NORTHWEST: 'GUIDE', SOUTHEAST: 'GUIDE', SOUTHWEST: 'GUIDE',
};

export function buildSupportSymbol(comp) {
  const origin = comp.geometry.origin;
  if (!origin) return null;

  const attrs = comp.attributes || {};

  // Tier 1: explicit SUPPORT-KIND attribute
  const explicitKind = (attrs['SUPPORT-KIND'] || attrs['SUPPORT_KIND'] || '').toUpperCase().trim();

  // Tier 2: SUPPORT-DIRECTION → kind
  const direction = (attrs['SUPPORT-DIRECTION'] || '').toUpperCase().trim();
  const dirKind   = _DIR_TO_KIND[direction] || null;

  // Tier 3: heuristic on support name / tag
  const sName = String(
    attrs['<SUPPORT_NAME>'] || attrs['SUPPORT_NAME'] || attrs['SUPPORT-NAME'] || ''
  ).toUpperCase();
  const heuristicGuide  = sName.includes('GUIDE') || sName.includes('GD');
  const heuristicAnchor = sName.includes('ANCHOR') || sName.includes('FIX') || sName.includes('ANC');
  const heuristicSpring = sName.includes('SPRING') || sName.includes('SPR');

  let kind;
  if      (explicitKind === 'REST')   kind = 'REST';
  else if (explicitKind === 'GUIDE')  kind = 'GUIDE';
  else if (explicitKind === 'ANCHOR') kind = 'ANCHOR';
  else if (explicitKind === 'SPRING') kind = 'SPRING';
  else if (dirKind)                   kind = dirKind;
  else if (heuristicAnchor)           kind = 'ANCHOR';
  else if (heuristicGuide)            kind = 'GUIDE';
  else if (heuristicSpring)           kind = 'SPRING';
  else                                kind = 'REST';

  const group = createSupportSymbol(origin, kind, null, comp.geometry.bore || 100);
  if (!group) return null;

  group.userData = {
    compId:  comp.id,
    pcfType: 'SUPPORT',
    kind,
    ...attrs,
  };

  return group;
}

// ─── Self-check (runs only in dev mode) ───────────────────────────────────────
async function _selfCheck() {
  const { MOCK_PCF_TEXT, MOCK_EXPECTED } = await import('../../js/mock/mock-data.js');
  const { parsePcf } = await import('./parser.js');

  const mockLog = { info:()=>{}, warn:()=>{}, error:()=>{}, count:()=>0 };
  const components = parsePcf(MOCK_PCF_TEXT, mockLog);
  const failures = [];

  const supportComp = components.find(c => c.type === 'SUPPORT');
  if (supportComp) {
    const symbol = buildSupportSymbol(supportComp);
    if (!symbol) {
      failures.push('SUPPORT symbol failed to build');
    } else if (symbol.userData.kind !== MOCK_EXPECTED.pcf.supportKind) {
      failures.push(`SUPPORT kind: expected ${MOCK_EXPECTED.pcf.supportKind}, got ${symbol.userData.kind}`);
    }
  } else {
    failures.push('No SUPPORT component found in mock data');
  }

  return { pass: failures.length === 0, failures };
}

if (typeof window !== 'undefined' && window.__GLB_PCF_DEV__) {
  _selfCheck().then(({ pass, failures }) => {
    if (pass) capabilities.ready('support-symbols');
    else       capabilities.fail('support-symbols', failures);
  });
}
