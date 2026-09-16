import {useState} from 'react';
import {ArrowUpRight, FileText, Search, ShieldCheck, type LucideIcon} from 'lucide-react';

export type PdfTool = {title:string; desc:string; icon:LucideIcon; category:string; run:()=>void};
export default function PdfWorkspace({tools,name,pages,onEdit,onRun}: {tools:PdfTool[];name:string;pages:number;onEdit:()=>void;onRun:(tool:PdfTool)=>void}) {
  const [category,setCategory]=useState('All tools');
  const [search,setSearch]=useState('');
  const visible=tools.filter(t=>(category==='All tools'||t.category===category)&&`${t.title} ${t.desc}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="pdf-home" aria-label="PDF MasterTool workspace">
    <div className="pdf-home-content">
      <header className="pdf-home-heading">
        <div><span className="workspace-eyebrow">DOCUMENT WORKSPACE</span><h1>PDF MasterTool<span>.</span></h1><p>Edit, organize and convert. Everything stays on your device.</p></div>
        <button className="current-document" onClick={onEdit}><span className="current-document-icon"><FileText size={26}/></span><span><small>CURRENT DOCUMENT</small><strong>{name||'Untitled'}</strong><span>{pages} {pages===1?'page':'pages'} · Continue editing</span></span><ArrowUpRight size={18}/></button>
      </header>
      <div className="pdf-tools-filter"><div className="pdf-categories" role="group" aria-label="PDF tool categories">
        {['All tools','Organize','Convert','Edit','Security'].map(label=><button key={label} aria-pressed={category===label} onClick={()=>setCategory(label)}>{label}</button>)}
      </div><label className="pdf-tool-search"><Search size={16}/><input aria-label="Search PDF tools" placeholder="Find a PDF tool…" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
      <div className="pdf-tools-grid">{visible.map(t=><button className="pdf-tool-card" key={t.title} onClick={()=>onRun(t)}><span className="pdf-tool-icon"><t.icon size={23} strokeWidth={1.7}/></span><span className="pdf-tool-category">{t.category}</span><strong>{t.title}</strong><p>{t.desc}</p><ArrowUpRight className="pdf-tool-arrow" size={17}/></button>)}</div>
      {!visible.length&&<p className="pdf-no-results">No matching tools. Try another search or category.</p>}
      <div className="pdf-home-note"><ShieldCheck size={15}/><span>Local processing. Your documents stay in your browser.</span><span className="pdf-home-shortcut">Find any action with <kbd>Ctrl K</kbd></span></div>
    </div>
  </main>;
}
