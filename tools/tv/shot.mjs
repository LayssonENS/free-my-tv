// Screenshot of Free My TV on the TV through CDP: node shot.mjs out.png [js to run first]
import { writeFileSync } from 'node:fs';
const pages = await (await fetch(`http://${process.env.TV || '10.0.0.102'}:9998/json/list`)).json();
const ws = new WebSocket(pages.find(p => p.description === 'io.freemytv').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const w = new Map();
ws.onmessage = m => { const x = JSON.parse(m.data); if (w.has(x.id)) { w.get(x.id)(x); w.delete(x.id); } };
const send = (method, params = {}) => new Promise(ok => { const i = ++id; w.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
if (process.argv[3]) { await send('Runtime.evaluate', { expression: process.argv[3] }); await new Promise(r => setTimeout(r, 900)); }
const r = await send('Page.captureScreenshot', { format: 'png', ...(process.argv[4] ? { clip: JSON.parse(process.argv[4]) } : {}) });
if (r.error) { console.log(r.error); process.exit(1); }
writeFileSync(process.argv[2], Buffer.from(r.result.data, 'base64'));
console.log('ok', process.argv[2]);
ws.close();
