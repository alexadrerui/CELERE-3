// mesh generators: ground, podium, crystals, bridges, terrain
// normals at both ends of each profile segment, averaged unless the corner is sharper than `crease`; solid on the right
const profNormals = (prof, crease = 50) => {
  const cr = cos(crease * DEG), n = prof.length, sn = [], out = [];
  for (let i = 0; i < n - 1; i++) { const a = prof[i + 1][0] - prof[i][0], b = prof[i + 1][1] - prof[i][1], l = hypot(a, b) || 1; sn.push([-b / l, a / l, l]); }
  for (let i = 0; i < n - 1; i++) {
    const e = (k) => { const a = sn[i], b = sn[k]; if (!b || !b[2] || a[0] * b[0] + a[1] * b[1] < cr) return a; const x = a[0] + b[0], y = a[1] + b[1], l = hypot(x, y) || 1; return [x / l, y / l]; };
    out.push([e(i - 1), e(i + 1)]);
  }
  return out;
};

// city ground: rings of land, quay walls, canal floors
// one cross-section from podium to outer shelf, swept around; walls take their boundary curve's normal
const NT = 1440; // steps around the circle
const FLOOR_Y = { moat: 3.2, mid: 3.0, ch: 4.6, out: 2.8 };
// Low: a third of the steps and no coping bevels (30k triangles, not 160k), except near the river mouth
function meshCityGround() {
  const mb = new MB(1 << 17), low = LV > 1;
  // bank on the `land` side (+1 out, -1 in) of radius R
  const bank = (R, land, fy) => {
    const p = low ? [[0, fy, M.QUAY], [0, 10, M.TRIM], [-0.07, 10.3, M.TRIM], [0.66, 10.3, M.TRIM], [0.66, 10, M.GROUND]]
      : [[0, fy, M.QUAY], [0, 9.98, M.TRIM], [-0.07, 10.03, M.TRIM], [-0.07, 10.26, M.TRIM], [-0.03, 10.3, M.TRIM], [0.62, 10.3, M.TRIM], [0.66, 10.26, M.TRIM], [0.66, 10, M.GROUND]];
    return (land > 0 ? p : p.reverse().map((q, i, a) => [q[0], q[1], i < a.length - 1 ? a[i + 1][2] : M.GROUND])).map((q) => [R + q[0] * land, q[1], q[2]]);
  };
  const names = ['moat', 'civ', 'mid', 'chi', 'cho', 'gar', 'out'];
  let prev = null;
  for (let j = 0; j <= NT; j++) {
    const t = j / NT * TAU, c = cos(t), s = sin(t);
    if (low && j % 3 && abs(angd(t, RIV_MOUTH.t)) * RIV_MOUTH.r > RIV_GAP + 12) continue;
    const R = names.map((k) => RB[k](t)), dR = names.map((k) => (RB[k](t + 1e-3) - RB[k](t - 1e-3)) / 2e-3);
    // boundary normals, pointing outwards
    const bn = R.map((r, k) => { const tx = dR[k] * c - r * s, tz = dR[k] * s + r * c, l = hypot(tx, tz); return [tz / l, -tx / l]; });
    const prof = [], own = []; // which boundary a point's normal follows (-1 = up)
    const add = (pts, k) => { for (const p of pts) { prof.push(p); own.push(k); } };
    add([[85, FLOOR_Y.moat, M.FLOOR]], -1);
    add(bank(R[0], 1, FLOOR_Y.moat), 0); add(bank(R[1], -1, FLOOR_Y.mid), 1); prof[prof.length - 1][2] = M.FLOOR;
    add(bank(R[2], 1, FLOOR_Y.mid), 2); add(bank(R[3], -1, FLOOR_Y.ch), 3); prof[prof.length - 1][2] = M.FLOOR;
    add(bank(R[4], 1, FLOOR_Y.ch), 4); add(bank(R[5], -1, FLOOR_Y.out), 5); prof[prof.length - 1][2] = M.FLOOR;
    // at the river mouth the outer quay is open: the canal floor runs into the river bed (the quay bridges it, city.js)
    const gap = abs(angd(t, RIV_MOUTH.t)) * RIV_MOUTH.r < RIV_GAP, wall = bank(R[6], 1, FLOOR_Y.out);
    add(gap ? wall.map((q, i) => [R[6] + 0.66 * i / (wall.length - 1), FLOOR_Y.out, M.FLOOR]) : wall, 6);
    const pn = profNormals(prof), ring = [];
    for (let i = 0; i < prof.length - 1; i++) {
      const a = prof[i], b = prof[i + 1];
      mb.mat = a[2]; mb.ea = 0;
      const V = (p, n, k) => {
        const hn = k < 0 ? [c, s] : bn[k];
        // baked occlusion in the corner at each wall's foot
        const ao = a[2] === M.QUAY ? 0.62 + 0.38 * sstep(3, 7.5, p[1]) : a[2] === M.FLOOR ? 0.8 : 1;
        return mb.v(p[0] * c, p[1], p[0] * s, n[0] * hn[0], n[1], n[0] * hn[1], ao);
      };
      ring.push(V(a, pn[i][0], own[i]), V(b, pn[i][1], own[i + 1] < 0 ? own[i] : own[i + 1]));
    }
    if (prev) for (let i = 0; i < ring.length; i += 2) if (hypot(prof[i / 2][0] - prof[i / 2 + 1][0], prof[i / 2][1] - prof[i / 2 + 1][1]) > 1e-4) mb.quad(prev[i], ring[i], ring[i + 1], prev[i + 1]);
    prev = ring;
  }
  return mb.build();
}

// sanctuary podium
// three marble tiers with a ring pool, a drum for the lotus and six stairways along the spokes; light-liquid
// wells over a slot at each tier edge
const POOL = [21, 43.5], STAIR = { r0: 92, y0: 14, r1: 58, y1: 40, hw: 6 };
const stairY = (r) => mix(STAIR.y0, STAIR.y1, clamp((STAIR.r0 - r) / (STAIR.r0 - STAIR.r1), 0, 1));
function meshPodium() {
  const mb = new MB(1 << 16);
  // tier edge from outside going up: face, lip, slot, kerb, walkway
  const edge = (R, y0, y1) => [[R, y0, M.MARBLE], [R, y1 - 0.3, M.TRIM], [R - 0.05, y1 - 0.2, M.TRIM], [R - 0.2, y1 - 0.15, M.TRIM], [R - 0.25, y1 - 0.5, M.TRIM], [R - 1.0, y1 - 0.5, M.TRIM], [R - 1.0, y1 + 0.42, M.TRIM], [R - 1.04, y1 + 0.46, M.TRIM], [R - 1.36, y1 + 0.46, M.TRIM], [R - 1.4, y1 + 0.42, M.TRIM], [R - 1.4, y1, M.PAVE]];
  const trough = (R, y) => [[R + 2.4, y, M.TRIM], [R + 2.4, y - 0.45, M.TRIM], [R, y - 0.45, M.MARBLE]];
  // plaza, pool, drum (no cuts)
  const inner = [[56.6, 40, M.PAVE], [44.2, 40, M.TRIM], [44.2, 40.32, M.TRIM], [44.16, 40.36, M.TRIM], [43.54, 40.36, M.TRIM], [43.5, 40.32, M.TRIM], [43.5, 39.2, M.FLOOR], [21, 39.2, M.MARBLE],
    [21, 41.9, M.TRIM], [20.95, 42, M.TRIM], [20.8, 42.05, M.TRIM], [20.75, 41.7, M.TRIM], [20.1, 41.7, M.TRIM], [20.1, 42.2, M.PAVE], [15.5, 42.2, M.MARBLE],
    [15.5, 44.3, M.TRIM], [15.45, 44.4, M.TRIM], [15.3, 44.45, M.TRIM], [15.25, 44.1, M.TRIM], [14.6, 44.1, M.TRIM], [14.6, 44.6, M.PAVE], [9.6, 44.6, M.GOLD], [9.6, 45.3, M.GOLD], [9.5, 45.4, M.GOLD], [8.3, 45.4, M.GOLD], [8.3, 44.4, M.GOLD]];
  mb.lathe(inner, { seg: 144, ao: (r, y) => (y < 39.9 ? 0.75 : 1) });
  // one sixth of the tiers between two stairways, copied around
  const sec = new MB(1 << 14), hw = STAIR.hw, cut = (r) => asin(min(hw / r, 1));
  const tiers = [[85, 3.2, M.QUAY], ...edge(85, 3.2, 20).slice(1), [72.9, 20, M.TRIM], ...trough(70.5, 20), ...edge(70.5, 19.55, 30).slice(1), [60.4, 30, M.TRIM], ...trough(58, 30), ...edge(58, 29.55, 40).slice(1), [56.6, 40, M.PAVE]];
  sec.lathe(tiers, { seg: 40, a0: (r) => cut(r), a1: (r) => PI / 3 - cut(r), ao: (r, y) => (r > 84.9 ? 0.62 + 0.38 * sstep(3, 7.5, y) : 1) });
  // stairway cut walls, on planes parallel to the spoke
  for (const sd of [0, 1]) {
    const ax = sd ? PI / 3 : 0, dx = cos(ax), dz = sin(ax), lx = sd ? sin(ax) : -sin(ax), lz = sd ? -cos(ax) : cos(ax); // l: from the axis towards this sector
    sec.mat = M.MARBLE;
    for (let i = 0; i < tiers.length - 1; i++) {
      const a = tiers[i], b = tiers[i + 1]; if (abs(a[0] - b[0]) < 1e-4) continue;
      const P = (r, y) => { const u = sqrt(r * r - hw * hw); return sec.v(dx * u + lx * hw, y, dz * u + lz * hw, -lx, 0, -lz, 0.8); };
      sec.quad(P(a[0], a[1]), P(b[0], b[1]), P(b[0], 2), P(a[0], 2));
    }
  }
  const secM = sec.build();
  for (let k = 0; k < 6; k++) mb.add(secM, 0, 0, 0, -(SPOKES[k]));
  return mb.build();
}
// a stairway along +x, origin STAIR_C. lod 1 is a plain ramp (sub-pixel steps only shimmer), lined by the material
const STAIR_C = [75, 27];
function meshPodiumStair(lod) {
  const st = new MB(1 << 13), hw = STAIR.hw, n = round((STAIR.y1 - STAIR.y0) / 0.18), tread = (STAIR.r0 - STAIR.r1) / n;
  st.fr = [-STAIR_C[0], -STAIR_C[1], 0, 1, 0, 1];
  st.mat = M.STEP;
  if (lod) { st.eb = 255; st.quad(st.v(STAIR.r0, STAIR.y0, -hw, 0, 1, 0, 0.85), st.v(STAIR.r0, STAIR.y0, hw, 0, 1, 0, 0.85), st.v(STAIR.r1, STAIR.y1, hw, 0, 1, 0, 0.85), st.v(STAIR.r1, STAIR.y1, -hw, 0, 1, 0, 0.85)); st.eb = 0; }
  else for (let i = 0; i < n; i++) {
    const r = STAIR.r0 - i * tread, y = STAIR.y0 + i * 0.18;
    st.quad(st.v(r, y, -hw, 1, 0, 0, 0.7), st.v(r, y, hw, 1, 0, 0, 0.7), st.v(r, y + 0.18, hw, 1, 0, 0, 1), st.v(r, y + 0.18, -hw, 1, 0, 0, 1));
    st.quad(st.v(r, y + 0.18, -hw, 0, 1, 0, 1), st.v(r, y + 0.18, hw, 0, 1, 0, 1), st.v(r - tread, y + 0.18, hw, 0, 1, 0, 0.75), st.v(r - tread, y + 0.18, -hw, 0, 1, 0, 0.75));
  }
  // top landing, and the stair block's foot in the moat
  st.mat = M.PAVE; st.quad(st.v(STAIR.r1, 40, -hw, 0, 1, 0), st.v(STAIR.r1, 40, hw, 0, 1, 0), st.v(56.5, 40, hw, 0, 1, 0), st.v(56.5, 40, -hw, 0, 1, 0));
  st.mat = M.QUAY; st.quad(st.v(STAIR.r0, STAIR.y0, -hw - 0.6, 1, 0, 0), st.v(STAIR.r0, STAIR.y0, hw + 0.6, 1, 0, 0), st.v(STAIR.r0, 3, hw + 0.6, 1, 0, 0, 0.6), st.v(STAIR.r0, 3, -hw - 0.6, 1, 0, 0, 0.6));
  for (const sg of [-1, 1]) {
    // stair block side and sloping cheek wall
    const z0 = sg * (hw - 0.03), z1 = sg * (hw + 0.6), y = (r) => stairY(r) + 0.95, S = lod ? 6 : 24;
    for (let k = 0; k < S; k++) {
      const ra = mix(STAIR.r0, STAIR.r1 - 1, k / S), rb = mix(STAIR.r0, STAIR.r1 - 1, (k + 1) / S), ya = y(ra), yb = y(rb), sl = 0.63;
      st.mat = M.MARBLE;
      st.quad(st.v(ra, ya, z1, 0, 0, sg), st.v(rb, yb, z1, 0, 0, sg), st.v(rb, 2, z1, 0, 0, sg, 0.6), st.v(ra, 2, z1, 0, 0, sg, 0.6));
      st.quad(st.v(ra, ya, z0, 0, 0, -sg), st.v(rb, yb, z0, 0, 0, -sg), st.v(rb, yb - 1.2, z0, 0, 0, -sg, 0.6), st.v(ra, ya - 1.2, z0, 0, 0, -sg, 0.6));
      st.mat = M.TRIM;
      st.quad(st.v(ra, ya + 0.06, z0 + sg * 0.05, -sl * 0.5, 0.8, -sg * 0.4), st.v(rb, yb + 0.06, z0 + sg * 0.05, -sl * 0.5, 0.8, -sg * 0.4), st.v(rb, yb + 0.06, z1 - sg * 0.05, -sl * 0.5, 0.8, sg * 0.4), st.v(ra, ya + 0.06, z1 - sg * 0.05, -sl * 0.5, 0.8, sg * 0.4));
      st.quad(st.v(ra, ya + 0.06, z0 + sg * 0.05, -sl * 0.5, 0.8, -sg * 0.4), st.v(rb, yb + 0.06, z0 + sg * 0.05, -sl * 0.5, 0.8, -sg * 0.4), st.v(rb, yb, z0, 0, 0.2, -sg), st.v(ra, ya, z0, 0, 0.2, -sg));
      st.quad(st.v(ra, ya + 0.06, z1 - sg * 0.05, -sl * 0.5, 0.8, sg * 0.4), st.v(rb, yb + 0.06, z1 - sg * 0.05, -sl * 0.5, 0.8, sg * 0.4), st.v(rb, yb, z1, 0, 0.2, sg), st.v(ra, ya, z1, 0, 0.2, sg));
    }
  }
  return st.build();
}

// crystals
const PETAL_W = (t) => 0.3 * pow(sin(PI * pow(t, 0.62)), 0.75) * (1 - 0.2 * t); // half width along a petal
// lotus petal: pointed crystal leaf along +y, unit length, faceted both sides, slightly cupped
// carved sandstone petal: a smooth, thick lens in section, cupped, unit length along +y; darker towards its foot,
// where the petals crowd
function meshPetal() {
  const mb = new MB(1024), S = 16, A = 14; mb.ea = WEATHERED; const bend = (t) => -0.22 * t * t, th = (t) => 0.055 * pow(sin(PI * pow(t, 0.6)), 0.8) + 0.004, ring = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S, w = PETAL_W(t) + 0.004, d = th(t), row = [];
    for (let j = 0; j <= A; j++) { const a = j / A * TAU, c = cos(a), s = sin(a); row.push(mb.v(c * w, t, bend(t) - 0.02 * sin(PI * t) * (1 - abs(s)) + s * d, c * d, 0.15 * (1 - t), s * w, 0.5 + 0.5 * sstep(0.05, 0.55, t))); }
    ring.push(row);
  }
  for (let i = 0; i < S; i++) for (let j = 0; j < A; j++) mb.quad(ring[i][j], ring[i][j + 1], ring[i + 1][j + 1], ring[i + 1][j]);
  return mb.build();
}
// pale-gold rim along a petal's edge
function meshPetalRim() {
  const mb = new MB(512), S = 18, edge = PETAL_W, bend = (t) => -0.22 * t * t;
  mb.mat = M.GOLD;
  for (const sd of [1, -1]) { const pts = []; for (let i = 0; i <= S; i++) { const t = i / S; pts.push([sd * edge(t), t, bend(t) - 0.02 * sin(PI * t), 0.0045]); } mb.tube(pts, 4, false); }
  return mb.build();
}
// tower trim: plinth, gold spiral band and cage over the point (the shaft is a crystal mesh)
const TOWER = { h: 78, r0: 3.3, r1: 2.75, tip: 9 };
// east first
const TOWER_HS = [80, 88, 72, 80, 72, 88];
const towerR = (y) => (y < TOWER.h - TOWER.tip ? mix(TOWER.r0, TOWER.r1, y / (TOWER.h - TOWER.tip)) : TOWER.r1 * (TOWER.h - y) / TOWER.tip);
function meshTowerTrim() {
  const mb = new MB(1 << 13);
  // round stepped island in the bay
  mb.lathe([[10.5, FLOOR_Y.mid - 0.2, M.QUAY], [10.5, 7.6, M.TRIM], [10.42, 7.7, M.TRIM], [9.3, 7.7, M.QUAY], [9.3, 9.2, M.TRIM], [9.22, 9.3, M.TRIM], [7.6, 9.3, M.MARBLE], [7.6, 11.2, M.TRIM], [7.5, 11.3, M.PAVE], [5.2, 11.3, M.TRIM], [5.2, 12.1, M.TRIM], [5.1, 12.2, M.TRIM], [4.3, 12.2, M.GOLD], [4.3, 12.7, M.GOLD], [4.2, 12.8, M.GOLD], [3.2, 12.8, M.GOLD]], { seg: 40, ao: (r, y) => (y < 8 ? 0.62 + 0.38 * sstep(3, 7.5, y) : 1) });
  return mb.build();
}
// the great obelisk on the lotus drum: height and half width at its foot
const OBELISK = { h: 92, b: 5.2 };

// balustrade: marble posts and rails, crystal panels
const BAL = 2.6; // module length
function meshBalPost(lod) {
  const mb = new MB(512); mb.mat = M.TRIM; const b = lod ? 0 : 0.035;
  mb.box(-0.24, 0, -0.24, 0.24, 1.12, 0.24, b, false); mb.box(-0.3, 1.12, -0.3, 0.3, 1.24, 0.3, b * 0.8);
  if (!lod) { mb.box(-0.2, 1.24, -0.2, 0.2, 1.36, 0.2, 0.05); mb.box(-0.28, 0, -0.28, 0.28, 0.16, 0.28, 0.03, false); }
  mb.box(0.24, 0.95, -0.09, BAL - 0.24, 1.06, 0.09, b * 0.7); mb.box(0.24, 0.06, -0.08, BAL - 0.24, 0.17, 0.08, b * 0.7);
  if (!lod) { mb.mat = M.GOLD; mb.box(0.24, 0.9, -0.03, BAL - 0.24, 0.95, 0.03, 0.01); mb.box(0.24, 0.17, -0.03, BAL - 0.24, 0.215, 0.03, 0.01); }
  return mb.build();
}
// lozenge facets across a thin crystal slab
function meshBalPanel(lod) {
  const mb = new MB(512), x0 = 0.26, x1 = BAL - 0.26, y0 = 0.22, y1 = 0.9, n = lod ? 1 : 4, w = (x1 - x0) / n;
  mb.eb = 28; mb.ea = 1; // slab, 0.11 m thick
  for (const f of [1, -1]) for (let k = 0; k < n; k++) {
    const a = x0 + k * w, c = [a + w / 2, (y0 + y1) / 2, f * 0.055], cs = [[a, y0, f * 0.012], [a + w, y0, f * 0.012], [a + w, y1, f * 0.012], [a, y1, f * 0.012]];
    for (let e = 0; e < 4; e++) { const p = cs[e], q = cs[(e + 1) % 4]; let nn = vnorm(vcross([q[0] - p[0], q[1] - p[1], q[2] - p[2]], [c[0] - p[0], c[1] - p[1], c[2] - p[2]])); if (nn[2] * f < 0) nn = nn.map((v) => -v); mb.tri(mb.v(p[0], p[1], p[2], nn[0], nn[1], nn[2]), mb.v(q[0], q[1], q[2], nn[0], nn[1], nn[2]), mb.v(c[0], c[1], c[2], nn[0], nn[1], nn[2])); }
  }
  return mb.build();
}

// bridges
// marble deck (x0, z0) -> (x1, z1) over `arches`, heights ya -> yb with a hump, half width hw, piers to `floor`
function bridge(mb, x0, z0, x1, z1, hw, ya, yb, hump, arches, floor, sea = 0) {
  const L = hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, vx = -uz, vz = ux;
  const top = (u) => mix(ya, yb, u / L) + hump * sin(PI * u / L), pier = min(1.5, L * 0.06), span = (L - pier * (arches + 1)) / arches, wl = sea ? 0 : WATER;
  const spring = wl + 0.5;
  // lower outline (u, y): piers to the floor, half-ellipse arches up to just under the deck
  const low = [[0, floor]];
  for (let k = 0; k < arches; k++) {
    const a = pier + k * (span + pier), cx = a + span / 2, rise = min(top(cx) - 0.75 - spring, span * 0.5);
    low.push([a, floor], [a, spring]);
    for (let i = 1; i < 14; i++) { const an = PI * (1 - i / 14); low.push([cx + cos(an) * span / 2, spring + sin(an) * rise]); }
    low.push([a + span, spring], [a + span, floor]);
  }
  low.push([L, floor]);
  const P = (u, v, y, nx, ny, nz, ao) => mb.v(x0 + ux * u + vx * v, y, z0 + uz * u + vz * v, ux * nx + vx * nz, ny, uz * nx + vz * nz, ao);
  const ln = profNormals(low.map((p) => [p[0], -p[1]]), 40);
  for (let i = 0; i < low.length - 1; i++) {
    const a = low[i], b = low[i + 1], n0 = ln[i][0], n1 = ln[i][1];
    mb.mat = M.QUAY; mb.ea = sea ? 255 : 0;
    if (hypot(a[0] - b[0], a[1] - b[1]) > 1e-4 && (a[1] > floor + 0.01 || b[1] > floor + 0.01)) mb.quad(P(a[0], -hw, a[1], n0[0], -n0[1], 0, 0.5), P(a[0], hw, a[1], n0[0], -n0[1], 0, 0.5), P(b[0], hw, b[1], n1[0], -n1[1], 0, 0.5), P(b[0], -hw, b[1], n1[0], -n1[1], 0, 0.5));
    if (abs(a[0] - b[0]) > 1e-4) for (const sd of [-1, 1]) mb.quad(P(a[0], sd * hw, a[1], 0, 0, sd, 0.85), P(b[0], sd * hw, b[1], 0, 0, sd, 0.85), P(b[0], sd * hw, top(b[0]) - 0.34, 0, 0, sd, 0.95), P(a[0], sd * hw, top(a[0]) - 0.34, 0, 0, sd, 0.95));
  }
  mb.ea = 0;
  // deck and its moulded edge: a kerb for the balustrade, a fascia below
  const S = max(8, round(L / 2.5)), EDGE = [[-0.5, 0], [-0.5, 0.3], [-0.46, 0.34], [0.08, 0.34], [0.12, 0.3], [0.12, -0.02], [0.06, -0.1], [0, -0.34]], EN = profNormals(EDGE);
  for (let i = 0; i < S; i++) {
    const a = L * i / S, b = L * (i + 1) / S, ta = top(a), tb = top(b);
    mb.mat = M.PAVE; mb.quad(P(a, -hw + 0.5, ta, 0, 1, 0), P(a, hw - 0.5, ta, 0, 1, 0), P(b, hw - 0.5, tb, 0, 1, 0), P(b, -hw + 0.5, tb, 0, 1, 0));
    mb.mat = M.TRIM;
    for (const sd of [-1, 1]) for (let k = 0; k < EDGE.length - 1; k++) {
      const p = EDGE[k], q = EDGE[k + 1], n0 = EN[k][0], n1 = EN[k][1];
      mb.quad(P(a, sd * (hw + p[0]), ta + p[1], 0, n0[1], sd * n0[0]), P(b, sd * (hw + p[0]), tb + p[1], 0, n0[1], sd * n0[0]), P(b, sd * (hw + q[0]), tb + q[1], 0, n1[1], sd * n1[0]), P(a, sd * (hw + q[0]), ta + q[1], 0, n1[1], sd * n1[0]));
    }
  }
  return { L, ux, uz, vx, vz, top };
}

// terrain: outer shelf, coast, mountains, sea bed
// polar grid from the outer coping to 7 km (~4 m cells at the canal, 9 m to beyond the mountains, then growing),
// cut into 16 sectors x 6 bands [{ mesh, c }] for culling. Vertex params a, b, c: steepness averaged over a few cells
// (per-vertex normals showed the grid on cliffs), river proximity, hollow or crest. heightAt(x, z) is the mesh's own
// height, which anything standing on the land must use (the analytic land is up to a metre off between vertices).
function meshTerrain() {
  const radii = [0]; let step = 3.4;
  while (radii[radii.length - 1] < 6800) { const r = radii[radii.length - 1]; radii.push(r + step); step = r < 3150 ? min(step * 1.013, 9) : step * 1.07; }
  const NR = radii.length, NA = NT, W1 = NA + 1, P = new Float32Array(NR * W1 * 3), N = new Float32Array(NR * W1 * 3), E = new Uint8Array(NR * W1 * 3);
  for (let j = 0; j <= NA; j++) {
    const t = (j % NA) / NA * TAU, c = cos(t), s = sin(t), r0 = RB.out(t) + 0.66;
    for (let i = 0; i < NR; i++) {
      const r = r0 + radii[i], o = (i * W1 + j) * 3, x = r * c, z = r * s, rd = r < 3600 ? riverDist(x, z) : 1e9; P[o] = x; P[o + 2] = z;
      // the first ring is the quay coping's back, except where the river passes under it
      P[o + 1] = i === 0 && rd > RIV_GAP - 0.4 ? LAND : terrainH(x, z); E[o + 1] = 255 * (1 - sstep(RIV_SHELF - 5, RIV_SHELF + 6, rd));
    }
  }
  const S = new Float32Array(NR * W1), S2 = new Float32Array(NR * W1), at = (i, j) => clamp(i, 0, NR - 1) * W1 + (j + NA) % NA;
  for (let i = 0; i < NR; i++) for (let j = 0; j <= NA; j++) {
    const o = (i * W1 + j) * 3, a = (min(i + 1, NR - 1) * W1 + j) * 3, b = (max(i - 1, 0) * W1 + j) * 3, c = (i * W1 + (j + 1) % NA) * 3, d = (i * W1 + (j + NA - 1) % NA) * 3;
    const ux = P[a] - P[b], uy = P[a + 1] - P[b + 1], uz = P[a + 2] - P[b + 2], vx = P[c] - P[d], vy = P[c + 1] - P[d + 1], vz = P[c + 2] - P[d + 2];
    N[o] = vy * uz - vz * uy; N[o + 1] = vz * ux - vx * uz; N[o + 2] = vx * uy - vy * ux;
    S[i * W1 + j] = 1 - abs(N[o + 1]) / (hypot(N[o], N[o + 1], N[o + 2]) || 1);
    // hollow or crest: land two cells away on four sides vs here
    E[o + 2] = clamp(128 + ((P[at(i + 2, j) * 3 + 1] + P[at(i - 2, j) * 3 + 1] + P[at(i, j + 2) * 3 + 1] + P[at(i, j - 2) * 3 + 1]) / 4 - P[o + 1]) * 22, 0, 255);
  }
  // steepness, blurred (two passes of a 3x3 box)
  for (const [A, B] of [[S, S2], [S2, S]]) for (let i = 0; i < NR; i++) for (let j = 0; j <= NA; j++) { let s = 0; for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) s += A[at(i + di, j + dj)]; B[i * W1 + j] = s / 9; }
  for (let i = 0; i < NR * W1; i++) E[i * 3] = clamp(S[i] * 400, 0, 255);
  // Medium/Low: chunks from every k-th vertex (Medium 1, 2, 4; Low 2, 4, 8). Things stand at full-mesh heights (trunks
  // start 0.4 m under). By the river a kept vertex takes the lowest height around, so the water is never buried; a skirt
  // runs down and outwards from each edge to hide cracks between levels (outwards so it faces up).
  const hk = (i, j, k) => {
    let y = P[(i * W1 + j % NA) * 3 + 1];
    if (k > 1 && i > 0 && radii[i] < 3600) { let wet = false, lo = y; for (let a = -k + 1; a < k; a++) for (let b = -k + 1; b < k; b++) { const q = at(i + a, j + b) * 3; if (E[q + 1] > 12) wet = true; if (P[q + 1] < lo) lo = P[q + 1]; } if (wet) y = lo; }
    return y;
  };
  const coarse = (i0, i1, j0, j1, c, k) => {
    const is = [], js = []; for (let i = i0; i < i1; i += k) is.push(i); is.push(i1); for (let j = j0; j < j1; j += k) js.push(j); js.push(j1);
    const mb = new MB((is.length + 2) * (js.length + 2)), drop = k * 2.5; mb.mat = M.TERRAIN;
    // di, dj: skirt direction out of the chunk
    const V = (i, j, di = 0, dj = 0) => {
      const o = (i * W1 + j % NA) * 3; let y = hk(i, j, k), x = P[o], z = P[o + 2];
      if (di || dj) { const q = (clamp(i - di, 0, NR - 1) * W1 + (j - dj + NA) % NA) * 3, ox = x - P[q], oz = z - P[q + 2], l = hypot(ox, oz) || 1; x += ox / l * drop; z += oz / l * drop; y -= drop; }
      mb.ea = E[o]; mb.eb = E[o + 1]; mb.ec = E[o + 2];
      return mb.v(x - c[0], y - c[1], z - c[2], N[o], N[o + 1], N[o + 2], 1 - 0.3 * clamp((E[o + 2] - 128) / 90, 0, 1));
    };
    const g = is.map((i) => js.map((j) => V(i, j))), ni = is.length, nj = js.length;
    for (let a = 0; a < ni - 1; a++) for (let b = 0; b < nj - 1; b++) mb.quad(g[a][b], g[a][b + 1], g[a + 1][b + 1], g[a + 1][b]);
    for (const [a, di] of [[0, -1], [ni - 1, 1]]) { if (is[a] === 0) continue; let p = V(is[a], js[0], di, 0); for (let b = 1; b < nj; b++) { const q = V(is[a], js[b], di, 0); mb.quad(g[a][b - 1], g[a][b], q, p); p = q; } }
    for (const [b, dj] of [[0, -1], [nj - 1, 1]]) { let p = V(is[0], js[b], 0, dj); for (let a = 1; a < ni; a++) { const q = V(is[a], js[b], 0, dj); mb.quad(g[a - 1][b], g[a][b], q, p); p = q; } }
    return mb.build();
  };
  const out = [], CA = 16, cuts = [0, 150, 420, 900, 1700, 3200, 1e9].map((d) => { let i = 0; while (i < NR - 1 && radii[i] < d) i++; return i; });
  for (let b = 0; b < cuts.length - 1; b++) for (let k = 0; k < CA; k++) {
    const i0 = cuts[b], i1 = cuts[b + 1], j0 = k * NA / CA, j1 = (k + 1) * NA / CA, nj = j1 - j0 + 1; if (i1 <= i0) continue;
    const co = (((i0 + i1) >> 1) * W1 + ((j0 + j1) >> 1)) * 3, c = [P[co], P[co + 1], P[co + 2]];
    if (LV) { out.push({ lods: (LV > 1 ? [2, 4, 8] : [1, 2, 4]).map((k) => coarse(i0, i1, j0, j1, c, k)), c }); continue; }
    const mb = new MB((i1 - i0 + 1) * nj + 4);
    mb.mat = M.TERRAIN;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const o = (i * W1 + j) * 3; mb.ea = E[o]; mb.eb = E[o + 1]; mb.ec = E[o + 2]; mb.v(P[o] - c[0], P[o + 1] - c[1], P[o + 2] - c[2], N[o], N[o + 1], N[o + 2], 1 - 0.3 * clamp((E[o + 2] - 128) / 90, 0, 1)); }
    for (let i = 0; i < i1 - i0; i++) for (let j = 0; j < nj - 1; j++) { const a = i * nj + j; mb.quad(a, a + 1, a + nj + 1, a + nj); }
    out.push({ lods: [mb.build()], c });
  }
  // quads split from the inner lower-angle corner to the outer higher one; no allocation (collision runs it every frame)
  const heightAt = (x, z) => {
    let t = atan2(z, x); if (t < 0) t += TAU;
    const fj = t / TAU * NA, j = min(floor(fj), NA - 1), a = fj - j, rel = hypot(x, z) - RB.out(t) - 0.66; if (rel <= 0) return LAND;
    let lo = 0, hi = NR - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (radii[m] <= rel) lo = m; else hi = m; }
    const b = clamp((rel - radii[lo]) / (radii[hi] - radii[lo]), 0, 1), o0 = (lo * W1 + j) * 3 + 1, o1 = (hi * W1 + j) * 3 + 1, h00 = P[o0], h01 = P[o0 + 3], h10 = P[o1], h11 = P[o1 + 3];
    return a >= b ? h00 + a * (h01 - h00) + b * (h11 - h01) : h00 + b * (h10 - h00) + a * (h11 - h10);
  };
  // the land as drawn, for collision: the mesh on High/Medium; on Low the finest level (every 2nd vertex, up to a metre or
  // two off), followed triangle by triangle as `coarse` cuts it
  const SJ = NA / CA, drawnK = (x, z, k) => {
    let t = atan2(z, x); if (t < 0) t += TAU;
    const fj = t / TAU * NA, j = min(floor(fj), NA - 1), rel = hypot(x, z) - RB.out(t) - 0.66; if (rel <= 0) return LAND;
    let lo = 0, hi = NR - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (radii[m] <= rel) lo = m; else hi = m; }
    let b = 0; while (b < cuts.length - 2 && cuts[b + 1] <= lo) b++;
    const i0 = cuts[b], i1 = cuts[b + 1], ia = i0 + floor((lo - i0) / k) * k, ib = min(ia + k, i1), j0 = floor(j / SJ) * SJ, ja = j0 + floor((j - j0) / k) * k, jb = min(ja + k, j0 + SJ);
    const a = (fj - ja) / (jb - ja), q = clamp((rel - radii[ia]) / (radii[ib] - radii[ia]), 0, 1), h00 = hk(ia, ja, k), h01 = hk(ia, jb, k), h10 = hk(ib, ja, k), h11 = hk(ib, jb, k);
    return a >= q ? h00 + a * (h01 - h00) + q * (h11 - h01) : h00 + q * (h10 - h00) + a * (h11 - h10);
  };
  return { chunks: out, heightAt, drawnAt: LV > 1 ? (x, z) => drawnK(x, z, 2) : heightAt };
}

// water surfaces
// flat ring between two boundaries at height y; param a: 0 canal water, 1 indigo light-liquid, 2 sea
function waterRing(mb, r0, r1, y, kind, n = NT / 2) {
  mb.mat = 0; mb.ea = kind;
  let pa = -1, pb = -1;
  for (let j = 0; j <= n; j++) { const t = (j % n) / n * TAU, c = cos(t), s = sin(t), a = typeof r0 === 'function' ? r0(t) : r0, b = typeof r1 === 'function' ? r1(t) : r1, A = mb.v(a * c, y, a * s, 0, 1, 0), B = mb.v(b * c, y, b * s, 0, 1, 0); if (pa >= 0) mb.quad(pa, A, B, pb); pa = A; pb = B; }
  mb.ea = 0;
}
// open sea: rings out to the horizon that follow the camera (the vertex shader adds its position and the swell), each
// SEA_GROW wider so cells stay near-square. Low: SEAK = 2, a quarter of the triangles.
function meshSea() {
  const mb = new MB(1 << 16); mb.mat = M.SEA; mb.ea = 2;
  const n = 192 / SEAK, c = mb.v(0, 0, 0, 0, 1, 0); let prev = null;
  for (let r = 1.5; r < 95000; r *= SEA_GROW ** SEAK) {
    const ring = []; for (let j = 0; j <= n; j++) { const t = j / n * TAU; ring.push(mb.v(r * cos(t), 0, r * sin(t), 0, 1, 0)); }
    for (let j = 0; j < n; j++) { if (prev) mb.quad(prev[j], prev[j + 1], ring[j + 1], ring[j]); else mb.tri(c, ring[j], ring[j + 1]); }
    prev = ring;
  }
  return mb.build();
}
// light-liquid falls over the podium tiers: sheet, foam, mist in one mesh, drawn in this order (blended, unsorted).
// Param a: 3 sheet, 4 foam, 5 mist. Sheet: b, c = height above the pool and drop below the lip (in 16 m x 255);
// foam and mist: b strength, c 0-1 outwards / upwards.
function meshCascades() {
  const mb = new MB(1 << 14); mb.mat = 0;
  // band between rings of section [r, y, b, c] swept through the sector
  const sweep = (sec, a0, a1, S) => {
    let prev = null;
    for (let i = 0; i <= S; i++) {
      const a = mix(a0, a1, i / S), cx = cos(a), sz = sin(a), ring = sec.map((q, j) => {
        const p0 = sec[max(j - 1, 0)], p1 = sec[min(j + 1, sec.length - 1)], dr = p1[0] - p0[0], dy = p1[1] - p0[1]; // normal across the section, away from the wall
        mb.eb = round(clamp(q[2], 0, 1) * 255); mb.ec = round(clamp(q[3], 0, 1) * 255);
        return mb.v(q[0] * cx, q[1], q[0] * sz, -dy * cx, dr, -dy * sz);
      });
      if (prev) for (let j = 0; j < sec.length - 1; j++) mb.quad(prev[j], ring[j], ring[j + 1], prev[j + 1]);
      prev = ring;
    }
  };
  // R: tier edge, y1: liquid level behind the lip, y0: pool below, pool: its reach from the wall
  const fall = (R, y1, y0, cutHw, pool) => {
    const H = y1 - y0, big = min(1, H / 10), reach = 0.1 + 0.3 * big, mh = 0.5 + 2.9 * big;
    for (let k = 0; k < 6; k++) {
      const c = cutHw ? asin(cutHw / R) + 0.004 : 0, a0 = SPOKES[k] + c, a1 = SPOKES[k] + PI / 3 - c, S = cutHw ? 36 : 12;
      // sheet: over the lip in a short curve, then down, leaning out as it speeds up
      const sec = [[R - 0.24, y1 + 0.02], [R - 0.1, y1 + 0.03], [R, y1 - 0.02], [R + 0.05, y1 - 0.15]];
      for (let j = 1; j <= 6; j++) { const t = j / 6; sec.push([R + 0.05 + reach * sqrt(t), y1 - 0.15 - (H - 0.15) * t]); }
      mb.ea = 3; sweep(sec.map((q) => [q[0], q[1], (q[1] - y0) / 16, (y1 + 0.03 - q[1]) / 16]), a0, a1, S);
      // foam on the pool, outwards from under the sheet
      mb.ea = 4; sweep([0, 0.3, 0.65, 1].map((t) => [R - 0.05 + (reach + pool) * t, y0 + 0.05, big, t]), a0, a1, S);
      // mist: two shells leaning away from the fall's foot
      mb.ea = 5;
      for (const j of [0, 1]) sweep([0, 0.25, 0.6, 1].map((t) => [R + reach * 0.5 + j * 0.45 + (0.8 + j * 0.9) * big * t * (0.6 + 0.4 * t) + 0.25 * t, y0 + 0.03 + mh * (0.75 + 0.25 * j) * t, big, t]), a0, a1, S);
    }
  };
  fall(85.03, 19.84, WATER, STAIR.hw + 0.7, 4.2); fall(70.53, 29.84, 19.9, STAIR.hw, 2.2); fall(58.03, 39.84, 29.9, STAIR.hw, 2.2); fall(21.02, 42.04, 39.95, 0, 1.6); fall(15.52, 44.44, 42.0, 0, 1.6);
  mb.ea = mb.eb = mb.ec = 0;
  return mb.build();
}

// Egypt: obelisks, pyramids, sphinxes, temples
// sandstone (M.MARBLE) drawn with eb = GLYPH shows incised hieroglyphs in columns (fs in sh_scene.js)
const GLYPH = 255, COURSES = 100, WEATHERED = 60; // ea = WEATHERED (eb 0): coarse, pitted, wind-scoured stone // eb = COURSES: big stepped courses of weathered blocks (the pyramids)
// four-sided block battered from half sizes (hx0, hz0) at y0 to (hx1, hz1) at y1 around (cx, cz); flat faces, no bottom
function frustum(mb, cx, cz, hx0, hz0, hx1, hz1, y0, y1, top = true) {
  const S = [[-1, -1], [1, -1], [1, 1], [-1, 1]], P = (k, y, hx, hz) => [cx + S[k][0] * hx, y, cz + S[k][1] * hz];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, a0 = P(i, y0, hx0, hz0), b0 = P(j, y0, hx0, hz0), a1 = P(i, y1, hx1, hz1), b1 = P(j, y1, hx1, hz1);
    const ex = b0[0] - a0[0], ez = b0[2] - a0[2], el = hypot(ex, ez), nx = ez / el, nz = -ex / el, inset = abs(nx) > 0.5 ? hx0 - hx1 : hz0 - hz1, n = vnorm([nx * (y1 - y0), inset, nz * (y1 - y0)]);
    const V = (p, ao = 1) => mb.v(p[0], p[1], p[2], n[0], n[1], n[2], ao);
    mb.quad(V(a0, 0.8), V(a1), V(b1), V(b0, 0.8));
  }
  if (top) { const V = (k) => { const p = P(k, y1, hx1, hz1); return mb.v(p[0], p[1], p[2], 0, 1, 0); }; mb.quad(V(0), V(3), V(2), V(1)); }
}
// Egyptian cornice over a block of half sizes (hx, hz) at y: torus roll, flaring cavetto, flat crown
function cornice(mb, cx, cz, hx, hz, y, s) {
  const m = mb.mat; mb.mat = M.TRIM; const e = mb.eb; mb.eb = 0;
  mb.box(cx - hx - 0.12 * s, y, cz - hz - 0.12 * s, cx + hx + 0.12 * s, y + 0.3 * s, cz + hz + 0.12 * s, 0.1 * s, false);
  frustum(mb, cx, cz, hx + 0.05 * s, hz + 0.05 * s, hx + 0.32 * s, hz + 0.32 * s, y + 0.3 * s, y + 0.9 * s, false);
  frustum(mb, cx, cz, hx + 0.36 * s, hz + 0.36 * s, hx + 0.36 * s, hz + 0.36 * s, y + 0.9 * s, y + 1.1 * s);
  mb.mat = m; mb.eb = e;
}
// obelisk H tall, half width b at the foot, glyphs on the shaft, electrum pyramidion; on a stepped plinth unless bare
function meshObelisk(H, b, bare = false) {
  const mb = new MB(1024), t = b * 0.66, ph = t * 2.6;
  // glyphs scaled with the shaft (ea: 1 + 20 x ea/255 times the normal size), so a colossus is legible from afar
  mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = round(clamp((b * 0.7 - 1) / 20, 0, 1) * 255); frustum(mb, 0, 0, b, b, t, t, 0, H - ph, false); mb.eb = mb.ea = 0;
  mb.mat = M.GOLD; frustum(mb, 0, 0, t, t, 0.02, 0.02, H - ph, H);
  if (!bare) { mb.mat = M.TRIM; mb.box(-b * 1.6, -1.5, -b * 1.6, b * 1.6, 0, b * 1.6, 0.08, false); mb.box(-b * 2.3, -3, -b * 2.3, b * 2.3, -1.5, b * 2.3, 0.08, false); }
  return mb.build();
}
// pyramid of half base B and height H: the casing stripped from its lower part, leaving stepped courses of core
// blocks (a riser and a tread each, ~2.3 m, a little ragged), smooth casing above, capped with electrum
function meshPyramid(B, H) {
  const mb = new MB(1 << 13), c = 0.035, top = 0.8, k = B / H, n = round(H * top / 2.3), rng = RNG(round(B * 7));
  mb.mat = M.MARBLE; mb.eb = COURSES;
  const Y = (i) => i * H * top / n, W = []; for (let i = 0; i < n; i++) W.push((H - Y(i + 1)) * k + 1.1 + 0.4 * rng());
  W.push(H * (1 - top) * k);
  for (let i = 0; i < n; i++) {
    frustum(mb, 0, 0, W[i], W[i], W[i] - 0.05, W[i] - 0.05, i ? Y(i) : -4, Y(i + 1), false); // riser
    frustum(mb, 0, 0, W[i] - 0.05, W[i] - 0.05, W[i + 1], W[i + 1], Y(i + 1), Y(i + 1) + 0.03, false); // tread
  }
  mb.eb = 0; frustum(mb, 0, 0, H * (1 - top) * k, H * (1 - top) * k, B * c, B * c, H * top, H * (1 - c), false); // casing
  mb.eb = 0; mb.mat = M.GOLD; frustum(mb, 0, 0, B * c, B * c, 0.05, 0.05, H * (1 - c), H);
  return mb.build();
}
// sphinx on its plinth, facing +x: lion body, haunches, forepaws, a human head in a striped nemes. ~8 m long
function meshSphinx(lod) {
  const mb = new MB(2048), bv = lod ? 0 : 1;
  mb.mat = M.TRIM; mb.box(-4.2, 0, -1.55, 4.2, 1.3, 1.55, 0.05 * bv, false); mb.box(-4.35, 1.3, -1.7, 4.35, 1.5, 1.7, 0.05 * bv);
  // rounded masses (tubes; TRIM, the same stone: tubes carry a parameter MARBLE reads as "hovering")
  const sides = lod ? 6 : 12; mb.mat = M.TRIM;
  mb.tube([[-3.45, 2.0, 0, 0.45], [-3.0, 2.25, 0, 0.86], [-1.9, 2.38, 0, 0.92], [-0.5, 2.42, 0, 0.88], [0.6, 2.58, 0, 0.98], [1.25, 2.75, 0, 0.82]], sides); // back and belly
  mb.tube([[0.7, 2.3, 0, 0.82], [1.35, 3.25, 0, 0.66], [1.62, 4.05, 0, 0.5]], sides); // chest and neck
  for (const sd of [-1, 1]) {
    mb.tube([[-3.15, 1.6, sd * 0.62, 0.38], [-2.75, 2.2, sd * 0.7, 0.62], [-2.05, 2.38, sd * 0.68, 0.56], [-1.35, 1.95, sd * 0.72, 0.4]], sides); // haunch
    mb.tube([[-1.75, 1.72, sd * 0.86, 0.22], [-0.7, 1.7, sd * 0.92, 0.2], [-0.35, 1.68, sd * 0.92, 0.17]], lod ? 4 : 7); // hind paw
    mb.tube([[0.95, 2.35, sd * 0.52, 0.34], [1.45, 1.8, sd * 0.52, 0.28], [2.3, 1.72, sd * 0.48, 0.24], [3.55, 1.7, sd * 0.46, 0.22]], lod ? 5 : 8); // foreleg and paw
  }
  if (!lod) mb.tube([[-3.4, 1.75, 0.95, 0.11], [-2.6, 1.62, 1.18, 0.1], [-1.4, 1.62, 1.2, 0.09], [-0.8, 1.76, 1.08, 0.11]], 5); // tail
  // head: the nemes headcloth falling in lappets either side of the face, a striped crown, a beard
  frustum(mb, 1.55, 0, 0.42, 0.98, 0.48, 0.6, 3.45, 5.0, false);
  mb.box(1.08, 4.92, -0.64, 2.18, 5.48, 0.64, 0.24 * bv + 0.04);
  mb.mat = M.MARBLE; mb.box(1.62, 4.0, -0.42, 2.36, 5.02, 0.42, 0.14 * bv + 0.02); // face
  mb.box(2.32, 4.28, -0.08, 2.5, 4.62, 0.08, 0.04 * bv); // nose
  mb.mat = M.TRIM; mb.box(2.12, 3.45, -0.1, 2.34, 4.05, 0.1, 0.05 * bv); // beard
  mb.mat = M.GOLD; mb.box(2.15, 5.15, -0.07, 2.36, 5.6, 0.07, 0); // uraeus
  return mb.build();
}
// papyrus-bundle column r in radius, h tall, closed-bud capital and abacus, centred at (cx, cz) from y
function column(mb, cx, cz, y, r, h, lod) {
  const prof = [[r * 1.25, y, M.TRIM], [r * 1.25, y + 0.35], [r * 0.98, y + 0.4, M.MARBLE], [r * 1.02, y + 0.8], [r * 0.86, y + h * 0.82], [r * 0.82, y + h * 0.84, M.GOLD], [r * 0.82, y + h * 0.855, M.MARBLE], [r * 1.08, y + h * 0.9], [r * 0.95, y + h * 0.95], [r * 0.7, y + h * 0.97, M.TRIM], [r * 0.7, y + h]];
  mb.eb = GLYPH; mb.lathe(prof, { seg: lod > 1 ? 6 : lod ? 8 : 14, cx, cz, crease: 40 }); mb.eb = 0;
  mb.mat = M.TRIM; mb.box(cx - r * 0.95, y + h, cz - r * 0.95, cx + r * 0.95, y + h + 0.45, cz + r * 0.95, lod ? 0 : 0.03);
}
// temple of size R facing +x: twin-towered pylon with a cornice, flagpole niches and a gate; a pair of obelisks in
// front; a court of papyrus columns under architraves; a sanctuary block behind. Pylon faces carved with glyphs.
// Returns { mesh, top }
function meshTemple(R, lod) {
  const mb = new MB(1 << 14), s = R / 18, H = 15 * s, px = R * 0.62;
  mb.mat = M.TERRACE; mb.box(-R * 1.05, -0.6, -R * 0.66, R * 1.2, 0.45, R * 0.66, 0.05, false);
  mb.mat = M.STEP; for (let i = 0; i < 3; i++) mb.box(R * 1.2, -0.6, -R * 0.2, R * 1.2 + 0.4 * (3 - i), 0.15 * i, R * 0.2, 0.02, false);
  // pylon: two battered towers either side of the gate
  for (const sd of [-1, 1]) {
    const cz = sd * R * 0.33; mb.mat = M.MARBLE; mb.eb = GLYPH;
    frustum(mb, px, cz, 2.6 * s, R * 0.27, 2.0 * s, R * 0.22, 0.45, 0.45 + H, false); mb.eb = 0;
    cornice(mb, px, cz, 2.0 * s, R * 0.22, 0.45 + H, s);
    if (!lod) { mb.mat = M.GOLD; for (const o of [-0.4, 0.4]) mb.tube([[px + 2.7 * s, 0.45, cz + o * R * 0.2, 0.18 * s], [px + 2.5 * s, 0.45 + H * 1.25, cz + o * R * 0.2, 0.12 * s]], 5); }
  }
  // gate: jambs and lintel between the towers
  mb.mat = M.MARBLE; mb.eb = GLYPH; mb.box(px - 1.8 * s, 0.45, -R * 0.11, px + 1.8 * s, 0.45 + H * 0.12, -R * 0.07, 0.04 * s, false); mb.box(px - 1.8 * s, 0.45, R * 0.07, px + 1.8 * s, 0.45 + H * 0.12, R * 0.11, 0.04 * s, false);
  mb.box(px - 1.8 * s, 0.45 + H * 0.12, -R * 0.11, px + 1.8 * s, 0.45 + H * 0.72, R * 0.11, 0.04 * s, false); mb.eb = 0;
  cornice(mb, px, 0, 1.8 * s, R * 0.11, 0.45 + H * 0.72, s * 0.8);
  // court: side walls, two rows of columns, architraves
  const ch = H * 0.62, cr = 0.75 * s, x0 = -R * 0.38, x1 = px - 3.4 * s, nc = max(3, round((x1 - x0) / (3.3 * s)));
  for (const sd of [-1, 1]) {
    mb.mat = M.MARBLE; mb.eb = GLYPH; frustum(mb, (x0 + px) / 2 - 1, sd * R * 0.58, (px - x0) / 2, 0.7 * s, (px - x0) / 2, 0.55 * s, 0.45, 0.45 + ch * 0.8, false); mb.eb = 0;
    cornice(mb, (x0 + px) / 2 - 1, sd * R * 0.58, (px - x0) / 2, 0.55 * s, 0.45 + ch * 0.8, s * 0.6);
    for (let i = 0; i <= nc; i++) column(mb, mix(x0, x1, i / nc), sd * R * 0.36, 0.45, cr, ch, lod);
    mb.mat = M.TRIM; mb.box(x0 - cr, 0.45 + ch + 0.45, sd * R * 0.36 - cr, x1 + cr, 0.45 + ch + 1.3 * s, sd * R * 0.36 + cr, lod ? 0 : 0.04);
  }
  // sanctuary behind the court
  const sx = -R * 0.72, sh = H * 0.7; mb.mat = M.MARBLE; mb.eb = GLYPH; frustum(mb, sx, 0, R * 0.33, R * 0.5, R * 0.3, R * 0.47, 0.45, 0.45 + sh, false); mb.eb = 0;
  cornice(mb, sx, 0, R * 0.3, R * 0.47, 0.45 + sh, s);
  // obelisks before the pylon
  const ob = meshObelisk(H * 1.35, 0.75 * s, true);
  for (const sd of [-1, 1]) { mb.mat = M.TRIM; mb.box(px + 5 * s - 1.2 * s, 0.45, sd * R * 0.2 - 1.2 * s, px + 5 * s + 1.2 * s, 1.5 * s + 0.45, sd * R * 0.2 + 1.2 * s, 0.05, false); mb.add(ob, px + 5 * s, 1.5 * s + 0.45, sd * R * 0.2); }
  return { mesh: mb.build(), top: 0.45 + H + 1.1 * s };
}
