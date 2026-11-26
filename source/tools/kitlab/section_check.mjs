// Section check: cut our model and the kit's (Kit Lab, kit meshes exported by kit_mesh.py) at fixed stations along
// x, y and z, measure how far each profile lies from the other, and rank the stations; the worst get a picture.
//   node tools/kitlab/section_check.mjs <model> <outdir> [step_m]
// (Kit Lab server on :8130, puppeteer-core and Chrome as in the other test scripts; run from a folder that has
// puppeteer-core installed, or set NODE_PATH.) Writes <outdir>/<model>_sections.json and _sections.md, and
// <outdir>/<model>_cut_<axis>_<v>.png for the worst stations.
// Measures, per station: "falta" - kit outline with none of ours within 0.3 m (ours misses it), "sobra" - our outline
// with none of the kit's within 0.3 m (ours has it, the kit not), their lengths, and the worst places (clustered).
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
const [id, out, stepArg] = process.argv.slice(2); const STEP = +(stepArg || 0); mkdirSync(out, { recursive: true });
const TOL = 0.3, SAMPLE = 0.2, CELL = 1;
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 }); p.on('pageerror', (e) => console.log('PAGEERR', e.message));
await p.goto('http://localhost:8130/source/tools/kitlab/kitlab.html'); await new Promise((r) => setTimeout(r, 1500));
await p.evaluate(async (id) => { __kitlab.pick(id); await __kitlab.kit(1); }, id);
for (let i = 0; i < 60 && /carregando/.test(await p.evaluate(() => document.getElementById('kitInfo').textContent)); i++) await new Promise((r) => setTimeout(r, 250));
const B = await p.evaluate(() => __kitlab.bounds()); const [lo, hi] = B;
// stations: every STEP m (default: ~12 per axis) inside our bounds
const st = []; for (const [ax, k] of [['y', 1], ['z', 2], ['x', 0]]) { const a = k === 1 ? max0(lo[k]) + 1.5 : lo[k] + 0.5, e = hi[k] - 0.5, s = STEP || (e - a) / 12; for (let v = a; v <= e + 1e-6; v += s) st.push([ax, +v.toFixed(2)]); }
function max0(v) { return Math.max(v, 0); }
// distance from points along A's segments to B's segments (2D in the cut plane)
const proj = (ax) => (ax === 'x' ? [2, 1] : ax === 'y' ? [0, 2] : [0, 1]);
function grid(S, u, w) { const G = new Map(); for (let i = 0; i < S.length; i += 6) { const a = [S[i + u], S[i + w]], c = [S[i + 3 + u], S[i + 3 + w]];
  const x0 = Math.floor(Math.min(a[0], c[0]) / CELL), x1 = Math.floor(Math.max(a[0], c[0]) / CELL), y0 = Math.floor(Math.min(a[1], c[1]) / CELL), y1 = Math.floor(Math.max(a[1], c[1]) / CELL);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; if (!G.has(k)) G.set(k, []); G.get(k).push([a, c]); } } return G; }
function dseg(p, a, c) { const dx = c[0] - a[0], dy = c[1] - a[1], l = dx * dx + dy * dy; let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
// (only inside our model's box, a little wider: the kit's forecourt and avenue run far beyond the building)
let BOX = null;
function off(A, Bg, u, w) { let len = 0, bad = 0; const pts = [];
  for (let i = 0; i < A.length; i += 6) { const a = [A[i + u], A[i + w]], c = [A[i + 3 + u], A[i + 3 + w]], L = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.ceil(L / SAMPLE));
    for (let j = 0; j < n; j++) { const q = [a[0] + (c[0] - a[0]) * (j + 0.5) / n, a[1] + (c[1] - a[1]) * (j + 0.5) / n]; if (q[0] < BOX[0] || q[0] > BOX[1] || q[1] < BOX[2] || q[1] > BOX[3]) continue; let d = 9; const cx = Math.floor(q[0] / CELL), cy = Math.floor(q[1] / CELL);
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const [s0, s1] of Bg.get(x + ',' + y) || []) d = Math.min(d, dseg(q, s0, s1));
      len += L / n; if (d > TOL) { bad += L / n; pts.push([+q[0].toFixed(1), +q[1].toFixed(1), +Math.min(d, 9).toFixed(2)]); } } }
  return { len: +len.toFixed(1), bad: +bad.toFixed(1), pts }; }
function clusters(pts) { const C = []; for (const q of pts) { const c = C.find((c) => Math.hypot(c.x - q[0], c.y - q[1]) < 2); if (c) { c.n++; c.d = Math.max(c.d, q[2]); c.x0 = Math.min(c.x0, q[0]); c.x1 = Math.max(c.x1, q[0]); c.y0 = Math.min(c.y0, q[1]); c.y1 = Math.max(c.y1, q[1]); } else C.push({ x: q[0], y: q[1], n: 1, d: q[2], x0: q[0], x1: q[0], y0: q[1], y1: q[1] }); }
  return C.sort((a, b) => b.n * SAMPLE - a.n * SAMPLE).slice(0, 4).map((c) => ({ de: [c.x0, c.y0], ate: [c.x1, c.y1], metros: +(c.n * SAMPLE).toFixed(1), dist_max: c.d })); }
const R = [];
for (const [ax, v] of st) { const S = await p.evaluate((ax, v) => __kitlab.sections(ax, v), ax, v); const [u, w] = proj(ax);
  if (!S.kit.length && !S.ours.length) continue; BOX = [lo[u] - 1, hi[u] + 1, Math.max(lo[w], 0.6) - 1, hi[w] + 1]; if (u === 1 || w === 1) { if (u === 1) BOX[0] = 0.8; else BOX[2] = 0.8; } /* (above the plinth's top: the ground and floors aside) */ const falta = off(S.kit, grid(S.ours, u, w), u, w), sobra = off(S.ours, grid(S.kit, u, w), u, w);
  R.push({ eixo: ax, em: v, plano: ax === 'x' ? '(z, y)' : ax === 'y' ? '(x, z)' : '(x, y)', kit_m: falta.len, nosso_m: sobra.len, falta_m: falta.bad, sobra_m: sobra.bad, nota: +(falta.bad + sobra.bad).toFixed(1), onde_falta: clusters(falta.pts), onde_sobra: clusters(sobra.pts) }); }
R.sort((a, b) => b.nota - a.nota);
writeFileSync(`${out}/${id}_sections.json`, JSON.stringify(R, null, 1));
const md = [`# Checagem por cortes · ${id}`, '', `Tolerância ${TOL} m. falta: contorno do kit sem o nosso a menos de ${TOL} m; sobra: o nosso sem o do kit. Coordenadas no plano do corte, em metros.`, '',
  '| corte | kit (m) | nosso (m) | falta (m) | sobra (m) | onde falta (maiores) | onde sobra (maiores) |', '|---|---|---|---|---|---|---|',
  ...R.map((r) => `| ${r.eixo} = ${r.em} ${r.plano} | ${r.kit_m} | ${r.nosso_m} | ${r.falta_m} | ${r.sobra_m} | ${r.onde_falta.map((c) => `${c.de}→${c.ate} (${c.metros} m, até ${c.dist_max})`).join('; ')} | ${r.onde_sobra.map((c) => `${c.de}→${c.ate} (${c.metros} m, até ${c.dist_max})`).join('; ')} |`)];
writeFileSync(`${out}/${id}_sections.md`, md.join('\n'));
// pictures of the worst stations: the profiles, ours orange, the kit's cyan
for (const r of R.slice(0, +(process.env.PICS || 6))) { await p.evaluate((ax, v) => __kitlab.cutAt(ax, v), r.eixo, r.em); await new Promise((q) => setTimeout(q, 500));
  await (await p.$('#c')).screenshot({ path: `${out}/${id}_cut_${r.eixo}_${r.em}.png` }); }
console.log(`${R.length} cortes; piores:`); for (const r of R.slice(0, 8)) console.log(`  ${r.eixo}=${r.em}: falta ${r.falta_m} m, sobra ${r.sobra_m} m`);
await b.close();
