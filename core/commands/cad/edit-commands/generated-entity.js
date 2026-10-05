import {validateNativeEntity} from '../../../../formats/dxf/writer/dxf-record-writer.js';
/** Generated resources belong to the source transaction, never to serialization. */
export function addGenerated(document,entity) {
 if(!entity.handle){entity.id=document.id+':committed:'+document.handles.handseed;entity.handle=document.handles.allocate();}
 entity.documentId=document.id;validateNativeEntity(entity,document);document.addEntity(entity);
}
