// Small hooks for the phone and touch layout of the editor chrome.
import {useEffect,useRef,useSyncExternalStore} from 'react';

// Whether a media query matches, following changes (rotation, resizing).
export function useMedia(query:string){
 const m=()=>globalThis.matchMedia?.(query);
 return useSyncExternalStore(change=>{const l=m();l?.addEventListener('change',change);return()=>l?.removeEventListener('change',change);},()=>!!m()?.matches,()=>false);
}
// True on touch-first devices (phones, tablets): no hover, no Alt key, no tooltips.
const coarse=()=>globalThis.matchMedia?.('(pointer:coarse)');
export const useCoarsePointer=()=>useMedia('(pointer:coarse)');

// Fields that would open the on-screen keyboard only take focus by themselves
// with a fine pointer, or when a key (a hardware keyboard) did the opening.
let keyed=false;
if(typeof window!=='undefined'){window.addEventListener('keydown',()=>{keyed=true;},true);window.addEventListener('pointerdown',()=>{keyed=false;},true);}
export const typingFirst=()=>!coarse()?.matches||keyed;

// Scroll `row` into view inside `list` only; scrollIntoView would also scroll
// the clipped app shell.
const reveal=(list:Element|null,row:Element|null)=>{
 if(!(list instanceof HTMLElement)||!(row instanceof HTMLElement))return;
 const top=row.getBoundingClientRect().top-list.getBoundingClientRect().top+list.scrollTop;
 if(top<list.scrollTop)list.scrollTop=top;else if(top+row.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=top+row.offsetHeight-list.clientHeight;
};

// The Pages and Properties drawers on phones. mobile-chrome.css draws a scrim on
// .workspace-layout itself, so a tap beside an open drawer lands there: it closes
// the drawer and never reaches the canvas. An open drawer also shows the
// selected layer and the current history step, which sit below its fold.
export function useDrawer(panel:string|null,close:()=>void,...watch:unknown[]){
 const closeRef=useRef(close);closeRef.current=close;
 useEffect(()=>{
  if(!panel)return;
  const tap=(e:Event)=>{if((e.target as Element|null)?.matches?.('.workspace-layout[data-panel]')){e.stopPropagation();closeRef.current();}};
  document.addEventListener('click',tap,true);return()=>document.removeEventListener('click',tap,true);
 },[panel]);
 useEffect(()=>{if(panel!=='properties')return;const id=requestAnimationFrame(()=>{
  const drawer=document.querySelector('.inspector');if(!drawer||getComputedStyle(drawer).position!=='absolute')return;
  reveal(document.querySelector('.inspector .layers-list'),document.querySelector('.inspector .layers-list .layer-row.selected'));
  reveal(document.querySelector('.inspector .history-list'),document.querySelector('.inspector .history-list .current'));
 });return()=>cancelAnimationFrame(id);},[panel,...watch]);
}
