import {snapshotEntityState,restoreEntityState} from './change-set.js';
export function commandIds(command) {
  return command.commands ? command.commands.flatMap(commandIds) : command.entityIds || command.sourceEntityIds || [command.entityId].filter(Boolean);
}
/** Private touched-source images; index membership is restored if commit fails. */
export function checkpoint(document,command) {
  return {entities:[...document.entities],modelSpace:[...document.modelSpace],paperSpaces:new Map([...document.paperSpaces].map(([k,v])=>[k,[...v]])),
    index:new Map(document.entityIndex),layers:new Map([...document.layerEntityIndex].map(([k,v])=>[k,new Set(v)])),
    images:new Map([...new Set(commandIds(command))].map(id=>document.getEntity(id)).filter(Boolean).map(e=>[e,snapshotEntityState(e)])),
    handles:new Set(document.handles.knownHandles),next:document.handles.nextNumericHandle};
}
export function rollback(document,state) {
  for(const [entity,image] of state.images) restoreEntityState(entity,image);
  document.entities=state.entities;document.modelSpace=state.modelSpace;document.paperSpaces=state.paperSpaces;
  document.entityIndex=state.index;document.entitiesById=state.index;document.layerEntityIndex=state.layers;
  for(const entity of state.images.keys()) document.adoptEntity(entity,entity.definitionId);
  document.handles.knownHandles=state.handles;document.handles.nextNumericHandle=state.next;
}
export function atomically(document,command,operation) {
  const state=checkpoint(document,command);
  try {return operation();} catch(error) {rollback(document,state);throw error;}
}
