// ocrFields compares normalized whitespace. Locate that same literal field
// before asking the app to edit it, rather than silently sending a no-op.
export function replaceBenchmarkField(regionText,fieldText,replacement){
 const field=fieldText.trim();
 if(!field)throw new Error('The benchmark field is empty.');
 const literal=part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp(field.split(/\s+/u).map(literal).join('\\s+'),'u');
 const match=pattern.exec(regionText);
 if(!match)throw new Error(`The benchmark field ${JSON.stringify(fieldText)} was not found in ${JSON.stringify(regionText)}.`);
 const text=regionText.slice(0,match.index)+replacement+regionText.slice(match.index+match[0].length);
 if(text===regionText)throw new Error(`The requested benchmark replacement for ${JSON.stringify(fieldText)} did not change the text.`);
 return text;
}
