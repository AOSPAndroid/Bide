import { useEffect,useLayoutEffect, useRef, useState,type PointerEvent } from 'react';
import { Eraser, PenLine, Type } from 'lucide-react';

type Stroke = { color: string; points: { x: number; y: number }[] };
// The drawn ink's box in pad-width units, with the pad's height in the same units.
export type Ink = { x: number; y: number; w: number; padH: number };
// The whole pad is fitted to the page (100pt margins, at most 920pt wide) and
// centred, as before; the trimmed ink keeps its spot and size within it.
export function placeInk(ink: Ink, pageW: number, pageH: number) {
  const w = Math.min(pageW - 100, (pageH - 120) / ink.padH, 920);
  return { left: (pageW - w) / 2 + ink.x * w, top: (pageH - w * ink.padH) / 2 + ink.y * w, width: ink.w * w };
}
const LINE = 2; // stroke width in CSS px
function draw(ctx: CanvasRenderingContext2D, { color, points }: Stroke, from = 0) {
  Object.assign(ctx, { strokeStyle: color, fillStyle: color, lineWidth: LINE, lineCap: 'round', lineJoin: 'round' });
  if (points.length === 1) { ctx.beginPath(); ctx.arc(points[0].x, points[0].y, LINE / 2, 0, Math.PI * 2); ctx.fill(); return; }
  ctx.beginPath(); ctx.moveTo(points[Math.max(0, from - 1)].x, points[Math.max(0, from - 1)].y);
  for (const p of points.slice(Math.max(1, from))) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

export default function Signature({ onAdd,placing=false }: { placing?:boolean;onAdd: (value: string, drawn: boolean, color: string, ink?: Ink) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Strokes are kept in CSS pixels: the bitmap follows the pad's displayed size
  // (times the pixel ratio), so x and y scale alike on every screen.
  const strokes = useRef<Stroke[]>([]), active = useRef<number | null>(null), pen = useRef(false);
  const [ink, setInk] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#172d4a');
  const placeButton=useRef<HTMLButtonElement>(null);
  const placingTouch=useRef<{id:number;x:number;y:number;moved:boolean}|null>(null),touchClick=useRef(false);
  const submit=()=>{if(placing||(mode==='draw'?!ink:!name.trim()))return;if(mode==='type'){onAdd(name,false,color);return;}const [url,box]=exportInk();onAdd(url,true,color,box);};
  useEffect(()=>{
    const button=placeButton.current;if(!button)return;
    // The touch is handled by pointerup; suppress its later compatibility
    // click before the modal can disappear and expose the page behind it.
    const nativeClick=(e:TouchEvent)=>{if(e.cancelable)e.preventDefault();};
    const extraFinger=(e:TouchEvent)=>{if(e.touches.length>1)placingTouch.current=null;};
    button.addEventListener('touchstart',nativeClick,{passive:false});document.addEventListener('touchstart',extraFinger,{passive:true});
    return()=>{button.removeEventListener('touchstart',nativeClick);document.removeEventListener('touchstart',extraFinger);};
  },[]);

  // A fast tap after drawing can have pointer events but no compatibility
  // click. Treat the primary touch itself as the button's activation.
  const beginPlace=(e:PointerEvent<HTMLButtonElement>)=>{
    placingTouch.current=null;touchClick.current=e.pointerType==='touch';
    if(e.pointerType!=='touch'||!e.isPrimary||placing)return;
    placingTouch.current={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);
  };
  const movePlace=(e:PointerEvent<HTMLButtonElement>)=>{const p=placingTouch.current;if(p?.id===e.pointerId&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>12)p.moved=true;};
  const endPlace=(e:PointerEvent<HTMLButtonElement>)=>{
    const p=placingTouch.current;placingTouch.current=null;if(!p||p.id!==e.pointerId||p.moved||placing)return;
    const r=e.currentTarget.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)submit();
  };

  const scale = () => Math.max(2, window.devicePixelRatio || 1);
  const context = () => { const c = ref.current!, ctx = c.getContext('2d')!, s = c.width / (c.clientWidth || 1); ctx.setTransform(s, 0, 0, s, 0, 0); return ctx; };
  useLayoutEffect(() => {
    const c = ref.current; if (!c) return;
    const fit = () => {
      const w = Math.round(c.clientWidth * scale()), h = Math.round(c.clientHeight * scale());
      if (!w || (c.width === w && c.height === h)) return;
      Object.assign(c, { width: w, height: h }); const ctx = context(); strokes.current.forEach(s => draw(ctx, s));
    };
    fit(); const observer = new ResizeObserver(fit); observer.observe(c); return () => { observer.disconnect(); active.current = null; };
  }, [mode]);
  const point = (e: { clientX: number; clientY: number }) => { const c = ref.current!, r = c.getBoundingClientRect(), k = c.clientWidth / (r.width || 1); return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }; };
  const end = (e: React.PointerEvent) => { if (e.pointerId === active.current) active.current = null; };
  // The trimmed ink, rendered from the strokes, so the placed image wraps the signature.
  function exportInk(): [string, Ink] {
    const c = ref.current!, cw = c.clientWidth, ch = c.clientHeight, all = strokes.current.flatMap(s => s.points), m = LINE + 2;
    const x0 = Math.max(0, Math.min(...all.map(p => p.x)) - m), y0 = Math.max(0, Math.min(...all.map(p => p.y)) - m);
    const x1 = Math.min(cw, Math.max(...all.map(p => p.x)) + m), y1 = Math.min(ch, Math.max(...all.map(p => p.y)) + m), s = scale();
    const out = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round((x1 - x0) * s)), height: Math.max(1, Math.round((y1 - y0) * s)) }), ctx = out.getContext('2d')!;
    ctx.setTransform(s, 0, 0, s, -x0 * s, -y0 * s); strokes.current.forEach(st => draw(ctx, st));
    return [out.toDataURL('image/png'), { x: x0 / cw, y: y0 / cw, w: (x1 - x0) / cw, padH: ch / cw }];
  }
  return <>
    <p className="muted">Add a handwritten mark to your document. This is a visual signature.</p>
    <div className="segmented"><button disabled={placing} className={mode === 'draw' ? 'active' : ''} onClick={() => setMode('draw')}><PenLine size={15}/>Draw signature</button><button disabled={placing} className={mode === 'type' ? 'active' : ''} onClick={() => setMode('type')}><Type size={15}/>Type signature</button></div>
    {mode === 'draw' ? <div className="signature-pad"><canvas ref={ref} width={920} height={340} aria-label="Draw your signature" onPointerDown={e => {
      if(placing)return;
      // One finger or pen draws; a second touch or a resting palm is ignored.
      if (e.pointerType === 'pen') pen.current = true;
      if (active.current !== null || (pen.current && e.pointerType === 'touch')) return;
      active.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); setInk(true);
      const stroke = { color, points: [point(e)] }; strokes.current.push(stroke); draw(context(), stroke);
    }} onPointerMove={e => {
      if (placing || e.pointerId !== active.current) return;
      const stroke = strokes.current.at(-1)!, from = stroke.points.length;
      const events = e.nativeEvent.getCoalescedEvents?.();
      for (const ev of events?.length ? events : [e.nativeEvent]) stroke.points.push(point(ev));
      draw(context(), stroke, from);
    }} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}/><span>Sign here</span></div>
    : <input disabled={placing} className="signature-type" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus/>}
    <div className="dialog-actions"><input disabled={placing} type="color" title="Signature ink" aria-label="Signature ink" value={color} onChange={e => setColor(e.target.value)}/>{mode === 'draw' && <button disabled={placing} className="secondary" onClick={() => { strokes.current = []; const c = ref.current; c?.getContext('2d')?.clearRect(0, 0, c.width, c.height); setInk(false); }}><Eraser size={14}/>Clear</button>}<button ref={placeButton} className="primary" disabled={placing || (mode === 'draw' ? !ink : !name.trim())} onPointerDown={beginPlace} onPointerMove={movePlace} onPointerUp={endPlace} onPointerCancel={()=>{placingTouch.current=null;}} onLostPointerCapture={()=>{placingTouch.current=null;}} onClick={e=>{if(touchClick.current&&e.detail!==0){touchClick.current=false;return;}touchClick.current=false;submit();}}>{placing?'Placing signature…':'Place signature'}</button></div>
  </>;
}
