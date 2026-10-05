import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root=process.env.CAD_REVIEW_ROOT || process.cwd();
const mod=await import(pathToFileURL(path.join(root,'formats/dxf/render/annotations/index.js')));
const codecs=await import(pathToFileURL(path.join(root,'formats/dxf/parser/entity-codecs/text-codec.js')));
const {layoutTextEntity:T,layoutMTextEntity:M,projectAnnotation:P,parseMTextRuns:parse,createDefaultGlyphProvider:G}=mod;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const text=(attrs={},geometry={})=>({id:'doc:text',type:'TEXT',attributes:{text:'A',height:10,...attrs},geometry:{point:{x:0,y:0,z:0},...geometry}});
const mtext=(attrs={},geometry={})=>({...text(attrs,geometry),type:'MTEXT'});
const oracle={measureText(s,o={}) {const h=o.height??10,wf=o.widthFactor??1;return {width:Array.from(s).length*h*wf,height:h,ascent:h*.8,descent:h*.2,hasMissingGlyphs:false};},hasGlyph:()=>true,getCoverageReport:()=>({totalMeasured:1,totalFallback:0,coverageRatio:1,missingGlyphs:[]})};
const tests=[
 ['A06-NATIVE-FLAGS',()=>{const e=codecs.TextCodec.decode([{code:1,value:'A'},{code:40,value:'10'},{code:71,value:'6'}],0);const r=T(e,oracle);assert.equal(r.mirrorX,true);assert.equal(r.mirrorY,true);} ],
 ['A06-NATIVE-WIDTH',()=>{const e=codecs.MtextCodec.decode([{code:1,value:'A A A'},{code:40,value:'10'},{code:41,value:'15'}],0);const r=M(e,oracle);assert.equal(r.referenceWidth,15);assert.ok(r.lines.length>1);} ],
 ['A06-TEXT-LITERALS',()=>assert.equal(T(text({text:'{literal}\\P'}),oracle).cleanText,'{literal}\\P')],
 ['A06-MIRROR-BOUNDS',()=>{const r=T(text({flags:4}),oracle);near(r.localBounds.min.y,-8);near(r.localBounds.max.y,2);} ],
 ['A06-TOP-ALIGN',()=>{const r=T(text({vertJust:3},{alignmentPoint:{x:100,y:50,z:0}}),oracle);near(r.localBounds.max.y,50);} ],
 ['A06-OBLIQUE-BOUNDS',()=>{const r=T(text({obliqueAngle:45}),oracle);near(r.localBounds.min.x,-2);near(r.localBounds.max.x,18);} ],
 ['A06-FONT-HONESTY',()=>assert.equal(P(text(),{}).approximate,true)],
 ['A06-FONT-CACHE',()=>{const g=G(),mono=g.resolveFont('mono','txt.shx'),prop=g.resolveFont('prop','simplex.shx');near(g.measureText('A',{height:10,font:mono}).width,6);near(g.measureText('A',{height:10,font:prop}).width,7);} ],
 ['A06-CACHE-ISOLATION',()=>{const g=G();const r=g.measureText('A',{height:10});r.width=999;r.charWidths[0]=999;near(g.measureText('A',{height:10}).width,7);near(g.measureText('A',{height:10}).charWidths[0],7);} ],
 ['A06-UNICODE',()=>{const g=G();g.measureText('😀',{height:10});assert.deepEqual(g.getCoverageReport().missingGlyphs,['😀']);assert.equal(g.getCoverageReport().totalFallback,1);} ],
 ['A06-MONO-FALLBACK',()=>{const g=G();assert.equal(g.measureText('☃',{font:g.resolveFont('mono','txt.shx')}).hasMissingGlyphs,true);} ],
 ['A06-REGISTRY-OWNERSHIP',()=>{const reg=new Map([['USER',{name:'USER'}]]);G({fontRegistry:reg}).dispose();assert.equal(reg.size,1);} ],
 ['A06-FINITE-METRICS',()=>{const g=G();for(const v of [Infinity,-Infinity,NaN]){const r=g.measureText('A',{height:v,widthFactor:v});assert.ok(Number.isFinite(r.width)&&Number.isFinite(r.height));}} ],
 ['A06-RUN-FONT',()=>{const seen=[];const g={...oracle,measureText(s,o){seen.push(o.font?.name??o.styleName);return oracle.measureText(s,o);},resolveFont:n=>({name:n})};M(mtext({text:'{\\fSPECIAL;A}B'}),g);assert.ok(seen.includes('SPECIAL'));} ],
 ['A06-RUN-HEIGHT',()=>{const r=M(mtext({text:'\\H4x;A'}),oracle);assert.ok(r.metrics.height>=40);assert.ok(r.localBounds.max.y-r.localBounds.min.y>=40);} ],
 ['A06-UNKNOWN-FORMAT',()=>{assert.ok(parse('A\\Zfoo;B').diagnostics.length);assert.ok(parse('A\\Hbad;B').diagnostics.length);} ],
 ['A06-FINITE-LAYOUT',()=>{for(const f of [T,M]){const r=f(text({rotation:Infinity,obliqueAngle:Infinity,referenceWidth:Infinity,lineSpacingFactor:Infinity}),oracle);assert.ok(r.planeCorners.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));}} ],
 ['A06-TYPE-SAFETY',()=>assert.throws(()=>P({...text(),type:'LINE'},{}),/TEXT|annotation/i)],
 ['A06-SOURCE-IMMUTABLE',()=>{const e=text({text:'{A}',flags:6,obliqueAngle:20});Object.freeze(e.attributes);Object.freeze(e.geometry.point);Object.freeze(e.geometry);Object.freeze(e);const before=JSON.stringify(e);P(e,{}, {glyphProvider:oracle});assert.equal(JSON.stringify(e),before);} ],
 ['A06-OCCURRENCE',()=>{const e=text();const r=P(e,{}, {glyphProvider:oracle,blockContext:{rootInsertId:'root',instancePath:[{handle:'B'}]},transform:{matrix:[2,0,0,100,0,-1,0,200,0,0,1,0]}});assert.equal(r.sourceEntityId,'root');assert.equal(r.occurrence.leafEntityId,'doc:text');near(r.position.x,100);near(r.position.y,200);near(r.bounds.max.x,120);} ],
 ['A06-WCS-MTEXT',()=>{const r=P(mtext({}, {point:{x:10,y:20,z:30},directionVector:{x:0,y:0,z:1},extrusion:{x:0,y:1,z:0}}),{}, {glyphProvider:oracle});near(r.xAxis.x,0);near(r.xAxis.z,1);assert.ok(r.bounds.max.z>r.bounds.min.z);} ],
 ['A06-NATIVE-MTEXT-ANGLE',()=>{const e=codecs.MtextCodec.decode([{code:1,value:'A'},{code:40,value:'10'},{code:50,value:String(Math.PI/2)}],0);const r=M(e,oracle);near(r.rotationRad,Math.PI/2);} ],
 ['A06-MTEXT-ATTACHMENTS',()=>{for(let code=1;code<=9;code++){const r=M(mtext({attachmentPoint:code,text:'A\\PA'}),oracle);const h=(code-1)%3,v=Math.floor((code-1)/3);near(r.localBounds.min.x,-r.metrics.width*h/2);near(r.localBounds.max.y,r.metrics.height*v/2);}} ],
 ['A06-ESCAPES',()=>assert.equal(parse('\\\\P \\{A\\}').cleanText,'\\P {A}')],
];
const results=[];for(const [id,fn] of tests){try{fn();results.push({id,result:'PASS'});}catch(e){results.push({id,result:'FAIL',detail:e.message});}}
const out={candidate:process.env.CAD_REVIEW_SHA||'UNATTESTED',results};
if(process.env.CAD_REVIEW_OUTPUT)fs.writeFileSync(process.env.CAD_REVIEW_OUTPUT,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));if(results.some(x=>x.result!=='PASS'))process.exitCode=1;
