// Names for undo steps, inferred from what changed between two projects.
type Obj={id?:string;name?:string;type?:string;[key:string]:unknown};
type PageLike={id:string;name:string;width:number;height:number;color?:string;source?:string;canvas:{objects?:unknown[]};guides?:unknown};
type ProjectLike={name:string;pages:PageLike[]};

const objects=(p:PageLike)=>(p.canvas?.objects??[]) as Obj[];
const label=(o:Obj)=>o.name||o.type||'layer';
// Compare without the (possibly huge) image data.
const same=(a:Obj,b:Obj)=>JSON.stringify(a,(k,v)=>k==='src'&&typeof v==='string'?v.length+v.slice(-64):v)===JSON.stringify(b,(k,v)=>k==='src'&&typeof v==='string'?v.length+v.slice(-64):v);

export function historyLabel(prev:ProjectLike,next:ProjectLike):string{
 if(!next.pages.some(p=>prev.pages.some(q=>q.id===p.id)))return 'Open document';
 if(prev.name!==next.name)return 'Rename document';
 if(next.pages.length>prev.pages.length)return next.pages.length-prev.pages.length===1?'Add page':`Add ${next.pages.length-prev.pages.length} pages`;
 if(next.pages.length<prev.pages.length)return 'Delete page';
 if(next.pages.some((p,i)=>p.id!==prev.pages[i].id))return 'Reorder pages';
 for(let i=0;i<next.pages.length;i++){
  const a=prev.pages[i],b=next.pages[i];if(a===b)continue;
  if(a.width!==b.width||a.height!==b.height)return 'Resize page';
  if(a.source!==b.source)return 'Edit PDF page';
  if(a.color!==b.color)return 'Page background';
  if(JSON.stringify(a.guides)!==JSON.stringify(b.guides))return 'Guides';
  if(a.name!==b.name)return 'Rename page';
  const before=objects(a),after=objects(b);
  if(after.length>before.length){const added=after.filter(o=>!before.some(x=>x.id&&x.id===o.id));return added.length===1?`Add ${label(added[0])}`:`Add ${added.length||after.length-before.length} layers`;}
  if(after.length<before.length){const gone=before.filter(o=>!after.some(x=>x.id&&x.id===o.id));return gone.length===1?`Delete ${label(gone[0])}`:`Delete ${gone.length||before.length-after.length} layers`;}
  const ids=after.map(o=>o.id);if(before.some((o,j)=>o.id!==ids[j])&&before.every(o=>ids.includes(o.id)))return 'Reorder layers';
  const changed=after.filter((o,j)=>!same(o,before[j]));
  if(changed.length===1){
   const o=changed[0],old=before.find(x=>x.id===o.id)??before[after.indexOf(o)];
   const keys=Object.keys({...o,...old}).filter(k=>JSON.stringify(o[k])!==JSON.stringify(old?.[k]));
   const what=keys.every(k=>['left','top'].includes(k))?'Move':keys.some(k=>['scaleX','scaleY','width','height','angle','skewX','skewY'].includes(k))?'Transform':keys.includes('text')?'Edit text':keys.includes('layerStyle')?'Layer style':keys.includes('clipPath')?'Mask':keys.includes('visible')?'Visibility':'Edit';
   return `${what} ${label(o)}`;
  }
  if(changed.length>1)return `Edit ${changed.length} layers`;
 }
 return 'Edit';
}
