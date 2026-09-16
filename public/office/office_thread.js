import { ZetaHelperThread } from './vendor/zetaHelper.js';
const helper = new ZetaHelperThread();
const property = (Name,Value) => new helper.css.beans.PropertyValue({Name,Value});
helper.thrPort.onmessage = event => {
 const msg=event.data;
 if(msg.cmd!=='convert')return;
 let model;
 try {
  model=helper.desktop.loadComponentFromURL('file://'+msg.from,'_blank',0,[property('Hidden',true),property('ReadOnly',true),property('MacroExecutionMode',0),property('UpdateDocMode',0)]);
  if(!model)throw new Error('This Office document could not be opened.');
  const filter=model.supportsService('com.sun.star.sheet.SpreadsheetDocument')?'calc_pdf_Export':model.supportsService('com.sun.star.presentation.PresentationDocument')?'impress_pdf_Export':'writer_pdf_Export';
  model.storeToURL('file://'+msg.to,[property('Overwrite',true),property('FilterName',filter)]);
  helper.thrPort.postMessage({...msg,cmd:'converted'});
 } catch(e){helper.thrPort.postMessage({...msg,cmd:'converted',error:'Office conversion failed. The file may be damaged, password protected, or use unsupported features.'});console.error(e);}
 finally {if(model)try{model.close(false);}catch{}}
};
helper.thrPort.postMessage({cmd:'start'});
