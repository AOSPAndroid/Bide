// Limit preview work independently of source size or editor zoom.
export function thumbnailScale(width:number,height:number){return Math.min(1,200/Math.max(1,width,height));}
