// OCR proofreading: words a dictionary does not know, with corrections. OCR
// confusions (rn↔m, l↔I↔1, 0↔O…) are tried first, especially at letters the
// recognizer was unsure of; dictionary suggestions follow.
export type Checker={correct:(word:string)=>boolean;suggest:(word:string)=>string[]};
export type Doubt={word:string;start:number;end:number;suggestions:string[];unsure:boolean};

const swaps:[string,string][]=[['rn','m'],['m','rn'],['cl','d'],['d','cl'],['vv','w'],['w','vv'],['l','i'],['i','l'],['l','I'],['I','l'],['1','l'],['l','1'],['0','o'],['o','0'],['O','0'],['0','O'],['5','s'],['s','5'],['8','B'],['B','8'],['e','c'],['c','e'],['h','b'],['b','h'],['n','u'],['u','n'],['ii','u'],['li','h'],['é','e'],['e','é'],['è','é'],['à','a'],['ç','c']];

// Single OCR substitutions of `word`; with `focus`, only those touching it.
export function confusionVariants(word:string,focus?:Set<number>){
 const out=new Set<string>();
 for(const [from,to] of swaps)for(let i=word.indexOf(from);i>=0;i=word.indexOf(from,i+1)){
  if(focus&&![...Array(from.length).keys()].some(k=>focus.has(i+k)))continue;
  out.add(word.slice(0,i)+to+word.slice(i+from.length));
 }
 // A doubled letter read twice ("Daliil" → "Dalil") or once.
 for(let i=1;i<word.length;i++)if(word[i]===word[i-1]&&(!focus||focus.has(i)||focus.has(i-1)))out.add(word.slice(0,i)+word.slice(i+1));
 out.delete(word);return [...out];
}

const known=(c:Checker[],w:string)=>c.some(x=>x.correct(w)||x.correct(w.toLowerCase()));

// Words to check in `text`. `unsure` holds code-point indexes of doubtful letters.
export function findDoubts(text:string,checkers:Checker[],unsure:Set<number>=new Set()):Doubt[]{
 const out:Doubt[]=[],chars=Array.from(text);let i=0;
 while(i<chars.length){
  if(!/\p{L}/u.test(chars[i])){i++;continue;}
  let j=i;while(j<chars.length&&/[\p{L}\p{M}'’-]/u.test(chars[j]))j++;
  const word=chars.slice(i,j).join('').replace(/['’-]+$/,''),end=i+Array.from(word).length,focus=new Set([...unsure].filter(k=>k>=i&&k<end).map(k=>k-i));
  // Short words, all-caps acronyms and words next to digits are left alone.
  // The dictionaries are English and French: other alphabets are not checked.
  const skip=!/^\p{Script=Latin}/u.test(word)||Array.from(word).length<3||/^\p{Lu}{2,}$/u.test(word)||/\d/.test(chars[i-1]??'')||/\d/.test(chars[end]??'');
  if(!skip&&checkers.length&&!known(checkers,word)){
   const fixes=confusionVariants(word,focus.size?focus:undefined).filter(v=>known(checkers,v));
   const dict=checkers.flatMap(c=>c.suggest(word)).filter(s=>!fixes.includes(s));
   out.push({word,start:i,end,suggestions:[...fixes,...dict].slice(0,4),unsure:focus.size>0});
  }else if(focus.size&&!skip){
   // A known word with doubtful letters: offer other real words they could be.
   const alt=confusionVariants(word,focus).filter(v=>known(checkers,v));
   if(alt.length)out.push({word,start:i,end,suggestions:alt.slice(0,3),unsure:true});
  }
  i=j;
 }
 return out;
}

// Replace the word at code points [start, end) of `text`.
export const applySuggestion=(text:string,d:Pick<Doubt,'start'|'end'>,replacement:string)=>{const c=Array.from(text);return c.slice(0,d.start).join('')+replacement+c.slice(d.end).join('');};
