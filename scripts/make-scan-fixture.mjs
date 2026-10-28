// Test documents for editing scanned PDFs: an invented quote, rendered as a
// 200 dpi greyscale JPEG scan, as scanners produce it, with and without the
// invisible OCR text layer they add (render mode 3, like Tesseract's
// "GlyphLessFont" layer). Everything on the page is invented.
//   node scripts/make-scan-fixture.mjs [outdir]   (default tests/fixtures)
import {chromium} from 'playwright-core';import {PDFDocument,StandardFonts,pushGraphicsState,popGraphicsState,setTextRenderingMode,TextRenderingMode} from 'pdf-lib';
import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';

const out=process.argv[2]||'tests/fixtures',DPI=200,W=595,H=842;
const row=(label,amount,style='')=>`<div class="row" style="${style}"><span class="t">${label}</span><span class="t amount">${amount}</span></div>`;
const html=`<!doctype html><meta charset="utf-8"><style>
 body{margin:0;width:${W}px;height:${H}px;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f}
 .page{padding:70px 60px}.head{text-align:center;font-weight:bold;font-size:11px}.sub{text-align:center;font-style:italic;font-size:9px;margin:4px 0 26px}
 h2{font-size:13px;border:1px solid #9aa;background:#eef0f6;padding:5px 12px;margin:0 0 22px}
 p{font-size:9.5px;margin:4px 0}.row{display:flex;justify-content:space-between;font-size:9.5px;margin:9px 0 9px 16px}
 .total{font-size:13px;font-weight:bold;margin-top:26px;margin-left:8px}.note{font-size:8.5px;margin-left:8px}
</style><div class="page">
 <div class="head t">ATELIER LUMIÈRE — RÉNOVATION</div><div class="sub t">Devis n° D-2026-0118 / chantier 44 rue des Tanneurs</div>
 <h2 class="t">3. RÉCAPITULATIF DES TRAVAUX</h2>
 <p class="t">Le présent devis tient compte des quantités relevées lors de la visite du 14 octobre 2026 :</p>
 ${row('Menuiseries extérieures, fourniture et pose :','12 480,00 €')}
 ${row('Isolation des combles perdus (85 m²) :','3 612,50 €')}
 ${row('Électricité, mise aux normes du tableau :','1 947,80 €')}
 ${row('Évacuation des gravats et nettoyage du chantier :','289,70 €')}
 ${row('Total des travaux TTC (*)','18 330,00 €','font-size:13px;font-weight:bold;margin-top:26px;margin-left:8px')}
 <p class="t note">* TVA à 10 % incluse pour les travaux de rénovation de logements de plus de deux ans.</p>
 <p class="t note">Devis valable trois mois. Acompte de 30 % à la commande, solde à la réception des travaux.</p>
</div>`;

const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:DPI/72});
 await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
 // Where each text element is, for the invisible text layer.
 const words=await page.evaluate(()=>[...document.querySelectorAll('.t')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent.replace(/\s+/g,' ').trim(),x:r.left,y:r.bottom,size:parseFloat(s.fontSize)};}));
 // A scan: greyscale, a little paper tone and noise, JPEG.
 const png=await page.screenshot();
 const scan=await page.evaluate(async png=>{
  const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');
  g.filter='grayscale(1) contrast(1.05) blur(0.35px)';g.drawImage(img,0,0);g.filter='none';
  const px=g.getImageData(0,0,c.width,c.height);let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let i=0;i<px.data.length;i+=4){const n=(rnd()-.5)*10,v=Math.min(255,px.data[i]*.97+4+n);px.data[i]=px.data[i+1]=px.data[i+2]=v;}
  g.putImageData(px,0,0);return c.toDataURL('image/jpeg',.82).split(',')[1];
 },png.toString('base64'));
 await mkdir(out,{recursive:true});
 for(const layer of [false,true]){
  const pdf=await PDFDocument.create(),image=await pdf.embedJpg(Buffer.from(scan,'base64')),p=pdf.addPage([W,H]);
  p.drawImage(image,{x:0,y:0,width:W,height:H});
  if(layer){
   const font=await pdf.embedFont(StandardFonts.Helvetica);
   p.pushOperators(pushGraphicsState(),setTextRenderingMode(TextRenderingMode.Invisible));
   for(const w of words)p.drawText(w.text,{x:w.x,y:H-w.y+w.size*.22,size:w.size,font});
   p.pushOperators(popGraphicsState());
  }
  pdf.setTitle('Devis D-2026-0118 (test document)');pdf.setProducer('bide test fixture');
  const file=join(out,layer?'scanned-quote-ocr-layer.pdf':'scanned-quote.pdf');await writeFile(file,await pdf.save());console.log(file);
 }
}finally{await browser.close();}
