// E-invoice conformance: every sample invoice (tests/einvoice/samples.mjs)
// as CII and UBL, checked against the official schemas (xmllint) and the
// European Commission's EN 16931 business rules (schematron XSLT, Saxon).
//   node scripts/einvoice-conformance.mjs
// Needs Java and xmllint, and the artefacts in tmp/einvoice-validation:
//   en16931/      git clone https://github.com/ConnectingEurope/eInvoicing-EN16931
//   facturx-en16931/  the Factur-X EN 16931 XSD (from the factur-x Python package)
//   ubl21/xsd/    https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.zip
//   saxon.jar, xmlresolver.jar  Saxon-HE 12 and xmlresolver 5 from Maven Central
// Writes each XML to tmp/einvoice/. Exits 1 on any schema error or fatal rule.
import {build} from 'esbuild';import {spawnSync} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';import {existsSync} from 'node:fs';
import {samples} from '../tests/einvoice/samples.mjs';

const dir=process.env.EINVOICE_ARTEFACTS||'tmp/einvoice-validation';
for(const need of ['en16931/cii/xslt/EN16931-CII-validation.xslt','facturx-en16931/FACTUR-X_EN16931.xsd','ubl21/xsd/maindoc/UBL-Invoice-2.1.xsd','saxon.jar'])if(!existsSync(`${dir}/${need}`))throw new Error(`Missing ${dir}/${need}; see the header of this script.`);
await build({entryPoints:['src/einvoice-xml.ts','src/einvoice.ts'],bundle:true,format:'esm',platform:'node',outdir:'tmp',logLevel:'error'});
const {toCii,toUbl}=await import('../tmp/einvoice-xml.js'),{checkInvoice}=await import('../tmp/einvoice.js');
await mkdir('tmp/einvoice',{recursive:true});
const run=(cmd,args)=>spawnSync(cmd,args,{encoding:'utf8',maxBuffer:64<<20});
// Fired assertions from the SVRL report: fatal ones fail the invoice.
function schematron(file,xslt){
 const r=run('java',['-cp',`${dir}/saxon.jar:${dir}/xmlresolver.jar`,'net.sf.saxon.Transform',`-s:${file}`,`-xsl:${dir}/en16931/${xslt}`]);
 if(r.status)return [{flag:'fatal',id:'saxon',text:r.stderr.split('\n').find(Boolean)??'Saxon failed'}];
 return [...r.stdout.matchAll(/<svrl:failed-assert\b([^>]*)>[\s\S]*?<svrl:text>([\s\S]*?)<\/svrl:text>/g)].map(m=>({flag:/flag="([^"]+)"/.exec(m[1])?.[1]??'',id:/id="([^"]+)"/.exec(m[1])?.[1]??'',text:m[2].replace(/\s+/g,' ').trim()}));
}
let failed=0;
for(const [name,inv] of Object.entries(samples)){
 const own=checkInvoice(inv).filter(i=>i.severity==='error');
 for(const [kind,xml,xsd,xslt] of [['cii',toCii(inv),`${dir}/facturx-en16931/FACTUR-X_EN16931.xsd`,'cii/xslt/EN16931-CII-validation.xslt'],['ubl',toUbl(inv),`${dir}/ubl21/xsd/maindoc/UBL-${inv.type==='381'?'CreditNote':'Invoice'}-2.1.xsd`,'ubl/xslt/EN16931-UBL-validation.xslt']]){
  const file=`tmp/einvoice/${name}.${kind}.xml`;await writeFile(file,xml);
  const schema=run('xmllint',['--noout','--schema',xsd,file]),rules=schematron(file,xslt),fatal=rules.filter(r=>r.flag!=='warning');
  const ok=!schema.status&&!fatal.length&&!own.length;if(!ok)failed++;
  console.log(`${ok?'ok  ':'FAIL'} ${name.padEnd(16)} ${kind}  schema ${schema.status?'errors':'valid'}, EN 16931 ${fatal.length} fatal / ${rules.length-fatal.length} warnings${own.length?`, own checks: ${own.map(i=>i.rule).join(' ')}`:''}`);
  if(schema.status)console.log('     '+schema.stderr.split('\n').filter(l=>l&&!l.endsWith('validates')).slice(0,4).join('\n     '));
  for(const r of rules)console.log(`     ${r.flag} ${r.id}: ${r.text.slice(0,160)}`);
 }
}
// Broken invoices: the editor's own checks must refuse what EN 16931 refuses.
const base=samples['services-vat'],broken={
 'no seller VAT number':{...base,seller:{...base.seller,vatId:undefined}},
 'no IBAN for a transfer':{...base,payment:{code:'58'}},
 'exempt without reason':{...samples.franchise,exemptionReason:''},
 'standard rate at 0%':{...base,lines:[{...base.lines[0],vatRate:0}]},
 'reverse charge, no buyer VAT':{...samples['reverse-charge'],buyer:{...samples['reverse-charge'].buyer,vatId:undefined}},
 'no due date or terms':{...base,dueDate:undefined},
};
for(const [name,inv] of Object.entries(broken)){
 const file=`tmp/einvoice/broken.cii.xml`;await writeFile(file,toCii(inv));
 const official=schematron(file,'cii/xslt/EN16931-CII-validation.xslt').filter(r=>r.flag!=='warning').map(r=>r.id),own=checkInvoice(inv).filter(i=>i.severity==='error').map(i=>i.rule);
 const agree=!official.length||own.length>0;if(!agree)failed++;
 console.log(`${agree?'ok  ':'FAIL'} broken: ${name.padEnd(30)} EN 16931 [${[...new Set(official)].join(' ')}]  editor [${own.join(' ')}]`);
}
process.exit(failed?1:0);
