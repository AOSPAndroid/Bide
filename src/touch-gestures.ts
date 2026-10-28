// Touch navigation on the canvas workspace (phones and tablets): two fingers
// pinch to zoom around their midpoint and pan at the same time; one finger on
// the grey margin scrolls. One finger on the page keeps working the current
// tool, but its first touch is held back for a moment and only handed to the
// canvas (Fabric) if no second finger follows, so a pinch never draws, selects
// or moves anything. If the canvas already had the touch when the second finger
// lands, what it started is cancelled. While the fingers move, the page is only
// scaled with CSS (a full-size canvas redraw per frame stalls phones); the real
// zoom is applied once when they lift. The browser's own page zoom is blocked
// over the workspace (touch-action: none) and on the rest of the interface
// (mobile-shell.css, main.tsx), so the toolbars and dialogs never grow with a pinch.
import type {Canvas} from 'fabric';
import {clampZoom} from './editor-tools';

type XY={x:number;y:number};
// Fabric's touch handlers, called with the held native events.
type FabricTouch={upperCanvasEl:HTMLCanvasElement;_onTouchStart(e:TouchEvent):void;_onMouseMove(e:TouchEvent):void};
export const HOLD_MS=90,MOVE_PX=8,LONG_MS=500;
// What the current tool wants from one finger on the page (canvas-events.ts).
export type TouchHooks={
 // A pinch took over a touch the canvas had already started: undo what it did.
 cancel?:()=>void;
 // Keep a still finger until it moves or lifts, instead of handing it over after HOLD_MS.
 wait?:()=>boolean;
 // A one-finger drag starting here scrolls the workspace instead of reaching the canvas.
 dragPans?:(e:TouchEvent)=>boolean;
 // A finger held still for LONG_MS; true if it opened a menu, which then owns the touch.
 longPress?:(e:TouchEvent)=>boolean;
};

export function attachTouchGestures(root:HTMLElement,{canvas,board,zoom,zoomAround,cancel,wait,dragPans,longPress}:{
 canvas:()=>Canvas|null;board:()=>HTMLElement|null;zoom:()=>number;
 // Set the zoom so that `page` (page units) lands under `screen` (client px).
 zoomAround:(value:number,page:XY,screen:XY)=>void;
}&TouchHooks){
 const fabric=()=>canvas() as unknown as FabricTouch|null;
 let held:{start:TouchEvent;moves:TouchEvent[];x:number;y:number;timer:number;pans:boolean}|undefined;
 let pinch:{distance:number;zoom:number;page:XY}|undefined,pan:{x:number;y:number;left:number;top:number}|undefined;
 let forwarded=false,pressed=false,press=0,frame=0,latest:{zoom:number;screen:XY}|undefined;
 // The CSS preview: the page's untransformed position and real zoom, and the zoom and midpoint shown.
 let base:{left:number;top:number;zoom:number}|undefined,shown:{zoom:number;screen:XY}|undefined;
 const swallow=(e:Event)=>{e.stopPropagation();if(e.cancelable)e.preventDefault();};
 const drop=()=>{if(held){clearTimeout(held.timer);held=undefined;}clearTimeout(press);press=0;};
 const flush=()=>{
  if(!held)return;const h=held;drop();
  const f=fabric();if(!f)return;forwarded=true;f._onTouchStart(h.start);for(const m of h.moves)f._onMouseMove(m);
 };
 const two=(e:TouchEvent)=>{const a=e.touches[0],b=e.touches[1];return {x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2,d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)};};
 const apply=()=>{
  frame=0;const el=board();if(!latest||!pinch||!base||!el)return;
  const z=clampZoom(latest.zoom),x=latest.screen.x-base.left-pinch.page.x*z,y=latest.screen.y-base.top-pinch.page.y*z;
  el.style.transformOrigin='0 0';el.style.transform=`translate(${x}px,${y}px) scale(${z/base.zoom})`;
  shown={zoom:z,screen:latest.screen};latest=undefined;
 };
 const commit=()=>{
  if(frame){cancelAnimationFrame(frame);apply();}
  const el=board();if(el)el.style.transform='';
  if(shown&&pinch)zoomAround(shown.zoom,pinch.page,shown.screen);base=shown=undefined;
 };
 const startPinch=(e:TouchEvent)=>{
  const el=board(),m=two(e),b=el?.getBoundingClientRect();if(!b)return;
  // A finger landing again mid-gesture re-anchors on the page as shown.
  const z=shown?.zoom??zoom();if(!base)base={left:b.left,top:b.top,zoom:z};
  pinch={distance:Math.max(10,m.d),zoom:z,page:{x:(m.x-b.left)/z,y:(m.y-b.top)/z}};pan=undefined;
 };
 const scroll=(t:Touch)=>{if(!pan)return;root.scrollLeft=pan.left-(t.clientX-pan.x);root.scrollTop=pan.top-(t.clientY-pan.y);};
 const onStart=(e:TouchEvent)=>{
  if(pressed){swallow(e);return;}
  if(pinch){swallow(e);if(e.touches.length===2)startPinch(e);return;}
  if(e.touches.length>=2){
   // A first touch still held never reaches the canvas at all; one already
   // handed over is undone (its end still reaches Fabric, with nothing left to commit).
   if(held)drop();else if(forwarded){clearTimeout(press);press=0;cancel?.();}
   startPinch(e);swallow(e);return;
  }
  const t=e.touches[0],f=fabric();
  if(f&&e.target===f.upperCanvasEl){
   forwarded=false;const pans=!!dragPans?.(e);
   held={start:e,moves:[],x:t.clientX,y:t.clientY,pans,timer:pans||wait?.()?0:window.setTimeout(flush,HOLD_MS)};
   if(longPress)press=window.setTimeout(()=>{press=0;if(held&&longPress(held.start)){drop();pressed=true;}},LONG_MS);
   swallow(e);return;
  }
  if(e.target instanceof Element&&e.target.closest('button,input,select,textarea,a,[contenteditable],[role=button],.form-overlay,.guide-layer'))return;
  pan={x:t.clientX,y:t.clientY,left:root.scrollLeft,top:root.scrollTop};swallow(e);
 };
 const onMove=(e:TouchEvent)=>{
  if(pressed){swallow(e);return;}
  if(pinch){
   swallow(e);if(e.touches.length<2)return;
   const m=two(e);latest={zoom:pinch.zoom*m.d/pinch.distance,screen:{x:m.x,y:m.y}};
   if(!frame)frame=requestAnimationFrame(apply);return;
  }
  if(pan){scroll(e.touches[0]);swallow(e);return;}
  if(held){
   const t=e.touches[0];held.moves.push(e);swallow(e);
   if(Math.hypot(t.clientX-held.x,t.clientY-held.y)<=MOVE_PX)return;
   // A finger that moves is a drag: a scroll from where it landed, or for the tool now.
   if(held.pans){pan={x:held.x,y:held.y,left:root.scrollLeft,top:root.scrollTop};drop();scroll(t);}else flush();
  }
 };
 const onEnd=(e:TouchEvent)=>{
  // The menu a long press opened owns the rest of the touch, so no click lands on it.
  if(pressed){if(e.touches.length===0)pressed=false;swallow(e);return;}
  clearTimeout(press);press=0;
  if(pinch){
   if(e.touches.length>0){swallow(e);return;}
   commit();pinch=undefined;
   // What the canvas started before the pinch ends here; otherwise nothing to tell it.
   if(forwarded){forwarded=false;return;}
   swallow(e);return;
  }
  if(pan){if(e.touches.length===0)pan=undefined;swallow(e);return;}
  // A tap: the canvas gets the held touch, then this end.
  if(held)flush();
  if(e.touches.length===0)forwarded=false;
 };
 // Safari's own pinch events.
 const onGesture=(e:Event)=>e.preventDefault();
 const options={capture:true,passive:false};
 root.addEventListener('touchstart',onStart,options);root.addEventListener('touchmove',onMove,options);
 root.addEventListener('touchend',onEnd,options);root.addEventListener('touchcancel',onEnd,options);
 root.addEventListener('gesturestart',onGesture,options);root.addEventListener('gesturechange',onGesture,options);
 return ()=>{
  drop();if(frame)cancelAnimationFrame(frame);const el=board();if(el)el.style.transform='';
  root.removeEventListener('touchstart',onStart,options);root.removeEventListener('touchmove',onMove,options);
  root.removeEventListener('touchend',onEnd,options);root.removeEventListener('touchcancel',onEnd,options);
  root.removeEventListener('gesturestart',onGesture,options);root.removeEventListener('gesturechange',onGesture,options);
 };
}
