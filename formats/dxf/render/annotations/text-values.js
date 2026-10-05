// Native source fields are read-only inputs, including fields not projected by older codecs.
export const finiteNumber=(v,fallback=0)=>Number.isFinite(Number(v)) ? Number(v) : fallback;
export const positiveNumber=(v,fallback)=>Number.isFinite(Number(v)) && Number(v)>0 ? Number(v) : fallback;
export function nativeValue(entity,code,fallback) {
  const tags=entity.source?.rawTags;
  const tag=tags?.findLast(t=>Number(t.code)===code);
  return tag ? tag.value : fallback;
}
export function textPoint(p={}) {
  const out={x:p.x??0,y:p.y??0,z:p.z??0};
  if(Object.values(out).some(v=>!Number.isFinite(Number(v))))throw new Error('Invalid annotation coordinates');
  return {x:Number(out.x),y:Number(out.y),z:Number(out.z)};
}
export function plainText(s) {
  return String(s).replace(/%%d/gi,'°').replace(/%%p/gi,'±').replace(/%%c/gi,'Ø')
    .replace(/%%[uo]/gi,'').replace(/%%%/g,'%');
}
