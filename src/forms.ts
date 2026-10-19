// PDF form fields. Fields of an imported PDF live in its source and are
// filled with MuPDF; fields added in bide live on the page (Page.forms).
// Export recreates them with pdf-lib, fillable or flattened.
export type FormFieldType='text'|'checkbox'|'dropdown'|'radio';
// Geometry in page units, top-left origin. `value` is the text, the chosen
// option, or 'Yes'/'Off' for a checkbox and radio button. Radio buttons share
// a `name` and each has its own `option`.
export type FormField={id:string;type:FormFieldType;name:string;left:number;top:number;width:number;height:number;value:string;options?:string[];option?:string;multiline?:boolean;readOnly?:boolean};
// A field of the source PDF: `widget` is its index among the page's widgets.
export type PdfFormField=FormField&{widget:number};

export const fieldLabels:Record<FormFieldType,string>={text:'Text field',checkbox:'Checkbox',dropdown:'Dropdown',radio:'Radio button'};
export const fieldSizes:Record<FormFieldType,[number,number]>={text:[180,22],checkbox:[14,14],dropdown:[140,22],radio:[14,14]};
export const isChecked=(value:string)=>!!value&&value!=='Off';

// "Text field 1", "Text field 2"…: PDF field names must be unique per document.
export function uniqueFieldName(base:string,taken:Iterable<string>){
 const used=new Set(taken);if(!used.has(base))return base;
 let n=2;while(used.has(`${base} ${n}`))n++;return `${base} ${n}`;
}

// A new field centred on the page, or at `at` (its top-left corner).
export function newField(type:FormFieldType,page:{width:number;height:number},taken:Iterable<string>,id:string,at?:{left:number;top:number}):FormField{
 const [width,height]=fieldSizes[type],name=uniqueFieldName(type==='radio'?'Choice':fieldLabels[type],taken);
 const left=at?.left??Math.round((page.width-width)/2),top=at?.top??Math.round((page.height-height)/2);
 return {id,type,name,left,top,width,height,value:type==='checkbox'||type==='radio'?'Off':'',...(type==='dropdown'?{options:['Option 1','Option 2']}:{}),...(type==='radio'?{option:'Option 1'}:{})};
}

// Bottom-left PDF rectangle of a field on a page `pageHeight` tall.
export const pdfBox=(f:{left:number;top:number;width:number;height:number},pageHeight:number)=>({x:f.left,y:pageHeight-f.top-f.height,width:f.width,height:f.height});
