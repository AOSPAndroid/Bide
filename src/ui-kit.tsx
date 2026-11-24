// Small shared UI pieces: icon buttons, numeric fields and the modal shell.
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {X,type Type} from 'lucide-react';

export function IconButton({ icon: Icon, label, onClick, disabled, active }: { icon: typeof Type; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" aria-pressed={active===undefined?undefined:active} className={`icon-button ${active ? 'active' : ''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon size={16}/></button>;
}
export function Field({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <label className="number-field"><span>{label}</span><input aria-label={label} type="number" value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} min={min} max={max} step={step} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))); }}/></label>;
}
// focusField=false starts on the first button, so a touch screen keeps its keyboard down.
export function ModalShell({ title, children, close, wide, focusField = true }: { title: string; children: ReactNode; close: () => void; wide?: boolean; focusField?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    (((focusField && root?.querySelector('input:not([type=color]),textarea,select')) || root?.querySelector('button')) as HTMLElement)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,textarea,[tabindex="0"]')];
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><IconButton icon={X} label="Close dialog" onClick={close}/></div>{children}</div></div>;
}

// A slider that reports its value when released (pointer up, key up or blur),
// for settings whose effect takes a moment to redraw.
export function ReleaseSlider({label,value,min,max,step,disabled,format=String,onCommit}:{label:string;value:number;min:number;max:number;step:number;disabled?:boolean;format?:(v:number)=>string;onCommit:(v:number)=>void}){
  const [shown,setShown]=useState(value);useEffect(()=>setShown(value),[value]);
  const commit=()=>{if(shown!==value)onCommit(shown);};
  return <label className="stacked-label">{label}: {format(shown)}<input aria-label={label} type="range" min={min} max={max} step={step} value={shown} disabled={disabled} onChange={e=>setShown(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/></label>;
}
