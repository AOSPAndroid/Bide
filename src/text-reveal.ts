// Phones and tablets: text being edited is big enough to read and stays above
// the on-screen keyboard. Starting to edit zooms in until the letters are 16 px
// tall, then scrolls the workspace to the text, and again whenever the keyboard
// resizes the viewport. Fabric's hidden textarea (which receives the typing)
// goes in a fixed layer that cannot scroll, so focusing it never shifts the app.
import type {Canvas} from 'fabric';
import type {RefObject} from 'react';
import {Textbox} from './text-appearance';

export const EDIT_TEXT_PX=16;
export function revealEditedText(c:Canvas,{zoomRef,workspace,changeZoom}:{zoomRef:RefObject<number>;workspace:RefObject<HTMLDivElement|null>;changeZoom:(value:number)=>void}){
 if(typeof matchMedia!=='function'||!matchMedia('(pointer: coarse)').matches)return ()=>{};
 const layer=document.createElement('div');layer.className='text-input-layer';
 layer.style.cssText='position:fixed;inset:0;overflow:clip;pointer-events:none;z-index:-1';document.body.append(layer);
 Object.assign(Textbox.ownDefaults,{hiddenTextareaContainer:layer});
 const editing=()=>{const t=c.getActiveObject();return t instanceof Textbox&&t.isEditing?t:null;};
 const reveal=()=>{
  const t=editing(),root=workspace.current,board=root?.querySelector('.artboard')?.getBoundingClientRect();if(!t||!root||!board)return;
  const z=zoomRef.current,r=t.getBoundingRect(),ws=root.getBoundingClientRect(),vv=window.visualViewport;
  // The part of the workspace left visible above an overlaid keyboard.
  const top=Math.max(ws.top,vv?.offsetTop??0),bottom=Math.min(ws.bottom,vv?vv.offsetTop+vv.height:innerHeight);
  const box={top:board.top+r.top*z,left:board.left+r.left*z,width:r.width*z,height:r.height*z};
  // A box taller than that: keep the caret's line in view instead of the box's middle.
  c.calcOffset();const caret=t._calcTextareaPosition(),y=box.height<bottom-top-16?box.top+box.height/2:parseFloat(caret.top)-(caret.charHeight??0)*z/2;
  root.scrollTop+=y-(top+bottom)/2;
  if(box.left<ws.left+8||box.left+box.width>ws.right-8)root.scrollLeft+=box.width<ws.width-16?box.left+box.width/2-(ws.left+ws.right)/2:box.left-ws.left-8;
  // The canvas moved with the scroll: the typing textarea follows the caret, where the keyboard looks.
  c.calcOffset();t.updateTextareaPosition();
 };
 let frame=0;const later=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(reveal);});};
 c.on('text:editing:entered',({target})=>{
  const px=(target.fontSize??12)*Math.abs(target.scaleY??1)*zoomRef.current;
  if(px<EDIT_TEXT_PX)changeZoom(zoomRef.current*EDIT_TEXT_PX/px);
  later();
 });
 const resized=()=>{if(editing())later();};
 window.visualViewport?.addEventListener('resize',resized);addEventListener('resize',resized);
 return ()=>{cancelAnimationFrame(frame);window.visualViewport?.removeEventListener('resize',resized);removeEventListener('resize',resized);layer.remove();};
}
