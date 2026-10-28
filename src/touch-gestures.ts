// Touch navigation on the canvas workspace (phones and tablets): two fingers
// pinch to zoom around their midpoint and pan at the same time; one finger on
// the grey margin scrolls. One finger on the page keeps working the current
// tool, but its first touch is held back for a moment and only handed to the
// canvas (Fabric) if no second finger follows, so a pinch never draws, selects
// or moves anything. The browser's own page zoom is blocked over the workspace
// (touch-action: none) and on the rest of the interface (mobile-shell.css,
// main.tsx), so the toolbars and dialogs never grow with a pinch.
import type {Canvas} from 'fabric';

type XY={x:number;y:number};
// Fabric's touch handlers, called with the held native events.
type FabricTouch={upperCanvasEl:HTMLCanvasElement;_onTouchStart(e:TouchEvent):void;_onMouseMove(e:TouchEvent):void};
export const HOLD_MS=90,MOVE_PX=8;

export function attachTouchGestures(root:HTMLElement,{canvas,board,zoom,zoomAround}:{
 canvas:()=>Canvas|null;board:()=>HTMLElement|null;zoom:()=>number;
 // Set the zoom so that `page` (page units) lands under `screen` (client px).
 zoomAround:(value:number,page:XY,screen:XY)=>void;
}){
 const fabric=()=>canvas() as unknown as FabricTouch|null;
 let held:{start:TouchEvent;moves:TouchEvent[];x:number;y:number;timer:number}|undefined;
 let pinch:{distance:number;zoom:number;page:XY}|undefined,pan:{x:number;y:number;left:number;top:number}|undefined;
 let forwarded=false,frame=0,latest:{zoom:number;screen:XY}|undefined;
 const swallow=(e:Event)=>{e.stopPropagation();if(e.cancelable)e.preventDefault();};
 const flush=()=>{
  if(!held)return;const h=held;held=undefined;clearTimeout(h.timer);
  const f=fabric();if(!f)return;forwarded=true;f._onTouchStart(h.start);for(const m of h.moves)f._onMouseMove(m);
 };
 const two=(e:TouchEvent)=>{const a=e.touches[0],b=e.touches[1];return {x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2,d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)};};
 const apply=()=>{frame=0;if(latest&&pinch)zoomAround(latest.zoom,pinch.page,latest.screen);latest=undefined;};
 const startPinch=(e:TouchEvent)=>{
  const m=two(e),b=board()?.getBoundingClientRect(),z=zoom();if(!b)return;
  pinch={distance:Math.max(10,m.d),zoom:z,page:{x:(m.x-b.left)/z,y:(m.y-b.top)/z}};pan=undefined;
 };
 const onStart=(e:TouchEvent)=>{
  if(pinch){swallow(e);if(e.touches.length===2)startPinch(e);return;}
  if(e.touches.length>=2){
   // A first touch still held never reaches the canvas at all.
   if(held){clearTimeout(held.timer);held=undefined;}
   startPinch(e);swallow(e);return;
  }
  const t=e.touches[0],f=fabric();
  if(f&&e.target===f.upperCanvasEl){forwarded=false;held={start:e,moves:[],x:t.clientX,y:t.clientY,timer:window.setTimeout(flush,HOLD_MS)};swallow(e);return;}
  if(e.target instanceof Element&&e.target.closest('button,input,select,textarea,a,[contenteditable],[role=button],.form-overlay,.guide-layer'))return;
  pan={x:t.clientX,y:t.clientY,left:root.scrollLeft,top:root.scrollTop};swallow(e);
 };
 const onMove=(e:TouchEvent)=>{
  if(pinch){
   swallow(e);if(e.touches.length<2)return;
   const m=two(e);latest={zoom:pinch.zoom*m.d/pinch.distance,screen:{x:m.x,y:m.y}};
   if(!frame)frame=requestAnimationFrame(apply);return;
  }
  if(pan){const t=e.touches[0];root.scrollLeft=pan.left-(t.clientX-pan.x);root.scrollTop=pan.top-(t.clientY-pan.y);swallow(e);return;}
  if(held){
   const t=e.touches[0];held.moves.push(e);swallow(e);
   // A finger that moves is a drag for the tool: hand it over now.
   if(Math.hypot(t.clientX-held.x,t.clientY-held.y)>MOVE_PX)flush();
  }
 };
 const onEnd=(e:TouchEvent)=>{
  if(pinch){
   if(e.touches.length>0){swallow(e);return;}
   pinch=undefined;if(frame){cancelAnimationFrame(frame);apply();}
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
  if(held)clearTimeout(held.timer);if(frame)cancelAnimationFrame(frame);
  root.removeEventListener('touchstart',onStart,options);root.removeEventListener('touchmove',onMove,options);
  root.removeEventListener('touchend',onEnd,options);root.removeEventListener('touchcancel',onEnd,options);
  root.removeEventListener('gesturestart',onGesture,options);root.removeEventListener('gesturechange',onGesture,options);
 };
}
