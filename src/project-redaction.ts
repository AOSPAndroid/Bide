import type {Project} from './model';
import type {Rect} from './redaction';
import {overlaps} from './redaction';

// A PDF source contains a whole document. Rebuild every retained source from
// only the pages the project actually uses, including older sibling versions.
// Otherwise a different visible page can keep a hidden, unredacted page alive.
export async function sanitizeProjectSources(project:Project,sanitize:(source:string,indexes:number[])=>Promise<{id:string;data:string}>):Promise<Project>{
  const sources:Record<string,string>={},mapping=new Map<string,{id:string;indexes:number[]}>();
  for(const page of project.pages){
    if(!page.source||mapping.has(page.source))continue;
    const indexes=[...new Set(project.pages.filter(p=>p.source===page.source).map(p=>p.index))];
    const result=await sanitize(page.source,indexes);sources[result.id]=result.data;mapping.set(page.source,{id:result.id,indexes});
  }
  return {...project,sources,pages:project.pages.map(p=>{
    const next=p.source?mapping.get(p.source):undefined;
    return next?{...p,source:next.id,index:next.indexes.indexOf(p.index)}:p;
  })};
}

export const remainingForms=<T extends Rect>(fields:T[],rects:Rect[])=>fields.filter(f=>!rects.some(r=>overlaps(f,r)));
