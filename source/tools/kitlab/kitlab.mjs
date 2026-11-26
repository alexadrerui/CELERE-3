// Kit Lab: a workbench to view and adjust the procedural models built after the KitBash3D kit, apart from the scene.
//
//   node tools/kitlab/kitlab.mjs           build tools/kitlab/kitlab.html (open it in a browser)
//   node tools/kitlab/kitlab.mjs --serve   build, serve on http://localhost:8130 and rebuild + reload the page
//                                          whenever src/meshes.js or tools/kitlab/workbench.js changes
//
// The page runs the project's own model code (src/math.js, layout.js, meshes.js, read-only here) followed by
// workbench.js. A function redefined in workbench.js replaces the project's one in the Kit Lab only; nothing in the
// scene changes until the finished function is copied back into src/meshes.js.
import { readFileSync, writeFileSync, existsSync, watch, createReadStream, statSync, readdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', '..', 'src'), root = path.join(here, '..', '..', '..');
const REF = path.join(root, 'reference', 'kb3d', 'pyramid_detail');
const PROJECT = ['math.js', 'layout.js', 'meshes.js'];

function build() {
  // the scene's material ids live with its shaders; only that table is taken from there
  const M = readFileSync(path.join(src, 'sh_scene.js'), 'utf8').match(/^const M = \{[^\n]*\};/m)[0];
  // quality settings the model code reads (the scene picks them from the GPU; the lab shows the High level)
  const stub = 'const LV = 0, LEAFK = 1, QL = (h) => h;\n' + M;
  // the kit's large buildings (reference/kb3d/kb3d_reference.json): id, size, parts, relevance
  let kitLarge = '[]'; const RJ = path.join(root, 'reference', 'kb3d', 'kb3d_reference.json');
  if (existsSync(RJ)) { const r = JSON.parse(readFileSync(RJ, 'utf8')), rel = (r.summary && r.summary.by_relevance) || {};
    const lvl = (id) => Object.keys(rel).find((k) => rel[k].includes(id.replace(/_[A-Z]$/, ''))) || '';
    kitLarge = JSON.stringify(r.assets.filter((a) => a.id.startsWith('BldgLg')).map((a) => ({ id: a.id, dims: [a.dimensions_m.width_x, a.dimensions_m.depth_y, a.dimensions_m.height_z], parts: a.mesh_parts, names: a.part_names, tris: a.triangles, rel: lvl(a.id) }))); }
  let kitDims = '{}', kitTop = '{ c: [0, 0], scale: 1 }';
  if (existsSync(path.join(REF, 'complex_ortho_top.json'))) { const j = JSON.parse(readFileSync(path.join(REF, 'complex_ortho_top.json'), 'utf8')); kitTop = JSON.stringify({ c: j.centre, scale: j.ortho_scale }); }
  if (existsSync(path.join(REF, 'manifest.json'))) kitDims = JSON.stringify(JSON.parse(readFileSync(path.join(REF, 'manifest.json'), 'utf8')).parts);
  // photo sessions of single kit parts (part_closeups.py: <Part>_closeups.json in any reference/kb3d folder): every shot
  // with its camera, so the lab can put our model in the very same view
  const kitShots = {}; const KB = path.join(root, 'reference', 'kb3d');
  if (existsSync(KB)) for (const d of readdirSync(KB, { withFileTypes: true })) if (d.isDirectory()) for (const f of readdirSync(path.join(KB, d.name))) if (f.endsWith('_closeups.json')) {
    const j = JSON.parse(readFileSync(path.join(KB, d.name, f), 'utf8'));
    (kitShots[j.part] = kitShots[j.part] || []).push({ dir: `../../../reference/kb3d/${d.name}/`, shots: j.shots.map((s) => ({ f: s.file, note: s.view, cam: s.cam || closeCam(j.box, s.file) })) }); }
  const parts = [stub + `
const KIT_LARGE = ${kitLarge}; // (before the workbench, which reads it)
const KIT_SHOTS = ${JSON.stringify(kitShots)};`, ...PROJECT.map((f) => `// ---- src/${f} (project, read-only here)\n` + readFileSync(path.join(src, f), 'utf8')),
    '// ---- tools/kitlab/workbench.js\n' + readFileSync(path.join(here, 'workbench.js'), 'utf8'),
    `const KIT_DIMS = ${kitDims};`, `const KIT_TOP = ${kitTop}, KIT_PYR = [-194.65, 315.28];`, readFileSync(path.join(here, 'viewer.js'), 'utf8')];
  const js = `(() => {\n${parts.join('\n')}\n})();`;
  const html = readFileSync(path.join(here, 'kitlab.template.html'), 'utf8').replace('/*SCRIPT*/', () => js);
  writeFileSync(path.join(here, 'kitlab.html'), html);
  console.log(`kitlab.html built (${(Buffer.byteLength(html) / 1000).toFixed(0)} kB)${existsSync(REF) ? '' : ' - no kit reference renders found in reference/kb3d/pyramid_detail'}`);
}

// the camera of a part_closeups.py shot, worked out from its name and the framed box as that script does (for the
// sessions rendered before it wrote the cameras down): Blender world, z up; lens in mm (36 mm sensor) or ortho width
function closeCam(box, file) {
  const [lo, hi] = box, c = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2), d = [0, 1, 2].map((k) => hi[k] - lo[k]), dl = Math.hypot(...d), R = dl / 2, D2R = Math.PI / 180;
  const add = (p, q, s = 1) => p.map((v, k) => v + q[k] * s); let m;
  if ((m = file.match(/_orbit_az(\d+)_el(\d+)/))) { const az = +m[1] === 22 ? 22.5 : +m[1] === 68 ? 67.5 : +m[1] === 112 ? 112.5 : +m[1] === 158 ? 157.5 : +m[1] === 202 ? 202.5 : +m[1] === 248 ? 247.5 : +m[1] === 292 ? 292.5 : +m[1] === 338 ? 337.5 : +m[1], t = az * D2R, e = +m[2] * D2R, fit = R / Math.tan(Math.atan(18 / 35) * 0.92);
    return { loc: add(c, [Math.sin(t) * Math.cos(e), -Math.cos(t) * Math.cos(e), Math.sin(e)], fit), tgt: c, lens: 35 }; }
  if ((m = file.match(/_ortho_(front|back|left|right|top)/))) { const V = { front: [[0, -1, 0], d[0], d[2]], back: [[0, 1, 0], d[0], d[2]], left: [[-1, 0, 0], d[1], d[2]], right: [[1, 0, 0], d[1], d[2]], top: [[0, 0, 1], d[0], d[1]] }[m[1]];
    return { loc: add(c, V[0], dl + 50), tgt: c, ortho: Math.max(V[1], V[2] * 4 / 3) * 1.06 }; }
  if ((m = file.match(/_face_(front|back|left|right)_(\d)(\d)_(near|far)/))) {
    const F = { front: [[0, -1, 0], d[1] / 2, [1, 0, 0], d[0]], back: [[0, 1, 0], d[1] / 2, [-1, 0, 0], d[0]], left: [[-1, 0, 0], d[0] / 2, [0, -1, 0], d[1]], right: [[1, 0, 0], d[0] / 2, [0, 1, 0], d[1]] }[m[1]];
    const hf = [0.15, 0.5, 0.85][+m[2]], cf = [-0.375, -0.125, 0.125, 0.375][+m[3]], df = m[4] === 'near' ? 0.35 : 0.7;
    const tgt = add(add(c, F[0], F[1]), F[2], F[3] * cf); tgt[2] = lo[2] + d[2] * hf; const loc = add(add(tgt, F[0], d[2] * df), [0, 0, d[2] * 0.08]); loc[2] = Math.max(loc[2], lo[2] + 1.7);
    return { loc, tgt, lens: 35 }; }
  if ((m = file.match(/_eye_az(\d+)/))) { const t = +m[1] * D2R, r = Math.max(d[0], d[1]) * 0.9;
    return { loc: [c[0] + Math.sin(t) * r, c[1] - Math.cos(t) * r, lo[2] + 1.7], tgt: [c[0], c[1], lo[2] + d[2] * 0.45], lens: 24 }; }
  return null;
}

build();

if (process.argv.includes('--serve')) {
  const clients = new Set();
  const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.js': 'text/javascript' };
  http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/__reload') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }); res.write('\n'); clients.add(res); req.on('close', () => clients.delete(res)); return; }
    if (u === '/') { res.writeHead(302, { Location: '/source/tools/kitlab/kitlab.html' }); res.end(); return; }
    const f = path.join(root, u);
    if (!f.startsWith(root) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(f).pipe(res);
  }).listen(8130, () => console.log('Kit Lab: http://localhost:8130/'));
  let t = 0;
  const again = () => { clearTimeout(t); t = setTimeout(() => { try { build(); for (const c of clients) c.write('data: reload\n\n'); } catch (e) { console.error(e.message); } }, 150); };
  for (const f of [path.join(src, 'meshes.js'), path.join(src, 'math.js'), path.join(src, 'layout.js'), path.join(here, 'workbench.js'), path.join(here, 'viewer.js'), path.join(here, 'kitlab.template.html')]) watch(f, again);
}
