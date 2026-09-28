// These proprietary faces are used from the viewer's own installation, never
// downloaded or redistributed. Carlito/Caladea/Liberation remain bundled options.
export const corporateFonts=['Segoe UI','Segoe UI Semibold','Segoe UI Light','Aptos','Aptos Display','Aptos Narrow','Calibri','Calibri Light','Cambria','Candara','Corbel','Constantia','Consolas','Tahoma','Arial Narrow','SF Pro','SF Pro Text','SF Pro Display'];
export const corporateFallback=(family:string)=>/^SF Pro/.test(family)?'Inter':/cambria|constantia/i.test(family)?'Caladea':/calibri|aptos/i.test(family)?'Carlito':/consolas/i.test(family)?'Liberation Mono':'Liberation Sans';
