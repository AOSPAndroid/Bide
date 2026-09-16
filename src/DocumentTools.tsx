import { useState } from 'react';
export type StampOptions = { kind: 'watermark' | 'numbers'; text: string; range: string; size: number; opacity: number; angle: number; start: number; position: 'top' | 'bottom'; color: string };
export type CropMargins = { left: number; top: number; right: number; bottom: number };

export function StampForm({ kind, onApply }: { kind: StampOptions['kind']; onApply: (options: StampOptions) => void }) {
  const [value, setValue] = useState<StampOptions>({ kind, text: kind === 'watermark' ? 'CONFIDENTIAL' : 'Page {n} of {total}', range: '', size: kind === 'watermark' ? 48 : 11, opacity: kind === 'watermark' ? 22 : 100, angle: kind === 'watermark' ? -35 : 0, start: 1, position: 'bottom', color: '#365849' });
  const update = (key: keyof StampOptions, v: string | number) => setValue(current => ({ ...current, [key]: v }));
  return <form onSubmit={e => { e.preventDefault(); onApply(value); }}>
    <p className="muted">Add editable text layers to the selected pages. You can reposition them afterward or undo the operation.</p>
    <label className="stacked-label">{kind === 'watermark' ? 'Watermark text' : 'Numbering template'}<input required maxLength={300} value={value.text} onChange={e => update('text', e.target.value)}/></label>
    {kind === 'numbers' && <p className="fine-print">Use {'{n}'} for the sequence number, {'{total}'} for selected page count, and {'{page}'} for the document page number.</p>}
    <label className="stacked-label">Pages<input placeholder="All pages, or 1-3, 5" value={value.range} onChange={e => update('range', e.target.value)}/></label>
    <div className="field-grid"><label className="stacked-label">Font size (pt)<input type="number" min={6} max={300} required value={value.size} onChange={e => update('size', Number(e.target.value))}/></label><label className="stacked-label">Opacity (%)<input type="number" min={1} max={100} required value={value.opacity} onChange={e => update('opacity', Number(e.target.value))}/></label></div>
    {kind === 'watermark' ? <label className="stacked-label">Angle<input type="number" min={-180} max={180} required value={value.angle} onChange={e => update('angle', Number(e.target.value))}/></label> : <div className="field-grid"><label className="stacked-label">Start at<input type="number" min={0} max={999999} required value={value.start} onChange={e => update('start', Number(e.target.value))}/></label><label className="stacked-label">Position<select value={value.position} onChange={e => update('position', e.target.value)}><option value="bottom">Footer</option><option value="top">Header</option></select></label></div>}
    <label className="color-field"><input type="color" aria-label="Stamp color" value={value.color} onChange={e => update('color', e.target.value)}/><span>Text color</span></label>
    <div className="dialog-actions"><button className="primary" type="submit">Add {kind === 'watermark' ? 'watermarks' : 'page numbers'}</button></div>
  </form>;
}

export function CropForm({ width, height, onApply }: { width: number; height: number; onApply: (margins: CropMargins) => void }) {
  const [value, setValue] = useState<CropMargins>({ left: 0, top: 0, right: 0, bottom: 0 });
  const valid = value.left + value.right < width && value.top + value.bottom < height;
  return <form onSubmit={e => { e.preventDefault(); if (valid) onApply(value); }}>
    <p className="muted">Trim the visible boundary of the current page. Dimensions are in points (72 pt = 1 inch).</p>
    <div className="field-grid">{(['left', 'top', 'right', 'bottom'] as const).map(key => <label className="stacked-label" key={key}>{key.charAt(0).toUpperCase() + key.slice(1)} margin<input type="number" min={0} max={(key === 'left' || key === 'right' ? width : height) - 1} required value={value[key]} onChange={e => setValue({ ...value, [key]: Number(e.target.value) })}/></label>)}</div>
    <div className="crop-preview" style={{ aspectRatio: `${width}/${height}` }}><div style={{ left: `${100 * value.left / width}%`, top: `${100 * value.top / height}%`, right: `${100 * value.right / width}%`, bottom: `${100 * value.bottom / height}%` }}/></div>
    <p className="fine-print">Result: {Math.max(0, width - value.left - value.right).toFixed(1)} × {Math.max(0, height - value.top - value.bottom).toFixed(1)} pt</p>
    <p className="notice">Cropping hides content outside the boundary; it does not redact it. Current layers become part of the PDF background. Undo restores them.</p>
    <div className="dialog-actions"><button className="primary" type="submit" disabled={!valid}>Crop current page</button></div>
  </form>;
}

export function PasswordForm({ name, incorrect, onSubmit }: { name: string; incorrect: boolean; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState('');
  return <form onSubmit={e => { e.preventDefault(); onSubmit(password); }}>
    <p className="muted">Enter the password for {name}.</p>
    {incorrect && <p className="notice">That password was not accepted. Try again.</p>}
    <label className="stacked-label">Document password<input type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)}/></label>
    <p className="notice">The unlocked document will be stored in your local workspace and saved projects without encryption. You can protect the exported PDF with a new password.</p>
    <div className="dialog-actions"><button className="primary" type="submit">Unlock and open</button></div>
  </form>;
}
