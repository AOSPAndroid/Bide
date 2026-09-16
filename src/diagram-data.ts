export type DiagramDraft = {name: string; xml: string};
export type DiagramIntent = 'save' | 'png' | 'svg' | 'pdf' | 'place';
export const DIAGRAM_URL = './diagrams/runtime/index.html?embed=1&proto=json&configure=1&libraries=1&ui=kennedy&dark=0&offline=1&local=1&noSaveBtn=1&noExitBtn=1&saveAndExit=0&lang=en';

const cell = (id: string, value: string, x: number, y: number, style = '', w = 160, h = 60) => `<mxCell id="${id}" value="${value}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1f5eb;strokeColor=#397d64;fontColor=#173e33;${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const edge = (id: string, from: string, to: string, label = '', style = '') => `<mxCell id="${id}" value="${label}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;strokeColor=#52796b;${style}" edge="1" parent="1" source="${from}" target="${to}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
const document = (content: string) => `<mxfile host="bide"><diagram id="page-1" name="Page 1"><mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1100" pageHeight="850" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${content}</root></mxGraphModel></diagram></mxfile>`;
export const diagramTemplates: Record<string, DiagramDraft> = {
  blank: {name: 'Untitled diagram', xml: document('')},
  flowchart: {name: 'Process flow', xml: document(
    cell('start', 'Start', 240, 60, 'rounded=1;arcSize=50;', 160, 50) +
    cell('process', 'Review request', 240, 160) +
    cell('decision', 'Approved?', 260, 270, 'rhombus;rounded=0;fillColor=#fff2cc;strokeColor=#b99b43;', 120, 100) +
    cell('done', 'Complete', 240, 430, 'arcSize=50;', 160, 50) +
    cell('revise', 'Revise', 500, 290) +
    edge('e1', 'start', 'process') + edge('e2', 'process', 'decision') + edge('e3', 'decision', 'done', 'Yes', 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;') + edge('e4', 'decision', 'revise', 'No', 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;') + edge('e5', 'revise', 'process', '', 'exitX=0.5;exitY=0;entryX=1;entryY=0.5;'))},
  org: {name: 'Team structure', xml: document(
    cell('lead', 'Team lead', 320, 70) + cell('a', 'Design', 100, 240) + cell('b', 'Engineering', 320, 240) + cell('c', 'Operations', 540, 240) +
    edge('e1', 'lead', 'a') + edge('e2', 'lead', 'b') + edge('e3', 'lead', 'c'))},
  network: {name: 'System overview', xml: document(
    cell('user', 'Browser', 60, 190) + cell('app', 'Application', 320, 190) + cell('db', 'Database', 600, 170, 'shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=15;', 120, 100) +
    edge('e1', 'user', 'app', 'Request') + edge('e2', 'app', 'db', 'Query'))},
};

// draw.io returns the original request as either an object or a JSON string.
export function exportRequestId(message: unknown): string | undefined {
  try { const request = typeof message === 'string' ? JSON.parse(message) : message; return request && typeof request === 'object' && 'requestId' in request ? String(request.requestId) : undefined; } catch { return undefined; }
}
export function imageDataBlob(data: string, format: 'png' | 'svg'): Blob {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(data);
  const mime = format === 'png' ? 'image/png' : 'image/svg+xml';
  if (!match || match[1] !== mime) throw new Error('The diagram editor returned an invalid image.');
  return new Blob([match[2] ? Uint8Array.from(atob(match[3]), c => c.charCodeAt(0)) : decodeURIComponent(match[3])], {type:mime});
}
