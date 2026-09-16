import {useEffect, useRef} from 'react';
import {flushSync} from 'react-dom';
import type {Workspace} from './WorkspaceDock';

type SiteTool = {
  name:string;title:string;description:string;inputSchema:object;
  annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};
  execute:(input:unknown)=>unknown;
};
type ToolContext = {registerTool:(tool:SiteTool,options:{signal:AbortSignal})=>void|Promise<void>};

export function useWorkspaceTools(view:Workspace, select:(view:Workspace)=>void) {
  const current=useRef({view,select});current.current={view,select};
  useEffect(()=>{
    const context=(document as Document & {modelContext?:ToolContext}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    const register=(tool:SiteTool)=>{
      try {void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});} catch { /* Optional browser capability. */ }
    };
    register({name:'get_workspace',title:'Read current workspace',description:'Read which bide workspace is currently visible. Does not read document contents.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},
      execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object.');return {workspace:current.current.view};}});
    register({name:'open_workspace',title:'Open a workspace',description:'Switch to the photo editor, PDF tools home, or draw.io. Keeps the current document and diagram drafts. Does not export, upload or modify document contents.',
      inputSchema:{type:'object',properties:{workspace:{type:'string',enum:['photo','pdf','diagrams']}},required:['workspace'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input){
        if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='workspace'))throw new Error('Expected a workspace.');
        const workspace=(input as {workspace?:unknown}).workspace;
        if(workspace!=='photo'&&workspace!=='pdf'&&workspace!=='diagrams')throw new Error('Choose photo, pdf or diagrams.');
        flushSync(()=>current.current.select(workspace));return {workspace:current.current.view};
      }});
    return ()=>lifecycle.abort();
  },[]);
}
