// Clone Stamp and Healing Brush on touch screens: there is no Alt key, so "Set
// source" makes the next tap pick the spot to copy from, and a cross marks it.
// Mouse and pen users keep Alt-click.
import {useEffect,useReducer,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {Crosshair} from 'lucide-react';
import type {createRetouchController} from './retouch-controller';
import {useCoarsePointer} from './touch-ui';

export default function RetouchSource({retouch,page}:{retouch:RefObject<ReturnType<typeof createRetouchController>|null>;page:{id:string;width:number;height:number}}){
 const coarse=useCoarsePointer(),[,refresh]=useReducer((n:number)=>n+1,0),r=retouch.current;
 useEffect(()=>r?.watch(refresh),[r]);
 // Without a source on this page the first tap picks one.
 useEffect(()=>{if(!coarse||!r)return;if(r.source().pageId!==page.id)r.arm();return()=>r.arm(false);},[coarse,r,page.id]);
 if(!coarse)return <span className="muted">Alt-click to sample</span>;
 const {armed,point,pageId}=r?.source()??{armed:false,point:null,pageId:''},board=document.querySelector('.artboard');
 const set=point&&pageId===page.id?point:null;
 return <>
  <button className="secondary set-source" aria-pressed={armed} onClick={()=>r?.arm(!armed)}><Crosshair size={16}/>Set source</button>
  <span className="muted retouch-source-hint" role="status">{armed?'Tap the spot to copy from':set?'Drag over the spot to fix':'Tap Set source first'}</span>
  {set&&board&&createPortal(<span className="retouch-source-mark" aria-hidden="true" style={{left:`${set.x/page.width*100}%`,top:`${set.y/page.height*100}%`}}/>,board)}
 </>;
}
