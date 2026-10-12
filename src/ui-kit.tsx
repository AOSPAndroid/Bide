// Small shared UI pieces: icon buttons, numeric fields and the modal shell.
import {useEffect,useRef,type ReactNode} from 'react';
import {X,type Type} from 'lucide-react';

export function IconButton({ icon: Icon, label, onClick, disabled, active }: { icon: typeof Type; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" aria-pressed={active===undefined?undefined:active} className={`icon-button ${active ? 'active' : ''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon size={16}/></button>;
}
export function Field({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <label className="number-field"><span>{label}</span><input aria-label={label} type="number" value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} min={min} max={max} step={step} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))); }}/></label>;
}
export function ModalShell({ title, children, close, wide }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    ((root?.querySelector('input:not([type=color]),textarea,select') || root?.querySelector('button')) as HTMLElement)?.focus();
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

