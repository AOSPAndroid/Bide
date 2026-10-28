// End-to-end on phone widths: every field of the invoice editor stays inside
// its column and its card, and no two fields overlap. iPhone Safari drew the
// date fields at their own, wider size, over the next field; that sizing is
// imitated here with user-agent-strength rules.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';

const layout=page=>page.evaluate(()=>{
 const problems=[],boxes=[];
 for(const card of document.querySelectorAll('.invoice-card')){
  const c=card.getBoundingClientRect();
  for(const field of card.querySelectorAll('.invoice-field')){
   const control=field.querySelector('input:not([type=checkbox]),select,textarea');if(!control)continue;
   const f=field.getBoundingClientRect(),r=control.getBoundingClientRect(),name=control.getAttribute('data-field')??control.getAttribute('aria-label')??field.textContent.trim().slice(0,30);
   if(!r.width)continue;
   if(r.right>f.right+.5||r.left<f.left-.5)problems.push(`${name} is wider than its column (${Math.round(r.width)} px in ${Math.round(f.width)} px)`);
   if(r.right>c.right-1||r.left<c.left+1)problems.push(`${name} runs out of its card`);
   boxes.push({name,r});
  }
 }
 for(const [i,a] of boxes.entries())for(const b of boxes.slice(i+1)){
  const x=Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left),y=Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top);
  if(x>.5&&y>.5)problems.push(`${a.name} overlaps ${b.name}`);
 }
 const root=document.scrollingElement;if(root.scrollWidth>innerWidth+1)problems.push(`the page scrolls sideways (${root.scrollWidth} px wide)`);
 return {problems,fields:boxes.length};
});

test('invoice fields keep to their columns on phones',{timeout:300000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  for(const [width,height] of [[320,568],[360,740],[390,844],[430,932]]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(server.resolvedUrls.local[0]+'app/');
   await page.locator('.workspace-nav').getByRole('button',{name:/Documents/}).click();
   await page.getByRole('button',{name:'New invoice'}).first().click();await page.getByRole('region',{name:'Invoice details'}).waitFor();
   // A browser's own date control: sized from its content box and wider than a phone column.
   await page.addStyleTag({content:':where(input[type=date]){box-sizing:content-box;min-width:230px}'});await page.waitForTimeout(200);
   const {problems,fields}=await layout(page);
   assert.ok(fields>20,`${width} px: the invoice fields were measured (${fields})`);
   assert.deepEqual(problems,[],`${width} px wide`);
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();await server.close();}
});
