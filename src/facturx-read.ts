// The invoice XML attached to a Factur-X / ZUGFeRD / XRechnung PDF: found
// through the document's associated files (/AF) and its embedded-files name
// tree, preferring the standard file names.
import {PDFDocument,PDFName,PDFDict,PDFArray,PDFRawStream,PDFString,PDFHexString,PDFRef,decodePDFRawStream,type PDFObject} from 'pdf-lib';

const known=['factur-x.xml','zugferd-invoice.xml','xrechnung.xml','order-x.xml'];

export async function embeddedInvoiceXml(bytes:Uint8Array):Promise<{name:string;xml:string}|undefined>{
 const doc=await PDFDocument.load(bytes,{ignoreEncryption:true,updateMetadata:false}),ctx=doc.context;
 const look=(o:PDFObject|undefined)=>o instanceof PDFRef?ctx.lookup(o):o;
 const specs:PDFDict[]=[],seen=new Set<PDFObject>();
 const add=(o:PDFObject|undefined)=>{const d=look(o);if(d instanceof PDFDict&&!seen.has(d)){seen.add(d);specs.push(d);}};
 const af=look(doc.catalog.get(PDFName.of('AF')));if(af instanceof PDFArray)for(let i=0;i<af.size();i++)add(af.get(i));
 // Name tree: /Names [name spec …] at the leaves, /Kids above them.
 const walk=(node:PDFObject|undefined,depth=0)=>{const n=look(node);if(!(n instanceof PDFDict)||depth>8)return;
  const names=look(n.get(PDFName.of('Names')));if(names instanceof PDFArray)for(let i=1;i<names.size();i+=2)add(names.get(i));
  const kids=look(n.get(PDFName.of('Kids')));if(kids instanceof PDFArray)for(let i=0;i<kids.size();i++)walk(kids.get(i),depth+1);};
 const tree=look(doc.catalog.get(PDFName.of('Names')));if(tree instanceof PDFDict)walk(tree.get(PDFName.of('EmbeddedFiles')));
 const files=specs.map(spec=>{
  const raw=look(spec.get(PDFName.of('UF')))??look(spec.get(PDFName.of('F'))),name=raw instanceof PDFString||raw instanceof PDFHexString?raw.decodeText():'';
  const ef=look(spec.get(PDFName.of('EF'))),stream=ef instanceof PDFDict?look(ef.get(PDFName.of('F')))??look(ef.get(PDFName.of('UF'))):undefined;
  return {name,stream:stream instanceof PDFRawStream?stream:undefined};
 }).filter(f=>f.stream&&/\.xml$/i.test(f.name));
 const file=files.find(f=>known.includes(f.name.toLowerCase()))??files[0];
 if(!file)return undefined;
 return {name:file.name,xml:new TextDecoder().decode(decodePDFRawStream(file.stream!).decode())};
}
