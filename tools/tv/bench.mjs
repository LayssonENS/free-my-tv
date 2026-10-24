// Measures Free My TV's frames on the TV through its inspector (CDP on port 9998).
// node tools/tv/bench.mjs <label>  (TV=<ip> for another TV)  → prints frame stats per step and the main-thread/raster cost; saves trace-<label>.json
import { mkdirSync, writeFileSync } from 'node:fs';

const label = process.argv[2] || 'run';
const ip = process.env.TV || '10.0.0.102';
const pages = await (await fetch(`http://${ip}:9998/json/list`)).json();
const page = pages.find(p => p.description === 'io.freemytv');
if (!page) { console.error('Free My TV is not open on the TV'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
let id = 0;
const waiting = new Map();
const events = [];
let traceDone = null;
ws.onmessage = m => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  else if (msg.method === 'Tracing.dataCollected') events.push(...msg.params.value);
  else if (msg.method === 'Tracing.tracingComplete') traceDone && traceDone();
};
const send = (method, params = {}) => new Promise(ok => { const i = ++id; waiting.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Every frame's interval, tagged with the step that was running.
await run(`(function(){
  window.__f = []; window.__step = 'idle';
  var last = 0;
  function tick(t){ if (last) window.__f.push([window.__step, t - last]); last = t; window.__raf = requestAnimationFrame(tick); }
  cancelAnimationFrame(window.__raf || 0); window.__raf = requestAnimationFrame(tick);
  return true; })()`);

// Back to a known place: the shelf, drawer closed, first tile.
await run(`(function(){ var F = window.FreeMyTV; F.hideSaver(); if (F.state.zone === 'drawer') F.back();
  F.state.zone = 'shelf'; F.state.shelf = 0; F.move(0, 0); return true; })()`);
await sleep(800);

const steps = [
  ['shelf →', [1, 0], 6], ['shelf ←', [-1, 0], 6],
  ['up to picks', [0, -1], 1], ['picks →', [1, 0], 2], ['picks ←', [-1, 0], 2],
  ['down to shelf', [0, 1], 1], ['drawer open', [0, 1], 1], ['drawer →', [1, 0], 3], ['drawer ←', [-1, 0], 3],
  ['drawer close', [0, -1], 1],
];

await send('Tracing.start', {
  categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,viz,benchmark',
  transferMode: 'ReportEvents',
});
await sleep(600);
for (const [name, [dx, dy], times] of steps) {
  for (let i = 0; i < times; i++) {
    await run(`window.__step = ${JSON.stringify(name)}; window.FreeMyTV.move(${dx}, ${dy}); true`);
    await sleep(450);
  }
}
await run(`window.__step = 'idle'; true`);
await sleep(300);
const frames = await run('window.__f');
await run('cancelAnimationFrame(window.__raf); true');
const done = new Promise(r => { traceDone = r; });
await send('Tracing.end');
await done;
ws.close();

// Frames per step: during a 450 ms step a smooth screen gives ~27 frames of 16.7 ms.
const by = {};
for (const [step, dt] of frames) (by[step] = by[step] || []).push(dt);
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
console.log(`\n== ${label} ==`);
console.log('step'.padEnd(16), 'frames', ' p50ms', ' p95ms', ' maxms', ' >25ms');
let all = [];
for (const [name] of steps) {
  const a = by[name] || [];
  all = all.concat(a);
  if (!a.length) continue;
  console.log(name.padEnd(16), String(a.length).padStart(6), pct(a, .5).toFixed(1).padStart(6), pct(a, .95).toFixed(1).padStart(6),
    Math.max(...a).toFixed(1).padStart(6), String(a.filter(x => x > 25).length).padStart(6));
}
const fps = 1000 * all.length / all.reduce((s, x) => s + x, 0);
console.log(`all: ${all.length} frames, ${fps.toFixed(1)} fps, ${all.filter(x => x > 25).length} long frames (>25ms), p95 ${pct(all, .95).toFixed(1)} ms`);

// Where the time went: total duration per event, main thread and compositor/raster threads.
const threads = {};
for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') threads[e.pid + ':' + e.tid] = e.args.name;
const cost = {};
for (const e of events) {
  if (e.ph !== 'X' || !e.dur) continue;
  const t = threads[e.pid + ':' + e.tid] || '?';
  if (!/CrRendererMain|Compositor|Raster|VizCompositor|CrGpuMain/.test(t)) continue;
  const key = t.replace(/\d+$/, '') + ' · ' + e.name;
  cost[key] = (cost[key] || 0) + e.dur / 1000;
}
console.log('\ntop costs (ms, whole run):');
Object.entries(cost).sort((a, b) => b[1] - a[1]).slice(0, 22)
  .forEach(([k, v]) => console.log(v.toFixed(1).padStart(9), ' ', k));
// The trace opens in Chrome DevTools' Performance panel; out/ stays out of git.
mkdirSync(new URL('../../out/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../../out/trace-${label}.json`, import.meta.url), JSON.stringify({ traceEvents: events }));
