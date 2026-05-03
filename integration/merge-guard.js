/**
 * integration/merge-guard.js
 * Basic ownership and protected-file checks.
 */
import { OWNERSHIP_MAP, PROTECTED_FILES } from './ownership-map.js';

export function assertOwnedFiles(changedFiles, owner, ownershipMap = OWNERSHIP_MAP) {
  const allowed = ownershipMap[owner] || [];
  const violations = (changedFiles || []).filter(f => !allowed.some(prefix => f.startsWith(prefix)));
  if (violations.length) throw new Error(`Ownership violation by ${owner}: ${violations.join(', ')}`);
  return true;
}

export function isProtectedFile(file) {
  return PROTECTED_FILES.includes(file);
}
