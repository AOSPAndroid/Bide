import {workspaces, type Workspace} from './WorkspaceDock';

export default function WorkspaceNav({active,onSelect}:{active:Workspace;onSelect:(view:Workspace)=>void}) {
  return <nav className="workspace-nav" aria-label="Choose workspace">
    {workspaces.map(item=><button key={item.id} aria-current={active===item.id?'page':undefined} onClick={()=>onSelect(item.id)}>
      <item.icon size={19}/><span><strong>{item.label}</strong><small>{item.detail}</small></span>
    </button>)}
    <span className="workspace-nav-note">One toolkit. Three workspaces.</span>
  </nav>;
}
