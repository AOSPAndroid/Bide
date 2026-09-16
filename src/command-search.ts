export type SearchableCommand = {label:string; keywords?:string; aliases?:string[]; category?:string; disabled?:string};
const normalize = (value:string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();

export function searchCommands<T extends SearchableCommand>(commands:T[],query:string):T[] {
  const needle=normalize(query);
  if(!needle)return commands;
  const words=needle.split(' ');
  return commands.map((command,index)=>{
    const label=normalize(command.label), aliases=(command.aliases||[]).map(normalize);
    const text=[label,normalize(command.keywords||''),normalize(command.category||''),...aliases].join(' ');
    const score=aliases.includes(needle)?100:label===needle?90:label.startsWith(needle)?70:label.includes(needle)?60:words.every(word=>text.includes(word))?40:0;
    return {command,index,score};
  }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).map(item=>item.command);
}

export function commandMetadata(label:string):Pick<SearchableCommand,'aliases'|'keywords'|'category'> {
  if(label==='Open diagram workspace')return {category:'Workspaces',aliases:['visio','draw','diagram','diagrams','drawio','draw.io','flowchart','flow chart','uml','network diagram'],keywords:'Microsoft Visio vsdx shapes connectors'};
  if(label==='Open photo editor')return {category:'Workspaces',aliases:['photo','photos','photoshop','photopea','image editor','design'],keywords:'pictures graphics psd'};
  if(label==='Open PDF MasterTool')return {category:'Workspaces',aliases:['pdf','pdf tools','ilovepdf','documents','pdf master'],keywords:'convert compress merge split'};
  const extra:Record<string,string>={'Open PDF, image or Office file':'open import psd photoshop docx xlsx pptx jpg png svg file','Extract text to Word':'docx pdf to word conversion','Extract plain text':'txt text extraction','Export pages as JPEG':'jpg jpeg image','Save editable project':'bide save download project','Add signature':'sign signing autograph'};
  if(extra[label])return {category:'Document',keywords:extra[label]};
  if(/diagram|drawio/i.test(label))return {category:'Diagrams',keywords:'draw drawio visio flowchart vsdx'};
  if(/page/i.test(label)&&!/export|extract/i.test(label))return {category:'Pages',keywords:'document artboard navigation organize'};
  if(/export|extract|compress|convert|merge|split|password/i.test(label))return {category:'Export & PDF',keywords:'download conversion save output'};
  if(/brush|eras|draw|highlight|pan|tool/i.test(label))return {category:'Tools',keywords:'drawing paint tools'};
  if(/font|text|bold|italic|underline/i.test(label))return {category:'Text',keywords:'typography type formatting'};
  if(/layer|selection|mask|align|flip|filter|grayscale|sepia|invert/i.test(label))return {category:'Layers',keywords:'object selection artwork'};
  return {category:'Document',keywords:''};
}
