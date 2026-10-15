import {History} from 'lucide-react';

// Undo history as a list: click a step to go back (or forward) to it.
export default function HistoryPanel({past,future,onJump}:{past:string[];future:string[];onJump:(steps:number)=>void}){
 // past[i] names the change that followed state i; the current state is last.
 const items=[{label:'Open',offset:-past.length},...past.map((label,i)=>({label,offset:i+1-past.length})),...future.map((label,i)=>({label,offset:i+1}))];
 return <div className="history-list" role="listbox" aria-label="History">
  {items.map((item,i)=><button key={i} role="option" aria-selected={item.offset===0} className={item.offset>0?'future':item.offset===0?'current':''} onClick={()=>item.offset&&onJump(item.offset)}>
   <History size={12}/><span>{item.label}</span>
  </button>)}
  {!past.length&&!future.length&&<p className="layers-empty">Changes appear here. Click one to go back to it.</p>}
 </div>;
}
