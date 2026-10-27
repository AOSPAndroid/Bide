// A small XML reader for machine-written documents such as e-invoices:
// elements, attributes and text, with namespace prefixes dropped (elements
// are matched by local name). No DTDs; comments, CDATA and processing
// instructions are handled. Pure, so it runs in tests and workers alike.
export type XmlNode={name:string;attrs:Record<string,string>;children:XmlNode[];text:string};

const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
const decode=(s:string)=>s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi,(m,e:string)=>e[0]==='#'?String.fromCodePoint(e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):+e.slice(1)):entities[e]??m);
const local=(name:string)=>name.slice(name.indexOf(':')+1);

export function parseXml(xml:string):XmlNode{
 const root:XmlNode={name:'#document',attrs:{},children:[],text:''},stack=[root];
 const tag=/<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
 for(let m;(m=tag.exec(xml));){
  const top=stack[stack.length-1];
  if(m[1]!==undefined)top.text+=m[1];
  else if(m[2]){if(stack.length>1&&local(m[2])===top.name)stack.pop();else throw new Error(`Unexpected </${m[2]}>.`);}
  else if(m[3]){
   const attrs:Record<string,string>={};for(const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[local(a[1])]=decode(a[2]??a[3]);
   const node:XmlNode={name:local(m[3]),attrs,children:[],text:''};top.children.push(node);if(!m[5])stack.push(node);
  }else if(m[6]!==undefined)top.text+=decode(m[6]);
 }
 if(stack.length!==1)throw new Error(`<${stack[stack.length-1].name}> is not closed.`);
 const first=root.children[0];if(!first)throw new Error('The file has no XML element.');
 return first;
}
// The first descendant along a path of local names, e.g. 'SellerTradeParty/Name'.
export function find(node:XmlNode|undefined,path:string):XmlNode|undefined{
 let current=node;for(const part of path.split('/')){if(!current)return undefined;current=current.children.find(c=>c.name===part);}return current;
}
export const findAll=(node:XmlNode|undefined,name:string)=>node?.children.filter(c=>c.name===name)??[];
export const text=(node:XmlNode|undefined,path?:string)=>(path?find(node,path):node)?.text.trim()||undefined;
