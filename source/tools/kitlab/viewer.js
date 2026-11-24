// ---- tools/kitlab/viewer.js: the Kit Lab's viewer (WebGL2). Draws a built mesh with flat lighting and colours by
// material, an orbit camera, the kit photos' framings, the kit photo beside or over it, and a check for missing faces.
const REF_DIR = '../../../reference/kb3d/pyramid_detail/', REF_RENDERS = '../../../reference/kb3d/renders/', KIT_SCALE = 2.4;
const refDir = () => (model && model.refs === 'renders' ? REF_RENDERS : REF_DIR);
const $ = (id) => document.getElementById(id);
const canvas = $('c'), gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
if (!gl) throw new Error('WebGL2 is not available in this browser.');

// colours by material (sRGB), close to the scene's look: the scene's shaders are not run here
const PIG = [[.66, .26, .18], [.2, .38, .5], [.8, .63, .3], [.88, .85, .78], [.16, .14, .12], [.3, .45, .3]];
const vs = `#version 300 es
layout(location=0) in vec3 p; layout(location=1) in vec4 n; layout(location=2) in vec4 m;
uniform mat4 VP; out vec3 vn; out vec3 vp; flat out vec4 vm; out float ao;
void main() { vn = n.xyz; vp = p; vm = m; ao = n.w; gl_Position = VP * vec4(p, 1.); }`;
const fs = `#version 300 es
precision highp float;
in vec3 vn; in vec3 vp; flat in vec4 vm; in float ao; uniform vec3 eye; uniform int backs; uniform int mode; out vec4 o;
vec3 pig(float k) { int i = int(k / 51. + .5);
  return i == 0 ? vec3(${PIG[0]}) : i == 1 ? vec3(${PIG[1]}) : i == 2 ? vec3(${PIG[2]}) : i == 3 ? vec3(${PIG[3]}) : i == 4 ? vec3(${PIG[4]}) : vec3(${PIG[5]}); }
vec3 base() { int mt = int(vm.x + .5); float ea = vm.y, eb = vm.z;
  if (mt == ${M.MARBLE}) { if (eb > 90. && eb < 110. && ea > 128.) return vec3(.86, .83, .76); return vec3(.8, .66, .47) * (eb > 250. ? .93 : 1.); }
  if (mt == ${M.PLASTER}) return eb > 180. && eb < 230. ? pig(ea) : vec3(.8, .68, .52);
  if (mt == ${M.GOLD}) return vec3(.92, .68, .26);
  if (mt == ${M.TRIM}) return vec3(.87, .79, .65);
  if (mt == ${M.PAVE} || mt == ${M.STEP}) return vec3(.78, .66, .5);
  if (mt == ${M.GROUND}) return vec3(.76, .62, .44);
  if (mt == ${M.QUAY}) return vec3(.68, .58, .44);
  if (mt == ${M.CORE}) return vec3(.18, .15, .12);
  if (mt == ${M.ALLOY}) return vec3(.5, .38, .22);
  if (mt == ${M.BARK}) return vec3(.32, .24, .16);
  if (mt >= ${M.LEAF}) return vec3(.35, .48, .2);
  return vec3(.6); }
void main() {
  if (mode != 2 && vp.y < -.01) { discard; } /* below ground: buried footings are not shown */
  if (mode == 1) { o = vec4(0., 0., 0., .55); return; }
  if (!gl_FrontFacing) { if (backs == 1) { o = vec4(1., .24, .94, 1.); return; } }
  vec3 N = normalize(gl_FrontFacing || mode == 2 ? vn : -vn); /* (mode 2: the ground, one-sided) */ vec3 L = normalize(vec3(-.45, .78, -.43)); vec3 V = normalize(eye - vp);
  float d = max(dot(N, L), 0.); float hemi = .5 + .5 * N.y;
  vec3 c = base(); vec3 col = c * (vec3(1., .96, .88) * d * .78 + mix(vec3(.24, .22, .2), vec3(.42, .46, .52), hemi) * (.55 + .45 * ao));
  if (int(vm.x + .5) == ${M.GOLD}) col += vec3(1., .85, .5) * pow(max(dot(reflect(-L, N), V), 0.), 24.) * .5;
  o = vec4(pow(col, vec3(.95)), 1.); }`;
function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
const U = (n) => gl.getUniformLocation(prog, n), uVP = U('VP'), uEye = U('eye'), uBacks = U('backs'), uMode = U('mode');

// the mesh on the GPU, its edges for the wire view, its bounds
let cur = null;
function upload(mesh) {
  if (cur) { gl.deleteVertexArray(cur.vao); gl.deleteBuffer(cur.vb); gl.deleteBuffer(cur.ib); gl.deleteBuffer(cur.eb); }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, mesh.vb, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.BYTE, true, 20, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, false, 20, 16);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.ib, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  const ln = new Uint32Array(mesh.ib.length * 2); for (let i = 0, k = 0; i < mesh.ib.length; i += 3) { const a = mesh.ib[i], b = mesh.ib[i + 1], c = mesh.ib[i + 2]; ln.set([a, b, b, c, c, a], k); k += 6; }
  const eb = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ln, gl.STATIC_DRAW);
  const f = new Float32Array(mesh.vb), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < mesh.nv; i++) for (let k = 0; k < 3; k++) { const v = f[i * 5 + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  lo[1] = max(lo[1], 0); // what lies below ground (y < 0: buried footings) is neither framed, measured nor shown
  cur = { vao, vb, ib, eb, n: mesh.ib.length, nl: ln.length, nv: mesh.nv, lo, hi };
}

// camera: orbit around a target, perspective or orthographic
const cam = { tgt: [0, 0, 0], yaw: 0.6, pit: 0.35, dist: 50, ortho: false, oscale: 50, fovY: 2 * Math.atan(13.5 / 35) };
const camEye = () => { const cp = cos(cam.pit); return [cam.tgt[0] + cam.dist * cp * sin(cam.yaw), cam.tgt[1] + cam.dist * sin(cam.pit), cam.tgt[2] - cam.dist * cp * cos(cam.yaw)]; };
function matrices(asp) {
  const e = camEye(), f = vnorm([cam.tgt[0] - e[0], cam.tgt[1] - e[1], cam.tgt[2] - e[2]]);
  const up = abs(f[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0], r = vnorm(vcross(f, up)), u = vcross(r, f);
  const V = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -(r[0] * e[0] + r[1] * e[1] + r[2] * e[2]), -(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]), f[0] * e[0] + f[1] * e[1] + f[2] * e[2], 1];
  const R = cur ? hypot(cur.hi[0] - cur.lo[0], cur.hi[1] - cur.lo[1], cur.hi[2] - cur.lo[2]) : 100, nr = max(0.05, cam.dist - R * 1.2), fr = cam.dist + R * 2 + 100;
  let P;
  if (cam.ortho) { const w = cam.oscale / 2, h = w / asp; P = [1 / w, 0, 0, 0, 0, 1 / h, 0, 0, 0, 0, -2 / (fr - nr), 0, 0, 0, -(fr + nr) / (fr - nr), 1]; }
  else { const t = 1 / tan(cam.fovY / 2); P = [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + nr) / (nr - fr), -1, 0, 0, 2 * fr * nr / (nr - fr), 0]; }
  const O = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += P[k * 4 + j] * V[i * 4 + k]; O[i * 4 + j] = s; }
  return { VP: O, eye: e };
}

// ground: a big quad under the model, drawn first
const gvao = gl.createVertexArray(), gvb = gl.createBuffer();
function groundAt(y, s) {
  const b = new ArrayBuffer(4 * 20), f = new Float32Array(b), sb = new Int8Array(b), u = new Uint8Array(b);
  [[-s, -s], [s, -s], [s, s], [-s, s]].forEach(([x, z], i) => { f[i * 5] = x; f[i * 5 + 1] = y; f[i * 5 + 2] = z; sb[i * 20 + 13] = 127; sb[i * 20 + 15] = 127; u[i * 20 + 16] = M.GROUND; });
  gl.bindVertexArray(gvao); gl.bindBuffer(gl.ARRAY_BUFFER, gvb); gl.bufferData(gl.ARRAY_BUFFER, b, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.BYTE, true, 20, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, false, 20, 16);
  gl.bindVertexArray(null);
}

let dirty = true;
function draw() {
  if (!dirty) return; dirty = false;
  const w = canvas.clientWidth * devicePixelRatio | 0, h = canvas.clientHeight * devicePixelRatio | 0; if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h); gl.clearColor(.62, .69, .78, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  if (!cur) return;
  const { VP, eye } = matrices(w / h); gl.useProgram(prog); gl.uniformMatrix4fv(uVP, false, VP); gl.uniform3fv(uEye, eye); gl.uniform1i(uBacks, $('backs').checked ? 1 : 0); gl.uniform1i(uMode, 0);
  if ($('ground').checked) { const s = hypot(cur.hi[0] - cur.lo[0], cur.hi[2] - cur.lo[2]) * 3 + 20; groundAt(-0.02, s); gl.bindVertexArray(gvao); gl.uniform1i(uBacks, 0); gl.uniform1i(uMode, 2); gl.drawArrays(gl.TRIANGLE_FAN, 0, 4); gl.uniform1i(uMode, 0); gl.uniform1i(uBacks, $('backs').checked ? 1 : 0); }
  // front faces first, then back faces pushed a little away in depth: a back face shows (magenta) only where no front
  // face covers it, i.e. a real hole, not a thin plate's far side winning a depth tie from afar (the game culls back
  // faces, so those never show there)
  gl.bindVertexArray(cur.vao); gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK); gl.drawElements(gl.TRIANGLES, cur.n, gl.UNSIGNED_INT, 0);
  gl.cullFace(gl.FRONT); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 8); gl.drawElements(gl.TRIANGLES, cur.n, gl.UNSIGNED_INT, 0);
  gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.CULL_FACE);
  if ($('wire').checked) { gl.uniform1i(uMode, 1); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthFunc(gl.LEQUAL); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cur.eb); gl.drawElements(gl.LINES, cur.nl, gl.UNSIGNED_INT, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cur.ib); gl.disable(gl.BLEND); gl.depthFunc(gl.LESS); }
  gl.bindVertexArray(null);
  info();
}
const loop = () => { draw(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
const redraw = () => { dirty = true; };
function fitFrames() {
  for (const fr of document.querySelectorAll('.frame')) { const pn = fr.parentElement, w = pn.clientWidth - 2, h = pn.clientHeight - 2, k = min(w, h * 4 / 3);
    fr.style.width = k + 'px'; fr.style.height = k * 3 / 4 + 'px'; fr.style.maxWidth = fr.style.maxHeight = 'none'; fr.style.aspectRatio = 'auto'; }
  redraw();
}
addEventListener('resize', fitFrames); fitFrames();

// the kit photos' framings (tools: kb3d/pyr_detail.py), turned into this scene's axes. The kit is Blender (z up, its
// front facing -y); here y is up and fronts face -z, so Blender (x, y, z) is (-x, z, y) here (a mirror, which keeps
// both right-handed): a model that matches the kit matches its photos exactly
const bbox = () => ({ c: [0, 1, 2].map((k) => (cur.lo[k] + cur.hi[k]) / 2), d: [0, 1, 2].map((k) => cur.hi[k] - cur.lo[k]) });
let view = 'az045';
function setView(v) {
  view = v || 'az045'; v = view; if (!cur || !model.build) { refreshRef(); syncButtons(); return; } /* (after a free camera there is no named view: frame from 45°) */ const { c, d } = bbox(), asp = 4 / 3; cam.tgt = c.slice();
  if (v.startsWith('az')) { // perspective, 35 mm lens, framing the bounding sphere as the photos do
    const az = +v.slice(2, 5) * DEG, el = (isComplexLow() ? 12 : model.kit === 'complex' ? 30 : 22) * DEG, lens = isComplexLow() ? 28 : 35, mrg = isComplexLow() ? 0.8 : 1;
    const R = hypot(...d) / 2 * mrg * ((model.frame || {}).az || 1); cam.ortho = false; cam.fovY = 2 * Math.atan(13.5 / lens); cam.dist = R / tan(Math.atan(18 / lens) * 0.92);
    // Blender offset (sin az cos el, -cos az cos el, sin el) -> here (-sin az cos el, sin el, -cos az cos el)
    cam.yaw = -az; cam.pit = el; // camEye's offset is (cos pit sin yaw, sin pit, -cos pit cos yaw)
  } else if (model.kit === 'complex' && v === 'top') { // as the kit's complex_ortho_top render (KIT_TOP: its centre and width)
    cam.ortho = true; cam.dist = 600; cam.oscale = KIT_TOP.scale * KIT_SCALE; cam.tgt = [-(KIT_TOP.c[0] - KIT_PYR[0]) * KIT_SCALE, 0, (KIT_TOP.c[1] - KIT_PYR[1]) * KIT_SCALE]; cam.yaw = 0; cam.pit = PI / 2 - 1e-4;
  } else { // orthographic elevations, scaled to the bounding box as the photos are
    cam.ortho = true; cam.dist = hypot(...d) + 20;
    const W = { front: [d[0], d[1]], back: [d[0], d[1]], left: [d[2], d[1]], right: [d[2], d[1]], top: [d[0], d[2]] }[v];
    cam.oscale = max(W[0], W[1] * asp) * 1.08 * ((model.frame || {}).ortho || 1);
    // front: from -z; back: from +z; left (Blender -x) from +x here; right from -x; top: from above, the front down
    ({ front: () => { cam.yaw = 0; cam.pit = 0; }, back: () => { cam.yaw = PI; cam.pit = 0; }, left: () => { cam.yaw = PI / 2; cam.pit = 0; }, right: () => { cam.yaw = -PI / 2; cam.pit = 0; }, top: () => { cam.yaw = 0; cam.pit = PI / 2 - 1e-4; } })[v]();
  }
  refreshRef(); syncButtons(); redraw();
}
let complexLow = false; const isComplexLow = () => model && model.kit === 'complex' && complexLow;

// reference photo for the current model and view
function refFiles() {
  if (!model || !model.kit) return [];
  if (model.refs === 'renders') return [`${model.kit}.png`, `${model.kit}_front.png`, `${model.kit}_top.png`];
  if (model.kit === 'complex') { const L = []; for (const e of ['30', '12']) for (let a = 0; a < 360; a += 45) L.push(`complex_az${String(a).padStart(3, '0')}_el${e}.png`); for (let a = 0; a < 360; a += 45) L.push(`complex_eye_az${String(a).padStart(3, '0')}.png`); L.push('complex_ortho_top.png'); return L; }
  const p = `part_${model.kit}_`, L = [];
  for (const a of [45, 135, 225, 315]) L.push(`${p}az${String(a).padStart(3, '0')}_el22.png`);
  for (const o of ['front', 'back', 'left', 'right', 'top']) L.push(`${p}ortho_${o}.png`);
  for (const f of ['south', 'north', 'west', 'east']) for (const h of ['foot', 'mid', 'top']) L.push(`${p}close_${f}_${h}.png`);
  return L;
}
function refForView() {
  if (!model || !model.kit) return '';
  if (model.refs === 'renders') return view === 'front' ? `${model.kit}_front.png` : view === 'top' ? `${model.kit}_top.png` : `${model.kit}.png`;
  if (model.kit === 'complex') return view.startsWith('az') ? `complex_${view}_el${complexLow ? 12 : 30}.png` : view === 'top' ? 'complex_ortho_top.png' : '';
  return view.startsWith('az') ? `part_${model.kit}_${view}_el22.png` : `part_${model.kit}_ortho_${view}.png`;
}
function refreshRef(file) {
  const sel = $('refSel'), L = refFiles(); sel.innerHTML = L.map((f) => `<option>${f}</option>`).join('');
  const f = file || refForView(); if (f) sel.value = f; showRef(f && L.includes(f) ? f : '');
}
function showRef(f) {
  const img = $('ref'), over = $('over'), empty = $('refEmpty');
  if (!f) { img.removeAttribute('src'); over.removeAttribute('src'); empty.textContent = model && model.kit ? 'Sem foto do kit para esta vista' : 'Este modelo não tem peça correspondente no kit'; $('refTag').textContent = 'Kit original'; return; }
  empty.textContent = ''; img.className = ''; img.onerror = () => { img.className = 'missing'; empty.textContent = `Foto não encontrada em ${refDir().replace('../../../', '')}\n(as renders do kit ficam só no seu computador)`; };
  img.src = refDir() + f; over.src = refDir() + f; $('refTag').textContent = 'Kit original · ' + f.replace('.png', '');
}

// UI
let model = null;
function pick(m) {
  model = m; let mesh;
  for (const b of $('models').querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === m.id);
  try { localStorage.kitlabModel = m.id; } catch {}
  if (!m.build) { // a kit building with no model yet: its photos, size and parts
    cur = null; $('noModel').style.display = 'flex'; $('ourTag').textContent = 'Nosso modelo · ' + m.name; const a = m.kitInfo, k = (x) => (x * KIT_SCALE).toFixed(0), RL = { high: 'alta', medium: 'média', low: 'baixa' };
    $('noModel').textContent = `${m.name}\nainda sem modelo procedural\n\nkit ×${KIT_SCALE}: ${k(a.dims[0])} × ${k(a.dims[2])} × ${k(a.dims[1])} m (largura × altura × profundidade)\n${a.parts} peças · relevância: ${RL[a.rel] || '—'}`;
    $('info').innerHTML = `<b>${m.name}</b> (${m.kit}) · kit ×${KIT_SCALE}: <b>${k(a.dims[0])} × ${k(a.dims[2])} × ${k(a.dims[1])} m</b> · ${a.parts} peças · ${a.tris.toLocaleString()} triângulos no kit\npeças: ${[...new Set(a.names.map((n) => n.replace(/[A-Z]$/, '')))].join(', ')}`;
    setView(['front', 'top'].includes(view) ? view : 'az045'); redraw(); return;
  }
  $('noModel').style.display = 'none';
  try { mesh = m.build(+$('lod').value); } catch (e) { $('err').style.display = 'block'; $('err').textContent = `${m.name}: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`; return; }
  $('err').style.display = 'none'; upload(mesh); $('ourTag').textContent = 'Nosso modelo · ' + m.name;
  $('azs').querySelectorAll('[data-v=low]').forEach((b) => { b.style.display = m.kit === 'complex' ? '' : 'none'; });
  setView(m.kit === 'complex' && !(view.startsWith('az') || view === 'top') ? 'az045' : view);
}
// the list: a building is one entry; its parts (entries with parent: its id) fold under it, opened by clicking it
let openP = null; try { openP = localStorage.kitlabOpen || null; } catch {}
function listModels() {
  const G = { complex: 'Complexo da pirâmide · no jogo', large: 'Outros prédios grandes do kit · sem modelo' }, RL = { high: 'alta', medium: 'média', low: 'baixa' }; let h = '', g = '';
  for (const m of MODELS) {
    if (m.parent && m.parent !== openP) continue;
    if (m.group !== g) { g = m.group; h += `<h3>${G[g] || g}</h3>`; }
    const r = m.kitInfo && m.kitInfo.rel, tag = r ? `<span class="tag ${r}">${RL[r]}</span>` : '';
    const kids = MODELS.filter((c) => c.parent === m.id).length, fold = kids ? `<span class="fold">${openP === m.id ? '▾' : '▸'} ${kids} peças</span>` : '';
    const sub = m.kitInfo ? `${(m.kitInfo.dims[0] * KIT_SCALE).toFixed(0)} × ${(m.kitInfo.dims[1] * KIT_SCALE).toFixed(0)} m · ${m.kitInfo.parts} peças` : m.kit ? 'kit: ' + m.kit : 'sem peça no kit';
    h += `<button data-id="${m.id}" class="${m.build ? '' : 'todo'}${m.parent ? ' child' : ''}${model && model.id === m.id ? ' on' : ''}">${tag}${fold}${m.name}<small>${sub}</small></button>`;
  }
  $('models').innerHTML = h;
}
listModels();
$('models').onclick = (e) => {
  const b = e.target.closest('button[data-id]'); if (!b) return; const m = MODELS.find((x) => x.id === b.dataset.id);
  if (MODELS.some((c) => c.parent === m.id)) { openP = openP === m.id && model === m ? null : m.id; try { localStorage.kitlabOpen = openP || ''; } catch {} } // a building: open / close its parts
  pick(m); listModels();
};
$('views').innerHTML = [['front', 'Frente'], ['back', 'Trás'], ['top', 'Topo'], ['left', 'Esquerda'], ['right', 'Direita']].map(([v, n]) => `<button data-v="${v}">${n}</button>`).join('');
$('azs').innerHTML = [45, 135, 225, 315].map((a) => `<button data-v="az${String(a).padStart(3, '0')}">${a}°</button>`).join('') + [0, 90, 180, 270].map((a) => `<button data-v="az${String(a).padStart(3, '0')}" data-c=1>${a}°</button>`).join('') + '<button data-v=low title="Complexo: fotos baixas (12°)">baixo</button>';
function syncButtons() {
  for (const b of document.querySelectorAll('#views button, #azs button')) b.classList.toggle('on', b.dataset.v === view || (b.dataset.v === 'low' && complexLow));
  for (const b of document.querySelectorAll('#azs [data-c]')) b.style.display = model && model.kit === 'complex' ? '' : 'none';
}
$('views').onclick = $('azs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.v === 'low') { complexLow = !complexLow; setView(view.startsWith('az') ? view : 'az045'); } else if (model && model.kit === 'complex' && !b.dataset.v.startsWith('az') && b.dataset.v !== 'top') return; else setView(b.dataset.v); };
$('refSel').onchange = (e) => showRef(e.target.value);
$('overlay').onchange = () => { $('panes').classList.toggle('over', $('overlay').checked); $('refPane').style.display = $('overlay').checked ? 'none' : ''; fitFrames(); $('over').style.opacity = $('overlay').checked ? $('opacity').value / 100 : 0; redraw(); };
$('opacity').oninput = () => { if ($('overlay').checked) $('over').style.opacity = $('opacity').value / 100; };
for (const id of ['backs', 'wire', 'ground']) $(id).onchange = redraw;
$('lod').onchange = () => { const v = view; pick(model); if (model.build) setView(v); };

// orbit: drag rotates, right-drag pans, wheel zooms; F frames the model
let drag = null;
canvas.oncontextmenu = (e) => e.preventDefault();
canvas.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, b: e.button }; canvas.setPointerCapture(e.pointerId); };
canvas.onpointerup = () => { drag = null; };
canvas.onpointermove = (e) => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.b === 2 || e.shiftKey) { const s = (cam.ortho ? cam.oscale : cam.dist) / canvas.clientWidth, cy = cos(cam.yaw), sy = sin(cam.yaw); cam.tgt[0] += dx * s * cy; cam.tgt[2] += dx * s * sy; /* (screen right is (-cos yaw, 0, -sin yaw)) */ cam.tgt[1] += dy * s; }
  else { cam.yaw += dx * 0.006; cam.pit = clamp(cam.pit + dy * 0.006, -1.55, 1.5707); if (cam.ortho) { cam.ortho = false; cam.fovY = 2 * Math.atan(13.5 / 35); cam.dist = cam.oscale / (2 * tan(cam.fovY / 2) * 4 / 3) * 1.1; } view = ''; syncButtons(); }
  redraw();
};
canvas.onwheel = (e) => { e.preventDefault(); const k = Math.exp(e.deltaY * 0.0012); if (cam.ortho) cam.oscale *= k; else cam.dist *= k; redraw(); };
addEventListener('keydown', (e) => { if (e.code === 'KeyF') setView(view || 'az045'); });

// dimensions against the kit's (x2.4), triangles, camera
function info() {
  if (!cur) return; const { d } = bbox(), f = (v) => v.toFixed(1);
  let kit = '';
  const kd = model && KIT_DIMS[model.kit];
  if (kd) { const k = [kd[0] * KIT_SCALE, kd[2] * KIT_SCALE, kd[1] * KIT_SCALE]; kit = `   kit ×${KIT_SCALE}: <b>${f(k[0])} × ${f(k[1])} × ${f(k[2])}</b> m   (diferença ${['x', 'y', 'z'].map((a, i) => `${a} ${d[i] - k[i] >= 0 ? '+' : ''}${f(d[i] - k[i])}`).join('  ')})`; }
  const e = camEye();
  $('info').innerHTML = `nosso: <b>${f(d[0])} × ${f(d[1])} × ${f(d[2])}</b> m (largura × altura × profundidade)${kit}\n${cur.nv.toLocaleString()} vértices · ${(cur.n / 3).toLocaleString()} triângulos · câmera ${f(e[0])}, ${f(e[1])}, ${f(e[2])} → ${f(cam.tgt[0])}, ${f(cam.tgt[1])}, ${f(cam.tgt[2])}${cam.ortho ? ' (orto)' : ''}`;
}
// look(eye, target): a free camera (for tests and for sharing a view); also mb.find(): where the magenta pixels are
const look = (e, t) => { cam.ortho = false; cam.fovY = 2 * Math.atan(13.5 / 35); cam.tgt = t.slice(); const d = [e[0] - t[0], e[1] - t[1], e[2] - t[2]]; cam.dist = hypot(...d); cam.pit = Math.asin(d[1] / cam.dist); cam.yaw = Math.atan2(d[0], -d[2]); view = ''; syncButtons(); redraw(); };
window.__kitlab = { pick: (id) => pick(MODELS.find((m) => m.id === id)), setView, look, models: MODELS.map((m) => m.id) };

let start = null; try { start = MODELS.find((m) => m.id === localStorage.kitlabModel); } catch {}
pick(start || MODELS[0]);
