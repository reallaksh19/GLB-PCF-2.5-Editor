import {CadCommand,CompositeCadCommand} from './cad-command.js';
import {ChangeSet} from './change-set.js';
import {validateResult} from './command-validation.js';
import {atomically} from './transaction-state.js';
function fingerprint(command) {
  const keys=['name','entityIds','sourceEntityIds','entityId','dx','dy','dz','basePoint','angleDeg','sx','sy','sz','properties','updates','gripKey','newPoint'];
  return JSON.stringify(command.commands ? command.commands.map(fingerprint) : Object.fromEntries(keys.filter(k=>command[k]!==undefined).map(k=>[k,command[k]])));
}
/** Source transactions commit once; Undo advances revision but restores prior content identity. */
export class CommandHistory {
  constructor(options={}) {
    this.maxHistory=Math.max(1,options.maxHistory || 100);this.undoStack=[];this.redoStack=[];
    this._listeners=new Set();this._batch=null;this._document=null;this._ledger=new Map();this._states=new WeakMap();this._serial=0;
  }
  get canUndo(){return !!this.undoStack.length;}
  get canRedo(){return !!this.redoStack.length;}
  get undoCount(){return this.undoStack.length;}
  get redoCount(){return this.redoStack.length;}
  subscribe(callback){if(typeof callback!=='function')return ()=>{};this._listeners.add(callback);return ()=>this._listeners.delete(callback);}
  _notify(action,command,changeSet){
    const event={action,command:command ? {name:command.name,description:command.description} : null,changeSet,
      canUndo:this.canUndo,canRedo:this.canRedo,undoCount:this.undoCount,redoCount:this.redoCount,timestamp:Date.now()};
    for(const listener of this._listeners)try{listener(event);}catch(error){console.error('CommandHistory listener error:',error);}
  }
  _check(document){if(!document || (this._document && this._document!==document))throw new Error('History belongs to another source document');}
  _advance(document,contentStateId){document.revision++;document.contentStateId=contentStateId;document.knownContentStates.add(contentStateId);}
  clear(){this.undoStack=[];this.redoStack=[];this._batch=null;this._notify('clear',null,new ChangeSet('CLEAR_HISTORY'));}
  beginBatch(name='BATCH_TRANSACTION'){if(this._batch)throw new Error('Batch already open');this._batch={name,commands:[],document:null};}
  endBatch(){
    if(!this._batch)return null;const batch=this._batch;this._batch=null;
    if(!batch.commands.length)return null;
    return this.execute(new CompositeCadCommand(batch.commands,batch.name),batch.document);
  }
  cancelBatch(){this._batch=null;}
  execute(command,document){
    if(!(command instanceof CadCommand))throw new Error('CadCommand required');this._check(document);
    const payload=fingerprint(command),transactionId=command.transactionId;
    if(command.documentId!=null && command.documentId!==document.id)throw new Error('Transaction document identity mismatch');
    if(transactionId && this._ledger.has(transactionId)) {
      const delivered=this._ledger.get(transactionId);
      if(delivered.payload!==payload || delivered.document!==document)throw new Error('Transaction identifier payload conflict');
      return delivered.changeSet;
    }
    if(command.baseRevision!=null && command.baseRevision!==document.revision)throw new Error('Stale transaction base revision');
    command.validate(document);
    if(this._batch){if(this._batch.document && this._batch.document!==document)throw new Error('Batch document mismatch');this._batch.document=document;this._batch.commands.push(command);return new ChangeSet(this._batch.name);}
    const before=document.contentStateId,seedBefore=document.committedHandleSeed ?? document.handles.handseed;
    const changeSet=atomically(document,command,()=>{const result=command.execute(document);validateResult(result,document);return result;});
    if(!changeSet.hasChanges())return changeSet;
    this._document=document;
    const after=document.id+':content:revision:'+ (document.revision+1);
    this._serial++;document.committedHandleSeed=document.handles.handseed;this._advance(document,after);
    this._states.set(command,{before,after,seedBefore,seedAfter:document.committedHandleSeed});
    Object.assign(changeSet,{documentId:document.id,transactionId:transactionId || document.id+':local:'+this._serial,baseRevision:document.revision-1,resultRevision:document.revision,sourceContentStateId:after});
    if(transactionId)this._ledger.set(transactionId,{payload,document,changeSet});
    this.undoStack.push(command);if(this.undoStack.length>this.maxHistory)this.undoStack.shift();this.redoStack=[];
    this._notify('execute',command,changeSet);return changeSet;
  }
  undo(document){
    this._check(document);if(!this.canUndo)return null;
    const command=this.undoStack.at(-1),state=this._states.get(command);
    const changeSet=atomically(document,command,()=>command.undo(document));
    this.undoStack.pop();this.redoStack.push(command);document.committedHandleSeed=state.seedBefore;this._advance(document,state.before);
    this._notify('undo',command,changeSet);return changeSet;
  }
  redo(document){
    this._check(document);if(!this.canRedo)return null;
    const command=this.redoStack.at(-1),state=this._states.get(command);command.validate(document);
    const changeSet=atomically(document,command,()=>{const result=command.execute(document);validateResult(result,document);return result;});
    this.redoStack.pop();this.undoStack.push(command);document.committedHandleSeed=state.seedAfter;this._advance(document,state.after);
    this._notify('redo',command,changeSet);return changeSet;
  }
  getUndoList(){return this.undoStack.map(({name,description})=>({name,description}));}
  getRedoList(){return this.redoStack.map(({name,description})=>({name,description}));}
}
