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

// a cased pyramid after the kit's BuildingB (89.8 x 41.6 m, ~2.4x): white limestone casing in great courses, an
// electrum capstone over the top 19% with a lip round its foot; no plinth (the kit has none)
function meshPyramidCased(B, H) {
  const mb = new MB(512), c = 0.19, yc = H * (1 - c);
  mb.mat = M.MARBLE; mb.eb = COURSES; mb.ea = 255; frustum(mb, 0, 0, B, B, B * c, B * c, -2.5, yc, false); mb.eb = mb.ea = 0;
  mb.mat = M.GOLD; frustum(mb, 0, 0, B * c + 0.9, B * c + 0.9, B * c + 0.5, B * c + 0.5, yc - 0.4, yc + 0.6, true); // the lip
  frustum(mb, 0, 0, B * c + 0.1, B * c + 0.1, 0.05, 0.05, yc + 0.6, H);
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
// corner obelisk after KitBash3D BldgLgPyramid_A's ObeliskA (6.06 x 6.06 x 15.9 m at s = 1), measured off its front
// elevation (kit metres):
// - plinth: a dado 0-1.0 (half 2.57) of sunk panels in pale frames, a striped cavetto 1.0-1.6 flaring to 3.0, a slab to 1.8
// - shaft, one white stone: straight 1.8-3.1 (half 2.29), flaring to its widest at 4.5 (half 2.92), near-vertical to
//   8.5 (half 2.2), tapering to 13.8 (half 0.93)
// - a channel 0.74 wide sunk 0.12 down the middle of each face, the full height, a red ladder strip set in it
// - the four corners of the wide part filled with gold: 0.9 m of each face at 4.5, narrowing to nothing at 8.5
// - a ledge and a patinated gold pyramidion to 15.9
function meshKitObelisk(s) {
  const mb = new MB(8192), S = (v) => v * s;
  // plinth (its foot buried 2 m): the dado's core set back 0.07, a frame at the face (rails top and bottom, posts
  // between the five panels), so the panels read as sunk
  const fd = 0.07; mb.mat = M.MARBLE; mb.ea = WEATHERED; mb.box(S(-2.57 + fd), -2, S(-2.57 + fd), S(2.57 - fd), S(1.0), S(2.57 - fd), 0); mb.ea = 0; paint(mb, WHITE); // sandstone panels, a pale frame
  for (const sd of [-1, 1]) for (const ax of [0, 1]) {
    const F = (u0, u1, y0, y1) => { const o = sd * S(2.57), i = sd * S(2.57 - fd - 0.02); ax ? mb.box(min(o, i), y0, u0, max(o, i), y1, u1, S(0.01)) : mb.box(u0, y0, min(o, i), u1, y1, max(o, i), S(0.01)); };
    F(S(-2.57), S(2.57), -2, S(0.16)); F(S(-2.57), S(2.57), S(0.86), S(1.0)); // rails
    for (let i = 0; i <= 5; i++) { const u = S(-2.57 + i * 1.028); F(u - S(0.08), u + S(0.08), S(0.16), S(0.86)); } // posts
  }
  mb.mat = M.GOLD; mb.eb = mb.ea = 0; { const r = S(0.08), e = S(2.6), y = S(1.05); mb.tube([[-e, y, -e, r], [e, y, -e, r], [e, y, e, r], [-e, y, e, r], [-e, y, -e, r], [e, y, -e, r]], 8, false); } // the round gold roll between dado and cavetto
  paint(mb, RED); const cv = (f) => 2.58 + 0.42 * f * f; for (let i = 0; i < 4; i++) { const a = i / 4, b = (i + 1) / 4; frustum(mb, 0, 0, S(cv(a)), S(cv(a)), S(cv(b)), S(cv(b)), S(1.12 + 0.48 * a), S(1.12 + 0.48 * b), false); } // a concave cavetto
  if (true) for (let i = 0; i < 22; i++) {
    paint(mb, i % 2 ? BLUE : OCHRE); const u = S(-2.6 + (i + 0.5) * 5.2 / 22), hw = S(0.055), y0 = S(1.14), y1 = S(1.58);
    for (const sd of [-1, 1]) { for (let j = 0; j < 4; j++) { const a = j / 4, b = (j + 1) / 4, ya = S(1.12 + 0.48 * a), yb = S(1.12 + 0.48 * b), o0 = sd * S(cv(a) + 0.02), o1 = sd * S(cv(b) + 0.02); if (yb <= y0 || ya >= y1) continue; mb.quad(mb.v(u - hw, ya, o0, 0, 0, sd), mb.v(u - hw, yb, o1, 0, 0, sd), mb.v(u + hw, yb, o1, 0, 0, sd), mb.v(u + hw, ya, o0, 0, 0, sd)); mb.quad(mb.v(o0, ya, u - hw, sd, 0, 0), mb.v(o1, yb, u - hw, sd, 0, 0), mb.v(o1, yb, u + hw, sd, 0, 0), mb.v(o0, ya, u + hw, sd, 0, 0)); } }
  }
  unpaint(mb, M.TRIM); mb.box(S(-3.03), S(1.6), S(-3.03), S(3.03), S(1.85), S(3.03), S(0.05)); // the overhanging slab
  // the shaft, face by face, each face in three strips: stone | sunk channel | stone
  const cf = 0.08, PR = [[1.85, 2.58], [3.1, 2.26], [4.5, 2.92], [8.5, 2.2], [13.8, 0.93]] /* (narrowing to a waist above the plinth) */, hc = 0.37, dc = 0.12;
  const W = (y) => { for (let i = 0; i < PR.length - 1; i++) if (y <= PR[i + 1][0]) { const [ya, wa] = PR[i], [yb, wb] = PR[i + 1]; return wa + (wb - wa) * (y - ya) / (yb - ya); } return PR[PR.length - 1][1]; };
  for (const sd of [-1, 1]) for (const ax of [0, 1]) {
    // a point on this face: u across it, at height y, depth d in from the face
    const P = (u, y, d = 0) => { const w = S(W(y)) - S(d); return ax ? [sd * w, S(y), u] : [u, S(y), sd * w]; };
    for (let i = 0; i < PR.length - 1; i++) {
      const [ya, wa] = PR[i], [yb, wb] = PR[i + 1], sl = (wa - wb) / (yb - ya), n = vnorm(ax ? [sd, sl, 0] : [0, sl, sd]);
      const Q = (a, b) => mb.quad(mb.v(...a[0], ...n), mb.v(...a[1], ...n), mb.v(...b[1], ...n), mb.v(...b[0], ...n));
      paint(mb, WHITE); mb.ea += 20; // (a monolith: no courses)
      for (const [u0, u1] of [[-1, -hc], [hc, 1]]) { // the two stone strips: out to the arrises (which move with the width)
        const A = (y, u) => P(u === -1 ? -S(W(y) - cf) : u === 1 ? S(W(y) - cf) : S(u), y); /* (stopping short of the arris: its chamfer) */
        Q([A(ya, u0), A(yb, u0)], [A(ya, u1), A(yb, u1)]);
      }
      paint(mb, RED); Q([P(-S(hc), ya, dc), P(-S(hc), yb, dc)], [P(S(hc), ya, dc), P(S(hc), yb, dc)]); // the channel's floor
      mb.mat = M.MARBLE; mb.eb = mb.ea = 0; // its two side walls
      for (const u of [-hc, hc]) { const sn = ax ? [0, 0, -Math.sign(u)] : [-Math.sign(u), 0, 0]; mb.quad(mb.v(...P(S(u), ya), ...sn), mb.v(...P(S(u), yb), ...sn), mb.v(...P(S(u), yb, dc), ...sn), mb.v(...P(S(u), ya, dc), ...sn)); }
    }
    // the ladder's rungs in the channel
    // the ladder's rungs: small gilt rods lying in the channel, rounded, standing proud of its floor
    mb.mat = M.GOLD; mb.eb = mb.ea = 0;
    for (let y = 2.0; y < 13.5; y += 0.42) { const a = P(-S(hc * 0.92), y + 0.05, dc - 0.02), b = P(S(hc * 0.92), y + 0.05, dc - 0.02); mb.tube([[...a, S(0.05)], [...b, S(0.05)]], 6); }
    // channel's top and bottom ends
    mb.mat = M.MARBLE; mb.eb = mb.ea = 0;
    for (const [y, ny] of [[1.85, 1], [13.8, -1]]) mb.quad(mb.v(...P(-S(hc), y), 0, ny, 0), mb.v(...P(S(hc), y), 0, ny, 0), mb.v(...P(S(hc), y, dc), 0, ny, 0), mb.v(...P(-S(hc), y, dc), 0, ny, 0));
  }
  // gold filling the four corners of the wide part: on both faces of each arris, 0.9 m in at 4.5, nothing at 8.5
  mb.mat = M.GOLD; mb.eb = mb.ea = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const ax of [0, 1]) {
    const k = 0.03, C = (y, inset) => { const w = S(W(y) + k), m = w - S(inset) - S(cf) * (inset ? 0 : 1); return ax ? [sx * w, S(y), sz * m] : [sx * m, S(y), sz * w]; };
    const sl = (2.92 - 2.2) / 4, n = vnorm(ax ? [sx, sl, 0] : [0, sl, sz]);
    const xi = 2.92 - 1.2; mb.poly([C(4.5, 0), C(4.5, 1.2), C(6.0, W(6.0) - xi), C(8.5, 0)], n, 1); // inner edge straight up, then a kink, then slanting to the point
  }
  // small chamfers on the four arrises, gold where the gold fills the corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < PR.length - 1; i++) {
    const [ya, wa] = PR[i], [yb, wb] = PR[i + 1], gold = ya >= 4.5 && yb <= 8.5, sl = (wa - wb) / (yb - ya), n = vnorm([sx, sl * 1.4, sz]);
    if (gold) { mb.mat = M.GOLD; mb.eb = mb.ea = 0; } else { paint(mb, WHITE); mb.ea += 20; }
    const E = (y, w, k = 0) => [[sx * S(w + k), S(y), sz * S(w - cf + k)], [sx * S(w - cf + k), S(y), sz * S(w + k)]], g = gold ? 0.03 : 0, a0 = E(ya, wa, g), b0 = E(yb, wb, g);
    mb.quad(mb.v(...a0[0], ...n), mb.v(...b0[0], ...n), mb.v(...b0[1], ...n), mb.v(...a0[1], ...n));
  }
  mb.mat = M.GOLD; mb.box(S(-1.1), S(13.76), S(-1.1), S(1.1), S(13.98), S(1.1), S(0.02)); // a thick gold slab under the pyramidion
  // the pyramidion: gold, a fine groove a little below its tip
  const yg = 13.98 + (15.9 - 13.98) * 0.62, wg = 1.04 * (1 - 0.62);
  mb.mat = M.GOLD; mb.eb = mb.ea = 0; frustum(mb, 0, 0, S(1.04), S(1.04), S(wg), S(wg), S(13.98), S(yg - 0.02), true);
  mb.mat = M.CORE; mb.eb = mb.ea = 0; frustum(mb, 0, 0, S(wg - 0.03), S(wg - 0.03), S(wg - 0.03), S(wg - 0.03), S(yg - 0.02), S(yg + 0.02), false);
  mb.mat = M.GOLD; mb.eb = mb.ea = 0; frustum(mb, 0, 0, S(wg - 0.01), S(wg - 0.01), S(0.03), S(0.03), S(yg + 0.02), S(15.9));
  { const p = S(wg - 0.01), q = S(wg - 0.03), y = S(yg + 0.02); mb.poly([[-p, y, -p], [p, y, -p], [p, y, p], [-p, y, p]], [0, -1, 0], 1); } // its underside over the groove (closed)
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
// unlit fire bowl after the kit's FireBowlA (lost city: ash and charred logs, no flame): a shallow, wide bronze dish
// standing on the ground, r across its rim, about 0.4 r tall, a low domed heap of ash in it, three logs across it
function fireBowl(mb, x, y, z, r, seg = 12) {
  mb.mat = M.ALLOY; mb.eb = mb.ea = 0;
  mb.lathe([[0, y], [r * 0.55, y], [r * 0.8, y + r * 0.12], [r * 0.97, y + r * 0.3], [r, y + r * 0.36], [r * 0.93, y + r * 0.36], [r * 0.75, y + r * 0.2], [0, y + r * 0.16]], { seg, cx: x, cz: z, crease: 40 });
  mb.mat = M.CORE; mb.lathe([[r * 0.92, y + r * 0.33], [r * 0.7, y + r * 0.5], [r * 0.4, y + r * 0.62], [0, y + r * 0.68]], { seg, cx: x, cz: z, crease: 60 }); // ash, heaped above the rim
  mb.mat = M.BARK; for (const a of [0.3, 1.4, 2.6]) mb.tube([[x + cos(a) * r * 0.55, y + r * 0.4, z + sin(a) * r * 0.55, r * 0.07], [x - cos(a) * r * 0.45, y + r * 0.74, z - sin(a) * r * 0.45, r * 0.06]], 5);
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
    paint(mb, WHITE); { const X0 = X(-19.5), X1 = X(-10.4), Q = [[8, 0.6], [17, 0.6], [8, 24]]; for (const x of [X0, X1]) void x; extrudeX(mb, Q, min(X0, X1), max(X0, X1)); } // the hall's side blocks, sloping down to the back
  }
  // the arch: a proud sandstone frame, a white panel within, nested door frames, the pointed doorway
  mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED; fq(ogive(8.5, 33.8, 0.6, n, 1.955), -8.6, -6.6); mb.ea = 0;
  paint(mb, WHITE); fq(ogive(7.0, 33.8, 0.6, n, 2.22), -8.68, -8.6);
  mb.mat = M.MARBLE; mb.eb = mb.ea = 0;
  for (const [hx, ht] of [[6.0, 29.6], [3.5, 26.4]]) { fq([[-hx, 0.6], [-hx + 0.3, 0.6], [-hx + 0.3, ht], [-hx, ht]], -8.8, -8.68); fq([[hx - 0.3, 0.6], [hx, 0.6], [hx, ht], [hx - 0.3, ht]], -8.8, -8.68); fq([[-hx, ht - 0.3], [hx, ht - 0.3], [hx, ht], [-hx, ht]], -8.8, -8.68); }
  fq(ogive(2.2, 22.4, 0.6, n, 2.2), -8.9, -8.68); // the doorway's frame
  paint(mb, BLACK); fq(ogive(1.2, 22.4, 0.6, n, 2.6), -9.0, -8.85); // the doorway: a tall narrow slit
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
    const hw = 4.0 + 4.3 * min(1, t / 0.22), yt = 45.5 - 12.9 * (0.6 * t * t * (3 - 2 * t) + 0.4 * t), yb = 31 * (1 - t), ys = yt - 6, Q = [[hw, yb], [hw, ys - 0.9], [hw, ys]];
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
  mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED; mb.poly(A.map((p) => [p[0], p[1], z0 + L]), [0, 0, 1], 1); // its back end, closed
  mb.eb = mb.ea = 0; return mb.build();
}
// the kit complex's terrace building (BuildingC, ~2.4x), measured off the kit's plan and elevations. Its front (the
// pavilions) faces +x, its back runs into the pyramid; origin at its block's centre, on the ground.
// - lower storey 92.8 x 60.4 m, 16.8 m to its striped cavetto, panelled walls with red posts
// - two pavilions on the front, each with a battered doorway in a sandstone frame
// - two straight stairs down its long sides to the courtyard either side, with parapets coped in striped bands
// - an upper tier set back (-51 .. 17 m, 37 m wide) with a row of false-door niches, gold lines inlaid on its roof
// - at the back, a great slab lying up the pyramid's face, a gilt slab either side of it
function meshKitTerrace(lod) {
  const mb = new MB(1 << 15), A = 46.4, V = 30.2, y1 = 15.1, yc = 16.8, U0 = -51.2, U1 = 16.9, UV = 18.7, y2 = 24.6, yu = 26;
  const stripes = (x0, x1, z0, z1, y, h, o) => { // a cornice band of vertical stripes, red with blue / ochre, overhanging o
    paint(mb, RED); mb.box(x0 - o, y, z0 - o, x1 + o, y + h, z1 + o, 0);
    if (lod) return; const n = (len) => max(2, round(len / 1.2));
    for (const [ax, a0, a1, f] of [[0, x0, x1, z1 + o], [0, x0, x1, z0 - o], [1, z0, z1, x1 + o], [1, z0, z1, x0 - o]]) {
      const k = n(a1 - a0); for (let i = 0; i < k; i++) { if (i % 2) continue; paint(mb, (i >> 1) % 2 ? BLUE : OCHRE); const u = a0 + (i + 0.5) * (a1 - a0) / k;
        ax ? mb.box(f - 0.03, y + 0.1, u - 0.22, f + 0.03, y + h - 0.1, u + 0.22, 0) : mb.box(u - 0.22, y + 0.1, f - 0.03, u + 0.22, y + h - 0.1, f + 0.03, 0); }
    }
  };
  // lower storey: white ashlar, a plinth, red posts dividing its long walls into panels, the striped cavetto, a slab
  paint(mb, WHITE); mb.box(-A, 0, -V, A, y1, V, 0);
  unpaint(mb, M.MARBLE); mb.ea = WEATHERED; mb.box(-A - 0.6, -2, -V - 0.6, A + 0.6, 1.2, V + 0.6, 0.05); mb.ea = 0;
  paint(mb, RED); for (const x of [-30, -10, 14, 30]) for (const sd of [-1, 1]) mb.box(x - 0.6, 1.2, sd * V - 0.12, x + 0.6, y1, sd * V + 0.12, 0);
  stripes(-A, A, -V, V, y1, yc - y1, 0.4); unpaint(mb, M.TRIM); mb.box(-A - 0.8, yc, -V - 0.8, A + 0.8, yc + 0.5, V + 0.8, 0.06);
  // pavilions on the front, each a battered doorway (dark) in a sandstone frame under its own cornice
  // the two porches on the front: open post-and-beam, sandstone posts, a striped beam, a roof slab, a dark doorway
  // into the building behind each
  for (const [z0, z1] of [[3.4, 23], [-23, -3.4]]) {
    const zc = (z0 + z1) / 2; mb.mat = M.MARBLE; mb.ea = WEATHERED;
    for (const x of [A + 0.8, A + 14.2]) for (const z of [z0 + 0.9, z1 - 0.9]) mb.box(x - 0.9, -1, z - 0.9, x + 0.9, 11.6, z + 0.9, 0.06);
    mb.ea = 0; stripes(A, A + 15.2, z0, z1, 11.6, 1.5, 0.3); unpaint(mb, M.TRIM); mb.box(A - 0.3, 13.1, z0 - 0.6, A + 15.8, 13.6, z1 + 0.6, 0.05);
    paint(mb, BLACK); mb.poly([[A + 0.03, 0, zc - 3.4], [A + 0.03, 0, zc + 3.4], [A + 0.03, 8, zc + 2.4], [A + 0.03, 8, zc - 2.4]], [1, 0, 0], 1); // battered doorway
  }
  mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 12; mb.box(A, 1.5, -2.4, A + 1.2, 6, 2.4, 0); mb.eb = mb.ea = 0; // relief panel between them
  // stairs down the long sides to the courtyard, each between parapets coped with a striped band
  for (const sd of [-1, 1]) {
    const x0 = -15.7, x1 = -8, zt = sd * V, zb = sd * 61.2, n = lod ? 8 : 40;
    mb.mat = M.STEP; for (let i = 0; i < n; i++) { const z = zt + (zb - zt) * (i + 1) / n; mb.box(x0, -0.5, min(zt, z), x1, (yc + 0.5) * (1 - i / n), max(zt, z), 0); }
    for (const px of [x0 - 0.8, x1]) {
      const Q = [[zt, yc + 1.6], [zb, 1.2], [zb, 0], [zt, 0]], n2 = [0, 0, 0];
      mb.mat = M.MARBLE; mb.ea = WEATHERED;
      extrudeX(mb, Q, px, px + 0.8);
      mb.ea = 0; paint(mb, RED); extrudeX(mb, [[zt, yc + 1.6], [zb, 1.2], [zb, 1.7], [zt, yc + 2.1]], px - 0.1, px + 0.9); unpaint(mb);
    }
  }
  // upper tier: false-door niches between pilasters on all four faces, the striped cornice, gold lines on its roof
  paint(mb, WHITE); mb.box(U0, yc + 0.5, -UV, U1, y2, UV, 0);
  { const Q = [[U1, yc + 0.5], [U1 + 7, yc + 0.5], [U1, y2]]; extrudeZ(mb, Q, -UV, UV); } // the upper storey's east end sloping down to the lower roof
  const niche = (x, z, nx, nz) => { // a false door on the face whose outward normal is (nx, nz)
    const P = (a, b, d) => (nx ? [x + nx * d, 0, z + a] : [x + a, 0, z + nz * d]), Bx = (a0, a1, b0, b1, d0, d1) => { const p = P(a0, 0, d0), q = P(a1, 0, d1); mb.box(min(p[0], q[0]), b0, min(p[2], q[2]), max(p[0], q[0]), b1, max(p[2], q[2]), 0); };
    unpaint(mb, M.TRIM); Bx(-2, 2, yc + 2, y2 - 1.6, 0, 0.35); paint(mb, OCHRE); Bx(-1.4, 1.4, yc + 2.6, y2 - 2.2, 0.3, 0.45); paint(mb, BLACK); Bx(-0.6, 0.6, yc + 2.6, y2 - 3.6, 0.4, 0.5);
  };
  for (let x = U0 + 6; x < U1 - 2; x += 9.5) for (const sd of [-1, 1]) niche(x, sd * UV, 0, sd);
  stripes(U0, U1, -UV, UV, y2, yu - y2, 0.35); unpaint(mb, M.TRIM); mb.box(U0 - 0.7, yu, -UV - 0.7, U1 + 0.7, yu + 0.5, UV + 0.7, 0.05);
  // gold inlay on its roof: flat single faces 3 cm above it (no thin boxes, whose sides fight the roof from afar)
  mb.mat = M.GOLD; const g = yu + 0.53, up = [0, 1, 0], R = (x0, z0, x1, z1, y) => mb.poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], up, 1);
  for (const sd of [-1, 1]) R(U0 + 1, sd * 11 - 1.5, 5, sd * 11 + 1.5, g);
  R(-4, -11, 1.3, 11, g); R(-12.7, -1.4, 13.5, 1.4, g); R(12, -4.5, 14.5, 4.5, g);
  mb.mat = M.TRIM; R(22, -11.2, 44, 11.2, yc + 0.53); // a plain tan panel on the lower roof
  // at the back: a great slab lying up the pyramid's face (white, a carved sandstone strip down it), gilt slabs beside
  const slab = (xa, ya, xb, yb, hz, th, mat, glyph) => {
    const dx = xb - xa, dy = yb - ya, l = hypot(dx, dy), nx = dy / l, ny = -dx / l; // (nx, ny): the slab's upper side (its thickness goes below)
    const C = [[xa, ya], [xb, yb], [xb - nx * th, yb - ny * th], [xa - nx * th, ya - ny * th]];
    if (mat === 'white') paint(mb, WHITE); else { mb.mat = mat; mb.eb = mb.ea = 0; }
    extrudeZ(mb, C, -hz, hz);
    if (glyph) { mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 12; const o = 0.06; extrudeZ(mb, [[xa + nx * o, ya + ny * o], [xb + nx * o, yb + ny * o], [xb, yb], [xa, ya]], -hz * 0.4, hz * 0.4); mb.eb = mb.ea = 0; } // a carved sandstone strip down its face
  };
  slab(U0 + 3.3, yu + 0.5, -76, 47.5, 5.8, 4.2, 'white', true);
  mb.mat = M.MARBLE; mb.ea = WEATHERED; for (const sd of [-1, 1]) mb.box(U0 - 2, yu, sd * 8.1 - 2.25, U0 + 2.5, yu + 9, sd * 8.1 + 2.25, 0.08); mb.ea = 0; // the stone piers beside the slab
  for (const sd of [-1, 1]) { mb.fr = [0, 0, sd * 12, 1, 0, 1]; slab(U0 + 3.3, yu + 0.5, -60.3, 35.5, 0.8, 1.6, M.GOLD, false); mb.fr = null; }
  mb.eb = mb.ea = 0; return mb.build();
}
// a banner after the kit's BannerA-F (~2.4x): a tapered stone pedestal, an 18 m pole with a bronze finial, a red-brown
// cloth 2.8 m wide hanging from a crossbar near the top, cut straight across at about half the height
function meshKitBanner() {
  const mb = new MB(512);
  mb.mat = M.TRIM; frustum(mb, 0, 0, 0.95, 0.95, 0.7, 0.7, -2, 0.8); mb.box(-0.55, 0.8, -0.55, 0.55, 1.05, 0.55, 0.04);
  mb.mat = M.BARK; mb.tube([[0, 1.6, 0, 0.2], [0, 17.9, 0, 0.15]], 6); mb.box(-0.08, 17.32, -1.5, 0.08, 17.48, 1.5, 0);
  mb.mat = M.ALLOY; frustum(mb, 0, 0, 0.25, 0.25, 0.02, 0.02, 17.9, 19);
  paint(mb, RED); mb.box(0.18, 6.4, -1.4, 0.3, 17.3, 1.4, 0);
  paint(mb, OCHRE); for (const y of [15.5, 12.4]) mb.box(0.16, y, -1.4, 0.32, y + 0.4, 1.4, 0);
  paint(mb, BLUE); mb.box(0.16, 7.0, -1.4, 0.32, 7.4, 1.4, 0);
  mb.eb = mb.ea = 0; return mb.build();
}
// a standing torch after the kit's StandingTochA (~2.4x, 0.8 m across its bowl, 3.6 m tall): a wide base disc, a slender
// red shaft with painted bands, flaring to a wide shallow bowl, unlit
function meshKitTorch() {
  const mb = new MB(512); paint(mb, RED);
  mb.lathe([[0, 0], [0.34, 0], [0.34, 0.12], [0.22, 0.2], [0.13, 0.28], [0.12, 3.0], [0.15, 3.08], [0.15, 3.14], [0.22, 3.2], [0.44, 3.48], [0.48, 3.53], [0.48, 3.58], [0.4, 3.56], [0, 3.5]], { seg: 14, cx: 0, cz: 0, crease: 40 }); // a short cup flaring at the top (~0.5 m)
  paint(mb, OCHRE); for (const y of [0.45, 1.4, 2.75]) mb.lathe([[0.11, y], [0.135, y], [0.135, y + 0.12], [0.11, y + 0.12]], { seg: 12, cx: 0, cz: 0, crease: 40 });
  mb.mat = M.CORE; mb.eb = mb.ea = 0; mb.lathe([[0.42, 3.55], [0.2, 3.62], [0, 3.66]], { seg: 14, cx: 0, cz: 0, crease: 60 }); // ash heaped in the cup
  return mb.build();
}
// a group of clay pots after the kit's ClayPots (~2.4x): a big squat white pot with a wide open mouth and no neck, a blue
// lotus band round its shoulder; behind it, left and right, two small black jugs with a red band
function meshKitPots() {
  const mb = new MB(1024), L = (prof, x, z) => mb.lathe(prof, { seg: 14, cx: x, cz: z, crease: 40 });
  paint(mb, WHITE); L([[0, 0], [0.75, 0], [1.25, 0.6], [1.55, 1.5], [1.58, 2.15], [1.42, 2.75], [1.33, 2.95], [1.4, 3.05], [1.3, 3.08], [1.2, 2.9], [0, 2.4]], 0, 0);
  paint(mb, BLUE); L([[1.5, 1.85], [1.6, 1.85], [1.6, 2.35], [1.52, 2.35]], 0, 0);
  paint(mb, BLACK); L([[1.52, 1.95], [1.62, 1.95], [1.62, 2.02], [1.52, 2.02]], 0, 0);
  for (const [x, z] of [[1.95, -0.6], [-0.9, 1.95]]) { // (the kit's: either side of the big pot, a little behind it)
    paint(mb, BLACK); L([[0, 0], [0.35, 0], [0.66, 0.35], [0.72, 0.7], [0.55, 1.05], [0.26, 1.2], [0.24, 1.45], [0.32, 1.52], [0.2, 1.54], [0, 1.3]], x, z);
    paint(mb, RED); L([[0.68, 0.5], [0.75, 0.5], [0.75, 0.75], [0.68, 0.75]], x, z);
  }
  mb.eb = mb.ea = 0; return mb.build();
}
// one of the stone beams lying in a fan round the post at the end of the kit entrance's causeway: 9 m long, along z
function meshKitBeam() { const mb = new MB(64); mb.mat = M.MARBLE; mb.ea = WEATHERED; mb.box(-0.55, -0.3, -4.5, 0.55, 0.45, 4.5, 0.06, true); mb.ea = 0; return mb.build(); }
// enclosure wall after the kit's: the runs of its plan (a rectangle with a bay out on the -x side round the terrace
// building, which closes it), h high. Each run: a footing course along both faces (2.5 m out, 1.6 m high, battered,
// carried 2 m below ground so the wall never floats on uneven sand); a tan lower band (55%) of inscription panels
// framed in red between pale pilasters; a white upper band notched with shallow trapezoidal crenels; taller piers
function meshEnclosure(h, lod, gate = KP.gateX) {
  const mb = new MB(1 << 15), t = 1.6, hb = h * 0.55, hn = h - 0.42 * (h - hb);
  const run = (x0, z0, x1, z1, piers = true) => {
    const L = hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = abs(x1 - x0) > abs(z1 - z0);
    const B = (u0, u1, d, y0, y1, bev = 0, o = 0) => alongX ? mb.box(cx + u0, y0, cz + o - d, cx + u1, y1, cz + o + d, bev) : mb.box(cx + o - d, y0, cz + u0, cx + o + d, y1, cz + u1, bev);
    const T = (u, a0, a1, d0, d1, y0, y1) => alongX ? frustum(mb, cx + u, cz, a0, d0, a1, d1, y0, y1, true) : frustum(mb, cx, cz + u, d0, a0, d1, a1, y0, y1, true);
    // footing (its ends run on past the corners, so the corners close)
    mb.mat = M.MARBLE; mb.ea = WEATHERED; T(0, L / 2 + 2.5, L / 2 + 2.5, t + 3.0, t + 2.5, -2, 0.3); T(0, L / 2 + 2.5, L / 2 + 2.5, t + 2.5, t + 2.1, 0.3, 1.6); mb.ea = 0;
    mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 20; frustum(mb, cx, cz, alongX ? L / 2 : t, alongX ? t : L / 2, alongX ? L / 2 : t * 0.92, alongX ? t * 0.92 : L / 2, 1.6, hb, false); mb.eb = mb.ea = 0;
    paint(mb, WHITE); B(-L / 2, L / 2, t * 0.92, hb, hn); mb.ao = 0.42; B(-L / 2, L / 2, t * 0.3, hn, h); mb.ao = 1;
    for (const sd of [-1, 1]) { paint(mb, RED); B(-L / 2, L / 2, 0.06, hb - 0.75, hb - 0.55, 0, sd * (t * 0.94)); B(-L / 2, L / 2, 0.06, 1.95, 2.15, 0, sd * (t * 0.99)); }
    const nb = max(1, round(L / 14));
    for (let i = 0; i <= nb; i++) {
      const u = -L / 2 + i * L / nb;
      for (const sd of [-1, 1]) {
        paint(mb, RED); B(u - 1.12, u - 0.92, 0.08, 2.0, hb - 0.6, 0, sd * (t * 0.97)); B(u + 0.92, u + 1.12, 0.08, 2.0, hb - 0.6, 0, sd * (t * 0.97));
        paint(mb, WHITE); B(u - 0.8, u + 0.8, 0.2, 1.6, hb - 0.3, 0, sd * (t * 0.96)); unpaint(mb, M.TRIM); B(u - 1.0, u + 1.0, 0.26, hb - 0.55, hb - 0.2, 0, sd * (t * 0.96));
      }
    }
    const nm = max(1, round(L / 7.2)), p = L / nm; paint(mb, WHITE);
    for (let i = 0; i < nm; i++) T(-L / 2 + (i + 0.5) * p, p * 0.375, p * 0.3, t * 0.92, t * 0.92, hn, h);
    if (piers) { const np = max(1, round(L / 48)); for (let i = 0; i <= np; i++) { const u = -L / 2 + i * L / np; paint(mb, WHITE); B(u - 1.8, u + 1.8, t + 0.4, 0, h + 0.6); unpaint(mb, M.TRIM); B(u - 2.1, u + 2.1, t + 0.7, h + 0.6, h + 1.1, lod ? 0 : 0.06); /* (barely above the crest, as on the kit) */ } }
    mb.eb = mb.ea = 0;
  };
  const { wallW: W, wallE: E, wallZ: Z, bumpX: X, bumpZ: J, gapZ: G } = KP;
  run(E, Z, W, Z); run(E, -Z, -gate, -Z); run(gate, -Z, W, -Z); run(W, -Z, W, Z); // north, south (the entrance's gap), west
  run(E, -Z, E, -J); run(E, J, E, Z); // east, stopping at the bay's side walls (the bay is open to the court)
  run(X, -J, E, -J, false); run(X, J, E, J, false); run(X, -J, X, -G, false); run(X, G, X, J, false); // the bay; the pavilions fill its middle
  return mb.build();
}
// the far complex's plan, measured off the kit (tools/kitlab/pyr_plan.py, reference/kb3d/plan/plan.json)
// metres at 2.4x, relative to the pyramid's centre; x mirrored from the kit (its east, the terrace's side, is -x here)
const KP = {
  wallW: 121, wallE: -141.6, wallZ: 121.2, // the enclosure's wall lines
  bumpX: -187, bumpZ: 40.8, gapZ: 19.2, // the bay out round the terrace building (-x side); its walls open |z| < gapZ
  gateX: 29, // the entrance's gap in the front wall (the entrance building fills it)
  terrace: [-131.6, 0], // the terrace building's block centre (its front, the pavilions, facing -x)
  entranceZ: -125.1, // the entrance's wall line (its towers 5.7 m out from the wall)
  obelisks: [[-154.3, -118.8], [135.5, -118.8], [135.5, 117.6], [-154.3, 117.6]],
  banners: [[-131.3, 46.3], [-110, -93.2], [-111.5, -59.7], [-131.3, -41.1], [-110, 63.4], [-111.5, 96.9]],
  torches: [[-123.9, 63.4], [-116.5, 63.4], [-123.9, 97], [-116.5, 97], [-123.9, -93.2], [-116.5, -93.2], [-123.9, -63], [-116.5, -63], // at the stairs' feet
    [-194.5, -20.1], [-194.5, -7], [-194.5, 5.7], [-194.5, 18.7]], // before the pavilions' doors
  torchesHigh: [[-116.5, -29], [-124.1, -29], [-153.8, -8.1], [-153.8, 7]], // on the terrace (17.2 m up)
  pots: [[-175.9, -22, 0.4], [-174.8, 26.5, 2.1], [-174.5, -27.7, 1.2]], // on the terrace
};
// the kit entrance's causeway (part of the kit's terrain): from the entrance's plinth at z0 it tapers over 67 m toward
// the post, sandstone flags with a paler limestone strip down its middle, a step proud of the sand, its edges buried
function meshKitCauseway(z0) {
  const mb = new MB(512), z1 = z0 - 67, up = [0, 1, 0], yc = 0.25;
  const slab = (w0, w1, ya, za0, za1) => { mb.poly([[-w0, ya, za0], [w0, ya, za0], [w1, ya, za1], [-w1, ya, za1]], up, 1);
    for (const sd of [-1, 1]) { const n = vnorm([sd * (za0 - za1), 0, sd * (w0 - w1)]); mb.quad(mb.v(sd * w0, -2, za0, ...n), mb.v(sd * w0, ya, za0, ...n), mb.v(sd * w1, ya, za1, ...n), mb.v(sd * w1, -2, za1, ...n)); }
    mb.quad(mb.v(-w1, -2, za1, 0, 0, -1), mb.v(-w1, ya, za1, 0, 0, -1), mb.v(w1, ya, za1, 0, 0, -1), mb.v(w1, -2, za1, 0, 0, -1)); };
  mb.mat = M.PAVE; slab(24, 5.5, yc, z0, z1);
  paint(mb, WHITE); mb.poly([[-2.6, yc + 0.03, z0], [2.6, yc + 0.03, z0], [2.6, yc + 0.03, z1 + 3], [-2.6, yc + 0.03, z1 + 3]], up, 1); mb.eb = mb.ea = 0;
  mb.mat = M.TRIM; mb.lathe([[3.2, -1], [3.2, yc + 0.1], [2.9, yc + 0.3], [0, yc + 0.3]], { seg: 20, cx: 0, cz: z1 - 1 });
  return mb.build();
}
// a prism: the outline Q ([z, y], convex) extruded along x from x0 to x1
function extrudeX(mb, Q, x0, x1) {
  let a2 = 0; for (let i = 0; i < Q.length; i++) { const p = Q[i], q = Q[(i + 1) % Q.length]; a2 += p[0] * q[1] - q[0] * p[1]; } if (a2 < 0) Q = Q.slice().reverse();
  for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length], ez = b[0] - a[0], ey = b[1] - a[1], l = hypot(ez, ey) || 1, n = [0, -ez / l, ey / l];
    mb.quad(mb.v(x0, a[1], a[0], ...n), mb.v(x0, b[1], b[0], ...n), mb.v(x1, b[1], b[0], ...n), mb.v(x1, a[1], a[0], ...n)); }
  mb.poly(Q.map(([z, y]) => [x0, y, z]), [-1, 0, 0], 1); mb.poly(Q.map(([z, y]) => [x1, y, z]), [1, 0, 0], 1);
}
// a prism: the outline C ([x, y], convex) extruded along z from z0 to z1
function extrudeZ(mb, C, z0, z1) {
  let a2 = 0; for (let i = 0; i < C.length; i++) { const p = C[i], q = C[(i + 1) % C.length]; a2 += p[0] * q[1] - q[0] * p[1]; } if (a2 < 0) C = C.slice().reverse();
  extrude(mb, C, 0, z0, z1);
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
  return mb.build();
}
