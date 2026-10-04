#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSourceBoundaries } from '../integration/cad/source-boundary-guard.mjs';

export function verifyCadBoundaries(root = process.cwd()) {
  const contractPath = path.join(root, 'docs/CAD_DOCUMENT_ARCHITECTURE.md');
  const required = ['Same-Format Save Serializes the Source Document', 'Cross-Format Export Is Explicitly Lossy', 'Source Coordinates Are Preserved Exactly', 'Entity Identity Preservation', 'Unknown and Unmodified Entity Passthrough', 'Stable Identity for Selection', 'Transactional Command Edits'];
  const content = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, 'utf8') : '';
  const missing = required.filter(s => !content.includes(s));
  const contract = { ok: missing.length === 0, path: contractPath, missing };
  const boundary = checkSourceBoundaries(root);
  return { passed: contract.ok && boundary.violations.length === 0, contract, boundary };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyCadBoundaries();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('Contract headings: ' + (result.contract.ok ? 'PASS' : 'FAIL'));
    console.log('Source boundary: ' + result.boundary.status + '; ' + result.boundary.scannedCount + ' source files, ' + result.boundary.traversedCount + ' dependency files inspected');
    for (const v of result.boundary.violations) console.error(v.file + ':' + v.line + ' ' + v.code + ': ' + v.reason);
    console.log('Static checks do not certify native fidelity, Save, runtime authority or complete CAD85 delivery.');
  }
  process.exitCode = result.passed ? 0 : 1;
}
