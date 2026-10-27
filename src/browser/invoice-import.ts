// Opening an invoice someone sent: an e-invoice (Factur-X/ZUGFeRD PDF, UBL or
// CII XML) is read exactly; a PDF without invoice data, or a photo or scan,
// is read with OCR into a draft to check.
import {readInvoiceXml,type ReadInvoice} from '../einvoice-read';
import {embeddedInvoiceXml} from '../facturx-read';
import {invoiceFromOcr,type ScannedInvoice} from '../invoice-ocr';
import type {OcrReader} from './ocr';

export type ImportedInvoice={kind:'einvoice';read:ReadInvoice;xmlName?:string}|{kind:'scan';scan:ScannedInvoice};

async function scan(image:CanvasImageSource&{width:number;height:number},engine:OcrReader,signal?:AbortSignal){
 const canvas=Object.assign(document.createElement('canvas'),{width:image.width,height:image.height});canvas.getContext('2d')!.drawImage(image,0,0);
 const {recognizeImage}=await import('./ocr'),regions=await recognizeImage(canvas,{grouping:'lines',engine,languages:['fra','eng'],signal});
 return invoiceFromOcr(regions.map(r=>({text:r.text,left:r.left,top:r.top,width:r.width,height:r.height})));
}

export async function importInvoiceFile(file:File,{engine,signal,onStatus}:{engine:OcrReader;signal?:AbortSignal;onStatus?:(s:string)=>void}):Promise<ImportedInvoice>{
 if(/\.xml$/i.test(file.name)||file.type.includes('xml'))return {kind:'einvoice',read:readInvoiceXml(await file.text())};
 if(/\.pdf$/i.test(file.name)||file.type==='application/pdf'){
  const bytes=new Uint8Array(await file.arrayBuffer()),embedded=await embeddedInvoiceXml(bytes).catch(()=>undefined);
  if(embedded)return {kind:'einvoice',read:readInvoiceXml(embedded.xml),xmlName:embedded.name};
  onStatus?.('No e-invoice data in this PDF: reading the first page…');
  const {importDocument,pagePreview}=await import('./engine'),doc=await importDocument(file),url=await pagePreview(doc.id,0,2);
  const img=new Image();img.src=url;await img.decode();
  return {kind:'scan',scan:await scan(img,engine,signal)};
 }
 if(file.type.startsWith('image/')||/\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name)){
  onStatus?.('Reading the invoice…');
  const bitmap=await createImageBitmap(file);try{return {kind:'scan',scan:await scan(bitmap,engine,signal)};}finally{bitmap.close();}
 }
 throw new Error('Open a Factur-X or other PDF invoice, a UBL or CII XML file, or a photo of an invoice.');
}
