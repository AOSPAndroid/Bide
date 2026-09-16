import {importVisio} from './browser/visio';
import {useEffect, useRef, useState, type RefObject} from 'react';
import {Download, FilePlus2, FolderOpen, ImagePlus, Network, Save, X} from 'lucide-react';
import {download, loadLocal, saveLocal, safeName, uid} from './model';
import {exportInBrowser, importDocument} from './browser/engine';
import {DIAGRAM_URL, diagramTemplates, exportRequestId, imageDataBlob, type DiagramDraft, type DiagramIntent} from './diagram-data';

export type DiagramCommands = {save: () => void; open: () => void; newDiagram: () => void; export: (format: DiagramIntent) => void; edit: (draft: DiagramDraft) => void};
type Props = {active: boolean; commands: RefObject<DiagramCommands | null>; onPlace: (data: string, xml: string, name: string) => Promise<void>; onNew: () => void; onPalette: () => void};
type Pending = {id: string; intent: DiagramIntent; timer: ReturnType<typeof setTimeout>};

export default function Diagrams({active, commands, onPlace, onNew, onPalette}: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(diagramTemplates.flowchart);
  const draftRef = useRef(draft); draftRef.current = draft;
  const [restored, setRestored] = useState(false);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState(false);
  const [notice, setNotice] = useState('');
  const pending = useRef<Pending | null>(null);
  const incoming = useRef<DiagramDraft | null>(null);
  const onPlaceRef = useRef(onPlace); onPlaceRef.current = onPlace;
  const onPaletteRef = useRef(onPalette); onPaletteRef.current = onPalette;
  const send = (message: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(message), location.origin);
  const update = (next: DiagramDraft) => {draftRef.current = next; setDraft(next); setSaved(false);};

  useEffect(() => {
    let cancelled = false;
    loadLocal<DiagramDraft>('diagram').then(value => {
      if (!cancelled && value?.xml && !incoming.current) update(value);
    }).catch(() => {if (!cancelled) setNotice('Local autosave is unavailable. Use Save .drawio to keep your diagram.');})
      .finally(() => {if (!cancelled) setRestored(true);});
    return () => {cancelled = true;};
  }, []);
  useEffect(() => {
    if (!restored) return;
    let current = true;
    const timer = setTimeout(() => saveLocal('diagram', draft).then(() => {
      if(current){setSaved(true);send({action:'status',message:'Saved locally in bide',modified:false});}
    }).catch(() => {
      if(current)setNotice('Local autosave is unavailable. Use Save .drawio to keep your diagram.');
    }), 400);
    return () => {current = false; clearTimeout(timer);};
  }, [draft, restored, ready]);
  useEffect(() => {
    if (!restored || ready) return;
    const timer = setTimeout(() => setError('The diagram editor has not started. Extract the complete bide-browser.zip, including site/diagrams, then reload.'), 30000);
    return () => clearTimeout(timer);
  }, [restored, ready]);

  const load = (next: DiagramDraft) => {
    update(next); setTemplates(false); setError('');
    if (ready) send({action:'load', xml:next.xml, title:next.name, autosave:1, saveAndExit:0, noSaveBtn:1, noExitBtn:1});
    else incoming.current = next;
  };
  const request = (intent: DiagramIntent) => {
    if (!ready || pending.current) return;
    setError(''); setBusy(intent === 'save' ? 'Saving diagram…' : 'Preparing diagram…');
    const id = uid();
    pending.current = {id, intent, timer:setTimeout(() => {
      pending.current = null; setBusy(''); setError('The diagram export took too long. Try a smaller diagram or export SVG.');
    }, 45000)};
    send({action:'export', requestId:id, format:intent === 'save' ? 'xml' : intent === 'svg' ? 'svg' : 'xmlpng', currentPage:true, scale:2, border:16, embedImages:true, embedFonts:false, theme:'light'});
  };
  commands.current = {save:()=>request('save'), open:()=>fileInput.current?.click(), newDiagram:()=>setTemplates(true), export:request, edit:load};

  useEffect(() => {
    const receive = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== location.origin || typeof event.data !== 'string') return;
      let data;
      try {data = JSON.parse(event.data);} catch {return;}
      if (data.event === 'bide-open-file') {fileInput.current?.click();}
      else if (data.event === 'bide-command-palette') {onPaletteRef.current();}
      else if (data.event === 'configure') {
        send({action:'configure', config:{defaultFonts:['Arial','Verdana','Times New Roman','Georgia','Courier New'], enableAi:false}});
      } else if (data.event === 'init') {
        setReady(true); setError('');
        const value = incoming.current || draftRef.current; incoming.current = null; update(value);
        send({action:'load', xml:value.xml, title:value.name, autosave:1, saveAndExit:0, noSaveBtn:1, noExitBtn:1});
      } else if ((data.event === 'autosave' || data.event === 'save') && typeof data.xml === 'string') {
        update({...draftRef.current, xml:data.xml});
        if (data.event === 'save') download(new Blob([data.xml], {type:'application/xml'}), safeName(draftRef.current.name) + '.drawio');
      } else if (data.event === 'export' && pending.current && exportRequestId(data.message) === pending.current.id) {
        const job = pending.current;
        clearTimeout(job.timer);
        try {
          if (data.error) throw new Error(String(data.error));
          if (typeof data.xml !== 'string') throw new Error('The diagram editor did not return an editable document.');
          const name = safeName(draftRef.current.name);
          update({...draftRef.current, xml:data.xml});
          if (job.intent === 'save') download(new Blob([data.xml], {type:'application/xml'}), name + '.drawio');
          else {
            const blob = imageDataBlob(data.data, job.intent === 'svg' ? 'svg' : 'png');
            if (job.intent === 'place') await onPlaceRef.current(data.data, data.xml, name);
            else if (job.intent === 'pdf') {
              const doc = await importDocument(new File([blob], name + '.png', {type:'image/png'}));
              const pdf = await exportInBrowser({title:name, format:'pdf', compression:'lossless', range:'', dpi:144,
                pages:doc.pages.map(p => ({width:p.width/2, height:p.height/2, source:doc.id, index:p.index, svg:''}))});
              download(pdf, name + '.pdf');
            } else download(blob, name + '.' + job.intent);
          }
        } catch (error) {setError(error instanceof Error ? error.message : String(error));}
        finally {pending.current = null; setBusy('');}
      }
    };
    window.addEventListener('message', receive);
    return () => {window.removeEventListener('message', receive); if (pending.current) clearTimeout(pending.current.timer);};
  }, []);

  async function open(file: File) {
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('Choose a diagram smaller than 30 MB.');
      const visio = /\.vsdx$/i.test(file.name);
      if(visio)setBusy('Importing Visio locally…');
      const xml = visio ? await importVisio(file) : await file.text();
      const parsed = new DOMParser().parseFromString(xml, 'application/xml');
      if (parsed.querySelector('parsererror') || !['mxfile','mxGraphModel'].includes(parsed.documentElement.tagName)) throw new Error('Choose a .vsdx, .drawio or draw.io XML file. Older .vsd files must first be saved as .vsdx in Visio.');
      if(visio)setNotice('Visio imported as editable draw.io shapes. Check formatting, fonts and connectors. Save as .drawio to keep editing; Visio export is not supported.');
      onNew(); load({name:file.name.replace(/\.(drawio|xml|vsdx)$/i,''), xml});
    } catch (error) {setError(error instanceof Error ? error.message : String(error));} finally {setBusy('');}
  }
  return <section className="diagrams-workspace" style={{display:active ? 'flex' : 'none'}} aria-label="Diagram workspace">
    <input type="file" ref={fileInput} accept=".drawio,.xml,.vsdx" hidden onChange={e=>{if(e.target.files?.[0])void open(e.target.files[0]); e.target.value='';}}/>
    <div className="diagram-header">
      <div className="document-name"><Network size={16}/><input aria-label="Diagram name" value={draft.name} onChange={e=>update({...draft,name:e.target.value})}/><span className="save-state">{saved?'Saved locally':'Editing'}</span></div>
      <div className="diagram-actions"><button onClick={()=>setTemplates(true)} disabled={!ready||!!busy}><FilePlus2 size={14}/>New</button><button onClick={()=>fileInput.current?.click()} disabled={!ready||!!busy}><FolderOpen size={14}/>Open</button><button onClick={()=>request('save')} disabled={!ready||!!busy}><Save size={14}/>Save .drawio</button><span className="divider"/><button onClick={()=>request('svg')} disabled={!ready||!!busy}>SVG</button><button onClick={()=>request('png')} disabled={!ready||!!busy}>PNG</button><button onClick={()=>request('pdf')} disabled={!ready||!!busy}><Download size={14}/>PDF</button><button className="primary" onClick={()=>request('place')} disabled={!ready||!!busy}><ImagePlus size={14}/>Place in document</button></div>
    </div>
    {(error||notice)&&<div className="diagram-notice" role="alert"><span>{error||notice}</span><button aria-label="Dismiss diagram notice" onClick={()=>{setError('');setNotice('');}}><X size={16}/></button></div>}
    <div className="diagram-stage" onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.stopPropagation();}}>
      {restored&&<iframe ref={frame} title="draw.io diagram editor" src={DIAGRAM_URL} allow="clipboard-read; clipboard-write"/>}
      {(!ready||busy)&&<div className="diagram-loading" role="status"><span className="spinner"/>{busy||'Loading local diagram editor…'}</div>}
    </div>
    <div className="diagram-footer"><span>Powered by draw.io · Local engine · Files stay in your browser</span><span>Exports use the current page. Save .drawio keeps every page editable. PDF uses a high-resolution image.</span></div>
    {templates&&<div className="modal-backdrop" onClick={()=>setTemplates(false)}><div className="dialog" role="dialog" aria-modal="true" aria-label="New diagram" onClick={e=>e.stopPropagation()}><div className="modal-header"><h2>Create a diagram</h2><button aria-label="Close diagram templates" onClick={()=>setTemplates(false)}><X size={18}/></button></div><p className="muted">Save your current diagram first if you want to keep a separate copy.</p><div className="preset-grid">{Object.entries(diagramTemplates).map(([key,value])=><button key={key} onClick={()=>{onNew();load({...value});}}><Network size={22}/><strong>{key==='blank'?'Blank canvas':value.name}</strong><span>{key==='blank'?'Build your own diagram':'Start with editable shapes'}</span></button>)}</div></div></div>}
  </section>;
}
