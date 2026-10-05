import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentAuthority,DocumentSessionClient,DirectSessionTransport,EnvelopeType,createRequestEnvelope} from '../../../runtime/cad/index.js';
import {MoveEntitiesCommand,DeleteEntitiesCommand} from '../../../core/commands/cad/index.js';
const source='0\nSECTION\n2\nENTITIES\n0\nLINE\n5\n10\n8\n0\n10\n0\n20\n0\n11\n10\n21\n0\n0\nENDSEC\n0\nEOF\n';
test('replaying Delete ignores provider before-images and preserves historical checkpoint',()=>{
 const a=new DocumentAuthority();a.open({source});const command=new DeleteEntitiesCommand(['dxf:entity:10']);
 const first=a.executeCommand({command,baseRevision:0,transactionId:'delete'});
 const replay=a.executeCommand({command,baseRevision:0,transactionId:'delete'});
 assert.equal(replay.sourceRevision,first.sourceRevision);assert.equal(a.document.entities.length,0);a.dispose();
});
test('failed client replacement preserves the last consistent open session',async()=>{
 const c=new DocumentSessionClient();try{await c.openDocument({source,documentId:'original'});
 await assert.rejects(c.openDocument({source:{invalid:true}}));assert.equal(c.documentId,'original');
 assert.equal((await c.query('SUMMARY')).entityCount,1);}finally{c.dispose();}
});
test('queued command and source parameters are captured at submission',async()=>{
 const c=new DocumentSessionClient();try{await c.openDocument({source});c.transport.queue.enqueue(()=>new Promise(r=>setTimeout(r,5)));
 const command=new MoveEntitiesCommand(['dxf:entity:10'],1,0);const pending=c.executeCommand(command);command.dx=99;
 await pending;assert.equal(c.transport.authority.document.entities[0].geometry.start.x,1);}finally{c.dispose();}
});
test('query views at the same revision reject superseded render results',async()=>{
 let receive;const sent=[];const t={onMessage(fn){receive=fn;return ()=>{}},send(e){sent.push(e)},terminate(){}};
 const c=new DocumentSessionClient({transport:t});const open=c.openDocument({documentId:'D'});receive({type:EnvelopeType.OPEN_RESPONSE,documentId:'D',sourceRevision:0,requestId:sent[0].requestId,data:{documentId:'D',sourceRevision:0}});await open;
 const old=c.query('RENDER').catch(e=>e.code),fresh=c.query('RENDER');const [a,b]=sent.slice(-2);
 receive({type:EnvelopeType.QUERY_RESPONSE,documentId:'D',sourceRevision:0,requestId:a.requestId,data:{old:true}});
 receive({type:EnvelopeType.QUERY_RESPONSE,documentId:'D',sourceRevision:0,requestId:b.requestId,data:{fresh:true}});
 assert.equal(await old,'STALE_REVISION');assert.equal((await fresh).fresh,true);c.dispose();
});
test('transport queue capacity rejects excess work with a settled request',async()=>{
 const t=new DirectSessionTransport({maxPendingRequests:1});t.authority.open({source,documentId:'D'});
 t.queue.enqueue(()=>new Promise(r=>setTimeout(r,5))).catch(()=>{});t.queue.enqueue(()=>new Promise(r=>setTimeout(r,5))).catch(()=>{});
 const replies=[];t.onMessage(e=>replies.push(e));t.send(createRequestEnvelope({type:EnvelopeType.QUERY_REQUEST,documentId:'D',payload:{queryType:'SUMMARY'}}));
 await new Promise(r=>setTimeout(r,2));assert.match(replies[0].error.message,/capacity/);t.terminate();
});
test('Undo/Redo with no provider history does not create a revision',()=>{const a=new DocumentAuthority();a.open({source});a.undo(0);a.redo(0);assert.equal(a.sourceRevision,0);a.dispose();});
