import { splitPcfBlocks }     from '../../js/vendor/splitPcfBlocks.js';
import { parsePcfText }       from '../../js/vendor/parsePcfText.js';
import { normalizePcfModel }  from '../../js/vendor/normalizePcfModel.js';
import { toGenericComponent }  from '../../core/component-model.js';
import { capabilities } from '../../js/capabilities/capability-registry.js';

export function parsePcf(text, log) {
  if (!text || typeof text !== 'string') {
    log.error('PCF_PARSE_FAIL', { message: 'Input text is empty or invalid' });
    return [];
  }

  try {
    log.info('PCF_PARSE_START', { lineCount: text.split('\n').length });

    const parsed     = parsePcfText(text, log);
    const model      = normalizePcfModel(parsed, log);

    const components = (model.components || []).map(comp => toGenericComponent(comp));

    log.info('PCF_PARSE_DONE', {
      componentCount: components.length,
      warnCount: log.count('WARN'),
    });

    return components;
  } catch (err) {
    log.error('PCF_PARSE_ERROR', { error: err.message });
    return [];
  }
}

// ─── Self-check (runs only in dev mode) ───────────────────────────────────────
async function _selfCheck() {
  const { MOCK_PCF_TEXT, MOCK_EXPECTED } = await import('../../js/mock/mock-data.js');
  const failures = [];

  // ── Run the thing ──────────────────────────────────────────────────
  const mockLog = {
    info: () => {},
    warn: () => {},
    error: () => {},
    count: () => 0
  };
  const result = parsePcf(MOCK_PCF_TEXT, mockLog);

  // ── Assert quantitative outcomes ───────────────────────────────────
  if (result.length !== MOCK_EXPECTED.pcf.componentCount) {
    failures.push(`componentCount: expected ${MOCK_EXPECTED.pcf.componentCount}, got ${result.length}`);
  }

  const pipes = result.filter(c => c.type === 'PIPE');
  if (pipes.length !== MOCK_EXPECTED.pcf.byType.PIPE) {
    failures.push(`PIPE count: expected ${MOCK_EXPECTED.pcf.byType.PIPE}, got ${pipes.length}`);
  }

  // Check structure criteria
  const hasIdAndType = result.every(c => typeof c.id === 'string' && typeof c.type === 'string');
  if (!hasIdAndType) {
    failures.push('Missing id or type in some components');
  }

  return { pass: failures.length === 0, failures };
}

if (typeof window !== 'undefined' && window.__GLB_PCF_DEV__) {
  _selfCheck().then(({ pass, failures }) => {
    if (pass) capabilities.ready('pcf-parse');
    else       capabilities.fail('pcf-parse', failures);
  });
}
