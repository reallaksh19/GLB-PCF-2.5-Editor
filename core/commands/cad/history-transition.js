import {snapshotEntityState,restoreEntityState} from './change-set.js';
const runtimeKeys=['createdEntity','createdArc','createdPolyline','createdEntities','removedEntities','snapshots','deletedRecords','beforeSnapshot','beforeSnapshots','preSnapshot'];
function caches(command,out=[]) {
  out.push([command,Object.fromEntries(runtimeKeys.filter(k=>k in command).map(k=>[k,command[k]]))]);
  command.commands?.forEach(child=>caches(child,out));return out;
}
/** A private committed native plan is replayed without reallocating generated identities. */
export function recordTransition(document,before,changeSet,command) {
  const old=new Set(before),present=new Set(document.entities),positions=new Map(document.entities.map((e,i)=>[e.id,i]));
  return {images:changeSet.affectedIds.map(id=>document.entityIndex.get(id)).filter(Boolean).map(e=>[e,snapshotEntityState(e)]),
    added:document.entities.filter(e=>!old.has(e)).map(e=>[e,positions.get(e.id)]),removed:before.filter(e=>!present.has(e)),runtime:caches(command)};
}
export function replayTransition(document,plan) {
  for(const e of plan.removed)document.removeEntity(e);
  for(const [entity,image] of plan.images)restoreEntityState(entity,image,document);
  for(const [entity,index] of plan.added)document.addEntity(entity,index);
  for(const [entity] of plan.images)document.adoptEntity(entity,entity.definitionId);
  for(const [command,values] of plan.runtime)Object.assign(command,values,{executed:true});
}
