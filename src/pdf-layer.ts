import type {Page} from './model';
// Preserve every overlay and the page geometry; the project retains its source for undo.
export function unlockPdfPage(page:Page,image:object):Page{
 if(!page.source)throw new Error('This page is already editable.');
 return {...page,source:undefined,index:0,thumb:undefined,canvas:{...page.canvas,objects:[image,...(page.canvas.objects||[]) as unknown[]]}};
}

