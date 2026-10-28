// Phones: the File…Help menubar does not fit, so a Menu button opens the same
// menus as a sheet, one group at a time. Hidden above 600px (mobile-chrome.css).
import {useState} from 'react';
import {createPortal} from 'react-dom';
import {Menu} from 'lucide-react';
import {ModalShell} from './ui-kit';
import type {PaletteAction} from './editor-types';

// The phone options bar leaves out Snap to page; it lives in View instead.
const extra:Record<string,string[]>={View:['Toggle snapping to page']};

export default function PhoneMenu({menus,actions,run}:{menus:Record<string,string[]>;actions:PaletteAction[];run:(a:PaletteAction)=>void}){
 const [open,setOpen]=useState(false);
 return <>
  <button className="phone-menu-button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><Menu size={18}/><span>Menu</span></button>
  {open&&createPortal(<ModalShell title="Menu" close={()=>setOpen(false)}><nav className="phone-menu" aria-label="Application menu">
   {Object.entries(menus).map(([group,names])=><details key={group} name="phone-menu"><summary>{group}</summary><div>
    {[...names,...extra[group]??[]].map(name=>{const a=actions.find(x=>x.label===name);return a&&<button key={name} aria-disabled={!!a.disabled} onClick={()=>{if(a.disabled)return;setOpen(false);run(a);}}>
     <a.icon size={18}/><span><strong>{name}</strong>{a.disabled&&<small>{a.disabled}</small>}</span>
    </button>;})}
   </div></details>)}
  </nav></ModalShell>,document.body)}
 </>;
}
