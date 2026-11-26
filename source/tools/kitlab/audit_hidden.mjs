// node tools/kitlab/audit_hidden.mjs <model> [lod]  (Kit Lab server running; puppeteer-core + Chrome) -> triangles never seen
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const [id, lod = '0', out = ''] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => console.log(m.text()));
await p.goto('http://localhost:8130/source/tools/kitlab/kitlab.html'); await new Promise((r) => setTimeout(r, 1200));
const res = await p.evaluate((id, lod) => {
  const m = window.__kitlabModels ? null : null;
  const mesh = window.__kitlab.build(id, +lod), f = new Float32Array(mesh.vb), ib = mesh.ib, nt = ib.length / 3, mb8 = new Uint8Array(mesh.vb);
  const N = 2048, cv = document.createElement('canvas'); cv.width = cv.height = N; const gl = cv.getContext('webgl2', { antialias: false });
  const P = new Float32Array(nt * 9), C = new Uint8Array(nt * 12);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const v = ib[t * 3 + k]; P.set([f[v * 5], f[v * 5 + 1], f[v * 5 + 2]], t * 9 + k * 3); const idc = t + 1; C.set([idc & 255, (idc >> 8) & 255, (idc >> 16) & 255, 255], t * 12 + k * 4); }
  const sh = (ty, s) => { const o = gl.createShader(ty); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, `#version 300 es
in vec3 p; in vec4 c; uniform mat4 M; flat out vec4 vc; void main(){ vc=c; gl_Position=M*vec4(p,1.); }`)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float; flat in vec4 vc; out vec4 o; void main(){ o=vc; }`)); gl.linkProgram(pr); gl.useProgram(pr);
  const buf = (d, loc, n, t, norm) => { const bb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bb); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); const l = gl.getAttribLocation(pr, loc); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, t, norm, 0, 0); };
  // the ground (id 0) as an occluder
  const G = 400, P2 = new Float32Array(P.length + 18), C2 = new Uint8Array(C.length + 24); P2.set(P); C2.set(C); P2.set([-G, 0, -G, G, 0, -G, G, 0, G, -G, 0, -G, G, 0, G, -G, 0, G], P.length); C2.set(new Uint8Array(24).fill(0), C.length);
  for (let i = 0; i < 6; i++) C2[C.length + i * 4 + 3] = 255;
  buf(P2, 'p', 3, gl.FLOAT, false); buf(C2, 'c', 4, gl.UNSIGNED_BYTE, true);
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.viewport(0, 0, N, N);
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  const c = lo.map((v, k) => (v + hi[k]) / 2), R = Math.hypot(...hi.map((v, k) => v - lo[k])) / 2;
  const seen = new Uint8Array(nt + 1), px = new Uint8Array(N * N * 4), Mu = gl.getUniformLocation(pr, 'M');
  const look = (e, t, ortho, fov) => { // column-major view-projection
    const fz = [e[0] - t[0], e[1] - t[1], e[2] - t[2]], lz = Math.hypot(...fz); const z = fz.map((v) => v / lz); let up = Math.abs(z[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
    const x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]], lx = Math.hypot(...x); x.forEach((v, i) => (x[i] = v / lx)); const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const V = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
    const n = 0.05, fa = 2000; let Pm;
    if (ortho) { const s = ortho; Pm = [1 / s, 0, 0, 0, 0, 1 / s, 0, 0, 0, 0, -2 / (fa - n), 0, 0, 0, -(fa + n) / (fa - n), 1]; } else { const ff = 1 / Math.tan(fov / 2); Pm = [ff, 0, 0, 0, 0, ff, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]; }
    const M = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += Pm[k * 4 + j] * V[i * 4 + k]; M[i * 4 + j] = s; }
    gl.uniformMatrix4fv(Mu, false, M); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, P2.length / 3);
    gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, px); for (let i = 0; i < px.length; i += 4) seen[px[i] | (px[i + 1] << 8) | (px[i + 2] << 16)] = 1; };
  let views = 0;
  for (let el = 1; el <= 89; el += 8) for (let az = 0; az < 360; az += 10) { const a = az * Math.PI / 180, e2 = el * Math.PI / 180, d = R * 3; look([c[0] + Math.sin(a) * Math.cos(e2) * d, c[1] + Math.sin(e2) * d, c[2] - Math.cos(a) * Math.cos(e2) * d], c, R * 1.05); views++; }
  // close perspective views round it at eye level and above, and along the passage both ways
  for (const h of [1.7, 12, 30]) for (let az = 0; az < 360; az += 15) { const a = az * Math.PI / 180, d = R * 0.9; look([c[0] + Math.sin(a) * d, h, c[2] - Math.cos(a) * d], [c[0], h * 0.5 + 8, c[2]], 0, 1.2); views++; }
  for (let z = -30; z <= 60; z += 6) for (const dz of [1, -1]) for (const y of [1.7, 10, 20]) { look([0, y, z], [0, y * 0.8, z + dz * 20], 0, 1.6); views++; }
  const hidden = []; for (let t = 1; t <= nt; t++) if (!seen[t]) hidden.push(t - 1);
  // describe them: by material, and clusters (5 m cells) with counts
  const mat = {}, cell = {};
  for (const t of hidden) { const v = ib[t * 3]; const mt = mb8[v * 20 + 16]; mat[mt] = (mat[mt] || 0) + 1; let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { const w = ib[t * 3 + k]; cx += f[w * 5] / 3; cy += f[w * 5 + 1] / 3; cz += f[w * 5 + 2] / 3; } const sb = new Int8Array(mesh.vb), nn = [sb[v * 20 + 12], sb[v * 20 + 13], sb[v * 20 + 14]].map((q) => Math.round(q / 127 * 2) / 2).join('/'); const key = `${Math.round(cx / 4) * 4},${Math.round(cy / 4) * 4},${Math.round(cz / 4) * 4} m${mt} n${nn}`; cell[key] = (cell[key] || 0) + 1; }
  return { nt, nv: mesh.nv, views, hidden: hidden.length, mat, cells: Object.entries(cell).sort((a, b) => b[1] - a[1]).slice(0, 70) };
}, id, lod);
console.log(JSON.stringify(res, null, 0).replace(/\],\[/g, '],\n['));
await b.close();
