export function occurrenceIdentity(entity, blockContext) {
  const sourceEntityId = blockContext?.rootInsertId || entity.id;
  if (!sourceEntityId || !entity.id) throw new Error('Projection requires document-scoped source identities');
  const instancePath = (blockContext?.instancePath || []).map(step => ({ ...step }));
  return {
    id: `render:${JSON.stringify([sourceEntityId, instancePath, entity.id])}`,
    sourceEntityId,
    occurrence: { rootEntityId: sourceEntityId, leafEntityId: entity.id, instancePath },
  };
}
