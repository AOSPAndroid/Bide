// Browser-only adapter. Analytics is configured and consent-gated by the shared
// public/measurement.js script; no editor content is accepted by this API.
export type MeasurementTool = 'edit'|'merge'|'compress'|'split'|'convert'|'ocr'|'other';
export type MeasurementFormat = 'pdf'|'png'|'jpg'|'svg'|'split'|'txt'|'docx'|'psd'|'bide'|'other';
export type MeasurementPage = 'home'|'pdf-editor'|'merge-pdf'|'compress-pdf'|'pricing'|'privacy'|'help'|'app'|'other';
export type MeasurementEvent = 'page_view'|'editor_cta_clicked'|'editor_opened'|'document_opened'|'export_completed'|'sign_in_complete'|'checkout_started';
// Export formats arrive as runtime strings from the editor. The shared adapter
// accepts only the documented finite values and drops every other value.
export type MeasurementOptions = {tool?:MeasurementTool;format?:string};
type MeasurementConfig = {measurementId?:string;page?:MeasurementPage};
type MeasurementAPI = {
 init(config?:MeasurementConfig):boolean;
 track(name:MeasurementEvent,options?:MeasurementOptions):boolean;
 setTool(tool:MeasurementTool):boolean;
 preferences():void;
};
declare global {interface Window {bideMeasurement?:MeasurementAPI;}}

let pendingConfig:MeasurementConfig|undefined;
let pendingTool:MeasurementTool|undefined;

function ready(){
 try{
  const api=window.bideMeasurement;if(!api)return;
  if(pendingConfig){api.init(pendingConfig);pendingConfig=undefined;}
  if(pendingTool){api.setTool(pendingTool);pendingTool=undefined;}
 }catch{/* Optional measurement must not affect editing. */}
}
if(typeof window!=='undefined')window.addEventListener('bide-measurement-ready',ready);

export function startMeasurement(config:MeasurementConfig={}){
 if(typeof window==='undefined')return;
 const configured=(import.meta.env as Record<string,string|undefined>).VITE_GA_MEASUREMENT_ID;
 const measurementId=config.measurementId!==undefined?config.measurementId:configured;
 // An absent build variable must preserve a stream already supplied by HTML.
 pendingConfig={...(config.page!==undefined?{page:config.page}:{}),...(measurementId!==undefined?{measurementId}:{})};
 ready();
}
export function setMeasurementTool(tool:MeasurementTool){
 if(typeof window==='undefined')return;
 pendingTool=tool;ready();
}
export function trackMeasurement(name:MeasurementEvent,options:MeasurementOptions={}){
 try{if(typeof window!=='undefined')window.bideMeasurement?.track(name,options);}catch{/* Do not interrupt app actions. */}
}
export function measurementPreferences(){
 try{if(typeof window!=='undefined')window.bideMeasurement?.preferences();}catch{/* Optional UI only. */}
}
