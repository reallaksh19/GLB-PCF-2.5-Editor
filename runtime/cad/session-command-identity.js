// Semantic request identity excludes provider execution caches and transport metadata.
const excluded = new Set(['executed','transactionId','baseRevision','documentId',
  'snapshots','beforeSnapshot','createdEntities','deletedRecords']);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new TypeError('Unsupported command parameter');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Non-finite command parameter');
  return value;
}
export function commandIdentity(command) {
  if (!command || typeof command.execute !== 'function') throw new TypeError('Executable CAD command required');
  const parameters = Object.fromEntries(Object.keys(command).sort()
    .filter(key => !key.startsWith('_') && !excluded.has(key))
    .map(key => [key, key === 'commands' ? command[key].map(commandIdentity) : canonical(command[key])]));
  return JSON.stringify({type:command.constructor.name, parameters});
}

// Direct fallback snapshots wire inputs while keeping local provider prototypes and collection slots.
export function snapshotSubmission(value, memo = new Map()) {
  if (value === null || typeof value !== 'object') return value;
  if (memo.has(value)) return memo.get(value);
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) return value.slice();
  if (value instanceof Map) {
    const out = new Map(); memo.set(value, out);
    for (const [key, item] of value) out.set(snapshotSubmission(key, memo), snapshotSubmission(item, memo));
    return out;
  }
  if (value instanceof Set) {
    const out = new Set(); memo.set(value, out);
    for (const item of value) out.add(snapshotSubmission(item, memo));
    return out;
  }
  const out = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  memo.set(value, out);
  for (const key of Object.keys(value)) out[key] = snapshotSubmission(value[key], memo);
  return out;
}
