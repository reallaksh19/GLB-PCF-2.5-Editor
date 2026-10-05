/** Strong source associations outside a destructive operand closure prevent commit. */
export function validateRemoval(document,entities) {
 const removed=new Set();
 const collect=e=>{if(e.handle)removed.add(e.handle);for(const child of [...e.attributes.subEntities || [],...e.attributes.attribs || []])collect(child);const seq=e.source.seqendRawTags?.find(t=>t.code===5)?.value;if(seq)removed.add(seq.trim().toUpperCase());};
 entities.forEach(collect);
 const liveIds=new Set(document.entityIndex.keys());
 for(const record of document.raw.records) {
   if(removed.has(record.handle))continue;
   // Records removed by previous transactions cannot retain a live association.
   if(record.type && ['LINE','ARC','CIRCLE','INSERT','POLYLINE','LWPOLYLINE','TEXT','MTEXT','VERTEX','ATTRIB'].includes(record.type) && !liveIds.has(record.id))continue;
   for(const t of record.rawTags)if(((t.code>=330 && t.code<=369)||(t.code>=390 && t.code<=399)||t.code===1005) && removed.has(t.value.trim().toUpperCase()))throw new Error('External source association prevents destructive edit');
 }
}
