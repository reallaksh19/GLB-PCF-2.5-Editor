/** Capture synchronously before yielding to hashing/delivery. The live document is never acknowledged here. */
export async function serializeNative(doc,request,prepare) {
  if(request?.mode!=='native-save' || request.targetFormat!=='dxf')throw new Error('Native DXF Save mode/format mismatch');
  if(request.documentId!==doc.id || request.revision!==(doc.revision??0) || request.contentStateId!==(doc.contentStateId??doc.id+':content:0'))throw new Error('Stale Save checkpoint');
  if(request.targetVersion && request.targetVersion!==doc.source.acadVersion)throw new Error('Unsupported implicit Save version conversion');
  if(request.encodingPolicy && !['preserve',doc.source.encoding].includes(request.encodingPolicy))throw new Error('Unsupported encoding policy');
  const check=()=>{if(request.cancellationToken?.aborted)throw new Error('Save cancelled before delivery');};check();
  const documentId=doc.id, revision=doc.revision??0,contentStateId=doc.contentStateId??doc.id+':content:0';
  const diagnostics=doc.diagnostics.map(d=>({...d}));
  const {bytes,untouched,modifiedSpanCount}=prepare();
  const total=untouched.reduce((n,b)=>n+b.length,0), stable=new Uint8Array(total);let offset=0;
  for(const b of untouched){stable.set(b,offset);offset+=b.length;}
  const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
  const [outputDigest,untouchedRecordDigest]=await Promise.all([hash(bytes),hash(stable)]);check();
  return Object.freeze({documentId,sourceRevision:revision,sourceContentStateId:contentStateId,outputFormat:'dxf',
    bytesOrChunks:bytes,outputDigest,untouchedRecordDigest,diagnostics,
    fidelityReport:{untouchedSourceSpansPreserved:true,untouchedRecordCount:untouched.length,modifiedSpanCount,conversion:false,nativeSource:true}});
}
