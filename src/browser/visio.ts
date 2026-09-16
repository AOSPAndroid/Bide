/** The bundled draw.io importer converts modern Visio locally, without a conversion service. */
export function importVisio(file: File): Promise<string> {
  if (!/\.vsdx$/i.test(file.name)) return Promise.reject(new Error('Use a modern Visio .vsdx file. Save older .vsd files as .vsdx in Visio first.'));
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');frame.hidden=true;frame.title='Local Visio importer';
    let finished=false;
    const finish=(xml?:string,error?:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);frame.remove();if(xml)resolve(xml);else reject(new Error(error instanceof Error?error.message:'This Visio file could not be imported. Try saving it as a new .vsdx file in Visio.'));};
    const timer=setTimeout(()=>finish(undefined,new Error('Visio import timed out. Try a smaller diagram.')),60000);
    frame.onload=()=>{try{
      const importer=frame.contentWindow as Window & {doImport?:(buffer:null,done:(xml:string)=>void,fail:(error:unknown)=>void,file:File)=>void};
      if(!importer.doImport)throw new Error('The local Visio importer is unavailable.');
      importer.doImport(null,xml=>finish(xml),error=>finish(undefined,error),file);
    }catch(error){finish(undefined,error);}};
    frame.onerror=()=>finish();frame.src='./diagrams/runtime/vsdxImporter.html';document.body.append(frame);
  });
}
