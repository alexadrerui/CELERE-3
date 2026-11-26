// ---- tools/kitlab/viewer.js: the Kit Lab's viewer (WebGL2). Draws a built mesh with flat lighting and colours by
// material, an orbit camera, the kit photos' framings, the kit photo beside or over it, and a check for missing faces.
const REF_DIR = '../../../reference/kb3d/pyramid_detail/', REF_RENDERS = '../../../reference/kb3d/renders/', KIT_SCALE = 2.4;
const refDir = () => (model && model.refDir ? model.refDir : model && model.refs === 'renders' ? REF_RENDERS : REF_DIR);
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
in vec3 vn; in vec3 vp; flat in vec4 vm; in float ao; uniform vec3 eye; uniform int backs; uniform int mode; uniform vec4 clip; out vec4 o;
vec3 pig(float k) { int i = int(k / 51. + .5);
  return i == 0 ? vec3(${PIG[0]}) : i == 1 ? vec3(${PIG[1]}) : i == 2 ? vec3(${PIG[2]}) : i == 3 ? vec3(${PIG[3]}) : i == 4 ? vec3(${PIG[4]}) : vec3(${PIG[5]}); }
vec3 base() { int mt = int(vm.x + .5); float ea = vm.y, eb = vm.z;
  if (mt == ${M.MARBLE}) { if (eb > 90. && eb < 110. && ea > 128.) return vec3(.05, .05, .055); /* (the far pyramid: polished black granite) */ return vec3(.8, .66, .47) * (eb > 250. ? .93 : 1.); }
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
  float cd = dot(vp, clip.xyz) - clip.w; if (mode != 2 && dot(clip.xyz, clip.xyz) > .5 && cd > 0.) discard; /* the section: what lies past the plane is cut away */
  if (mode == 1) { o = vec4(0., 0., 0., .55); return; }
  if (!gl_FrontFacing && mode != 2 && dot(clip.xyz, clip.xyz) > .5) { o = vec4(vec3(.3, .27, .24), 1.); return; } /* cut open: its inside, dim */
  if (!gl_FrontFacing) { if (backs == 1) { o = vec4(1., .24, .94, 1.); return; } }
  vec3 N = normalize(gl_FrontFacing || mode == 2 ? vn : -vn); /* (mode 2: the ground, one-sided) */ vec3 L = normalize(vec3(-.45, .78, -.43)); vec3 V = normalize(eye - vp);
  float d = max(dot(N, L), 0.); float hemi = .5 + .5 * N.y;
  vec3 c = base(); vec3 col = c * (vec3(1., .96, .88) * d * .78 + mix(vec3(.24, .22, .2), vec3(.42, .46, .52), hemi) * (.55 + .45 * ao));
  if (int(vm.x + .5) == ${M.GOLD}) col += vec3(1., .85, .5) * pow(max(dot(reflect(-L, N), V), 0.), 24.) * .5;
  if (int(vm.x + .5) == ${M.MARBLE} && vm.z > 90. && vm.z < 110. && vm.y > 128.) { vec3 R = reflect(-V, N); col += mix(vec3(.25, .27, .3), vec3(.55, .65, .8), clamp(R.y * .5 + .5, 0., 1.)) * .35 + vec3(1., .95, .85) * pow(max(dot(reflect(-L, N), V), 0.), 60.) * .6; } /* its polish: sky and sun mirrored */
  if (mode != 2 && dot(clip.xyz, clip.xyz) > .5 && cd > -.06) col = vec3(1., .45, .1); /* our cut edge: orange */
  o = vec4(pow(col, vec3(.95)), 1.); }`;
function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
const U = (n) => gl.getUniformLocation(prog, n), uVP = U('VP'), uEye = U('eye'), uBacks = U('backs'), uMode = U('mode'), uClip = U('clip');

// ---- the kit's own mesh, for comparing in 3D (tools/kitlab/kit_mesh.py exports it to reference/kb3d/mesh/, local only:
// it is read here at run time and never written into the page or the project)
const KIT_MESH_DIR = '../../../reference/kb3d/mesh/';
const kvs = `#version 300 es
layout(location=0) in vec3 p; layout(location=1) in vec4 n; layout(location=2) in vec4 c; layout(location=3) in vec4 b;
uniform mat4 VP; out vec3 vn; out vec3 vp; out vec3 vc; out vec3 vb; void main() { vn = n.xyz; vp = p; vc = c.rgb; vb = b.xyz; gl_Position = VP * vec4(p, 1.); }`;
const kfs = `#version 300 es
precision highp float; in vec3 vn; in vec3 vp; in vec3 vc; in vec3 vb; uniform int kmode; uniform float kalpha; uniform vec4 clip; uniform vec3 eye; out vec4 o;
void main() {
  float cd = dot(vp, clip.xyz) - clip.w; if (dot(clip.xyz, clip.xyz) > .5 && cd > 0.) discard;
  if (vp.y < -.01) discard;
  bool edge = dot(clip.xyz, clip.xyz) > .5 && cd > -.06;
  if (kmode == 2) { vec3 w = fwidth(vb); vec3 e = smoothstep(vec3(0.), w * 1.2, vb); float k = 1. - min(min(e.x, e.y), e.z); if (k < .2 && !edge) discard; o = vec4(edge ? vec3(.1, .9, 1.) : vec3(.05, .55, .75), edge ? 1. : k * kalpha + .15); return; }
  if (!gl_FrontFacing && dot(clip.xyz, clip.xyz) > .5) discard; /* its inside, cut open */
  vec3 N = normalize(vn); if (dot(N, eye - vp) < 0.) N = -N; vec3 L = normalize(vec3(-.45, .78, -.43));
  vec3 col = vc * (vec3(1., .96, .88) * max(dot(N, L), 0.) * .78 + mix(vec3(.24, .22, .2), vec3(.42, .46, .52), .5 + .5 * N.y) * .9);
  if (edge) col = vec3(.1, .9, 1.); /* the kit's cut edge: cyan */
  o = vec4(pow(col, vec3(.95)), kmode == 3 ? 1. : kalpha); }`;
const kprog = gl.createProgram(); gl.attachShader(kprog, sh(gl.VERTEX_SHADER, kvs)); gl.attachShader(kprog, sh(gl.FRAGMENT_SHADER, kfs)); gl.linkProgram(kprog);
if (!gl.getProgramParameter(kprog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(kprog));
const KU = (n) => gl.getUniformLocation(kprog, n), kuVP = KU('VP'), kuMode = KU('kmode'), kuAlpha = KU('kalpha'), kuClip = KU('clip'), kuEye = KU('eye');
// the kit's materials by name, coloured like ours
const kitColour = (nm) => { const s = nm.toLowerCase();
  return /gold/.test(s) ? [.92, .68, .26] : /hierogl/.test(s) ? [.78, .62, .44] : /granite|black/.test(s) ? [.12, .12, .13] : /white|bright/.test(s) ? [.88, .85, .78] : /orange/.test(s) ? [.8, .55, .35]
    : /sandstone|trim|colum/.test(s) ? [.8, .66, .47] : /mud/.test(s) ? [.6, .45, .3] : /wood|bark/.test(s) ? [.4, .28, .18] : /cloth|banner|fabric/.test(s) ? [.66, .26, .18] : /clay|pot/.test(s) ? [.6, .38, .25] : [.7, .68, .64]; };
let kitIndex = null, kitGPU = null, kitKey = '', kitLoading = '';
const kitCache = new Map();
async function kitPart(key) { if (kitCache.has(key)) return kitCache.get(key);
  const e = kitIndex[key]; if (!e) return null; const buf = await (await fetch(KIT_MESH_DIR + e.file)).arrayBuffer();
  const r = { pos: new Float32Array(buf, 0, e.tris * 9), mat: new Uint8Array(buf, e.tris * 36, e.tris), e }; kitCache.set(key, r); return r; }
// which kit parts a model compares with
function kitParts(m) { if (!m || !m.kit) return []; const A = m.kitAsset || 'BldgLgPyramid_A';
  if (m.kit === 'complex' || m.kit === A) return Object.keys(kitIndex).filter((k) => k.startsWith(A + '/') && !k.endsWith('/'));
  return [`${A}/${m.kit}`]; }
async function kitLoad() {
  const mode = +$('kitMode').value, alone = model && !model.build; if ((!mode && !alone) || !model || !model.kit || (!cur && !alone)) { $('kitInfo').textContent = mode ? 'Este modelo não tem peça no kit' : ''; return; }
  if (!kitIndex) { try { kitIndex = await (await fetch(KIT_MESH_DIR + 'index.json', { cache: 'no-store' })).json(); } catch { $('kitInfo').textContent = 'Sem malhas do kit: rode tools/kitlab/kit_mesh.py (reference/kb3d/mesh/)'; return; } }
  const keys = kitParts(model), key = model.id + ':' + keys.join(','); if (key === kitKey || key === kitLoading) return;
  if (!keys.length || !keys.every((k) => kitIndex[k])) { $('kitInfo').textContent = 'Esta peça não tem malha do kit exportada (tools/kitlab/kit_mesh.py)'; kitFree(); redraw(); return; }
  kitLoading = key; $('kitInfo').textContent = 'carregando a malha do kit…';
  const P = []; for (const k of keys) P.push(await kitPart(k)); if (kitLoading !== key) return;
  // the frame: model.kitXform (the kit point at our origin, c = [x, y], and our offset o), else the complex's frame
  // (the pyramid's centre) for the complex and its parts laid out there, else the part's box: its centre on ours, its
  // foot on the ground
  const S = KIT_SCALE; let c, o;
  if (model.kitXform) { c = model.kitXform.c; o = model.kitXform.o; }
  else if (['complex', 'pyramid', 'wall'].includes(model.id)) { c = KIT_PYR; o = [0, 0, 0]; }
  else if (alone) { const bx = (kitIndex[model.kitAsset + '/'] || P[0].e).box; c = [(bx[0][0] + bx[1][0]) / 2, (bx[0][1] + bx[1][1]) / 2]; o = [0, -bx[0][2] * S, 0]; } // (no model of ours: the kit alone, centred, on the ground)
  else { const bx = P[0].e.box; c = [(bx[0][0] + bx[1][0]) / 2, (bx[0][1] + bx[1][1]) / 2]; o = [(cur.lo[0] + cur.hi[0]) / 2, -bx[0][2] * S, (cur.lo[2] + cur.hi[2]) / 2]; }
  const nt = P.reduce((s, q) => s + q.e.tris, 0), buf = new ArrayBuffer(nt * 3 * 24), f = new Float32Array(buf), sb = new Int8Array(buf), u8 = new Uint8Array(buf);
  let v = 0;
  for (const q of P) { const col = q.e.mats.map(kitColour);
    for (let t = 0; t < q.e.tris; t++) { const A = [], cc = col[q.mat[t]] || [.7, .7, .7];
      for (const k of [0, 2, 1]) { /* (the mirror in x would turn the faces inside out) */ const x = q.pos[t * 9 + k * 3], y = q.pos[t * 9 + k * 3 + 1], z = q.pos[t * 9 + k * 3 + 2]; A.push([-(x - c[0]) * S + o[0], z * S + o[1], (y - c[1]) * S + o[2]]); }
      const nn = vnorm(vcross([A[1][0] - A[0][0], A[1][1] - A[0][1], A[1][2] - A[0][2]], [A[2][0] - A[0][0], A[2][1] - A[0][1], A[2][2] - A[0][2]]));
      for (let k = 0; k < 3; k++, v++) { const i = v * 6, q4 = v * 24; f[i] = A[k][0]; f[i + 1] = A[k][1]; f[i + 2] = A[k][2];
        sb[q4 + 12] = nn[0] * 127; sb[q4 + 13] = nn[1] * 127; sb[q4 + 14] = nn[2] * 127; u8[q4 + 16] = cc[0] * 255; u8[q4 + 17] = cc[1] * 255; u8[q4 + 18] = cc[2] * 255; u8[q4 + 19] = 255;
        u8[q4 + 20] = k === 0 ? 255 : 0; u8[q4 + 21] = k === 1 ? 255 : 0; u8[q4 + 22] = k === 2 ? 255 : 0; u8[q4 + 23] = 0; } } }
  kitFree(); const vao = gl.createVertexArray(), vb = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.BYTE, true, 24, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 24, 16); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 24, 20); gl.bindVertexArray(null);
  kitGPU = { vao, vb, n: nt * 3, f }; kitKey = key; kitLoading = ''; secKey = '';
  if (alone) { // no model of ours: the kit stands in, framed and measured as ours would be
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < nt * 3; i++) for (let k = 0; k < 3; k++) { const x = f[i * 6 + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; }
    lo[1] = max(lo[1], 0); cur = { vao: null, n: 0, nl: 0, nv: 0, lo, hi, f: new Float32Array(0), idx: new Uint32Array(0) }; $('noModel').style.display = 'none'; setView(view || 'az045'); }
  $('kitInfo').textContent = `kit: ${keys.length} peça${keys.length > 1 ? 's' : ''} · ${nt.toLocaleString()} triângulos · laranja = nosso corte, ciano = corte do kit`; redraw(); }
// the section's lines: every triangle crossing the plane gives a segment (ours orange, the kit's cyan), drawn a couple
// of pixels thick; recomputed only when the plane, the model or the kit changes
const lvs = `#version 300 es
layout(location=0) in vec3 p; uniform mat4 VP; uniform vec2 off; void main() { gl_Position = VP * vec4(p, 1.); gl_Position.xy += off * gl_Position.w; }`;
const lfs = `#version 300 es
precision highp float; uniform vec3 col; out vec4 o; void main() { o = vec4(col, 1.); }`;
const lprog = gl.createProgram(); gl.attachShader(lprog, sh(gl.VERTEX_SHADER, lvs)); gl.attachShader(lprog, sh(gl.FRAGMENT_SHADER, lfs)); gl.linkProgram(lprog);
const luVP = gl.getUniformLocation(lprog, 'VP'), luOff = gl.getUniformLocation(lprog, 'off'), luCol = gl.getUniformLocation(lprog, 'col');
let secKey = ''; const sec = { ours: null, kit: null };
function sectionOf(get, nt, n, d) { const out = []; const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
  for (let t = 0; t < nt; t++) { get(t, P); for (let k = 0; k < 3; k++) g[k] = P[k][0] * n[0] + P[k][1] * n[1] + P[k][2] * n[2] - d;
    let m = 0; for (let k = 0; k < 3; k++) { const a = g[k], b = g[(k + 1) % 3]; if ((a < 0) !== (b < 0)) { const s = a / (a - b), A = P[k], B = P[(k + 1) % 3]; out.push(A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s, A[2] + (B[2] - A[2]) * s); m++; } }
    if (m === 1) out.length -= 3; }
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW); return { vb, n: out.length / 3 }; }
function drawSection(VP, clip, w, h, km) {
  const n = clip.slice(0, 3), d = clip[3], key = clip.join(',') + '|' + (cur && cur.nv) + '|' + (kitGPU ? kitGPU.n : 0) + '|' + km;
  if (key !== secKey) { for (const s of [sec.ours, sec.kit]) if (s) gl.deleteBuffer(s.vb); sec.ours = sec.kit = null;
    if (km !== 3 && cur.n) { const f = cur.f, ix = cur.idx; sec.ours = sectionOf((t, P) => { for (let k = 0; k < 3; k++) { const i = ix[t * 3 + k] * 5; P[k][0] = f[i]; P[k][1] = f[i + 1]; P[k][2] = f[i + 2]; } }, ix.length / 3, n, d); }
    if (km && kitGPU) { const f = kitGPU.f; sec.kit = sectionOf((t, P) => { for (let k = 0; k < 3; k++) { const i = (t * 3 + k) * 6; P[k][0] = f[i]; P[k][1] = f[i + 1]; P[k][2] = f[i + 2]; } }, kitGPU.n / 3, n, d); }
    secKey = key; }
  gl.useProgram(lprog); gl.uniformMatrix4fv(luVP, false, VP); gl.disable(gl.DEPTH_TEST); const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.enableVertexAttribArray(0);
  for (const [s, col] of [[sec.kit, [.1, .9, 1]], [sec.ours, [1, .5, .12]]]) { if (!s || !s.n) continue; gl.bindBuffer(gl.ARRAY_BUFFER, s.vb); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); gl.uniform3fv(luCol, col);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { gl.uniform2f(luOff, dx * 2 / w, dy * 2 / h); gl.drawArrays(gl.LINES, 0, s.n); } }
  gl.bindVertexArray(null); gl.deleteVertexArray(vao); gl.enable(gl.DEPTH_TEST); }
function kitFree() { if (kitGPU) { gl.deleteVertexArray(kitGPU.vao); gl.deleteBuffer(kitGPU.vb); } kitGPU = null; kitKey = ''; }
// the section plane: along an axis, at a fraction of our model's extent (a little past it either way)
let cutSign = 1;
function cutPlane() { const ax = $('cutAxis').value; if (!ax || !cur) { $('cutVal').textContent = '—'; return [0, 0, 0, 0]; } const k = 'xyz'.indexOf(ax), lo = cur.lo[k] - 2, hi = cur.hi[k] + 2, v = lo + (hi - lo) * $('cutPos').value / 1000;
  $('cutVal').textContent = v.toFixed(2) + ' m'; const n = [0, 0, 0]; n[k] = cutSign; return [...n, v * cutSign]; }

// the mesh on the GPU, its edges for the wire view, its bounds
let cur = null;
function upload(mesh) {
  if (cur && cur.vao) { gl.deleteVertexArray(cur.vao); gl.deleteBuffer(cur.vb); gl.deleteBuffer(cur.ib); gl.deleteBuffer(cur.eb); }
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
  cur = { vao, vb, ib, eb, n: mesh.ib.length, nl: ln.length, nv: mesh.nv, lo, hi, f, idx: mesh.ib }; secKey = '';
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
  const { VP, eye } = matrices(w / h), clip = cutPlane(), km0 = +$('kitMode').value, km = model && !model.build ? (km0 === 2 ? 2 : 3) : km0, band = $('cutProfile').checked && clip[0] + clip[1] + clip[2] !== 0;
  if (band) { gl.clearColor(.1, .09, .08, 1); gl.clear(gl.COLOR_BUFFER_BIT); drawSection(VP, clip, w, h, km); info(); return; }
  gl.useProgram(prog); gl.uniform4fv(uClip, clip); gl.uniformMatrix4fv(uVP, false, VP); gl.uniform3fv(uEye, eye); gl.uniform1i(uBacks, $('backs').checked ? 1 : 0); gl.uniform1i(uMode, 0);
  if ($('ground').checked) { const s = hypot(cur.hi[0] - cur.lo[0], cur.hi[2] - cur.lo[2]) * 3 + 20; groundAt(-0.02, s); gl.bindVertexArray(gvao); gl.uniform1i(uBacks, 0); gl.uniform1i(uMode, 2); gl.drawArrays(gl.TRIANGLE_FAN, 0, 4); gl.uniform1i(uMode, 0); gl.uniform1i(uBacks, $('backs').checked ? 1 : 0); }
  // front faces first, then back faces pushed a little away in depth: a back face shows (magenta) only where no front
  // face covers it, i.e. a real hole, not a thin plate's far side winning a depth tie from afar (the game culls back
  // faces, so those never show there)
  gl.bindVertexArray(cur.vao); gl.enable(gl.CULL_FACE);
  if (km !== 3 && cur.n) { gl.cullFace(gl.BACK); gl.drawElements(gl.TRIANGLES, cur.n, gl.UNSIGNED_INT, 0);
    gl.cullFace(gl.FRONT); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 8); gl.drawElements(gl.TRIANGLES, cur.n, gl.UNSIGNED_INT, 0); }
  gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.CULL_FACE);
  // the kit: opaque alone (3), or over ours: blended where it is in front of or level with ours (1), as wires (2),
  // or blended right through (4)
  if (km && kitGPU) { gl.useProgram(kprog); gl.uniformMatrix4fv(kuVP, false, VP); gl.uniform4fv(kuClip, clip); gl.uniform3fv(kuEye, eye); gl.uniform1i(kuMode, km === 4 ? 1 : km); gl.uniform1f(kuAlpha, $('kitAlpha').value / 100);
    gl.bindVertexArray(kitGPU.vao);
    if (km === 3) gl.drawArrays(gl.TRIANGLES, 0, kitGPU.n);
    else { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); if (km === 4) gl.disable(gl.DEPTH_TEST); else { gl.depthFunc(gl.LEQUAL); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -4); }
      gl.drawArrays(gl.TRIANGLES, 0, kitGPU.n); gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.disable(gl.BLEND); }
    gl.useProgram(prog); gl.bindVertexArray(cur.vao); }
  gl.enable(gl.DEPTH_TEST);
  if ($('wire').checked && cur.n) { gl.uniform1i(uMode, 1); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthFunc(gl.LEQUAL); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cur.eb); gl.drawElements(gl.LINES, cur.nl, gl.UNSIGNED_INT, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cur.ib); gl.disable(gl.BLEND); gl.depthFunc(gl.LESS); }
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
  view = v || 'az045'; v = view; if (!cur) { refreshRef(); syncButtons(); return; } /* (no model of ours: framed on the kit's stand-in once it is loaded) */ /* (after a free camera there is no named view: frame from 45°) */ const { c, d } = bbox(), asp = 4 / 3; cam.tgt = c.slice();
  if (v.startsWith('az')) { // perspective, 35 mm lens, framing the bounding sphere as the photos do
    const az0 = +v.slice(2, 5), azs = model.orbit ? Math.round(az0 / model.orbit.step) * model.orbit.step : az0, az = azs * DEG, el = (model.orbit ? model.orbit.el : isComplexLow() ? 12 : model.kit === 'complex' ? 30 : 22) * DEG, lens = isComplexLow() ? 28 : 35, mrg = isComplexLow() ? 0.8 : 1;
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
  if (model.orbit) { for (const e of [0, 20, 45]) for (let a = 0; a < 360; a += model.orbit.step) L.push(`${p}az${String(a).padStart(3, '0')}_el${String(e).padStart(2, '0')}.png`); for (const o of ['front', 'back', 'left', 'right', 'top']) L.push(`${p}ortho_${o}.png`); for (const f of ['south', 'north', 'west', 'east']) for (const h of ['foot', 'mid', 'top']) for (const c of ['l', 'c', 'r']) L.push(`${p}close_${f}_${h}_${c}.png`); return L; }
  for (const a of [45, 135, 225, 315]) L.push(`${p}az${String(a).padStart(3, '0')}_el22.png`);
  for (const o of ['front', 'back', 'left', 'right', 'top']) L.push(`${p}ortho_${o}.png`);
  for (const f of ['south', 'north', 'west', 'east']) for (const h of ['foot', 'mid', 'top']) L.push(`${p}close_${f}_${h}.png`);
  return L;
}
function refForView() {
  if (!model || !model.kit) return '';
  if (model.refs === 'renders') return view === 'front' ? `${model.kit}_front.png` : view === 'top' ? `${model.kit}_top.png` : `${model.kit}.png`;
  if (model.kit === 'complex') return view.startsWith('az') ? `complex_${view}_el${complexLow ? 12 : 30}.png` : view === 'top' ? 'complex_ortho_top.png' : '';
  if (model.orbit && view.startsWith('az')) { const a = Math.round(+view.slice(2, 5) / model.orbit.step) * model.orbit.step; return `part_${model.kit}_az${String(a).padStart(3, '0')}_el${String(model.orbit.el).padStart(2, '0')}.png`; }
  return view.startsWith('az') ? `part_${model.kit}_${view}_el22.png` : `part_${model.kit}_ortho_${view}.png`;
}
// every photo for the model: the part's set (above) and its close photo sessions (KIT_SHOTS), with their cameras
let REFS = new Map();
function refList() {
  const L = refFiles().map((f) => ({ f, g: 'Fotos da peça', dir: refDir() }));
  const GN = (f) => { let m; if ((m = f.match(/_orbit_az\d+_el(\d+)/))) return `Órbita ${+m[1]}°`; if (/_eye_/.test(f)) return 'Altura dos olhos'; if (/_ortho_/.test(f)) return 'Elevações (orto)';
    if ((m = f.match(/_face_(\w+?)_\d\d_(near|far)/))) return `Face ${{ front: 'frontal', back: 'de trás', left: 'esquerda', right: 'direita' }[m[1]]} · ${m[2] === 'near' ? 'perto' : 'longe'}`; return 'Sessão de perto'; };
  if (model && model.kit && KIT_SHOTS[model.kit]) for (const s of KIT_SHOTS[model.kit]) for (const h of s.shots) L.push({ f: h.f, g: GN(h.f), dir: s.dir, cam: h.cam, note: h.note });
  REFS = new Map(L.map((r) => [r.f, r])); return L;
}
function refreshRef(file) {
  const sel = $('refSel'), L = refList(); let h = '', g = null;
  for (const r of L) { if (r.g !== g) { h += (g === null ? '' : '</optgroup>') + `<optgroup label="${r.g}">`; g = r.g; } h += `<option value="${r.f}">${r.f.replace(/^part_|\.png$/g, '')}</option>`; }
  sel.innerHTML = h + (g === null ? '' : '</optgroup>');
  const f = file || refForView(); if (f) sel.value = f; showRef(f && REFS.has(f) ? f : '');
}
// our camera onto a kit photo's: Blender world (z up, front -y) into the model's frame (model.kitXform: the kit point
// at our origin, c = [x, y]; o = our offset), x2.4 and mirrored in x as everywhere here
function kitCam(r) {
  const X = model && model.kitXform; if (!r || !r.cam || !X || !cur) return false; const S = KIT_SCALE;
  const P = ([x, y, z]) => [-(x - X.c[0]) * S + X.o[0], z * S + X.o[1], (y - X.c[1]) * S + X.o[2]], e = P(r.cam.loc), t2 = P(r.cam.tgt), d = [e[0] - t2[0], e[1] - t2[1], e[2] - t2[2]];
  cam.tgt = t2; cam.dist = hypot(...d); cam.pit = Math.asin(d[1] / cam.dist); cam.yaw = Math.atan2(d[0], -d[2]);
  if (r.cam.ortho) { cam.ortho = true; cam.oscale = r.cam.ortho * S; } else { cam.ortho = false; cam.fovY = 2 * Math.atan(13.5 / r.cam.lens); }
  view = ''; syncButtons(); redraw(); return true;
}
function pickRef(f) { showRef(f); const r = REFS.get(f); if ($('camSync').checked) kitCam(r); }
function showRef(f) {
  const img = $('ref'), over = $('over'), empty = $('refEmpty');
  if (!f) { img.removeAttribute('src'); over.removeAttribute('src'); empty.textContent = model && model.kit ? 'Sem foto do kit para esta vista' : 'Este modelo não tem peça correspondente no kit'; $('refTag').textContent = 'Kit original'; return; }
  empty.textContent = ''; img.className = ''; img.onerror = () => { img.className = 'missing'; empty.textContent = `Foto não encontrada em ${((REFS.get(f) || {}).dir || refDir()).replace('../../../', '')}\n(as renders do kit ficam só no seu computador)`; };
  const r = REFS.get(f), dir = (r && r.dir) || refDir(); img.src = dir + f; over.src = dir + f; $('refTag').textContent = 'Kit original · ' + f.replace('.png', '') + (r && r.note ? ' · ' + r.note : '');
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
    setView(['front', 'top'].includes(view) ? view : 'az045'); redraw(); kitFree(); kitLoad(); return; // (the kit stands in for ours: built afresh)
  }
  $('noModel').style.display = 'none';
  try { mesh = m.build(+$('lod').value); } catch (e) { $('err').style.display = 'block'; $('err').textContent = `${m.name}: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`; return; }
  $('err').style.display = 'none'; upload(mesh); $('ourTag').textContent = 'Nosso modelo · ' + m.name;
  $('azs').querySelectorAll('[data-v=low]').forEach((b) => { b.style.display = m.kit === 'complex' ? '' : 'none'; });
  setView(m.kit === 'complex' && !(view.startsWith('az') || view === 'top') ? 'az045' : view);
  kitLoad();
}
// the list: a building is one entry; its parts (entries with parent: its id) fold under it, opened by clicking it
let openP = null; try { openP = localStorage.kitlabOpen || null; } catch {}
function listModels() {
  const G = { complex: 'Complexo da pirâmide · no jogo', large: 'Prédios grandes do kit · sem modelo', medium: 'Prédios médios do kit · sem modelo', small: 'Prédios pequenos do kit · sem modelo' }, RL = { high: 'alta', medium: 'média', low: 'baixa' }; let h = '', g = '';
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
$('refSel').onchange = (e) => pickRef(e.target.value);
$('kitMode').onchange = () => { try { localStorage.kitlabKit = $('kitMode').value; } catch {} kitLoad(); redraw(); };
$('kitAlpha').oninput = redraw; $('cutProfile').onchange = redraw; $('cutAxis').onchange = redraw; $('cutPos').oninput = redraw; $('cutFlip').onclick = () => { cutSign = -cutSign; redraw(); };
$('cutLook').onclick = () => { const ax = $('cutAxis').value; if (!ax || !cur) return; const { c, d } = bbox(); cam.ortho = true; cam.tgt = c.slice(); cam.dist = hypot(...d) + 20; const k = 'xyz'.indexOf(ax);
  cam.tgt[k] = cutPlane()[3] * cutSign; // looking at the cut face, from the side that was cut away
  if (ax === 'y') { cam.yaw = 0; cam.pit = cutSign > 0 ? PI / 2 - 1e-4 : -PI / 2 + 1e-4; cam.oscale = max(d[0], d[2] * 4 / 3) * 1.1; }
  else if (ax === 'z') { cam.yaw = cutSign > 0 ? PI : 0; cam.pit = 0; cam.oscale = max(d[0], d[1] * 4 / 3) * 1.1; } else { cam.yaw = cutSign > 0 ? PI / 2 : -PI / 2; cam.pit = 0; cam.oscale = max(d[2], d[1] * 4 / 3) * 1.1; }
  $('cutProfile').checked = true; view = ''; syncButtons(); redraw(); };
try { if (localStorage.kitlabKit) $('kitMode').value = localStorage.kitlabKit; } catch {}
$('camSync').onchange = () => { if ($('camSync').checked) kitCam(REFS.get($('refSel').value)); };
addEventListener('keydown', (e) => { if (e.key !== '[' && e.key !== ']') return; const s = $('refSel'), n = s.options.length; if (!n) return; s.selectedIndex = (s.selectedIndex + (e.key === ']' ? 1 : n - 1)) % n; pickRef(s.value); });
// the overlay: a mix (opacity), the difference (where the two disagree it lights up) or a curtain (the photo on the
// right of the bar, ours on the left)
function overStyle() { const o = $('over'), on = $('overlay').checked, md = $('ovMode').value, v = $('opacity').value;
  o.style.mixBlendMode = on && md === 'diff' ? 'difference' : 'normal'; o.style.clipPath = on && md === 'wipe' ? `inset(0 0 0 ${v}%)` : 'none';
  o.style.opacity = !on ? 0 : md === 'mix' ? v / 100 : 1; $('opacity').title = md === 'wipe' ? 'posição da cortina' : 'opacidade'; }
$('ovMode').onchange = overStyle;
$('overlay').onchange = () => { $('panes').classList.toggle('over', $('overlay').checked); $('refPane').style.display = $('overlay').checked ? 'none' : ''; fitFrames(); overStyle(); redraw(); };
$('opacity').oninput = overStyle;
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
  const kd = model && (model.kitDims || KIT_DIMS[model.kit]);
  if (kd) { const k = [kd[0] * KIT_SCALE, kd[2] * KIT_SCALE, kd[1] * KIT_SCALE]; kit = `   kit ×${KIT_SCALE}: <b>${f(k[0])} × ${f(k[1])} × ${f(k[2])}</b> m   (diferença ${['x', 'y', 'z'].map((a, i) => `${a} ${d[i] - k[i] >= 0 ? '+' : ''}${f(d[i] - k[i])}`).join('  ')})`; }
  const e = camEye();
  $('info').innerHTML = `nosso: <b>${f(d[0])} × ${f(d[1])} × ${f(d[2])}</b> m (largura × altura × profundidade)${kit}\n${cur.nv.toLocaleString()} vértices · ${(cur.n / 3).toLocaleString()} triângulos · câmera ${f(e[0])}, ${f(e[1])}, ${f(e[2])} → ${f(cam.tgt[0])}, ${f(cam.tgt[1])}, ${f(cam.tgt[2])}${cam.ortho ? ' (orto)' : ''}`;
}
// look(eye, target): a free camera (for tests and for sharing a view); also mb.find(): where the magenta pixels are
const look = (e, t) => { cam.ortho = false; cam.fovY = 2 * Math.atan(13.5 / 35); cam.tgt = t.slice(); const d = [e[0] - t[0], e[1] - t[1], e[2] - t[2]]; cam.dist = hypot(...d); cam.pit = Math.asin(d[1] / cam.dist); cam.yaw = Math.atan2(d[0], -d[2]); view = ''; syncButtons(); redraw(); };
// for the section check (tools/kitlab/section_check.mjs): the cut's segments, ours and the kit's, at a plane
function sectionSegs(ax, v) { const n = [0, 0, 0]; n['xyz'.indexOf(ax)] = 1; const seg = (get, nt) => { const out = [], P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
    for (let t = 0; t < nt; t++) { get(t, P); for (let k = 0; k < 3; k++) g[k] = P[k][0] * n[0] + P[k][1] * n[1] + P[k][2] * n[2] - v; const s0 = out.length;
      for (let k = 0; k < 3; k++) { const a = g[k], b = g[(k + 1) % 3]; if ((a < 0) !== (b < 0)) { const s = a / (a - b), A = P[k], B = P[(k + 1) % 3]; out.push(+(A[0] + (B[0] - A[0]) * s).toFixed(3), +(A[1] + (B[1] - A[1]) * s).toFixed(3), +(A[2] + (B[2] - A[2]) * s).toFixed(3)); } }
      if (out.length - s0 === 3) out.length = s0; }
    return out; };
  const ours = cur && cur.n ? seg((t, P) => { for (let k = 0; k < 3; k++) { const i = cur.idx[t * 3 + k] * 5; P[k][0] = cur.f[i]; P[k][1] = cur.f[i + 1]; P[k][2] = cur.f[i + 2]; } }, cur.idx.length / 3) : [];
  const kit = kitGPU ? seg((t, P) => { for (let k = 0; k < 3; k++) { const i = (t * 3 + k) * 6; P[k][0] = kitGPU.f[i]; P[k][1] = kitGPU.f[i + 1]; P[k][2] = kitGPU.f[i + 2]; } }, kitGPU.n / 3) : [];
  return { ours, kit, lo: cur && cur.lo, hi: cur && cur.hi }; }
window.__kitlab = { sections: sectionSegs, cutAt: (ax, v) => { const k = 'xyz'.indexOf(ax), lo = cur.lo[k] - 2, hi = cur.hi[k] + 2; $('cutAxis').value = ax; $('cutPos').value = (v - lo) / (hi - lo) * 1000; cutSign = 1; $('cutLook').onclick(); }, bounds: () => cur && [cur.lo, cur.hi, cur.n, kitGPU && kitGPU.n, $("kitInfo").textContent], kit: async (m) => { $('kitMode').value = String(m); await kitLoad(); redraw(); return $('kitInfo').textContent; }, profile: (on) => { $('cutProfile').checked = !!on; redraw(); }, cut: (ax, f, s = 1) => { $('cutAxis').value = ax; $('cutPos').value = f * 1000; cutSign = s; redraw(); return $('cutVal').textContent; }, cutLook: () => $('cutLook').onclick(),
  pick: (id) => pick(MODELS.find((m) => m.id === id)), build: (id, l = 0) => MODELS.find((m) => m.id === id).build(l), /* (for the audits: a model's mesh) */ setView, look, photo: (f) => { refreshRef(f); $('refSel').value = f; pickRef(f); return !!REFS.get(f); }, models: MODELS.map((m) => m.id) };

let start = null; try { start = MODELS.find((m) => m.id === localStorage.kitlabModel); } catch {}
pick(start || MODELS[0]);
