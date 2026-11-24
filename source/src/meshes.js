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
const GLYPH = 255, COURSES = 100, WEATHERED = 60, PAINT = 204;
// painted plaster (M.PLASTER, eb = PAINT), the pigment by ea: 0 red ochre, 1 Egyptian blue, 2 yellow ochre, 3 white, 4 black, 5 green
const RED = 0, BLUE = 1, OCHRE = 2, WHITE = 3, BLACK = 4;
const paint = (mb, k) => { mb.mat = M.PLASTER; mb.eb = PAINT; mb.ea = k * 51; };
const unpaint = (mb, m = M.MARBLE) => { mb.mat = m; mb.eb = mb.ea = 0; }; // ea = WEATHERED (eb 0): coarse, pitted, wind-scoured stone // eb = COURSES: big stepped courses of weathered blocks (the pyramids)
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
  mb.box(cx - hx - 0.12 * s, y, cz - hz - 0.12 * s, cx + hx + 0.12 * s, y + 0.3 * s, cz + hz + 0.12 * s, 0.1 * s); // (its underside shows where it overhangs)
  frustum(mb, cx, cz, hx + 0.05 * s, hz + 0.05 * s, hx + 0.32 * s, hz + 0.32 * s, y + 0.3 * s, y + 0.9 * s, false);
  frustum(mb, cx, cz, hx + 0.36 * s, hz + 0.36 * s, hx + 0.36 * s, hz + 0.36 * s, y + 0.9 * s, y + 1.1 * s);
  mb.mat = m; mb.eb = e;
}
// obelisk H tall, half width b at the foot, glyphs on the shaft, electrum pyramidion; on a stepped plinth unless bare
function meshObelisk(H, b, bare = false) {
  const mb = new MB(1024), t = b * 0.66, ph = t * 2.6;
  // glyphs scaled with the shaft (ea: 1 + 20 x ea/255 times the normal size), so a colossus is legible from afar
  mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = max(6, round(clamp((b * 0.7 - 1) / 20, 0, 1) * 255)); frustum(mb, 0, 0, b, b, t, t, 0, H - ph, false); mb.eb = mb.ea = 0;
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
// (after KitBash3D PropColumn_D: a bulging foot of bound stems, a shaft tapering to ~0.86 r, tie bands, a swelling bud)
function column(mb, cx, cz, y, r, h, lod, seg = 0) {
  const H = (t) => y + h * t, prof = [[r * 1.25, y, M.TRIM], [r * 1.25, y + 0.35], [r * 1.02, y + 0.4, M.MARBLE], [r * 1.16, H(0.05)], [r * 1.12, H(0.09)], [r * 1.0, H(0.14)], [r * 0.95, H(0.3)], [r * 0.86, H(0.72)],
    [r * 0.9, H(0.725), M.TRIM], [r * 0.9, H(0.745)], [r * 0.86, H(0.75), M.MARBLE], [r * 0.86, H(0.76), M.TRIM], [r * 0.9, H(0.765)], [r * 0.9, H(0.785)], [r * 0.85, H(0.79), M.MARBLE],
    [r * 1.0, H(0.83)], [r * 1.1, H(0.87)], [r * 1.07, H(0.91)], [r * 0.92, H(0.95)], [r * 0.72, H(0.975), M.TRIM], [r * 0.7, H(1)]];
  mb.eb = GLYPH; mb.lathe(prof, { seg: seg || (lod > 1 ? 6 : lod ? 10 : 16), cx, cz, crease: 40 }); mb.eb = 0;
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
    // torus roll up the tower's corners and round it at ~55% height (after KitBash3D BldgMdMumificationTemple_A)
    if (!lod) {
      mb.mat = M.TRIM; const t = 0.55, hx = 2.6 * s - 0.6 * s * t, hz = R * 0.27 - R * 0.05 * t, yb = 0.45 + H * t, r = 0.22 * s;
      mb.tube([[px - hx, yb, cz - hz, r], [px + hx, yb, cz - hz, r], [px + hx, yb, cz + hz, r], [px - hx, yb, cz + hz, r], [px - hx, yb, cz - hz, r]], 6, false);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.tube([[px + sx * 2.6 * s, 0.45, cz + sz * R * 0.27, r], [px + sx * 2.0 * s, 0.45 + H, cz + sz * R * 0.22, r]], 6, false);
    }
    if (!lod) { mb.mat = M.GOLD; for (const o of [-0.4, 0.4]) mb.tube([[px + 2.7 * s, 0.45, cz + o * R * 0.2, 0.18 * s], [px + 2.5 * s, 0.45 + H * 1.25, cz + o * R * 0.2, 0.12 * s]], 5); }
  }
  // gate: a dark doorway deep in the passage (the leaves open into shadow), jambs and lintel between the towers
  mb.mat = M.CORE; mb.box(px - 1.9 * s, 0.45, -R * 0.07, px - 1.6 * s, 0.45 + H * 0.12, R * 0.07, 0, false);
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

// the far-bank pyramid complex (layout: FARPYR; reference: KitBash3D BldgLgPyramid_A and the Euergetes gate at Karnak)
// a cased pyramid of half base B and height H in ~1.1 m courses of dressed blocks, its top 15% an electrum capstone
// (faces at ~43 deg as in the kit)
function meshPyramidCased(B, H) {
  const mb = new MB(512), c = 0.12, yc = H * (1 - c), k = B / H;
  mb.mat = M.MARBLE; mb.eb = COURSES; mb.ea = 255; frustum(mb, 0, 0, B, B, B * c, B * c, -2, yc, false); mb.eb = mb.ea = 0; // white limestone casing
  // electrum capstone: a stepped collar where it meets the casing, then the cap set back from it, a hair proud of the
  // casing's slope so its edges catch the light
  mb.mat = M.GOLD; const e = 0.7, b1 = B * c + e - 1.6 * k;
  frustum(mb, 0, 0, B * c + e, B * c + e, b1, b1, yc - 0.3, yc + 1.6, true); // collar
  frustum(mb, 0, 0, b1 - 0.3, b1 - 0.3, 0.05, 0.05, yc + 1.6, H + 0.3);
  mb.mat = M.TRIM; mb.box(-B - 1.5, -2, -B - 1.5, B + 1.5, 0.4, B + 1.5, 0.1); // a low plinth
  return mb.build();
}
// freestanding monumental gate, front and back facing -z/+z: two carved piers and a lintel, slightly battered, a torus
// roll up the corners, a cavetto cornice, a gold winged sun disc on the cornice over the opening on both faces.
// W wide, D deep, H to the top of the cornice; the opening a third of the width and ~2/3 of the height.
function meshGate(W = 14, D = 5, H = 22, lod = 0) {
  const mb = new MB(4096), w = W / 2, d = D / 2, ow = W / 6, oh = H * 0.62, hc = H - 3.3, pc = (w + ow) / 2, ph = (w - ow) / 2;
  mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 30; // glyphs ~2.2x their normal size: registers of relief legible from the avenue
  for (const sd of [-1, 1]) frustum(mb, sd * pc, 0, ph, d, ph - 0.15, d - 0.1, 0, hc, false); // piers
  mb.box(-ow - 0.2, oh, -d + 0.1, ow + 0.2, hc, d - 0.1, 0); // lintel over the opening
  mb.eb = mb.ea = 0;
  // torus roll up the four outer corners and across under the cornice
  if (!lod) { mb.mat = M.TRIM; for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.tube([[sx * w, 0, sz * d, 0.28], [sx * (w - 0.15), hc, sz * (d - 0.1), 0.26]], 10, false); }
  cornice(mb, 0, 0, w - 0.1, d - 0.05, hc, 3); // a deep, flaring cavetto over its torus roll
  mb.mat = M.TRIM; mb.box(-w - 0.4, -0.4, -d - 0.6, w + 0.4, 0.25, d + 0.6, 0.05); // threshold platform
  // winged sun disc on the cavetto, both faces
  mb.mat = M.GOLD;
  for (const sz of [-1, 1]) {
    // on the cavetto's face, which leans out ~0.9 m over its height: disc and wings set on that slope
    const z = sz * (d + 0.85), y = hc + 1.7;
    const n = lod ? 12 : 24, ring = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; ring.push([1.25 * cos(a), y + 1.25 * sin(a), z + sz * 0.25]); }
    mb.poly(ring, [0, 0, sz], 1); // disc face
    mb.tube([...ring, ring[0]].map((p) => [p[0], p[1], p[2] - sz * 0.1, 0.12]), 4, false); // its rim
    // wings: three tiers of feathers, the lower ones shorter, curving slightly up at the tips; a uraeus each side
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      const x0 = sx * 1.2, len = 5.2 - k * 1.2, y0 = y + 0.5 - k * 0.42, zz = z + sz * (0.12 - k * 0.04);
      const xs = [x0, x0 + sx * len * 0.5, x0 + sx * len];
      mb.poly([[xs[0], y0 + 0.38, zz], [xs[1], y0 + 0.36, zz], [xs[2], y0 + 0.5, zz], [xs[2], y0 + 0.2, zz], [xs[1], y0, zz], [xs[0], y0, zz]], [0, 0, sz], 1);
      if (!lod) for (let f = 1; f < 8; f++) { const xf = x0 + sx * len * f / 8; mb.box(min(xf, xf + sx * 0.04), y0, zz - 0.03, max(xf, xf + sx * 0.04), y0 + 0.36, zz + sz * 0.05, 0); } // feather ribs
    }
  }
  return mb.build();
}
// corner obelisk after KitBash3D BldgLgPyramid_A's (6.06 x 6.06 x 15.9 m at s = 1): a two-tier panelled plinth, a squat
// shaft with an inlaid strip down each face and gold sheathing on its lower corners, a gold pyramidion
function meshKitObelisk(s) {
  const mb = new MB(4096), S = (v) => v * s;
  // plinth: a dado of panels between dark posts, a gold torus, a cavetto striped red / blue / ochre, an overhanging slab
  mb.mat = M.TRIM; mb.box(S(-3.03), 0, S(-3.03), S(3.03), S(1.3), S(3.03), S(0.05));
  paint(mb, BLACK); for (let i = 0; i <= 6; i++) { const u = S(-3.03 + i * 1.01); for (const sd of [-1, 1]) { mb.box(u - S(0.07), 0, sd * S(3.03) - S(0.06), u + S(0.07), S(1.3), sd * S(3.03) + S(0.06), 0); mb.box(sd * S(3.03) - S(0.06), 0, u - S(0.07), sd * S(3.03) + S(0.06), S(1.3), u + S(0.07), 0); } }
  mb.mat = M.GOLD; mb.eb = mb.ea = 0; mb.box(S(-3.1), S(1.3), S(-3.1), S(3.1), S(1.48), S(3.1), S(0.06));
  paint(mb, RED); frustum(mb, 0, 0, S(2.95), S(2.95), S(3.3), S(3.3), S(1.48), S(2.15), false);
  for (let i = 0; i < 24; i++) { // vertical stripes on the cavetto, blue and ochre between the red
    paint(mb, i % 2 ? BLUE : OCHRE); const u = S(-2.9 + (i + 0.5) * 5.8 / 24), hw = S(0.06), y0 = S(1.5), y1 = S(2.12);
    for (const sd of [-1, 1]) { const o0 = sd * S(3.0), o1 = sd * S(3.33); mb.quad(mb.v(u - hw, y0, o0, 0, 0, sd), mb.v(u - hw, y1, o1, 0, 0, sd), mb.v(u + hw, y1, o1, 0, 0, sd), mb.v(u + hw, y0, o0, 0, 0, sd)); mb.quad(mb.v(o0, y0, u - hw, sd, 0, 0), mb.v(o1, y1, u - hw, sd, 0, 0), mb.v(o1, y1, u + hw, sd, 0, 0), mb.v(o0, y0, u + hw, sd, 0, 0)); }
  }
  unpaint(mb, M.TRIM); mb.box(S(-3.4), S(2.15), S(-3.4), S(3.4), S(2.65), S(3.4), S(0.05));
  // shaft: one white stone, a brick-red ladder strip inlaid down the middle of each face
  paint(mb, WHITE); mb.ea += 20; frustum(mb, 0, 0, S(1.95), S(1.95), S(1.25), S(1.25), S(2.65), S(13.6), false); // (ea + 20: a monolith, no courses)
  const sh = (y) => S(1.95 - 0.7 * (y - 2.65) / 10.95) + S(0.03), hw = S(0.22);
  for (const sd of [-1, 1]) for (const ax of [0, 1]) {
    const Q = (u, y, d = 0) => (ax ? [sd * (sh(y) + d), S(y), u] : [u, S(y), sd * (sh(y) + d)]), n = ax ? [sd, 0.06, 0] : [0, 0.06, sd];
    const q = (u0, u1, y0, y1, d) => { const a = Q(u0, y0, d), b = Q(u0, y1, d), c = Q(u1, y1, d), e = Q(u1, y0, d); mb.quad(mb.v(...a, ...n), mb.v(...b, ...n), mb.v(...c, ...n), mb.v(...e, ...n)); };
    paint(mb, RED); q(-hw, hw, 3.2, 13.1, 0);
    paint(mb, OCHRE); for (let y = 3.35; y < 13; y += 0.42) q(-hw * 0.85, hw * 0.85, y, y + 0.08, S(0.004));
  }
  // gold fins sheathing the four corners over the lower half, splaying out beyond the shaft (the waisted silhouette)
  // (each fin two gold faces from a foot that wraps the corner out to a tip on the shaft's arris)
  mb.mat = M.GOLD; mb.eb = mb.ea = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const y0 = S(2.65), y1 = S(9.4), c0 = S(1.95), T = [sx * sh(9.4), y1, sz * sh(9.4)], O = [sx * (c0 + S(0.5)), y0, sz * (c0 + S(0.5))];
    for (const P of [[sx * (c0 + S(0.04)), y0, sz * (c0 - S(1.0))], [sx * (c0 - S(1.0)), y0, sz * (c0 + S(0.04))]]) {
      const a = [O[0] - P[0], O[1] - P[1], O[2] - P[2]], b = [T[0] - P[0], T[1] - P[1], T[2] - P[2]]; let n = vnorm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
      if (n[0] * sx + n[2] * sz < 0) n = n.map((v) => -v);
      // normals bent across the face (toward the arris at the outer foot, up toward the tip): a beaten sheet that
      // grades from light to shade instead of one flat tone
      const d = vnorm([sx, 0, sz]), nO = vnorm([n[0] + d[0] * 0.9, n[1], n[2] + d[2] * 0.9]), nT = vnorm([n[0], n[1] + 0.6, n[2]]), nP = vnorm([n[0] * 1.2 - d[0] * 0.4, n[1] - 0.15, n[2] * 1.2 - d[2] * 0.4]);
      mb.tri(mb.v(...P, ...nP, 0.85), mb.v(...O, ...nO, 0.9), mb.v(...T, ...nT, 1));
    }
  }
  mb.mat = M.TRIM; mb.box(S(-1.4), S(13.6), S(-1.4), S(1.4), S(13.85), S(1.4), S(0.03)); // ledge under the pyramidion
  mb.mat = M.GOLD; frustum(mb, 0, 0, S(1.3), S(1.3), S(0.05), S(0.05), S(13.85), S(15.9));
  mb.eb = mb.ea = 0; return mb.build();
}
// one bay of the avenue colonnade, rows along z: a papyrus-bud column (after KitBash3D PropColumn_D, ~2.4x) on a square
// plinth, carrying its length L of a continuous architrave with a cornice
function meshColonnadeBay(L, lod) {
  const mb = new MB(2048), r = 1.05, h = 11.5;
  mb.mat = M.TRIM; mb.box(-1.45, 0, -1.45, 1.45, 0.7, 1.45, lod ? 0 : 0.05);
  column(mb, 0, 0, 0.7, r, h, lod, [28, 14, 8][lod]);
  const y = 0.7 + h + 0.45; mb.mat = M.MARBLE; mb.eb = GLYPH; mb.box(-1.0, y, -L / 2, 1.0, y + 1.4, L / 2, 0); mb.eb = 0;
  if (!lod) { mb.mat = M.TRIM; mb.box(-1.15, y + 1.4, -L / 2, 1.15, y + 1.75, L / 2, 0.06); mb.box(-1.25, y + 1.75, -L / 2, 1.25, y + 1.95, L / 2, 0.03); }
  return mb.build();
}
// a prism: the convex outline pts ([x, y], counter-clockwise) extruded along z from z0 to z1, around x = cx
function extrude(mb, pts, cx, z0, z1, ends = true) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], ex = b[0] - a[0], ey = b[1] - a[1], l = hypot(ex, ey) || 1, n = [ey / l, -ex / l, 0];
    mb.quad(mb.v(cx + a[0], a[1], z0, ...n), mb.v(cx + b[0], b[1], z0, ...n), mb.v(cx + b[0], b[1], z1, ...n), mb.v(cx + a[0], a[1], z1, ...n));
  }
  if (ends) { mb.poly(pts.map((p) => [cx + p[0], p[1], z0]), [0, 0, -1], 1); mb.poly(pts.map((p) => [cx + p[0], p[1], z1]), [0, 0, 1], 1); }
}
// a pointed (ogival) arch outline, hw half wide, vertical sides from y0 to the springing ys, two arcs of radius 1.6 hw
// meeting at the apex (ys + 1.48 hw); counter-clockwise from the right foot
function ogive(hw, ys, y0 = 0, n = 8, k = 1.6) { // (k: arc radius / hw; the rise is hw * sqrt(2k - 1))
  const R = k * hw, c = R - hw, ta = Math.acos(c / R), pts = [[hw, y0]];
  for (let k = 0; k <= n; k++) { const t = ta * k / n; pts.push([-c + R * cos(t), ys + R * sin(t)]); }
  for (let k = n - 1; k >= 0; k--) { const t = ta * k / n; pts.push([c - R * cos(t), ys + R * sin(t)]); }
  pts.push([-hw, y0]); return pts;
}
// unlit fire bowl (lost city: ash and charred logs, no flame): a bronze dish on a short foot, r across the rim
function fireBowl(mb, x, y, z, r, seg = 12) {
  mb.mat = M.ALLOY; mb.eb = mb.ea = 0;
  mb.lathe([[r * 0.35, y], [r * 0.3, y + r * 0.25], [r * 0.45, y + r * 0.3], [r * 0.85, y + r * 0.55], [r, y + r * 0.8], [r * 0.93, y + r * 0.82], [r * 0.6, y + r * 0.55]], { seg, cx: x, cz: z, crease: 40 });
  mb.mat = M.CORE; mb.box(x - r * 0.6, y + r * 0.5, z - r * 0.6, x + r * 0.6, y + r * 0.62, z + r * 0.6, 0);
  mb.mat = M.BARK; for (const a of [0.3, 1.4, 2.6]) mb.tube([[x + cos(a) * r * 0.5, y + r * 0.6, z + sin(a) * r * 0.5, r * 0.07], [x - cos(a) * r * 0.3, y + r * 0.85, z - sin(a) * r * 0.3, r * 0.06]], 5, false);
}
// the kit complex's entrance (after KitBash3D BldgLgPyramid_A's BuildingA, ~2.4x, measured off its front and side
// elevations). Front faces -z, the wall line at z = 0:
// - centre: no block, a tall arch with a domed (rounded-pointed) head, a proud sandstone frame round a white panel,
//   two nested rectangular door frames and a narrow pointed doorway; a tapered drop and bars round a gilt disc in the
//   head, a stone disc on the apex
// - either side: a tower battered on its OUTER face only (the inner face plumb), framed by thin sandstone fillets, a
//   tapered pendant under a striped cavetto with a gilt torus and an overhanging slab, a striped red band low down, a
//   carved band at its foot, an unlit fire bowl on top; plain walls with ochre cartouche slots between
// - behind: the hall's boat-shaped roof, rising in a long curve from the ground at the back to the arch's head
function meshKitEntrance(lod) {
  const mb = new MB(1 << 15), n = lod ? 5 : 10, zf = -7;
  // a flat convex piece on the front, z0..z1 (any winding: made counter-clockwise)
  const fq = (pts, z0, z1) => {
    let a2 = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    extrude(mb, a2 < 0 ? pts.slice().reverse() : pts, 0, z0, z1);
  };
  const disc = (x, y, r, z0, z1) => { const P = [], k = lod ? 10 : 20; for (let i = 0; i < k; i++) { const t = i / k * TAU; P.push([x + r * cos(t), y + r * sin(t)]); } fq(P, z0, z1); };
  // a thin fillet from (x0, y0) to (x1, y1), w wide, on the face at z
  const fillet = (x0, y0, x1, y1, w, z) => { const dx = x1 - x0, dy = y1 - y0, l = hypot(dx, dy), ox = -dy / l * w / 2, oy = dx / l * w / 2; fq([[x0 - ox, y0 - oy], [x1 - ox, y1 - oy], [x1 + ox, y1 + oy], [x0 + ox, y0 + oy]], z - 0.12, z); };
  unpaint(mb, M.TRIM); mb.box(-36.5, -0.4, -10.5, 36.5, 0.6, 9, 0.05); // plinth
  for (const sd of [-1, 1]) {
    const X = (x) => sd * x, P = (pts) => pts.map(([x, y]) => [X(x), y]), xs = (a, b) => [min(X(a), X(b)), max(X(a), X(b))];
    // the tower: outer face battered, inner face plumb
    paint(mb, WHITE); fq(P([[-14, 0.6], [-14, 29], [-27.6, 29], [-32.3, 0.6]]), zf, 8);
    // thin sandstone fillets framing its face, the pendant
    mb.mat = M.MARBLE; mb.eb = mb.ea = 0;
    fillet(X(-30.9), 0.8, X(-26.4), 27.9, 0.28, zf); fillet(X(-15.4), 0.8, X(-15.4), 27.9, 0.28, zf); fillet(X(-26.4), 27.9, X(-15.4), 27.9, 0.28, zf);
    fq(P([[-20.8, 16.5], [-19.8, 16.5], [-19.2, 29], [-21.4, 29]]), zf - 0.45, zf);
    // carved band at the foot, the striped red band above it
    mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 12; fq(P([[-14, 0.6], [-14, 5.4], [-31.4, 5.4], [-32.2, 0.6]]), zf - 0.08, zf); mb.eb = mb.ea = 0;
    paint(mb, RED); fq(P([[-14, 8], [-14, 8.7], [-31.0, 8.7], [-31.1, 8]]), zf - 0.06, zf);
    if (!lod) for (let x = -30.6, i = 0; x < -14.2; x += 0.55, i++) { paint(mb, i & 1 ? BLUE : OCHRE); const [a, b] = xs(x - 0.08, x + 0.08); mb.box(a, 8.05, zf - 0.09, b, 8.65, zf - 0.05, 0); }
    // cavetto (striped, a gilt torus under it) and the overhanging slab
    const [g0, g1] = xs(-27.9, -13.7); mb.mat = M.GOLD; mb.eb = mb.ea = 0; mb.box(g0, 28.75, zf - 0.35, g1, 29.1, 8.3, 0.04);
    paint(mb, RED); frustum(mb, X(-20.8), 0.6, 7.0, 7.65, 7.6, 8.25, 29.1, 30.6, false);
    if (!lod) for (let x = -27.9, i = 0; x < -13.8; x += 0.5, i++) { paint(mb, i & 1 ? BLUE : OCHRE); const [a, b] = xs(x - 0.07, x + 0.07); mb.box(a, 29.2, zf - 0.68, b, 30.5, zf - 0.6, 0); }
    const [s0, s1] = xs(-28.9, -12.8); unpaint(mb, M.TRIM); mb.box(s0, 30.6, zf - 1.1, s1, 31.5, 9.2, 0.05);
    fireBowl(mb, X(-20.8), 31.5, 0.6, 2.8, lod ? 8 : 14);
    // plain walls between the towers and the arch, with ochre cartouche slots; a taller block behind
    paint(mb, WHITE); let [a, b] = xs(-14, -6); mb.box(a, 0.6, -5, b, 27, 8, 0); [a, b] = xs(-10.5, -6); mb.box(a, 0.6, 4, b, 30, 10, 0);
    unpaint(mb, M.TRIM); [a, b] = xs(-10.9, -9.9); for (const [y0, y1] of [[15, 20.5], [9.8, 12.6]]) mb.box(a, y0, -5.3, b, y1, -4.95, 0.45); // pale rounded slots
    paint(mb, RED); [a, b] = xs(-14, -8.4); mb.box(a, 8, -5.08, b, 8.7, -4.98, 0);
    // the hall's side blocks behind the towers
    paint(mb, WHITE); [a, b] = xs(-19.5, -10.4); mb.box(a, 0.6, 8, b, 24, 40, 0);
  }
  // the arch: a proud sandstone frame, a white panel within, nested door frames, the pointed doorway
  mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED; fq(ogive(8.5, 33.8, 0.6, n, 1.955), -8.6, -6.6); mb.ea = 0;
  paint(mb, WHITE); fq(ogive(7.0, 33.8, 0.6, n, 2.22), -8.68, -8.6);
  mb.mat = M.MARBLE; mb.eb = mb.ea = 0;
  for (const [hx, ht] of [[6.0, 29.6], [3.5, 26.4]]) { fq([[-hx, 0.6], [-hx + 0.3, 0.6], [-hx + 0.3, ht], [-hx, ht]], -8.8, -8.68); fq([[hx - 0.3, 0.6], [hx, 0.6], [hx, ht], [hx - 0.3, ht]], -8.8, -8.68); fq([[-hx, ht - 0.3], [hx, ht - 0.3], [hx, ht], [-hx, ht]], -8.8, -8.68); }
  fq(ogive(2.75, 20.6, 0.6, n, 1.83), -8.9, -8.68); // the doorway's frame
  paint(mb, BLACK); fq(ogive(1.75, 20.6, 0.6, n, 2.38), -9.0, -8.85); // the doorway
  // in the head: the tapered drop, the two bars, a gilt disc with three points round it; a stone disc on the apex
  mb.mat = M.MARBLE; mb.eb = mb.ea = 0;
  fq([[-1.0, 39.5], [1.0, 39.5], [1.45, 45.6], [-1.45, 45.6]], -8.85, -8.68);
  fq([[-6.9, 33.2], [-2.4, 33.6], [-2.4, 34.6], [-6.9, 35.0]], -8.85, -8.68); fq([[2.4, 33.6], [6.9, 33.2], [6.9, 35.0], [2.4, 34.6]], -8.85, -8.68);
  mb.mat = M.GOLD; disc(0, 36.5, 0.9, -8.95, -8.68);
  for (const [x, y, an] of [[-2.1, 38.1, -0.8], [2.1, 38.1, 0.8], [0, 34.0, PI]]) { const c = cos(an), s2 = sin(an), T = (u, v) => [x + u * c + v * s2, y - u * s2 + v * c]; fq([T(-0.45, -0.35), T(0.45, -0.35), T(0, 0.75)], -8.9, -8.68); }
  mb.mat = M.MARBLE; mb.ea = WEATHERED; mb.box(-0.5, 48, -8.2, 0.5, 49.7, -7.2, 0); disc(0, 50.9, 1.3, -8.15, -7.25); mb.ea = 0;
  // the hall roof: a boat-shaped shell lofted from the arch back over 62 m, its top curving down from the head of
  // the arch, its keel line from 31 m at the front to the ground at the back; red bands along the sides' tops, the
  // crown in fine transverse red / ochre / blue stripes either side of a plain ridge
  const L = 62, z0 = -6.6, ns = lod ? 10 : round(L / 0.9), nc = lod ? 3 : 6;
  const prof = (t) => { // (narrower and lower where it meets the arch, so none of it shows beside the arch's head)
    const hw = 4.0 + 6.5 * min(1, t / 0.22), yt = 45.5 - 12.9 * (0.6 * t * t * (3 - 2 * t) + 0.4 * t), yb = 31 * (1 - t), ys = yt - 6, Q = [[hw, yb], [hw, ys - 0.9], [hw, ys]];
    for (let k = 1; k <= nc; k++) { const an = k / nc * PI / 2; Q.push([hw * cos(an), ys + (yt - ys) * sin(an)]); }
    for (let k = nc - 1; k >= 0; k--) { const an = k / nc * PI / 2; Q.push([-hw * cos(an), ys + (yt - ys) * sin(an)]); }
    Q.push([-hw, ys - 0.9], [-hw, yb]); return Q;
  };
  let A = prof(0);
  for (let i = 0; i < ns; i++) {
    const B = prof((i + 1) / ns), za = z0 + L * i / ns, zb = z0 + L * (i + 1) / ns, m = A.length;
    for (let j = 0; j < m; j++) { // (j = m - 1 closes the underside)
      const k1 = (j + 1) % m, p0 = [A[j][0], A[j][1], za], p1 = [A[k1][0], A[k1][1], za], q1 = [B[k1][0], B[k1][1], zb], q0 = [B[j][0], B[j][1], zb];
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], 0], e2 = [q0[0] - p0[0], q0[1] - p0[1], q0[2] - p0[2]];
      let nn = vnorm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
      if (nn[0] * e1[1] - nn[1] * e1[0] < 0) nn = nn.map((v) => -v); // outward: (ey, -ex) for the counter-clockwise outline
      const side = j === 0 || j >= m - 2, band = j === 1 || j === m - 3, ridge = abs(j - (m - 2) / 2) < 1.6;
      // sides and ridge plain sandstone (as on the kit), a red band along the sides' tops, the crown in fine red and
      // blue pinstripes on the pale sandstone ground
      const pin = [-1, RED, -1, -1, BLUE, -1][i % 6];
      if (band) paint(mb, RED); else if (side || ridge || lod || pin < 0) { mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED; } else paint(mb, pin);
      mb.quad(mb.v(...p0, ...nn), mb.v(...p1, ...nn), mb.v(...q1, ...nn), mb.v(...q0, ...nn));
    }
    A = B;
  }
  mb.eb = mb.ea = 0; return mb.build();
}
// the kit complex's terrace building (after BuildingC, ~2.4x), its front facing +x: a white lower storey with a
// gold-lined roof pattern, striped cavetto cornices, two gate pavilions with dark doorways, two straight stairs with
// parapets up the front, an upper tier with a row of framed false-door niches, a rear shrine flanked by slanted slabs
function meshKitTerrace(lod) {
  const mb = new MB(1 << 14), A = 45, V = 55, y1 = 12, U0 = -40, U1 = 20, y2 = 22;
  const stripes = (x0, x1, z0, z1, y, h, o) => { // a cornice band of vertical stripes, red with blue / ochre, overhanging o
    paint(mb, RED); mb.box(x0 - o, y, z0 - o, x1 + o, y + h, z1 + o, 0);
    if (lod) return; const n = (len) => max(2, round(len / 1.2));
    for (const [ax, a0, a1, f] of [[0, x0, x1, z1 + o], [0, x0, x1, z0 - o], [1, z0, z1, x1 + o], [1, z0, z1, x0 - o]]) {
      const k = n(a1 - a0); for (let i = 0; i < k; i++) { if (i % 2) continue; paint(mb, (i >> 1) % 2 ? BLUE : OCHRE); const u = a0 + (i + 0.5) * (a1 - a0) / k;
        ax ? mb.box(f - 0.03, y + 0.1, u - 0.22, f + 0.03, y + h - 0.1, u + 0.22, 0) : mb.box(u - 0.22, y + 0.1, f - 0.03, u + 0.22, y + h - 0.1, f + 0.03, 0); }
    }
  };
  // lower storey and its roof pattern
  paint(mb, WHITE); mb.box(-A, 0, -V, A, y1, V, 0);
  stripes(-A, A, -V, V, y1 - 1.4, 1.4, 0.4); unpaint(mb, M.TRIM); mb.box(-A - 0.8, y1, -V - 0.8, A + 0.8, y1 + 0.5, V + 0.8, 0.06);
  mb.mat = M.GOLD; for (const [a, b, c, d] of [[U1 + 3, A - 4, -V + 4, -V + 4.6], [U1 + 3, A - 4, V - 4.6, V - 4], [A - 4.6, A - 4, -V + 4, V - 4], [U1 + 3, U1 + 3.6, -V + 4, V - 4], [U1 + 3, A - 4, -0.3, 0.3]]) mb.box(a, y1 + 0.5, c, b, y1 + 0.56, d, 0);
  // gate pavilions on the front, each a dark doorway in a red frame under its own cornice
  for (const sd of [-1, 1]) {
    const vc = sd * 40; paint(mb, WHITE); mb.box(A, 0, vc - 7, A + 8, 14, vc + 7, 0); stripes(A, A + 8, vc - 7, vc + 7, 12.6, 1.4, 0.3);
    unpaint(mb, M.TRIM); mb.box(A - 0.3, 14, vc - 7.6, A + 8.6, 14.5, vc + 7.6, 0.05);
    paint(mb, RED); mb.box(A + 8, 0, vc - 3, A + 8.15, 9.5, vc + 3, 0); paint(mb, BLACK); mb.box(A + 8.1, 0, vc - 2.2, A + 8.25, 8.7, vc + 2.2, 0);
  }
  // two straight stairs up the front to the terrace, with parapets
  for (const sd of [-1, 1]) {
    const vc = sd * 14, w = 3.2, run = 22, n = lod ? 8 : 25; mb.mat = M.STEP; mb.eb = mb.ea = 0;
    for (let i = 0; i < n; i++) mb.box(A, 0, vc - w, A + run * (1 - i / n), (y1 + 0.5) * (i + 1) / n, vc + w, 0); // a flight of treads
    unpaint(mb, M.TRIM); for (const pz of [vc - w - 0.6, vc + w]) extrude(mb, [[A + run + 0.5, 0], [A + run + 0.5, 1.2], [A, y1 + 1.6], [A, 0]].map(([x, y]) => [x, y]), 0, pz, pz + 0.6); // parapets (x as given)
  }
  // upper tier: false-door niches between pilasters, a striped cornice
  paint(mb, WHITE); mb.box(U0, y1 + 0.5, -V + 10, U1, y2, V - 10, 0);
  for (let v = -V + 15; v <= V - 15; v += 6.5) {
    unpaint(mb, M.TRIM); mb.box(U1, y1 + 2, v - 2, U1 + 0.35, y2 - 2.2, v + 2, 0);
    paint(mb, OCHRE); mb.box(U1 + 0.3, y1 + 2.6, v - 1.4, U1 + 0.45, y2 - 2.8, v + 1.4, 0);
    paint(mb, BLACK); mb.box(U1 + 0.4, y1 + 2.6, v - 0.6, U1 + 0.5, y2 - 4.5, v + 0.6, 0);
  }
  stripes(U0, U1, -V + 10, V - 10, y2 - 1.5, 1.5, 0.35); unpaint(mb, M.TRIM); mb.box(U0 - 0.7, y2, -V + 9.3, U1 + 0.7, y2 + 0.5, V - 9.3, 0.05);
  // rear shrine and its slanted flanking slabs
  paint(mb, WHITE); mb.box(-30, y2, -7, -24, y2 + 17, 7, 0); stripes(-30, -24, -7, 7, y2 + 15.6, 1.4, 0.3);
  mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 12; mb.box(-24.1, y2 + 1, -2.5, -23.9, y2 + 14, 2.5, 0); mb.eb = mb.ea = 0;
  // slanting slabs either side, leaning in toward the shrine (a slab's face as a sheared box)
  for (const sd of [-1, 1]) {
    const zb = sd * 13, zt = sd * 8.5, P = [[-31, zb - 1.2], [-23, zb - 1.2], [-23, zb + 1.2], [-31, zb + 1.2]];
    paint(mb, WHITE); for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4], d = zt - zb, A0 = [a[0], y2, a[1]], B0 = [b[0], y2, b[1]], A1 = [a[0], y2 + 15, a[1] + d], B1 = [b[0], y2 + 15, b[1] + d];
      const ex = B0[0] - A0[0], ez = B0[2] - A0[2], l = hypot(ex, ez), nn = [ez / l, 0, -ex / l];
      mb.quad(mb.v(...A0, ...nn), mb.v(...A1, ...nn), mb.v(...B1, ...nn), mb.v(...B0, ...nn)); }
    mb.poly(P.map((q) => [q[0], y2 + 15, q[1] + zt - zb]), [0, 1, 0], 1);
  }
  mb.eb = mb.ea = 0; return mb.build();
}
// a banner (after the kit's BannerA-F, ~2.4x): a stone base, an 18 m pole with a bronze finial, a narrow red-brown
// pennant hanging from a crossbar at the top
function meshKitBanner() {
  const mb = new MB(512);
  mb.mat = M.TRIM; mb.box(-0.9, 0, -0.9, 0.9, 1.1, 0.9, 0.05);
  mb.mat = M.BARK; mb.tube([[0, 1, 0, 0.2], [0, 18, 0, 0.15]], 6, false); mb.tube([[0, 17.4, -1.1, 0.08], [0, 17.4, 1.1, 0.08]], 4, false);
  mb.mat = M.ALLOY; frustum(mb, 0, 0, 0.25, 0.25, 0.02, 0.02, 18, 19.3);
  paint(mb, RED); const P = [[0.25, 17.3, -0.9], [0.25, 17.3, 0.9], [0.25, 7.5, 0.6], [0.25, 6.6, 0], [0.25, 7.5, -0.6]];
  mb.poly(P, [1, 0, 0], 1); mb.poly(P.map((p) => [0.18, p[1], p[2]]).reverse(), [-1, 0, 0], 1);
  paint(mb, OCHRE); for (const y of [15.5, 12, 9]) { mb.box(0.26, y, -0.7, 0.28, y + 0.35, 0.7, 0); mb.box(0.15, y, -0.7, 0.17, y + 0.35, 0.7, 0); }
  mb.eb = mb.ea = 0; return mb.build();
}
// a standing torch (kit StandingTochA, ~2.4x): a slender red pillar with painted bands flaring to a bowl, unlit
function meshKitTorch() {
  const mb = new MB(512); paint(mb, RED);
  mb.lathe([[0.45, 0], [0.4, 0.3], [0.32, 0.4], [0.3, 2.8], [0.42, 3.2], [0.7, 3.55], [0.62, 3.6], [0.3, 3.45]], { seg: 10, cx: 0, cz: 0, crease: 40 });
  paint(mb, OCHRE); for (const y of [0.5, 1.4, 2.4]) mb.lathe([[0.34, y], [0.34, y + 0.12]], { seg: 10, cx: 0, cz: 0, crease: 40 });
  mb.mat = M.CORE; mb.eb = mb.ea = 0; mb.box(-0.4, 3.35, -0.4, 0.4, 3.45, 0.4, 0);
  return mb.build();
}
// a group of clay pots (kit ClayPots, ~2.4x): a big white jar with a blue lotus band, small dark jugs round it
function meshKitPots() {
  const mb = new MB(1024), jar = (x, z, r, h, k, band) => {
    paint(mb, k); mb.lathe([[r * 0.45, 0], [r * 0.85, h * 0.25], [r, h * 0.5], [r * 0.8, h * 0.8], [r * 0.42, h * 0.9], [r * 0.5, h]], { seg: 10, cx: x, cz: z, crease: 40 });
    if (band >= 0) { paint(mb, band); mb.lathe([[r * 1.005, h * 0.45], [r * 0.98, h * 0.58]], { seg: 10, cx: x, cz: z, crease: 40 }); }
  };
  jar(0, 0, 1.4, 3.2, WHITE, BLUE); jar(1.9, 0.6, 0.6, 1.4, BLACK, -1); jar(-1.6, 1.2, 0.7, 1.5, BLUE, OCHRE); jar(0.8, -1.8, 0.55, 1.2, BLACK, RED);
  mb.eb = mb.ea = 0; return mb.build();
}
// one of the stone beams lying in a fan round the post at the end of the kit entrance's causeway: 9 m long, along z
function meshKitBeam() { const mb = new MB(64); mb.mat = M.MARBLE; mb.ea = WEATHERED; mb.box(-0.55, -0.3, -4.5, 0.55, 0.45, 4.5, 0.06, true); mb.ea = 0; return mb.build(); }
// enclosure wall of half sizes (X, Z) around the origin, h high, with merlons, a gateway gap of half width g in the
// -z side (toward the city)
function meshEnclosure(X, Z, h, g, lod, jog = null) { // jog: [z0, z1] left open on the +x side (the terrace building closes it)
  // after the kit's wall: a tan lower band (55%) of carved inscription panels, each framed in red between pale
  // pilasters (no openings); a white upper band whose top is notched with shallow trapezoidal crenels (wider at the
  // top, cut half-way into the thickness, merlons about twice a crenel wide); taller piers every ~48 m
  const mb = new MB(1 << 15), t = 1.6, hb = h * 0.55, hn = h - 0.42 * (h - hb), run = (x0, z0, x1, z1) => {
    const L = hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = abs(x1 - x0) > abs(z1 - z0);
    // a box spanning u0..u1 along the run, half depth d (offset o across it), y0..y1
    const B = (u0, u1, d, y0, y1, bev = 0, o = 0) => alongX ? mb.box(cx + u0, y0, cz + o - d, cx + u1, y1, cz + o + d, bev) : mb.box(cx + o - d, y0, cz + u0, cx + o + d, y1, cz + u1, bev);
    // a block battered along the run: half lengths a0 at y0 to a1 at y1, half depth d
    const T = (u, a0, a1, d, y0, y1) => alongX ? frustum(mb, cx + u, cz, a0, d, a1, d, y0, y1, true) : frustum(mb, cx, cz + u, d, a0, d, a1, y0, y1, true);
    mb.mat = M.MARBLE; mb.ea = WEATHERED; B(-L / 2, L / 2, t + 0.15, 0, 0.7); mb.ea = 0; // footing course
    mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 20; frustum(mb, cx, cz, alongX ? L / 2 : t, alongX ? t : L / 2, alongX ? L / 2 : t * 0.92, alongX ? t * 0.92 : L / 2, 0.7, hb, false); mb.eb = mb.ea = 0;
    paint(mb, WHITE); B(-L / 2, L / 2, t * 0.92, hb, hn); mb.ao = 0.42; B(-L / 2, L / 2, t * 0.3, hn, h); mb.ao = 1; // upper band, and its core deep behind the crenels (in their shade)
    // inscription panels: a red frame along the top and bottom, pale pilasters with a small cap between panels
    for (const sd of [-1, 1]) { paint(mb, RED); B(-L / 2, L / 2, 0.06, hb - 0.75, hb - 0.55, 0, sd * (t * 0.94)); B(-L / 2, L / 2, 0.06, 0.95, 1.15, 0, sd * (t * 0.99)); }
    const nb = max(1, round(L / 14));
    for (let i = 0; i <= nb; i++) {
      const u = -L / 2 + i * L / nb;
      for (const sd of [-1, 1]) {
        paint(mb, RED); B(u - 1.12, u - 0.92, 0.08, 1.0, hb - 0.6, 0, sd * (t * 0.97)); B(u + 0.92, u + 1.12, 0.08, 1.0, hb - 0.6, 0, sd * (t * 0.97));
        paint(mb, WHITE); B(u - 0.8, u + 0.8, 0.2, 0.7, hb - 0.3, 0, sd * (t * 0.96)); unpaint(mb, M.TRIM); B(u - 1.0, u + 1.0, 0.26, hb - 0.55, hb - 0.2, 0, sd * (t * 0.96));
      }
    }
    // merlons: battered blocks (narrower at the top) at full thickness, the crenels between them showing the core
    const nm = max(1, round(L / 7.2)), p = L / nm; paint(mb, WHITE);
    for (let i = 0; i < nm; i++) T(-L / 2 + (i + 0.5) * p, p * 0.375, p * 0.3, t * 0.92, hn, h);
    // taller piers
    const np = max(1, round(L / 48));
    for (let i = 0; i <= np; i++) { const u = -L / 2 + i * L / np; paint(mb, WHITE); B(u - 1.8, u + 1.8, t + 0.4, 0, h + 3); unpaint(mb, M.TRIM); B(u - 2.1, u + 2.1, t + 0.7, h + 3, h + 3.6, lod ? 0 : 0.06); }
    mb.eb = mb.ea = 0;
  };
  run(-X, Z, X, Z); run(-X, -Z, -g, -Z); run(g, -Z, X, -Z); run(-X, -Z, -X, Z); if (jog) { run(X, -Z, X, jog[0]); run(X, jog[1], X, Z); } else run(X, -Z, X, Z);
  return mb.build();
}
// the river end: a stone quay with a stair of steps down to the water (-z), and the paved avenue and forecourt behind it
function meshFarQuay(F) {
  const mb = new MB(1 << 13), y = F.y + 0.12, zq = F.quay, za = F.aveA, zi = za + 48;
  // quay block (waterline from sea level), carried inland past the natural shore; its top a little below the flags
  // laid on it, so no two surfaces share a plane
  mb.mat = M.QUAY; mb.ea = 255; mb.box(-46, -4, zq, 46, y - 0.08, zi, 0.1); mb.ea = 0;
  mb.mat = M.TRIM; mb.box(-46.3, y - 0.05, zq - 0.3, 46.3, y + 0.35, zq + 0.9, 0.08); // coping along the water
  for (let x = -42; x <= 42; x += 7) if (abs(x) > 20) mb.lathe([[0.32, y + 0.3], [0.3, y + 0.9], [0.4, y + 1.05], [0.25, y + 1.2], [0, y + 1.25]], { seg: 10, cx: x, cz: zq + 0.5 }); // bollards
  mb.mat = M.STEP; for (let i = 0, n = round(y / 0.25); i < n; i++) { const yy = y - (i + 1) * 0.25, z1 = zq - i * 0.4; mb.box(-18, -2, z1 - 0.4, 18, yy + 0.25, z1, 0); }
  // flags (blocks, as in the city): the quay's deck either side of the avenue, the avenue up to the gate, a small
  // square round the gate; past the gate the ground is sand
  mb.mat = M.PAVE;
  mb.box(-46, y - 0.3, zq + 0.9, 46, y, za, 0.05);
  mb.box(-46, y - 0.3, za, -20, y, zi, 0.05); mb.box(20, y - 0.3, za, 46, y, zi, 0.05);
  mb.box(-20, F.y - 1, za, 20, y, F.gate - 6, 0.05); // avenue
  mb.box(-24, F.y - 1, F.gate - 6, 24, y, F.gate + 6, 0.05); // round the gate
  // the kit entrance's causeway (BuildingA's forecourt): from the entrance's plinth it tapers over 67 m to a post,
  // sandstone flags with a paler strip of slabs down its middle, a step proud of the sand
  const z0 = F.wallN - 10.5, z1 = z0 - 67, up = [0, 1, 0], yc = F.y + 0.25;
  const slab = (w0, w1, ya, za0, za1) => { mb.poly([[-w0, ya, za0], [w0, ya, za0], [w1, ya, za1], [-w1, ya, za1]], up, 1);
    for (const sd of [-1, 1]) { const n = vnorm([sd * (za0 - za1), 0, sd * (w0 - w1)]); mb.quad(mb.v(sd * w0, F.y - 0.6, za0, ...n), mb.v(sd * w0, ya, za0, ...n), mb.v(sd * w1, ya, za1, ...n), mb.v(sd * w1, F.y - 0.6, za1, ...n)); }
    mb.quad(mb.v(-w1, F.y - 0.6, za1, 0, 0, -1), mb.v(-w1, ya, za1, 0, 0, -1), mb.v(w1, ya, za1, 0, 0, -1), mb.v(w1, F.y - 0.6, za1, 0, 0, -1)); };
  mb.mat = M.PAVE; slab(15.5, 5.5, yc, z0, z1);
  paint(mb, WHITE); mb.poly([[-2.6, yc + 0.03, z0], [2.6, yc + 0.03, z0], [2.6, yc + 0.03, z1 + 3], [-2.6, yc + 0.03, z1 + 3]], up, 1); mb.eb = mb.ea = 0; // the paler middle strip (limestone)
  mb.mat = M.TRIM; mb.lathe([[3.2, F.y - 0.4], [3.2, yc + 0.1], [2.9, yc + 0.3], [0, yc + 0.3]], { seg: 20, cx: 0, cz: z1 - 1 }); // round base of the post
  return mb.build();
}
