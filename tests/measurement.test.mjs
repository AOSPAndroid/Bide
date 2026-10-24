import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/measurement.js',import.meta.url),'utf8');
const ID='G-TEST123456',CHOICE='bide.analytics.choice.v1',SOURCE='bide.analytics.source.v1';
const START=1800000000000,DAY=86400000;

function memoryStorage(values=new Map(),blocked=false){
 const calls=[];
 return {values,calls,getItem(key){calls.push(['get',key]);if(blocked)throw Error('blocked');return values.get(key)??null;},
  setItem(key,value){calls.push(['set',key,value]);if(blocked)throw Error('blocked');values.set(key,value);},
  removeItem(key){calls.push(['remove',key]);if(blocked)throw Error('blocked');values.delete(key);}};
}
function environment({url='https://bide.example/merge-pdf/?email=secret@example.test#sensitiveFragment',referrer='https://chatgpt.com/?q=sensitive_payload',local,session,gpc=false,blocked=false}={}){
 let clock=START;
 const all=[],listeners=new Map(),timers=new Map(),cookieWrites=[],cookies=new Map();
 class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.attributes=new Map();this.listeners=new Map();all.push(this);}
  appendChild(child){child.parent=this;this.children.push(child);return child;}
  setAttribute(key,value){this.attributes.set(key,value);}
  getAttribute(key){return this.attributes.get(key)??null;}
  addEventListener(name,callback){this.listeners.set(name,callback);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);this.parent=undefined;}
  showModal(){this.setAttribute('open','');}
  close(){this.attributes.delete('open');}
  focus(){}
  click(){this.listeners.get('click')?.({target:this,preventDefault(){}});}
 }
 const doc={head:new Element('head'),body:new Element('body'),referrer,title:'customer-secret.pdf',activeElement:null,
  createElement:tag=>new Element(tag),
  getElementById(id){return all.find(el=>el.id===id&&el.parent)||null;},
  addEventListener(name,callback){listeners.set('document:'+name,callback);}};
 Object.defineProperty(doc,'cookie',{get:()=>[...cookies].map(([name,value])=>name+'='+value).join('; '),set:value=>{
  cookieWrites.push(value);const [pair]=value.split(';'),[name,...rest]=pair.split('=');
  if(value.includes('Max-Age=0'))cookies.delete(name);else cookies.set(name,rest.join('='));
 }});
 const win={document:doc,location:new URL(url),navigator:{globalPrivacyControl:gpc},
  localStorage:local||memoryStorage(undefined,blocked),sessionStorage:session||memoryStorage(undefined,blocked),
  addEventListener(name,callback){listeners.set(name,callback);},
  setTimeout(callback){const id=timers.size+1;timers.set(id,callback);return id;},clearTimeout(id){timers.delete(id);}};
 class FakeDate extends Date {static now(){return clock;}}
 const context={module:{exports:{}},URL,Date:FakeDate,Set,encodeURIComponent};
 vm.runInNewContext(source,context);
 const api=context.module.exports.createMeasurement(win);
 const buttons=()=>all.filter(el=>el.tagName==='button'&&el.parent?.parent?.parent===doc.body);
 return {api,win,doc,all,cookies,cookieWrites,
  scripts:()=>doc.head.children.filter(el=>el.tagName==='script'),
  commands:()=>JSON.parse(JSON.stringify((win.bideDataLayer||[]).map(args=>Array.from(args)))),
  click(text){const button=buttons().find(el=>el.textContent===text);assert.ok(button,'Missing button: '+text);button.click();},
  dispatch(name,event={}){listeners.get(name)?.(event);},advance(ms){clock+=ms;},
  accept(){this.click('Accept analytics');}};
}
const accepted=(expiresAt=START+180*DAY)=>memoryStorage(new Map([[CHOICE,JSON.stringify({version:1,measurementId:ID,choice:'accepted',expiresAt})]]));

test('missing or invalid stream produces no provider, analytics storage, banner, or events',()=>{
 for(const measurementId of [undefined,'','G-bad','AW-123456','G-SECRET<script>']){
  const e=environment();assert.equal(e.api.init({measurementId}),false);
  assert.equal(e.api.track('page_view'),false);
  assert.equal(e.scripts().length,0);assert.equal(e.win.localStorage.calls.length,0);assert.equal(e.win.sessionStorage.calls.length,0);
  assert.equal(e.doc.getElementById('bide-measurement-dialog'),null);
 }
});

test('undecided and declined visitors cause no Google requests or analytics identifiers',()=>{
 const e=environment();e.api.init({measurementId:ID});
 assert.equal(e.scripts().length,0);assert.equal(e.api.track('editor_opened'),false);
 assert.equal(e.win.localStorage.calls.filter(c=>c[0]==='set').length,0);
 assert.equal(e.win.sessionStorage.calls.length,0);
 e.click('Decline analytics');
 assert.equal(e.scripts().length,0);assert.equal(e.commands().length,0);
 assert.equal(JSON.parse(e.win.localStorage.values.get(CHOICE)).choice,'declined');
 assert.equal(e.win['ga-disable-'+ID],true);
});

test('acceptance loads one provider and only sanitized, allowlisted event fields',()=>{
 const e=environment();e.api.init({measurementId:ID});e.accept();
 assert.equal(e.scripts().length,1);assert.equal(e.scripts()[0].referrerPolicy,'no-referrer');
 const config=e.commands().find(c=>c[0]==='config')[2];
 assert.equal(config.send_page_view,false);assert.equal(config.allow_google_signals,false);assert.equal(config.allow_ad_personalization_signals,false);
 assert.equal(config.cookie_domain,'none');assert.equal(config.cookie_update,false);assert.equal(config.cookie_expires,180*86400);
 e.api.setTool('merge');
 assert.equal(e.api.track('export_completed',{format:'pdf',filename:'customer-secret.pdf',email:'secret@example.test',content:'sensitive_payload',page_location:'https://leak.example'}),true);
 const event=e.commands().filter(c=>c[0]==='event').at(-1);
 assert.equal(event[1],'export_completed');
 assert.deepEqual(event[2],{page_location:'https://bide.example/merge-pdf/',page_title:'Bide — Merge PDF',page_referrer:'https://chatgpt.com/',bide_page:'merge-pdf',acquisition_source:'chatgpt',send_to:ID,tool:'merge',format:'pdf'});
 const serialized=JSON.stringify(e.commands());
 for(const secret of ['customer-secret.pdf','secret@example.test','sensitive_payload','sensitiveFragment','leak.example'])assert.equal(serialized.includes(secret),false,secret);
 const count=e.commands().length;assert.equal(e.api.track('purchase',{format:'pdf'}),false);assert.equal(e.commands().length,count);
 assert.equal(e.api.setTool('customer-secret.pdf'),false);
 e.api.track('export_completed',{tool:'customer-secret.pdf',format:'customer-secret.pdf'});
 assert.equal(e.commands().at(-1)[2].format,undefined);assert.equal(e.commands().at(-1)[2].tool,'merge');
 e.api.init({measurementId:ID});assert.equal(e.scripts().length,1);
 assert.equal(e.commands().filter(c=>c[0]==='event'&&c[1]==='page_view').length,1);
});

test('consented finite acquisition source persists from marketing to editor without referrer queries',()=>{
 const local=accepted(),session=memoryStorage();
 const landing=environment({local,session,referrer:'https://www.google.fr/search?q=private-document'});
 landing.api.init({measurementId:ID});
 const app=environment({local,session,url:'https://bide.example/app/?tool=merge&file=customer-secret.pdf',referrer:'https://bide.example/merge-pdf/?email=secret@example.test'});
 app.api.init({measurementId:ID,page:'app'});
 const params=app.commands().find(c=>c[0]==='event')[2];
 assert.equal(params.acquisition_source,'google');assert.equal(params.page_location,'https://bide.example/app/');
 assert.equal(JSON.stringify([...session.values]).includes('private-document'),false);
 assert.equal(JSON.stringify([...session.values]).includes('customer-secret.pdf'),false);
});

test('withdrawal drops queued commands, disables future tracking, and clears only Bide analytics cookies',()=>{
 const e=environment({local:accepted()});e.api.init({measurementId:ID});
 e.cookies.set('bide_analytics_ga','client-id');e.cookies.set('bide_analytics_ga_TEST','session-id');e.cookies.set('bide_licence','keep');e.cookies.set('_ga_other','keep');
 e.api.preferences();e.click('Decline analytics');
 assert.equal(e.win['ga-disable-'+ID],true);assert.equal(e.api.track('export_completed',{format:'pdf'}),false);
 assert.equal(e.commands().length,0);assert.equal(e.win.sessionStorage.values.has(SOURCE),false);
 assert.equal(e.cookies.has('bide_analytics_ga'),false);assert.equal(e.cookies.has('bide_analytics_ga_TEST'),false);
 assert.equal(e.cookies.get('bide_licence'),'keep');assert.equal(e.cookies.get('_ga_other'),'keep');
});

test('GPC overrides stored acceptance and mid-visit opt-outs stop events',()=>{
 const e=environment({local:accepted(),gpc:true});e.api.init({measurementId:ID});
 assert.equal(e.scripts().length,0);assert.equal(e.api.track('page_view'),false);
 e.api.preferences();assert.equal(e.doc.getElementById('bide-measurement-dialog').children[1].textContent.includes('Global Privacy Control'),true);
 const active=environment({local:accepted()});active.api.init({measurementId:ID});active.win.navigator.globalPrivacyControl=true;
 assert.equal(active.api.track('editor_opened'),false);assert.equal(active.win['ga-disable-'+ID],true);assert.equal(active.commands().length,0);
});

test('accepting again while the provider is loading restores only the newly consented queue',()=>{
 const e=environment();e.api.init({measurementId:ID});e.accept();
 e.api.track('document_opened');e.api.preferences();e.click('Decline analytics');
 e.api.preferences();e.accept();
 assert.equal(e.scripts().length,1);
 assert.equal(e.win['ga-disable-'+ID],false);
 assert.equal(e.commands()[0][0],'consent');assert.equal(e.commands()[0][1],'default');
 assert.equal(e.commands().some(c=>c[0]==='js'),true);
 assert.equal(e.commands().some(c=>c[0]==='event'&&c[1]==='document_opened'),false);
 assert.equal(e.commands().filter(c=>c[0]==='event'&&c[1]==='page_view').length,1);
});

test('expired consent and cross-tab revocation cannot continue measurement',()=>{
 const expired=environment({local:accepted(START-1)});expired.api.init({measurementId:ID});assert.equal(expired.scripts().length,0);
 const e=environment({local:accepted(START+1000)});e.api.init({measurementId:ID});e.advance(1001);
 assert.equal(e.api.track('export_completed'),false);assert.equal(e.win['ga-disable-'+ID],true);
 const other=environment({local:accepted()});other.api.init({measurementId:ID});other.win.localStorage.values.delete(CHOICE);other.dispatch('storage',{key:CHOICE});
 assert.equal(other.api.track('editor_opened'),false);assert.equal(other.win['ga-disable-'+ID],true);
});

test('storage and provider failures do not throw through editor actions',()=>{
 const e=environment({blocked:true});assert.doesNotThrow(()=>{e.api.init({measurementId:ID});e.accept();e.api.track('document_opened');});
 assert.equal(e.scripts().length,1);e.scripts()[0].onerror();
 assert.equal(e.api.track('export_completed',{format:'pdf'}),false);
 const unknown=environment({local:accepted(),url:'https://bide.example/private/customer-secret.pdf?email=secret@example.test',referrer:'https://unlisted.example/private/account'});
 unknown.api.init({measurementId:ID});const event=unknown.commands().find(c=>c[0]==='event')[2];
 assert.equal(event.page_location,'https://bide.example/');assert.equal(event.page_referrer,'');assert.equal(event.bide_page,'other');
});
