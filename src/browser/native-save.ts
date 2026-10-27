// Inside the iOS and Android apps a download link does nothing: files are
// written to the app's cache and handed to the system share sheet, from
// which people save them to Files, send them by email, and so on.
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';

const base64=async(blob:Blob)=>{const bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};

export async function shareFile(blob:Blob,filename:string){
 const {uri}=await Filesystem.writeFile({path:filename,data:await base64(blob),directory:Directory.Cache});
 await Share.share({title:filename,files:[uri]});
}
