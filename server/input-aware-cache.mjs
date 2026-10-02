// Rebuild an expensive aggregate only when its source data or rules change.
// Normal requests keep the last successful snapshot while one refresh runs.
export function createInputAwareCache(load,{readRevision,initial,now=Date.now,checkEvery=60_000,quietFor=300_000,onError=console.error}={}) {
 let value=initial,pending,lastCheck=-Infinity,generation=0;
 const rebuild=async revision=>{
  if(pending)await pending;
  if(value?.inputRevision===revision.key)return value;
  const startedGeneration=generation;
  pending=Promise.resolve().then(()=>load(revision)).then(next=>{if(startedGeneration===generation)value=next;return next;}).finally(()=>{pending=null;});
  return pending;
 };
 const inspect=async requireFresh=>{
  const revision=await readRevision();
  if(value?.inputRevision===revision.key)return value;
  if(!requireFresh&&value!==undefined&&revision.changedAt>now()-quietFor)return value;
  if(requireFresh||value===undefined)return rebuild(revision);
  if(!pending)void rebuild(revision).catch(onError);
  return value;
 };
 const read=async({requireFresh=false}={})=>{
  if(requireFresh||value===undefined)return inspect(true);
  if(now()-lastCheck>=checkEvery){lastCheck=now();void inspect(false).catch(onError);}
  return value;
 };
 read.invalidate=()=>{generation++;value=undefined;lastCheck=-Infinity;};
 return read;
}
