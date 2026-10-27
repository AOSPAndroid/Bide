export type DiscoveryTool = 'edit' | 'merge' | 'compress';

export function discoveryTool(search:string):DiscoveryTool|undefined {
  const value=new URLSearchParams(search).get('tool');
  return value==='edit'||value==='merge'||value==='compress' ? value : undefined;
}

export const discoveryIntents = {
  edit:{title:'Edit your PDF',description:'Open a PDF to edit detected text, add content and review the result before downloading.',button:'Choose a PDF'},
  merge:{title:'Combine your PDFs',description:'Choose your files together, arrange their pages, then export one document. Your selected files replace the sample workspace.',button:'Choose PDFs to merge'},
  compress:{title:'Make your PDF smaller',description:'Open a PDF, choose an export quality and download the result. Savings depend on the original document.',button:'Choose a PDF to compress'},
} as const;
