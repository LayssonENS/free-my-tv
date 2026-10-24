// Which composited layers repaint while focus moves along the shelf, picks and drawer.
const pages = await (await fetch(`http://${process.env.TV || '10.0.0.102'}:9998/json/list`)).json();
const ws = new WebSocket(pages.find(p => p.description === 'io.freemytv').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const w = new Map(); let layers = [];
ws.onmessage = m => { const x = JSON.parse(m.data); if (w.has(x.id)) { w.get(x.id)(x); w.delete(x.id); } else if (x.method === 'LayerTree.layerTreeDidChange' && x.params.layers) layers = x.params.layers; };
const send = (method, params = {}) => new Promise(ok => { const i = ++id; w.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const run = e => send('Runtime.evaluate', { expression: e, returnByValue: true });
await send('DOM.enable'); await send('DOM.getDocument', { depth: -1 });
await send('LayerTree.enable'); await sleep(500);
const before = Object.fromEntries(layers.map(l => [l.layerId, l.paintCount]));
const seq = (process.argv[2] || 'R,R,R,L,L,L,U,R,L,D,D,R,L,U').split(',');
const map = { R: '1,0', L: '-1,0', U: '0,-1', D: '0,1' };
for (const s of seq) { await run(`window.FreeMyTV.move(${map[s]})`); await sleep(450); }
await sleep(400);
console.log('layers:', layers.length);
const rows = [];
for (const l of layers) {
  const d = (l.paintCount || 0) - (before[l.layerId] || 0);
  let who = '';
  if (l.backendNodeId) { const r = await send('DOM.describeNode', { backendNodeId: l.backendNodeId }); const n = r.result?.node; if (n) { const a = n.attributes || []; const ai = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : ''; }; who = n.nodeName.toLowerCase() + (ai('id') ? '#' + ai('id') : '') + (ai('class') ? '.' + ai('class').split(' ').join('.') : '') + (n.pseudoType ? '::' + n.pseudoType : ''); } }
  rows.push([d, Math.round(l.width) + 'x' + Math.round(l.height), l.drawsContent ? 'draws' : '-', who || '(' + (l.name || 'anon') + ')']);
}
rows.sort((a, b) => b[0] - a[0]);
for (const r of rows.slice(0, 30)) console.log(String(r[0]).padStart(4), r[1].padStart(10), r[2].padStart(6), ' ', r[3]);
await run(`window.FreeMyTV.state.zone='shelf'; window.FreeMyTV.move(0,0)`);
ws.close();
