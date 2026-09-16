import { useRef, useState } from 'react';
import { Eraser, PenLine, Type } from 'lucide-react';

export default function Signature({ onAdd }: { onAdd: (value: string, drawn: boolean, color: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [ink, setInk] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#172d4a');
  return <>
    <p className="muted">Add a handwritten mark to your document. This is a visual signature.</p>
    <div className="segmented"><button className={mode === 'draw' ? 'active' : ''} onClick={() => setMode('draw')}><PenLine size={15}/>Draw signature</button><button className={mode === 'type' ? 'active' : ''} onClick={() => setMode('type')}><Type size={15}/>Type signature</button></div>
    {mode === 'draw' ? <div className="signature-pad"><canvas ref={ref} width={920} height={340} aria-label="Draw your signature" onPointerDown={e => {
      const c = ref.current!, r = c.getBoundingClientRect(), ctx = c.getContext('2d')!;
      c.setPointerCapture(e.pointerId); drawing.current = true; setInk(true);
      ctx.beginPath(); ctx.moveTo((e.clientX-r.left)*c.width/r.width, (e.clientY-r.top)*c.height/r.height); ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }} onPointerMove={e => { if (!drawing.current) return; const c = ref.current!, r = c.getBoundingClientRect(), ctx = c.getContext('2d')!; ctx.lineTo((e.clientX-r.left)*c.width/r.width, (e.clientY-r.top)*c.height/r.height); ctx.stroke(); }} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false}/><span>Sign here</span></div>
    : <input className="signature-type" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus/>}
    <div className="dialog-actions"><input type="color" title="Signature ink" value={color} onChange={e => setColor(e.target.value)}/>{mode === 'draw' && <button className="secondary" onClick={() => { ref.current?.getContext('2d')?.clearRect(0,0,920,340); setInk(false); }}><Eraser size={14}/>Clear</button>}<button className="primary" disabled={mode === 'draw' ? !ink : !name.trim()} onClick={() => onAdd(mode === 'draw' ? ref.current!.toDataURL('image/png') : name, mode === 'draw', color)}>Place signature</button></div>
  </>;
}
