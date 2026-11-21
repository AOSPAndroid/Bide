// Compare the letters-first flow, with a font only after an explicit refusal.
// Missing scores and runtime errors must never count as a clean edit.
export function bideComparisonResult(record){
 if(!record)return 'not measured';
 if(record.unreadable)return 'unread';
 const scored=(result,kind)=>{
  if(result?.outcome==='error')return 'error';
  if(result?.outcome==='refused')return 'refused';
  if(result?.outcome!==kind||!Array.isArray(result.problems)||!result.problems.every(p=>typeof p==='string'&&p.length>0))return 'not measured';
  return result.problems.length?result.problems.join('+'):'ok';
 };
 if(record.letters?.outcome==='refused')return record.font?scored(record.font,'font'):'refused';
 return scored(record.letters,'letters');
}
