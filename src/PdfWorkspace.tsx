import {useState} from 'react';
import {ArrowUpRight, FileText, FolderOpen, Search, ShieldCheck, X, type LucideIcon} from 'lucide-react';

export type PdfTool = {title:string; desc:string; icon:LucideIcon; category:string; run:()=>void};
const categories = [
  {name:'Organize',description:'Arrange pages and reduce file size.'},
  {name:'Convert',description:'Move between documents and image formats.'},
  {name:'Edit',description:'Add content and finish your document.'},
  {name:'Security',description:'Manage password protection.'},
];
export default function PdfWorkspace({tools,name,pages,onEdit,onOpen,onRun}: {tools:PdfTool[];name:string;pages:number;onEdit:()=>void;onOpen:()=>void;onRun:(tool:PdfTool)=>void}) {
  const [category,setCategory]=useState('All tools');
  const [search,setSearch]=useState('');
  const visible=tools.filter(t=>(category==='All tools'||t.category===category)&&`${t.title} ${t.desc}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <main className="pdf-home" aria-label="PDF MasterTool workspace">
    <div className="pdf-home-content">
      <header className="pdf-home-heading">
        <div><span className="workspace-eyebrow">DOCUMENT WORKSPACE</span><h1>What would you like to do?</h1><p>Open a file, then choose a tool. Your documents stay on your device.</p><div className="pdf-start-actions"><button className="primary" onClick={onOpen}><FolderOpen size={18}/>Open document <kbd>Ctrl O</kbd></button><button className="secondary" onClick={onEdit}>Edit current document<ArrowUpRight size={16}/></button></div></div>
        <button className="current-document" onClick={onEdit}><span className="current-document-icon"><FileText size={26}/></span><span><small>CURRENT DOCUMENT</small><strong>{name||'Untitled'}</strong><span>{pages} {pages===1?'page':'pages'} · Continue editing</span></span><ArrowUpRight size={18}/></button>
      </header>
      <div className="pdf-tools-filter"><div className="pdf-categories" role="group" aria-label="PDF tool categories">
        {['All tools',...categories.map(c=>c.name)].map(label=><button key={label} aria-pressed={category===label} onClick={()=>setCategory(label)}>{label}<span>{label==='All tools'?tools.length:tools.filter(t=>t.category===label).length}</span></button>)}
      </div><label className="pdf-tool-search"><Search size={16}/><input aria-label="Search PDF tools" placeholder="Search tools, e.g. compress" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button aria-label="Clear tool search" onClick={()=>setSearch('')}><X size={15}/></button>}</label></div>
      <p className="tool-results" role="status">{visible.length} {visible.length===1?'tool':'tools'}{search.trim()?` matching “${search.trim()}”`:''} · Actions apply to your current document unless they open a file.</p>
      {categories.map(group=>{const items=visible.filter(t=>t.category===group.name);return items.length>0&&<section className="pdf-tool-section" key={group.name} aria-label={`${group.name} tools`}><div className="pdf-section-heading"><h2>{group.name}</h2><p>{group.description}</p></div><div className="pdf-tools-grid">{items.map(t=><button className="pdf-tool-card" key={t.title} onClick={()=>onRun(t)}><span className="pdf-tool-icon"><t.icon size={22} strokeWidth={1.7}/></span><strong>{t.title}</strong><p>{t.desc}</p><ArrowUpRight className="pdf-tool-arrow" size={17}/></button>)}</div></section>;})}
      {!visible.length&&<div className="pdf-no-results"><Search size={26}/><h2>No tools found</h2><p>Try a different phrase or show all tools.</p><button className="secondary" onClick={()=>{setSearch('');setCategory('All tools');}}>Reset filters</button></div>}
      <div className="pdf-home-note"><ShieldCheck size={15}/><span>Local processing. No document uploads.</span><span className="pdf-home-shortcut">Find any action with <kbd>Ctrl K</kbd></span></div>
    </div>
  </main>;
}
