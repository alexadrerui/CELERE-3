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
  mb.mat = M.GOLD; mb.eb = mb.ea = 0; { const r = S(0.08), e = S(2.6), y = S(1.05); mb.tube([[0, y, -e, r], [e, y, -e, r], [e, y, e, r], [-e, y, e, r], [-e, y, -e, r], [0.4, y, -e, r]], 8); /* starts and ends mid-side, its ends overlapping inside it (no open ring at a corner) */ } // the round gold roll between dado and cavetto
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
  mb.lathe([[r * 0.55, y], [r * 0.8, y + r * 0.12], [r * 0.97, y + r * 0.3], [r, y + r * 0.36], [r * 0.93, y + r * 0.36], [r * 0.86, y + r * 0.298]], { seg, cx: x, cz: z, crease: 40 }); /* (no bottom: it stands on the slab; inside, down only to the ash) */
  mb.mat = M.CORE; mb.lathe([[r * 0.86, y + r * 0.298], [r * 0.6, y + r * 0.36], [r * 0.3, y + r * 0.4], [0, y + r * 0.42]], { seg, cx: x, cz: z, crease: 60 }); // ash, a low mound just above the rim
  mb.mat = M.BARK; for (const a of [0.3, 1.4, 2.6]) mb.tube([[x + cos(a) * r * 0.55, y + r * 0.3, z + sin(a) * r * 0.55, r * 0.07], [x - cos(a) * r * 0.45, y + r * 0.46, z - sin(a) * r * 0.45, r * 0.06]], 5);
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
// the pyramid's south face (meshPyramidCased(107.75, 99.9) at the complex's centre) in the entrance's own frame (it
// stands at z KP.entranceZ): z on the face at height y
const PYR_FACE = (y) => { const B = 107.75, H = 99.9, c = 0.19; return -B - KP.entranceZ + (B - B * c) * (y + 2.5) / (H * (1 - c) + 2.5); };
// the entrance where it runs into the pyramid (kit): everything cut along the face (0.1 m inside it, so the cut hides
// in the stone), the cut closed by a lid on that plane (for the entrance on its own) and, on every surface, a band of
// the frame's stone 0.6 m wide following the face
function clipPyramid(m) {
  const BAND = 0.6, IN = 0.1, f = new Float32Array(m.vb), b = new Uint8Array(m.vb), out = new MB(m.nv + 1024);
  const g = (i, s) => f[i * 5 + 2] - (PYR_FACE(f[i * 5 + 1]) + s); // > 0 past the plane (s: shift along z)
  const copy = (i) => { const j = out.nv++; if (out.nv * 20 > out.vb.byteLength) { const n = new ArrayBuffer(out.vb.byteLength * 2); new Uint8Array(n).set(out.b); out.vb = n; out.f = new Float32Array(n); out.b = new Uint8Array(n); out.sb = new Int8Array(n); }
    out.b.set(b.subarray(i * 20, i * 20 + 20), j * 20); return j; };
  // a vertex between out vertices p and q where the plane (shift s) crosses (its other data from p)
  const cross = (p, q, s) => { const gp = out.f[p * 5 + 2] - (PYR_FACE(out.f[p * 5 + 1]) + s), gq = out.f[q * 5 + 2] - (PYR_FACE(out.f[q * 5 + 1]) + s), t = gp / (gp - gq), j = out.nv++;
    if (out.nv * 20 > out.vb.byteLength) { const n = new ArrayBuffer(out.vb.byteLength * 2); new Uint8Array(n).set(out.b); out.vb = n; out.f = new Float32Array(n); out.b = new Uint8Array(n); out.sb = new Int8Array(n); }
    out.b.copyWithin(j * 20, p * 20, p * 20 + 20); for (let k = 0; k < 3; k++) out.f[j * 5 + k] = out.f[p * 5 + k] + (out.f[q * 5 + k] - out.f[p * 5 + k]) * t; return j; };
  const gv = (i, s) => out.f[i * 5 + 2] - (PYR_FACE(out.f[i * 5 + 1]) + s);
  // clip a polygon (out vertex ids) to the side gv <= 0 (keep < 0) or >= 0 (keep > 0)
  const clipPoly = (P, s, keepPast) => { const R = []; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], a = gv(p, s) > 0 === keepPast, c = gv(q, s) > 0 === keepPast;
    if (a) R.push(p); if (a !== c) R.push(cross(p, q, s)); } return R; };
  const segs = []; // the cut's segments on the plane, for the lid: [x0, y0, x1, y1] running with the solid on their left
  const map = new Int32Array(m.nv).fill(-1), id = (i) => (map[i] < 0 ? (map[i] = copy(i)) : map[i]);
  const emit = (P, band) => { if (P.length < 3) return; if (band) for (const v of P) { out.b[v * 20 + 16] = M.MARBLE; out.b[v * 20 + 17] = WEATHERED; out.b[v * 20 + 18] = 0; out.b[v * 20 + 19] = 0; }
    for (let i = 1; i + 1 < P.length; i++) out.tri(P[0], P[i], P[i + 1]); };
  for (let t = 0; t < m.ib.length; t += 3) {
    const T = [m.ib[t], m.ib[t + 1], m.ib[t + 2]], G = T.map((i) => g(i, IN)), GB = T.map((i) => g(i, IN - BAND));
    if (G.every((v) => v >= 0)) continue; // wholly inside the pyramid
    if (GB.every((v) => v <= 0)) { out.tri(id(T[0]), id(T[1]), id(T[2])); continue; } // wholly clear of it
    // fresh copies (the band recolours them), cut to the plane, then split at the band's edge
    const P = clipPoly(T.map(copy), IN, false); let collared = false;
    if (P.length >= 3 && G.some((v) => v > 0)) { // the cut's segment on this face: the two new vertices lying on the plane
      const on = P.filter((v) => abs(gv(v, IN)) < 1e-4); if (on.length === 2) { const a = on[0], c = on[1], sb = new Int8Array(out.vb), nx = sb[a * 20 + 12], ny = sb[a * 20 + 13] + (PYR_FACE(1) - PYR_FACE(0)) * sb[a * 20 + 14]; /* (the normal along the plane's x and up-the-slope directions) */
        const x0 = out.f[a * 5], y0 = out.f[a * 5 + 1], x1 = out.f[c * 5], y1 = out.f[c * 5 + 1]; // (the face's normal, across the plane: the solid lies the other way)
        const nl = hypot(nx, ny) || 1; if ((x1 - x0) * ny - (y1 - y0) * nx > 0) segs.push([x0, y0, x1, y1, nx / nl, ny / nl]); else segs.push([x1, y1, x0, y0, nx / nl, ny / nl]); collared = hypot(x1 - x0, y1 - y0) > 1e-3; } }
    emit(clipPoly(P, IN - BAND, false), false); if (!collared) emit(clipPoly(P, IN - BAND, true), true); /* (a face cut by the pyramid: its last 0.6 m lies under the collar) */
  }
  // the lid: the cut's outline filled (non-zero winding), in horizontal bands, on the plane, facing into the pyramid
  const ys = [...new Set(segs.flatMap((s) => [s[1], s[3]]).map((y) => Math.round(y * 1e4) / 1e4))].sort((p, q) => p - q), nz = vnorm([0, -(PYR_FACE(1) - PYR_FACE(0)), 1]);
  out.mat = M.MARBLE; out.ea = WEATHERED; out.eb = 0;
  const P3 = (x, y) => out.v(x, y, PYR_FACE(y) + IN, ...nz);
  for (let i = 0; i + 1 < ys.length; i++) { const ya = ys[i], yb = ys[i + 1], ym = (ya + yb) / 2; if (yb - ya < 1e-4) continue;
    const X = []; for (const [x0, y0, x1, y1] of segs) { if ((y0 - ym) * (y1 - ym) >= 0) continue; const at = (y) => x0 + (x1 - x0) * (y - y0) / (y1 - y0); X.push([at(ym), at(ya), at(yb), y1 > y0 ? 1 : -1]); }
    X.sort((p, q) => p[0] - q[0]);
    // crossings a few cm apart are one (a face and a flat decal on it count once; two blocks sharing a face cancel)
    const Y = []; for (const c of X) { const l = Y[Y.length - 1]; if (l && c[0] - l[0] < 0.08 && abs(c[1] - l[1]) < 0.08 && abs(c[2] - l[2]) < 0.08) l[3] = clamp(l[3] + c[3], -1, 1) || 0; else Y.push(c.slice()); }
    let w = 0; for (let k = 0; k + 1 < Y.length; k++) { w = clamp(w + Y[k][3], -1, 1); if (w === 0) continue; const A = Y[k], C = Y[k + 1]; out.quad(P3(A[1], ya), P3(C[1], ya), P3(C[2], yb), P3(A[2], yb)); } }
  // the trim's volume (kit): a collar 0.15 proud round the cut, BAND deep, its outer face and its front edge
  const PROUD = 0.15; out.mat = M.MARBLE; out.ea = WEATHERED; out.eb = 0;
  for (let [x0, y0, x1, y1, nx, ny] of segs) { if (hypot(x1 - x0, y1 - y0) < 1e-3) continue;
    { const l = hypot(x1 - x0, y1 - y0), ex = (x1 - x0) / l * PROUD, ey = (y1 - y0) / l * PROUD; x0 -= ex; y0 -= ey; x1 += ex; y1 += ey; } /* (a little longer at both ends: the corners close) */
    const ox = nx * PROUD, oy = ny * PROUD, zA = PYR_FACE(y0) + IN, zB = PYR_FACE(y1) + IN, zA2 = PYR_FACE(y0 + oy) + IN, zB2 = PYR_FACE(y1 + oy) + IN;
    out.quad(out.v(x0 + ox, y0 + oy, zA2, nx, ny, 0), out.v(x1 + ox, y1 + oy, zB2, nx, ny, 0), out.v(x1 + ox, y1 + oy, zB - BAND, nx, ny, 0), out.v(x0 + ox, y0 + oy, zA - BAND, nx, ny, 0)); // its outer face
    out.quad(out.v(x0, y0, zA - BAND, 0, 0, -1), out.v(x1, y1, zB - BAND, 0, 0, -1), out.v(x1 + ox, y1 + oy, zB - BAND, 0, 0, -1), out.v(x0 + ox, y0 + oy, zA - BAND, 0, 0, -1)); // its front edge
    out.quad(out.v(x0, y0, zA, ...nz), out.v(x1, y1, zB, ...nz), out.v(x1 + ox, y1 + oy, zB2, ...nz), out.v(x0 + ox, y0 + oy, zA2, ...nz)); } // its back, on the lid's plane
  out.mat = 0; out.ea = 0; return out.build();
}
function meshKitEntrance(lod) {
  const mb = new MB(1 << 15), n = lod ? 5 : 10, zf = -7;
  // a flat convex piece on the front, z0..z1 (any winding: made counter-clockwise)
  const fq = (pts, z0, z1) => {
    let a2 = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    extrude(mb, a2 < 0 ? pts.slice().reverse() : pts, 0, z0, z1);
  };
  // the same, pressed on a wall at z1: no back face (never seen)
  const fqd = (pts, z0, z1) => { let a2 = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    const Q = a2 < 0 ? pts.slice().reverse() : pts; extrude(mb, Q, 0, z0, z1, false); mb.poly(Q.map((p) => [p[0], p[1], z0]), [0, 0, -1], 1); };
  const disc = (x, y, r, z0, z1, back = true) => { const P = [], k = lod ? 10 : 20; for (let i = 0; i < k; i++) { const t = i / k * TAU; P.push([x + r * cos(t), y + r * sin(t)]); } (back ? fq : fqd)(P, z0, z1); };
  // a thin fillet from (x0, y0) to (x1, y1), w wide, on the face at z
  const fillet = (x0, y0, x1, y1, w, z) => { const dx = x1 - x0, dy = y1 - y0, l = hypot(dx, dy), ox = -dy / l * w / 2, oy = dx / l * w / 2; fqd([[x0 - ox, y0 - oy], [x1 - ox, y1 - oy], [x1 + ox, y1 + oy], [x0 + ox, y0 + oy]], z - 0.12, z); };
  unpaint(mb, M.TRIM); mb.box(-36.5, -0.4, -10.5, 36.5, 0.6, -0.75, 0.05); mb.box(-20.1, -0.4, -0.75, 20.1, 0.6, 60, 0.05); // plinth: in front, full width, up to the enclosure wall's footing (local z -0.7); along the corridor, under it to the pyramid (cut on its face)
  const OX = (y) => -34.6 + 8.2 * (y - 0.6) / 28.4; // the tower's battered outer face, x at height y (measured off the kit's front elevation)
  for (const sd of [-1, 1]) {
    const X = (x) => sd * x, P = (pts) => pts.map(([x, y]) => [X(x), y]), xs = (a, b) => [min(X(a), X(b)), max(X(a), X(b))];
    // the tower: outer face battered, inner face plumb
    { const NZ0 = -4.4, NZ1 = -1.8, NY = 17.5; paint(mb, WHITE); // (the niche's recess: z NZ0..NZ1, up to NY; see the frame below)
      fq(P([[-14, 0.6], [-14, 29], [OX(29), 29], [OX(0.6), 0.6]]), zf, NZ0); fq(P([[-14, 0.6], [-14, 29], [OX(29), 29], [OX(0.6), 0.6]]), NZ1, 8);
      fq(P([[-14, 0.6], [-14, 29], [OX(29), 29], [OX(NY), NY], [OX(NY), 0.6]]), NZ0, NZ1); }
    // thin sandstone fillets framing its face, the pendant
    mb.mat = M.MARBLE; mb.eb = mb.ea = 0;
    { // a continuous sandstone frame 0.3 proud, standing on the carved band (from its top, 5.4 m): the slanting edge, the
      // top, the inner edge; its ends cut level, so they sit flat on the band
      const yb = 5.4, F = (pts) => fqd(P(pts), zf - 0.12, zf), w = 0.28, xo = (y) => OX(y) + 1.4; /* (0.12 proud: under the red band, 0.16, which runs across it unbroken) */
      F([[xo(yb), yb], [xo(yb) + w, yb], [xo(27.9) + w, 27.9], [xo(27.9), 27.9]]); // the slanting edge, its foot cut level
      F([[xo(27.9), 27.9 - w], [-15.4 + w / 2, 27.9 - w], [-15.4 + w / 2, 27.9], [xo(27.9), 27.9]]); // the top
      F([[-15.4 - w / 2, yb], [-15.4 + w / 2, yb], [-15.4 + w / 2, 27.9], [-15.4 - w / 2, 27.9]]); // the inner edge
    }
    // the stone key: a tapered pendant from under the slab (the fire bowl's base) down the face, standing proud of the
    // cavetto; one on the front and one on the battered outer face
    { const key = (V) => { const c = V.reduce((p, q) => [p[0] + q[0] / 8, p[1] + q[1] / 8, p[2] + q[2] / 8], [0, 0, 0]);
        for (const f of [[4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) { const [p, q, r, u] = f.map((i) => V[i]); /* (no back: its first four corners lie on or in the wall) */
          let nn = vnorm(vcross([q[0] - p[0], q[1] - p[1], q[2] - p[2]], [u[0] - p[0], u[1] - p[1], u[2] - p[2]])); const m = [(p[0] + r[0]) / 2 - c[0], (p[1] + r[1]) / 2 - c[1], (p[2] + r[2]) / 2 - c[2]];
          if (nn[0] * m[0] + nn[1] * m[1] + nn[2] * m[2] < 0) nn = nn.map((v) => -v); mb.quad(mb.v(...p, ...nn), mb.v(...q, ...nn), mb.v(...r, ...nn), mb.v(...u, ...nn)); } };
      const y0 = 16.5, y1 = 30.58, w0 = 0.55, w1 = 1.05, d0 = 0.6, d1 = 0.75; /* (about as proud as the cavetto, as on the kit) */ mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED;
      const xc = X(-20.2); // on the front face (z = zf), out toward -z
      key([[xc - w0, y0, zf], [xc + w0, y0, zf], [xc - w1, y1, zf], [xc + w1, y1, zf], [xc - w0, y0, zf - d0], [xc + w0, y0, zf - d0], [xc - w1, y1, zf - d1], [xc + w1, y1, zf - d1]]);
      const zc = 0.5, o = -sd, F = (y, z, d) => [X(OX(y)) + o * d, y, z]; // on the battered outer face, out away from the building
      { // on the outer face it hangs plumb from the slab (its outer face vertical, just inside the slab's edge) and ends
        // where the battered wall comes out to meet it
        const xv = 27.6, yb = 0.6 + (34.6 - xv - 0.1) / 8.2 * 28.4, V = (y, z, out) => [X(out ? -xv : OX(y) + 0.15), y, z]; /* (its back set into the wall: no shared plane) */
        key([V(yb, zc - 0.8, 0), V(yb, zc + 0.8, 0), V(y1, zc - w1, 0), V(y1, zc + w1, 0), V(yb, zc - 0.8, 1), V(yb, zc + 0.8, 1), V(y1, zc - w1, 1), V(y1, zc + w1, 1)]); }
      { // low on the outer face, near its front: a tall recess in a sandstone frame (jambs, a lintel), coursed stone at
        // its back; all leaning with the batter
        const G = (y, z, d) => [X(OX(y)) + o * d, y, z], blk = (ya, yb2, za, zb, d0b, d1b) => key([G(ya, za, d0b), G(ya, zb, d0b), G(yb2, za, d0b), G(yb2, zb, d0b), G(ya, za, d1b), G(ya, zb, d1b), G(yb2, za, d1b), G(yb2, zb, d1b)]);
        const fz0 = -5.6, fz1 = -0.6, jw = 1.2, yt = 17.5; /* (jambs fz0..fz0+jw and fz1-jw..fz1: the recess between them, -4.4..-1.8) */
        mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED; blk(0.6, yt, fz0, fz0 + jw, -0.15, 0.9); blk(0.6, yt, fz1 - jw, fz1, -0.15, 0.9); blk(yt, yt + 1.4, fz0 - 0.3, fz1 + 0.3, -0.15, 1.0); // jambs, lintel
        // the rest of the outer face: the carved band at its foot and the striped red band, a sandstone fillet up its
        // front edge and along its top (all on the batter; not across the niche)
        for (const [za, zb] of [[zf, fz0], [fz1, 8]]) { /* (from the corner, where the front's band ends, round to the back) */
          mb.eb = GLYPH; mb.ea = 12; blk(0.6, 5.4, za, zb, -0.05, 0.16); mb.eb = mb.ea = 0;
          paint(mb, RED); blk(8, 8.7, za, zb, -0.05, 0.16);
          if (!lod) for (let z = za + 0.3, i = 0; z < zb - 0.2; z += 0.55, i++) { paint(mb, i & 1 ? BLUE : OCHRE); blk(8.05, 8.65, z - 0.08, z + 0.08, 0.1, 0.19); }
        }
        mb.mat = M.MARBLE; mb.eb = mb.ea = 0; blk(0.8, 27.9, zf + 0.25, zf + 0.53, -0.05, 0.12); blk(27.6, 27.9, zf + 0.25, 7.6, -0.05, 0.12); blk(0.8, 27.9, 7.32, 7.6, -0.05, 0.12);
        mb.ea = WEATHERED; }
      // its back face (kit): the carved band at its foot and the striped red band, out from the side wall to the corner
      // (past it by their depth, capping the side bands), and a sandstone frame: up the slanting edge, under the
      // cornice, down beside the side wall; pieces on the face at z 8, facing back
      { const zb = 8, fqb = (pts, d) => { let a2 = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
          const Q = a2 < 0 ? pts.slice().reverse() : pts; extrude(mb, Q, 0, zb, zb + d, false); mb.poly(Q.map((p) => [p[0], p[1], zb + d]), [0, 0, 1], 1); };
        const xi = -19.5, xo2 = (y) => OX(y) + 1.4, w = 0.28;
        mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 12; fqb(P([[xi, 0.6], [xi, 5.4], [OX(5.4) - 0.16, 5.4], [OX(0.6) - 0.16, 0.6]]), 0.16); mb.eb = mb.ea = 0;
        paint(mb, RED); fqb(P([[xi, 8], [xi, 8.7], [OX(8.7) - 0.16, 8.7], [OX(8) - 0.16, 8]]), 0.16);
        if (!lod) for (let x = OX(8.4) + 0.3, i = 0; x < xi - 0.3; x += 0.55, i++) { paint(mb, i & 1 ? BLUE : OCHRE); fqb(P([[x - 0.08, 8.05], [x + 0.08, 8.05], [x + 0.08, 8.65], [x - 0.08, 8.65]]), 0.2); }
        mb.mat = M.MARBLE; mb.eb = 0; mb.ea = 0;
        fqb(P([[xo2(5.4), 5.4], [xo2(5.4) + w, 5.4], [xo2(27.9) + w, 27.9], [xo2(27.9), 27.9]]), 0.12); // the slanting edge
        fqb(P([[xo2(27.9), 27.9 - w], [xi - 0.4, 27.9 - w], [xi - 0.4, 27.9], [xo2(27.9), 27.9]]), 0.12); // under the cornice
        fqb(P([[xi - 0.4 - w, 5.4], [xi - 0.4, 5.4], [xi - 0.4, 27.9], [xi - 0.4 - w, 27.9]]), 0.12); } // beside the side wall
      mb.ea = 0; }
    // carved band at the foot, the striped red band above it
    mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 12; fq(P([[-14, 0.6], [-14, 5.4], [OX(5.4) - 0.16, 5.4], [OX(0.6) - 0.16, 0.6]]), zf - 0.16, zf); /* (out past the corner by its own depth: it caps the side band's end) */ /* (out to the corner, meeting the side's band) */ mb.eb = mb.ea = 0;
    paint(mb, RED); fqd(P([[-14, 8], [-14, 8.7], [OX(8.7) - 0.16, 8.7], [OX(8) - 0.16, 8]]), zf - 0.16, zf);
    { // round the inside corner: the bands carried along the tower's side that faces the wall, back to the wall's face
      const [a0, b0] = xs(-14, -13.84); mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 12; mb.box(a0, 0.6, zf - 0.16, b0, 5.4, -5.36, 0); mb.eb = mb.ea = 0;
      paint(mb, RED); mb.box(a0, 8, zf - 0.16, b0, 8.7, -5.36, 0);
      if (!lod) for (let z = zf + 0.15, i = 0; z < -5.5; z += 0.55, i++) { paint(mb, i & 1 ? BLUE : OCHRE); const [c, e] = xs(-13.84, -13.78); mb.box(c, 8.05, z - 0.08, e, 8.65, z + 0.08, 0); } }
    if (!lod) for (let x = OX(8.4) + 0.3, i = 0; x < -14.2; x += 0.55, i++) { paint(mb, i & 1 ? BLUE : OCHRE); const [a, b] = xs(x - 0.08, x + 0.08); fqd([[a, 8.05], [b, 8.05], [b, 8.65], [a, 8.65]], zf - 0.2, zf - 0.15); /* (on the band's face, which stands 0.16 proud) */ }
    // cavetto (striped, a gilt torus under it) and the overhanging slab
    const [g0, g1] = xs(-26.8, -13.7); mb.mat = M.GOLD; mb.eb = mb.ea = 0; mb.box(g0, 28.75, zf - 0.35, g1, 29.1, 8.3, 0.04);
    paint(mb, RED); frustum(mb, X(-20.2), 0.6, 6.4, 7.65, 7.0, 8.25, 29.1, 30.6, false);
    if (!lod) { const cx = X(-20.2), cz = 0.6, h0x = 6.4, h1x = 7.0, h0z = 7.65, h1z = 8.25, y0 = 29.1, y1 = 30.6, e = 0.03, hw = 0.07; // stripes on the cavetto's four faces, lying on them
      const strip = (A0, A1, B0, B1, n, k) => { paint(mb, k & 1 ? BLUE : OCHRE); mb.quad(mb.v(...A0, ...n), mb.v(...A1, ...n), mb.v(...B1, ...n), mb.v(...B0, ...n)); };
      for (const sz of [-1, 1]) { const n = vnorm([0, (h1z - h0z) / (y1 - y0), sz]); let i = 0; for (let u = -0.95; u <= 0.95; u += 0.08, i++) { const z0 = cz + sz * (h0z + e), z1 = cz + sz * (h1z + e);
        strip([cx + u * h0x - hw, y0, z0], [cx + u * h1x - hw, y1, z1], [cx + u * h0x + hw, y0, z0], [cx + u * h1x + hw, y1, z1], n, i); } }
      for (const sx of [-1, 1]) { const n = vnorm([sx, (h1x - h0x) / (y1 - y0), 0]); let i = 0; for (let u = -0.96; u <= 0.96; u += 0.065, i++) { const x0 = cx + sx * (h0x + e), x1 = cx + sx * (h1x + e);
        strip([x0, y0, cz + u * h0z - hw], [x1, y1, cz + u * h1z - hw], [x0, y0, cz + u * h0z + hw], [x1, y1, cz + u * h1z + hw], n, i); } } }
    const [s0, s1] = xs(-27.9, -12.6); unpaint(mb, M.TRIM); mb.box(s0, 30.6, zf - 1.1, s1, 31.5, 9.2, 0.05);
    { const cx = X(-20.2), cz = 0.6; // four diagonal marks on the slab round the bowl, the bowl standing on it
      mb.mat = M.BARK; mb.eb = mb.ea = 0; for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const P = (u, v) => [cx + sx * u, 31.53, cz + sz * v]; mb.poly([P(2.9, 3.6), P(3.6, 2.9), P(5.3, 4.6), P(4.6, 5.3)], [0, 1, 0], 1); }
      fireBowl(mb, cx, 31.5, cz, 2.8, lod ? 8 : 14); }
    /* (no buttress behind the tower: the kit has nothing there, kit mesh) */
    // plain walls between the towers and the arch, with ochre cartouche slots; a taller block behind
    paint(mb, WHITE); let [a, b] = xs(-14, -8.3); mb.box(a, 0.6, -5.17, b, 27, 6.5, 0); /* (kit mesh: one flat top at 27 m from the front wall back to z 6.5) */ /* (its face is the panel below, with the slots) */  /* (narrowing in steps as they run back beside the hall) */ // stepping up to the arch
    { // two slots sunk in the forward wall, rounded at both ends, gilt at the back (a sandstone lip round them)
      const xc = X(-11.15), rw = 0.5, slot = (y0, y1) => { const P = [], k = lod ? 4 : 8;
          for (let i = 0; i <= k; i++) { const an = PI * i / k; P.push([xc + rw * cos(an), y1 - rw + rw * sin(an)]); } for (let i = 0; i <= k; i++) { const an = PI + PI * i / k; P.push([xc + rw * cos(an), y0 + rw + rw * sin(an)]); } return P; };
      for (const [y0, y1] of [[15, 21], [10, 12.8]]) { const S = slot(y0, y1); mb.mat = M.GOLD; mb.eb = mb.ea = 0; mb.poly(S.map(([x, y]) => [x, y, -5.21]), [0, 0, -1], 1); /* the gilt back, 0.15 deep */
        unpaint(mb, M.TRIM); for (let i = 0; i < S.length; i++) { const p = S[i], q = S[(i + 1) % S.length], nx = -(q[1] - p[1]), ny = q[0] - p[0], l = hypot(nx, ny) || 1; /* the slot's sides, facing in */
          { const mx = (p[0] + q[0]) / 2 - xc, my = (p[1] + q[1]) / 2, cy = clamp(my, y0 + rw, y1 - rw), sg = (nx * mx + ny * (my - cy)) > 0 ? -1 : 1; /* (inward: toward the slot's spine) */ const flip = sg; /* (build() flips a quad to match its normals) */ mb.quad(mb.v(p[0], p[1], -5.36, sg * nx / l, sg * ny / l, 0), mb.v(q[0], q[1], -5.36, sg * nx / l, sg * ny / l, 0), mb.v(q[0], q[1], -5.21, sg * nx / l, sg * ny / l, 0), mb.v(p[0], p[1], -5.21, sg * nx / l, sg * ny / l, 0)); } /* facing into the slot */ } }
      // the wall's face round the slots, a hair proud of the box (the box's face shows through the slots as their back)
      paint(mb, WHITE); { const [a0, b0] = xs(-14, -8.3), z = -5.36; const ring = (y0, y1) => slot(y0, y1);
        mb.quad(mb.v(a0, 0.6, z, 0, 0, -1), mb.v(b0, 0.6, z, 0, 0, -1), mb.v(b0, 9.6, z, 0, 0, -1), mb.v(a0, 9.6, z, 0, 0, -1));
        mb.quad(mb.v(a0, 13.2, z, 0, 0, -1), mb.v(b0, 13.2, z, 0, 0, -1), mb.v(b0, 14.6, z, 0, 0, -1), mb.v(a0, 14.6, z, 0, 0, -1));
        mb.quad(mb.v(a0, 21.4, z, 0, 0, -1), mb.v(b0, 21.4, z, 0, 0, -1), mb.v(b0, 26.5, z, 0, 0, -1), mb.v(a0, 26.5, z, 0, 0, -1));
        mb.quad(mb.v(a0, 26.5, z, 0, 1, 0), mb.v(b0, 26.5, z, 0, 1, 0), mb.v(b0, 26.5, -5.17, 0, 1, 0), mb.v(a0, 26.5, -5.17, 0, 1, 0)); /* the strip of top between the panel and the box */
        for (const x of [a0, b0]) mb.quad(mb.v(x, 0.6, z, x === a0 ? -1 : 1, 0, 0), mb.v(x, 26.5, z, x === a0 ? -1 : 1, 0, 0), mb.v(x, 26.5, -5.17, x === a0 ? -1 : 1, 0, 0), mb.v(x, 0.6, -5.17, x === a0 ? -1 : 1, 0, 0)); /* its ends */
        const L0 = min(xc - rw, xc + rw), R0 = max(xc - rw, xc + rw);
        // round the slots' rounded ends: the panel filled up to each arc (a fan from the corners of its box)
        for (const [y0, y1] of [[10, 12.8], [15, 21]]) for (const [yc, sgn, yb] of [[y1 - rw, 1, y1 + 0.4], [y0 + rw, -1, y0 - 0.4]]) {
          const k = lod ? 4 : 8, arc = []; for (let i = 0; i <= k; i++) { const an = PI * i / k; arc.push([xc + rw * cos(an), yc + sgn * rw * sin(an)]); }
          for (let i = 0; i < k; i++) { const p = arc[i], q = arc[i + 1], c = [p[0] + q[0] < 2 * xc ? L0 : R0, yb]; mb.poly([[c[0], c[1], z], [p[0], p[1], z], [q[0], q[1], z]], [0, 0, -1], 1); }
          mb.poly([[L0, yb, z], [L0, yc, z], [arc[k][0], arc[k][1], z]], [0, 0, -1], 1); mb.poly([[R0, yb, z], [arc[0][0], arc[0][1], z], [R0, yc, z]], [0, 0, -1], 1);
          mb.poly([[L0, yb, z], [arc[k / 2][0], arc[k / 2][1], z], [R0, yb, z]], [0, 0, -1], 1); }
        for (const [y0, y1] of [[9.6, 13.2], [14.6, 21.4]]) { mb.quad(mb.v(a0, y0, z, 0, 0, -1), mb.v(L0, y0, z, 0, 0, -1), mb.v(L0, y1, z, 0, 0, -1), mb.v(a0, y1, z, 0, 0, -1)); /* (beside the slot, full height) */
          mb.quad(mb.v(R0, y0, z, 0, 0, -1), mb.v(b0, y0, z, 0, 0, -1), mb.v(b0, y1, z, 0, 0, -1), mb.v(R0, y1, z, 0, 0, -1)); } } }
    mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 12; [a, b] = xs(-14, -8.3); mb.box(a, 0.6, -5.5, b, 5.4, -5.3, 0); mb.eb = mb.ea = 0; // the carved band at its foot
    paint(mb, RED); fqd([[a, 8], [b, 8], [b, 8.7], [a, 8.7]], -5.52, -5.3);
    if (!lod) for (let x = -13.8, i = 0; x < -8.5; x += 0.55, i++) { paint(mb, i & 1 ? BLUE : OCHRE); const [c, e] = xs(x - 0.08, x + 0.08); fqd([[c, 8.05], [e, 8.05], [e, 8.65], [c, 8.65]], -5.57, -5.5); } // its stripes
    // the hall's side blocks behind the towers
    { const X0 = min(X(-19.5), X(-10.4)), X1 = max(X(-19.5), X(-10.4)), xo = sd < 0 ? X1 : X0, so = -sd; /* (the outer face: the one away from the hall) */
      // (kit mesh) a block whose top slopes down toward the pyramid, 0.35 m per m from 26.7 m behind the tower; along
      // the hall a strip 2.5 m wide standing 3 m higher, sloping alike; both run into the pyramid (cut on its face)
      const ytop = (z) => min(27, 29.275 - 0.35 * z), /* (kit mesh: flat at 27 to z 6.5, then down 0.35 m per m) */ xh = sd < 0 ? X0 : X1, xv = X(-8.0); /* (xh: the block's face toward the hall) */ paint(mb, WHITE);
      { // the block (from the wall behind the front: it fills the corner by the tower): its top and back end; its foot,
        // its front (against the wall) and its face toward the hall (behind the strip) are never seen; its outer face
        // built round the recess below
        const Qb = [[2, 0.6], [60, 0.6], [60, ytop(60)], [6.5, 27], [2, 27]];
        for (const i of [1, 2, 3]) { const a = Qb[i], c = Qb[i + 1], ez = c[0] - a[0], ey = c[1] - a[1], l = hypot(ez, ey) || 1, nn = [0, -ez / l, ey / l];
          mb.quad(mb.v(X0, a[1], a[0], ...nn), mb.v(X0, c[1], c[0], ...nn), mb.v(X1, c[1], c[0], ...nn), mb.v(X1, a[1], a[0], ...nn)); }
        const xi2 = sd < 0 ? X0 : X1; mb.poly(Qb.map(([z, y]) => [xi2, y, z]), [sd, 0, 0], 1); } /* (its face toward the hall: hidden by the strip, but the lid where the pyramid cuts needs its outline) */
      { // (its face toward the hall stands inside the hall's wall, and its foot on the ground: neither is built; the hall's
        // wall behind it is not built either, so the strip and the hall read as one block where the pyramid cuts them)
        const Q = [[3.5, 0.6], [3.5, 30], [6.5, 30], [60, ytop(60) + 3], [60, 0.6]], x0 = min(xh, xv), x1 = max(xh, xv); /* (kit mesh: its front a block at z 3.5) */
        for (let i = 0; i + 1 < Q.length; i++) { const a = Q[i], b = Q[i + 1], ez = b[0] - a[0], ey = b[1] - a[1], l = hypot(ez, ey) || 1, nn = [0, ez / l, -ey / l];
          mb.quad(mb.v(x0, a[1], a[0], ...nn), mb.v(x0, b[1], b[0], ...nn), mb.v(x1, b[1], b[0], ...nn), mb.v(x1, a[1], a[0], ...nn)); }
        const xo2 = sd < 0 ? x1 : x0; mb.poly(Q.map(([z, y]) => [xo2, y, z]), [-sd, 0, 0], 1); } /* (from the wall's step: the next step up toward the arch) */
      // a piece standing out of the outer face, d proud: its outline Q ([z, y], convex), its sides and its face (no back)
      const proud = (Q, d) => { const x1 = xo + so * d; let a2 = 0; for (let i = 0; i < Q.length; i++) { const p = Q[i], q = Q[(i + 1) % Q.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
        const R = a2 < 0 ? Q.slice().reverse() : Q; for (let i = 0; i < R.length; i++) { const a = R[i], c = R[(i + 1) % R.length], ez = c[0] - a[0], ey = c[1] - a[1], l = hypot(ez, ey) || 1, nn = [0, -ez / l, ey / l];
          mb.quad(mb.v(xo, a[1], a[0], ...nn), mb.v(xo, c[1], c[0], ...nn), mb.v(x1, c[1], c[0], ...nn), mb.v(x1, a[1], a[0], ...nn)); }
        mb.poly(R.map(([z, y]) => [x1, y, z]), [so, 0, 0], 1); };
      // (kit) the lines are thin fillets of the frame's stone, 0.22 wide, a little proud
      const f = (z0, y0, z1, y1, w = 0.22) => { const dz = z1 - z0, dy = y1 - y0, l = hypot(dz, dy), ez = dz / l * w / 2, ey = dy / l * w / 2, oz = -dy / l * w / 2, oy = dz / l * w / 2;
        proud([[z0 - ez - oz, y0 - ey - oy], [z1 + ez - oz, y1 + ey - oy], [z1 + ez + oz, y1 + ey + oy], [z0 - ez + oz, y0 - ey + oy]], 0.07); };
      // a frame of fillets along a polyline (closed or not), its corners mitred: each piece ends on the corner's bisector
      const fr = (L, closed, w = 0.22) => { const n = L.length, E = []; for (let i = 0; i < (closed ? n : n - 1); i++) { const a = L[i], b = L[(i + 1) % n], dz = b[0] - a[0], dy = b[1] - a[1], l = hypot(dz, dy); E.push([a, b, [-dy / l * w / 2, dz / l * w / 2]]); }
        const meet = (e1, e2, s) => { // where the offset lines (side s) of two edges cross
          const p = [e1[0][0] + e1[2][0] * s, e1[0][1] + e1[2][1] * s], r = [e1[1][0] - e1[0][0], e1[1][1] - e1[0][1]], q = [e2[0][0] + e2[2][0] * s, e2[0][1] + e2[2][1] * s], u = [e2[1][0] - e2[0][0], e2[1][1] - e2[0][1]];
          const den = r[0] * u[1] - r[1] * u[0]; if (abs(den) < 1e-9) return [e1[1][0] + e1[2][0] * s, e1[1][1] + e1[2][1] * s]; const k = ((q[0] - p[0]) * u[1] - (q[1] - p[1]) * u[0]) / den; return [p[0] + r[0] * k, p[1] + r[1] * k]; };
        E.forEach((e, i) => { const pv = closed ? E[(i - 1 + E.length) % E.length] : E[i - 1], nx = closed ? E[(i + 1) % E.length] : E[i + 1];
          const c0 = (s) => (pv ? meet(pv, e, s) : [e[0][0] + e[2][0] * s, e[0][1] + e[2][1] * s]), c1 = (s) => (nx ? meet(e, nx, s) : [e[1][0] + e[2][0] * s, e[1][1] + e[2][1] * s]);
          proud([c0(-1), c1(-1), c1(1), c0(1)], 0.07); }); };
      // its outer face (kit): a rectangle by the tower, a sandstone panel, a triangle pointing to the pyramid
      mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED; fr([[17.75, 0.6], [17.75, ytop(17.75) - 0.8], [8.8, ytop(8.8) - 0.8], [8.8, 0.6]], false); /* (kit: 0.8 off the top, the front edge and the recess's frame alike, down to the ground) */
      { // the triangle (kit): its three sides parallel to what bounds it - the recess's frame, the sloping top, the
        // pyramid's face (its trim) - and the same 0.8 off each
        const m = 0.8, za = 21.9 + 0.15 + m, top = (z) => ytop(z) - m * Math.hypot(1, 0.35), hyp = (y) => PYR_FACE(y) + 0.1 - 0.6 - m * Math.hypot(1, PYR_FACE(1) - PYR_FACE(0));
        let yb = 0; for (let i = 0; i < 40; i++) yb = top(hyp(yb)); const B = [hyp(yb), yb], A = [za, top(za)]; let yc2 = 0; for (let i = 0; i < 40; i++) yc2 = yc2 + (za - hyp(yc2)) / (PYR_FACE(1) - PYR_FACE(0)); const C = [za, yc2];
        fr([A, B, C], true); }
      mb.ea = 0;
      // the outer face round a recess (kit): a channel 3.2 wide and 0.4 deep from the ground to 0.8 under the top, its
      // top end sloping with the top, carved sandstone at its back
      { const z0 = 18.7, z1 = 21.9, D = 0.4, yf = 2.4, /* (its floor just above where the pyramid cuts the face) */ yc = (z) => ytop(z) - 0.8, xb = xo - so * D, face = (Q) => mb.poly(Q.map(([z, y]) => [xo, y, z]), [so, 0, 0], 1);
        paint(mb, WHITE); face([[2, 0.6], [z0, 0.6], [z0, ytop(z0)], [6.5, 27], [2, 27]]); face([[z1, 0.6], [60, 0.6], [60, ytop(60)], [z1, ytop(z1)]]); face([[z0, yc(z0)], [z1, yc(z1)], [z1, ytop(z1)], [z0, ytop(z0)]]); face([[z0, 0.6], [z1, 0.6], [z1, yf], [z0, yf]]);
        mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED; const W = (p, q, nn) => mb.quad(mb.v(xb, p[1], p[0], ...nn), mb.v(xo, p[1], p[0], ...nn), mb.v(xo, q[1], q[0], ...nn), mb.v(xb, q[1], q[0], ...nn));
        W([z0, yf], [z0, yc(z0)], [0, 0, 1]); W([z1, yf], [z1, yc(z1)], [0, 0, -1]); W([z0, yc(z0)], [z1, yc(z1)], vnorm([0, -1, -0.35])); // its sides and its sloping top
        W([z1, yf], [z0, yf], [0, 1, 0]); // its floor
        mb.eb = GLYPH; mb.ea = 12; mb.poly([[xb, yf, z0], [xb, yf, z1], [xb, yc(z1), z1], [xb, yc(z0), z0]], [so, 0, 0], 1); mb.eb = mb.ea = 0; // its back
        mb.mat = M.MARBLE; mb.ea = WEATHERED; const g = 0.15; fr([[z0 - g, yf - g], [z1 + g, yf - g], [z1 + g, yc(z1 + g) + g], [z0 - g, yc(z0 - g) + g]], true); mb.ea = 0; } // its frame, round its edge
    }
  }
  // the doorway's outline (kit): straight sides, a chamfered top: [hw at the foot .. ys], up to a flat top tw wide at ht
  const hexo = (hw, ys, ht, tw) => [[hw, 0.6], [hw, ys], [tw, ht], [-tw, ht], [-hw, ys], [-hw, 0.6]];
  // a flat face (normal along z) filling an x-symmetric outline less an x-symmetric hole, in horizontal bands; R and H
  // are their right halves climbing (x >= 0); above the hole's top the band runs right across
  const plateHole = (R, Hh, z, nz) => { const xat = (P, y) => { if (y <= P[0][1]) return P[0][0]; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; if (y >= a[1] && y <= b[1]) return b[1] - a[1] < 1e-6 ? a[0] : a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); } return 0; };
    const top = Hh[Hh.length - 1][1], ys = [...new Set([...R.map((p) => p[1]), ...Hh.map((p) => p[1])])].filter((y) => y >= R[0][1] && y <= R[R.length - 1][1]).sort((p, q) => p - q);
    const q4 = (A2, B2, C2, D2) => mb.quad(mb.v(A2[0], A2[1], z, 0, 0, nz), mb.v(B2[0], B2[1], z, 0, 0, nz), mb.v(C2[0], C2[1], z, 0, 0, nz), mb.v(D2[0], D2[1], z, 0, 0, nz));
    for (let i = 0; i + 1 < ys.length; i++) { const a = ys[i], b = ys[i + 1]; if (b - a < 1e-6) continue; const oa = xat(R, a), ob = xat(R, b);
      if (a >= top - 1e-6) { q4([-oa, a], [oa, a], [ob, b], [-ob, b]); continue; }
      const ha = xat(Hh, a), hb = xat(Hh, b); q4([-oa, a], [-ha, a], [-hb, b], [-ob, b]); q4([ha, a], [oa, a], [ob, b], [hb, b]); } };
  const DOOR_F = hexo(1.92, 20.85, 25.4, 0.35), DOOR_B = hexo(1.85, 20.5, 23.7, 0.3), half3 = (P) => P.slice(0, 3); /* (front and back openings, kit) */
  // a solid from rings of points (convex, same count): its sides between rings, its ends closed
  const ringLoft = (R) => { const ctr = (P) => P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length, s[2] + p[2] / P.length], [0, 0, 0]);
    for (let i = 0; i + 1 < R.length; i++) { const A2 = R[i], B2 = R[i + 1], c = ctr([...A2, ...B2]);
      for (let k = 0; k < A2.length; k++) { const p0 = A2[k], p1 = A2[(k + 1) % A2.length], p2 = B2[(k + 1) % A2.length], p3 = B2[k];
        let nn = vnorm(vcross([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]])); const m = ctr([p0, p1, p2, p3]);
        if (nn[0] * (m[0] - c[0]) + nn[1] * (m[1] - c[1]) + nn[2] * (m[2] - c[2]) < 0) nn = nn.map((v) => -v); mb.quad(mb.v(...p0, ...nn), mb.v(...p1, ...nn), mb.v(...p2, ...nn), mb.v(...p3, ...nn)); } }
    const end = (P, Q) => { const c0 = ctr(P), c1 = ctr(Q), nn = vnorm([c0[0] - c1[0], c0[1] - c1[1], c0[2] - c1[2]]); mb.poly(P, nn, 1); };
    end(R[0], R[1]); end(R[R.length - 1], R[R.length - 2]); };
  // the arch: a proud sandstone frame, a white panel within, nested door frames, the pointed doorway
  // the frame: a band 1.5 wide standing 1.5 proud of the white panel (z -7.2), as a ring between the outer and the
  // inner outline: its front face (quads between the two outlines), its outer and inner reveals
  { /* the kit's outline (measured on its mesh): plumb to 36, curving in, a short flat top at 48.9 - not pointed */
    const OR = [[8.45, 0.6], [8.45, 36], [7.6, 38.2], [6.5, 40.5], [5.6, 42.6], [4.5, 44.6], [3.35, 46.3], [2.6, 47.6], [2.1, 48.4], [1.6, 48.9]];
    const O = [...OR, ...OR.slice().reverse().map(([x, y]) => [-x, y])];
    const inset = (P, d) => P.map((p, i) => { const a = P[(i - 1 + P.length) % P.length], b = P[(i + 1) % P.length], e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
      const l1 = hypot(...e1) || 1, l2 = hypot(...e2) || 1, n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2], k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
      return [p[0] + (n1[0] + n2[0]) / k * d, p[1] + (n1[1] + n2[1]) / k * d]; });
    const I = inset(O, 1.4); I[0][1] = 0.6; I[I.length - 1][1] = 0.6; const zp = -7.2, zf2 = -7.75; /* (0.55 proud of the panel, as on the kit) */
    paint(mb, WHITE); plateHole([...I.slice(0, OR.length), [0, I[OR.length - 1][1]]], half3(DOOR_F), zp, -1); // the panel, the doorway cut through it
    mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED; const m = min(O.length, I.length);
    for (let i = 0; i + 1 < m; i++) mb.quad(mb.v(O[i][0], O[i][1], zf2, 0, 0, -1), mb.v(O[i + 1][0], O[i + 1][1], zf2, 0, 0, -1), mb.v(I[i + 1][0], I[i + 1][1], zf2, 0, 0, -1), mb.v(I[i][0], I[i][1], zf2, 0, 0, -1));
    const reveal = (R, z0, z1, out) => { for (let i = 0; i + 1 < R.length; i++) { const p = R[i], q = R[i + 1], ex = q[0] - p[0], ey = q[1] - p[1], l = hypot(ex, ey) || 1, nx = ey / l * out, ny = -ex / l * out;
      mb.quad(mb.v(p[0], p[1], z0, nx, ny, 0), mb.v(q[0], q[1], z0, nx, ny, 0), mb.v(q[0], q[1], z1, nx, ny, 0), mb.v(p[0], p[1], z1, nx, ny, 0)); } };
    reveal(O, zf2, -6.6, 1); reveal(I, zf2, zp, -1);
    plateHole([...OR, [0, OR[OR.length - 1][1]]], half3(DOOR_F), -6.6, 1); // the frame's back, closing it against the hall
    mb.ea = 0; }
  mb.mat = M.MARBLE; mb.eb = mb.ea = 0;
  for (const [hx, ht] of [[6.15, 30.7], [3.65, 27.45]]) { const w2 = 0.22; /* (kit front elevation: thin lines 0.22 wide) */ fqd([[-hx, 0.6], [-hx + w2, 0.6], [-hx + w2, ht], [-hx, ht]], -7.32, -7.2); fqd([[hx - w2, 0.6], [hx, 0.6], [hx, ht], [hx - w2, ht]], -7.32, -7.2); fqd([[-hx, ht - w2], [hx, ht - w2], [hx, ht], [-hx, ht]], -7.32, -7.2); }
  // the doorway (kit front elevation): a tall opening, straight sides and a chamfered top (straight slopes up to a short
  // flat top), in a brown band 0.75 wide standing 0.3 proud; open: a dark passage behind
  {
    const O = hexo(2.67, 21.1, 26.1, 0.85), I = DOOR_F, zf = -7.5, zp = -7.2;
    mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED;
    for (let i = 0; i + 1 < O.length; i++) mb.quad(mb.v(O[i][0], O[i][1], zf, 0, 0, -1), mb.v(O[i + 1][0], O[i + 1][1], zf, 0, 0, -1), mb.v(I[i + 1][0], I[i + 1][1], zf, 0, 0, -1), mb.v(I[i][0], I[i][1], zf, 0, 0, -1));
    const rv = (R, out) => { for (let i = 0; i + 1 < R.length; i++) { const p = R[i], q = R[i + 1], ex = q[0] - p[0], ey = q[1] - p[1], l = hypot(ex, ey) || 1, nx = ey / l * out, ny = -ex / l * out;
      mb.quad(mb.v(p[0], p[1], zf, nx, ny, 0), mb.v(q[0], q[1], zf, nx, ny, 0), mb.v(q[0], q[1], zp, nx, ny, 0), mb.v(p[0], p[1], zp, nx, ny, 0)); } };
    rv(O, 1); rv(I, -1); mb.ea = 0;
    mb.mat = M.PAVE; mb.box(-1.85, 0.55, -7.5, 1.85, 0.62, 52, 0); /* (the passage's floor, right through to the back) */ } // its threshold running in
  // in the head: the tapered drop, the two bars, a gilt disc with three points round it; a stone disc on the apex
  mb.mat = M.MARBLE; mb.eb = mb.ea = 0;
  // three keys in the head, one shape each: a tapering block 1.2 wide where it starts (by the sun) widening to 2.2 at
  // the frame, rising as a ramp from 0.1 to the frame's 0.55 where it meets it; an inset line down its middle
  { const key = (A0, A1, along, across, h0, h1, sh) => { /* h0, h1: half widths at the start and the end; sh: the stripe's half width */ // A0: the start's centre, A1: the end's centre (on the frame), across: unit
      const z0 = -7.3, z1 = -7.72, zb = -7.2, /* (the end just behind the frame's face) */ c = (p, h, s) => [p[0] + across[0] * h * s, p[1] + across[1] * h * s];
      const F = [[...c(A0, h0, -1), z0], [...c(A1, h1, -1), z1], [...c(A1, h1, 1), z1], [...c(A0, h0, 1), z0]], Bk = F.map(([x, y]) => [x, y, zb]);
      const face = (Q) => { let nn = vnorm(vcross([Q[1][0] - Q[0][0], Q[1][1] - Q[0][1], Q[1][2] - Q[0][2]], [Q[3][0] - Q[0][0], Q[3][1] - Q[0][1], Q[3][2] - Q[0][2]]));
        const m = Q.reduce((s, q) => [s[0] + q[0] / 4, s[1] + q[1] / 4, s[2] + q[2] / 4], [0, 0, 0]), ce = [(A0[0] + A1[0]) / 2, (A0[1] + A1[1]) / 2, -7.4];
        if (nn[0] * (m[0] - ce[0]) + nn[1] * (m[1] - ce[1]) + nn[2] * (m[2] - ce[2]) < 0) nn = nn.map((v) => -v); mb.quad(mb.v(...Q[0], ...nn), mb.v(...Q[1], ...nn), mb.v(...Q[2], ...nn), mb.v(...Q[3], ...nn)); };
      mb.mat = M.TRIM; mb.eb = 0; mb.ea = WEATHERED; face(F); face([F[0], F[1], Bk[1], Bk[0]]); face([F[3], F[2], Bk[2], Bk[3]]); face([F[0], F[3], Bk[3], Bk[0]]); mb.ea = 0;
      mb.mat = M.MARBLE; const L = (u, s) => { const p = [A0[0] + (A1[0] - A0[0]) * u, A0[1] + (A1[1] - A0[1]) * u], z = z0 + (z1 - z0) * u - 0.02; return [p[0] + across[0] * sh * s, p[1] + across[1] * sh * s, z]; };
      const Ln = [L(0, -1), L(0.995, -1), L(0.995, 1), L(0, 1)]; face(Ln); }; /* the stripe of the frame's stone, the whole length */
    // (kit front elevation: the top one 2.6 wide at its foot to 3.7 at the frame, a stripe 0.85 wide; the side ones
    // 2.7 tall by the sun to 4.0 at the frame, a stripe 0.36 tall)
    key([0, 40.2], [0, 48.25], [0, 1], [1, 0], 1.3, 1.84, 0.42);
    for (const sx of [-1, 1]) key([sx * 2.03, 34.3], [sx * 7.25, 34.35], [sx, 0], [0, 1], 1.35, 2.0, 0.18); }
  // the sun (kit): a disc, two three-pointed stars with curved sides above it, a four-pointed one below it, between
  // the side keys
  mb.mat = M.GOLD; mb.eb = mb.ea = 0; disc(0, 37.4, 0.93, -7.47, -7.2, false);
  { const star = (cx, cy, R, tips) => { const T = tips.map((d) => d * PI / 180).sort((p, q) => p - q), P = [], k = lod ? 3 : 7;
      for (let i = 0; i < T.length; i++) { const a0 = T[i], a1 = i + 1 < T.length ? T[i + 1] : T[0] + 2 * PI;
        const t0 = [cx + R * cos(a0), cy + R * sin(a0)], t1 = [cx + R * cos(a1), cy + R * sin(a1)], am = (a0 + a1) / 2, rv = 0.36 * R, V = [cx + rv * cos(am), cy + rv * sin(am)];
          const C = [2 * V[0] - (t0[0] + t1[0]) / 2, 2 * V[1] - (t0[1] + t1[1]) / 2]; /* a curve from tip to tip through the valley: sharp tips, sides curving in */
          for (let s = 0; s < k; s++) { const f = s / k, g = 1 - f; P.push([g * g * t0[0] + 2 * g * f * C[0] + f * f * t1[0], g * g * t0[1] + 2 * g * f * C[1] + f * f * t1[1]]); } }
      const zf = -7.42, zb = -7.2, cv = mb.v(cx, cy, zf, 0, 0, -1), F = P.map(([x, y]) => mb.v(x, y, zf, 0, 0, -1));
      for (let i = 0; i < P.length; i++) mb.tri(cv, F[i], F[(i + 1) % P.length]); // its face, fanned from the centre (star-shaped)
      for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], ex = q[0] - p[0], ey = q[1] - p[1], l = hypot(ex, ey) || 1;
        mb.quad(mb.v(p[0], p[1], zf, ey / l, -ex / l, 0), mb.v(q[0], q[1], zf, ey / l, -ex / l, 0), mb.v(q[0], q[1], zb, ey / l, -ex / l, 0), mb.v(p[0], p[1], zb, ey / l, -ex / l, 0)); } };
    star(-2.6, 38.95, 1.15, [85, 212, 325]); star(2.6, 38.95, 1.15, [95, 328, 215]); star(0, 34.8, 1.25, [52, 128, 215, 325]); }
  mb.mat = M.GOLD; mb.eb = mb.ea = 0; ringLoft([[[-1.05, 48.8, -7.45], [1.05, 48.8, -7.45], [0.75, 49.8, -7.45], [-0.75, 49.8, -7.45]], [[-1.05, 48.8, -7.0], [1.05, 48.8, -7.0], [0.75, 49.8, -7.0], [-0.75, 49.8, -7.0]]]); /* the foot under the disc: a trapezoid on the frame's top */
  disc(0, 50.85, 1.4, -7.5, -7.05); disc(0, 50.85, 1.15, -7.55, -7.45, false); /* (kit mesh: r 1.4, its top 1.0 above the frame's... 2.9 above the cap) */ /* a short stem on the frame's flat top */ /* the medallion on the apex (top at the kit's 53.2), a raised boss on its face */
  // the hall: a pointed vault 16.6 m wide behind the arch, its walls bowing out a little like a hull; its crown nearly
  // straight from 48 m at the arch to 35.5 m at the back, 58 m behind, with a slight dip just behind the gate. Bands
  // following the crown (kit): a plain ridge cap, a band of fine stripes, a band of carved signs, a dark band,
  // plain sandstone, a band of fine stripes and a plain foot. A pointed doorway in a stepped frame at the back end;
  // a gilt scroll at each end of the ridge
  const L = 64, z0 = -6.6, hw = 8.05, nh = lod ? 8 : 32, /* (it runs into the pyramid: cut along its face, below) */ nr = lod ? 8 : 20, Z = (t) => z0 + L * t;
  const top = (t) => 48.7 - 0.296 * max(0, Z(t) - 0.7); /* straight (kit: 48.7 behind the arch, 0.296 m down per m) */
  // the section, by depth d below the crown (kit): plumb up to 13, curving in, a cap with a small lip and a flat top
  const PROF = [[13, 8.05], [11.2, 7.15], [9.6, 6.65], [8.2, 6.14], [7.5, 5.85], [6.2, 5.17], [4.2, 4.13], [2.2, 2.97], [1.55, 2.75], [1.5, 2.95], [1.3, 2.95], [1.2, 2.75], [0.6, 2.4], [0.15, 2.1], [0, 1.85], [0, 0]];
  const kindD = (d, u) => (d < 1.52 ? 'ridge' : d < 7.5 ? 'stripe' : d < 16 ? 'glyph' : d < 19.5 ? 'dark' : u < 0.04 ? 'foot' : u < 0.12 ? 'stripe' : 'stone');
  const sec = (t) => { const H = top(t), P = [], add = (x, y) => P.push([x, y, (y - 0.6) / (H - 0.6), H - y]);
    for (const u of [0, 0.04, 0.12]) add(hw, 0.6 + (H - 0.6) * u); for (const d of [19.5, 16]) add(hw, H - d);
    for (const [d, x] of PROF) add(x, H - d); return P; };
  const pig = [RED, OCHRE, WHITE, RED, OCHRE, BLUE, WHITE, OCHRE], sub = lod ? 1 : 10;
  let A = sec(0);
  for (let i = 0; i < nh; i++) {
    const B = sec((i + 1) / nh);
    for (let j = 0; j + 1 < A.length; j++) {
      const um = (A[j][2] + A[j + 1][2]) / 2, mk = kindD((A[j][3] + A[j + 1][3]) / 2, um), striped = mk === 'stripe' && !lod;
      for (let q = 0; q < (striped ? sub : 1); q++) { // stripes: each slice cut into fine coloured strips along the hall
        const f0 = striped ? q / sub : 0, f1 = striped ? (q + 1) / sub : 1, L2 = (p, r, f) => [p[0] + (r[0] - p[0]) * f, p[1] + (r[1] - p[1]) * f];
        const a0 = L2(A[j], B[j], f0), a1 = L2(A[j + 1], B[j + 1], f0), b0 = L2(A[j], B[j], f1), b1 = L2(A[j + 1], B[j + 1], f1), za = Z((i + f0) / nh), zb = Z((i + f1) / nh);
        if (striped) paint(mb, pig[(i * sub + q) % pig.length]); else if (mk === 'dark') { mb.mat = M.BARK; mb.eb = mb.ea = 0; } /* a dull dark brown */
        else if (mk === 'glyph') { mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 12; } else if (mk === 'ridge') { mb.mat = M.MARBLE; mb.eb = mb.ea = 0; } else { mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED; }
        for (const sx of [-1, 1]) {
          const p0 = [sx * a0[0], a0[1], za], p1 = [sx * a1[0], a1[1], za], p2 = [sx * b1[0], b1[1], zb], p3 = [sx * b0[0], b0[1], zb];
          let nn = vnorm(vcross([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]])); const ox = sx * (A[j + 1][1] - A[j][1]), oy = -(A[j + 1][0] - A[j][0]); /* the profile's outward side (right side climbing) */ if (nn[0] * ox + nn[1] * oy < 0) nn = nn.map((v) => -v);
          const cov = (p) => abs(p[0]) > hw - 0.02 && p[2] >= 3.5 && p[1] <= min(30, 32.275 - 0.35 * p[2]) - 0.02; if (cov(p0) && cov(p1) && cov(p2) && cov(p3)) continue; /* (behind the side wall's raised strip: never seen) */
          mb.quad(mb.v(...p0, ...nn), mb.v(...p1, ...nn), mb.v(...p2, ...nn), mb.v(...p3, ...nn));
        }
      }
      mb.eb = mb.ea = 0;
    }
    A = B;
  }
  // its ends: the section's outline round a centre point
  const cap = (t, d) => { const P = sec(t), H = top(t), z = Z(t), cv = mb.v(0, H * 0.45, z, 0, 0, d), R = P.map(([x, y]) => mb.v(x, y, z, 0, 0, d)), Lf = P.map(([x, y]) => mb.v(-x, y, z, 0, 0, d));
    for (let k = 0; k < P.length - 1; k++) { mb.tri(cv, R[k], R[k + 1]); mb.tri(cv, Lf[k + 1], Lf[k]); } mb.tri(cv, Lf[0], R[0]); };
  mb.mat = M.MARBLE; mb.ea = WEATHERED; plateHole(sec(1).map(([x, y]) => [x, y]), half3(DOOR_B), Z(1), 1); plateHole(sec(0).map(([x, y]) => [x, y]), half3(DOOR_F), z0 + 0.02, -1); /* the front end too, just behind the frame's back (the cap's lip reaches a little past the frame) */ mb.ea = 0; /* the back end, the doorway cut through (the front end is the frame's back plate) */
  // the passage (open right through, kit): its walls and chamfered roof from the front doorway to the back one, facing in
  { mb.mat = M.MARBLE; mb.eb = mb.ea = 0; const A2 = DOOR_F.map(([x, y]) => [x, y, -7.2]), B2 = DOOR_B.map(([x, y]) => [x, y, Z(1)]);
    for (let i = 0; i + 1 < A2.length; i++) { const p0 = A2[i], p1 = A2[i + 1], p2 = B2[i + 1], p3 = B2[i]; let nn = vnorm(vcross([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]]));
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2; if (nn[0] * (0 - mx) + nn[1] * (12 - my) < 0) nn = nn.map((v) => -v); mb.quad(mb.v(...p0, ...nn), mb.v(...p1, ...nn), mb.v(...p2, ...nn), mb.v(...p3, ...nn)); } }
  // the back doorway (kit): the front one's shape, a little lower, in a brown band 0.75 wide standing 0.3 proud
  { const O = hexo(2.6, 20.7, 24.5, 0.8), I = DOOR_B, z1 = Z(1), zf = z1 + 0.3; mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED;
    for (let i = 0; i + 1 < O.length; i++) mb.quad(mb.v(O[i][0], O[i][1], zf, 0, 0, 1), mb.v(O[i + 1][0], O[i + 1][1], zf, 0, 0, 1), mb.v(I[i + 1][0], I[i + 1][1], zf, 0, 0, 1), mb.v(I[i][0], I[i][1], zf, 0, 0, 1));
    const rv = (R, out) => { for (let i = 0; i + 1 < R.length; i++) { const p = R[i], q = R[i + 1], ex = q[0] - p[0], ey = q[1] - p[1], l = hypot(ex, ey) || 1, nx = ey / l * out, ny = -ex / l * out;
      mb.quad(mb.v(p[0], p[1], z1, nx, ny, 0), mb.v(q[0], q[1], z1, nx, ny, 0), mb.v(q[0], q[1], zf, nx, ny, 0), mb.v(p[0], p[1], zf, nx, ny, 0)); } };
    rv(O, 1); rv(I, -1); mb.ea = 0; }

  // the medallion's gilt base (kit mesh): a block 2.4 wide behind the disc, its top falling back in a concave sweep from
  // just under the disc's top down onto the ridge cap 4.6 m behind it
  { const PR = [[-7.0, 50.9], [-6.5, 50.69], [-6.0, 50.45], [-5.5, 50.22], [-5.0, 49.82], [-4.5, 49.62], [-4.0, 49.49], [-3.5, 49.24], [-3.0, 49.0], [-2.4, 48.76]];
    mb.mat = M.GOLD; mb.eb = 0; mb.ea = 20; ringLoft(PR.map(([z, y]) => [[-1.2, 48.4, z], [1.2, 48.4, z], [1.2, y, z], [-1.2, y, z]])); mb.ea = 0; }
  // the gilt horn at the back end (kit): lying on the cap, then curving up and out, waisted in the middle and flared
  // at the tip
  if (!lod) { let zr = 40; for (let i = 0; i < 40; i++) zr = PYR_FACE(top((zr - z0) / L)); /* where the ridge meets the pyramid */ const z1 = zr - 1.6, H = top((z1 - z0) / L), path = [[H + 0.1, z1 - 2.2], [H + 0.2, z1 - 0.9], [H + 0.55, z1 + 0.2], [H + 1.2, z1 + 0.95], [H + 1.9, z1 + 1.3], [H + 2.3, z1 + 1.35]];
    const wid = [1.7, 1.45, 1.05, 1.0, 1.35, 1.75], thk = [1.0, 0.95, 0.85, 0.8, 0.8, 0.75], R = [];
    for (let i = 0; i < path.length; i++) { const p = path[i], q = path[min(i + 1, path.length - 1)], o = path[max(i - 1, 0)], ty = q[0] - o[0], tz = q[1] - o[1], l = hypot(ty, tz), ny = tz / l, nz = -ty / l, w = wid[i] / 2, h = thk[i] / 2;
      R.push([[-w, p[0] - ny * h, p[1] - nz * h], [w, p[0] - ny * h, p[1] - nz * h], [w, p[0] + ny * h, p[1] + nz * h], [-w, p[0] + ny * h, p[1] + nz * h]]); }
    mb.mat = M.GOLD; mb.eb = 0; mb.ea = 20; ringLoft(R); }
  mb.eb = mb.ea = 0; return clipPyramid(mb.build());
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
  // runs along x carry on t past both ends to close the corners (their end a hair proud of the cross wall's face);
  // runs along z stop their footing and piers short at joined ends (j0: the end at the lower coordinate, j1 the upper),
  // so no two runs share a face anywhere (that flickered)
  const run = (x0, z0, x1, z1, piers = true, j0 = true, j1 = true, si = 0, e0 = '', e1 = '') => { // si: the court side (+1/-1 along the run's normal; 0: none)
    // e0/e1 (runs along z): how the cross run meets that end - 'in': its court side faces this run, 'out': away. The
    // court-side pieces stop there at the cross run's own (no two runs share space at a corner)
    const L0 = hypot(x1 - x0, z1 - z0), alongX0 = abs(x1 - x0) > abs(z1 - z0), L = alongX0 ? L0 + 2 * (t + 0.02) : L0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = abs(x1 - x0) > abs(z1 - z0);
    const tiE = t * 0.3, cut = (e, up) => (alongX ? 0 : e === 'in' ? (up ? tiE : t * 0.92 + 1.6 + 0.12) : e === 'out' ? (up ? t * 0.92 : 0) : 0);
    const U0 = -L / 2 + cut(e0, 1), U1 = L / 2 - cut(e1, 1), W0 = -L0 / 2 + cut(e0, 0), W1 = L0 / 2 - cut(e1, 0); // the upper (thin wall, crest, teeth) and the lower (lower wall, coping) court-side limits
    const B = (u0, u1, d, y0, y1, bev = 0, o = 0) => alongX ? mb.box(cx + u0, y0, cz + o - d, cx + u1, y1, cz + o + d, bev) : mb.box(cx + o - d, y0, cz + u0, cx + o + d, y1, cz + u1, bev);
    // a box like B but without the faces nobody sees: sk holds 'b' (its back: the face toward the wall's line), 'f' (its
    // front), 'd' (its foot), 'u' (its top)
    const Bd = (u0, u1, d, y0, y1, o, sk) => { const s = o > 0 ? 1 : o < 0 ? -1 : 0, n0 = o - d, n1 = o + d, P = (q, nn, y) => (alongX ? [cx + q, y, cz + nn] : [cx + nn, y, cz + q]);
      const N = (nn) => (alongX ? [0, 0, nn] : [nn, 0, 0]), U = (q) => (alongX ? [q, 0, 0] : [0, 0, q]), F = (a, b2, c, e, nm) => mb.quad(mb.v(...a, ...nm), mb.v(...b2, ...nm), mb.v(...c, ...nm), mb.v(...e, ...nm));
      if (!(sk.includes('b') && s < 0) && !(sk.includes('f') && s > 0)) F(P(u0, n1, y0), P(u1, n1, y0), P(u1, n1, y1), P(u0, n1, y1), N(1)); // the +normal face
      if (!(sk.includes('b') && s > 0) && !(sk.includes('f') && s < 0)) F(P(u0, n0, y0), P(u1, n0, y0), P(u1, n0, y1), P(u0, n0, y1), N(-1)); // the -normal face
      if (!sk.includes('u')) F(P(u0, n0, y1), P(u1, n0, y1), P(u1, n1, y1), P(u0, n1, y1), [0, 1, 0]); if (!sk.includes('d')) F(P(u0, n0, y0), P(u1, n0, y0), P(u1, n1, y0), P(u0, n1, y0), [0, -1, 0]);
      F(P(u0, n0, y0), P(u0, n1, y0), P(u0, n1, y1), P(u0, n0, y1), U(-1)); F(P(u1, n0, y0), P(u1, n1, y0), P(u1, n1, y1), P(u1, n0, y1), U(1)); };
    const T = (u, a0, a1, d0, d1, y0, y1, off = 0) => alongX ? frustum(mb, cx + u, cz + off, a0, d0, a1, d1, y0, y1, true) : frustum(mb, cx + off, cz + u, d0, a0, d1, a1, y0, y1, true);
    // footing (its ends run on past the corners, so the corners close)
    const FT = (trim, d0, d1, y0, y1) => { const a = alongX ? -L0 / 2 - t - 3.02 : -L0 / 2 + (j0 ? trim : -2.5), b = alongX ? L0 / 2 + t + 3.02 : L0 / 2 - (j1 ? trim : -2.5); T((a + b) / 2, (b - a) / 2, (b - a) / 2, d0, d1, y0, y1); };
    mb.mat = M.MARBLE; mb.ea = WEATHERED; FT(t + 3.0, t + 3.0, t + 2.5, -2, 0.3); FT(t + 2.1, t + 2.5, t + 2.1, 0.3, 1.6); mb.ea = 0;
    mb.mat = M.MARBLE; mb.eb = GLYPH; mb.ea = 20; frustum(mb, cx, cz, alongX ? L / 2 : t, alongX ? t : L / 2, alongX ? L / 2 : t * 0.92, alongX ? t * 0.92 : L / 2, 1.6, hb, false); mb.eb = mb.ea = 0;
    paint(mb, WHITE); const yT = h * 0.765, ti = t * 0.3; /* (court side: above the lower wall's top the wall stops at the teeth's inner edge, ti from its line) */
    if (si) { Bd(-L / 2, L / 2, t * 0.92, hb, yT, 1e-9 * si, 'fd'); B(U0, U1, (t * 0.92 + ti) / 2, yT, hn, 0, -si * (t * 0.92 - ti) / 2);
      if (alongX) for (const [a, b] of [[-L / 2, -L0 / 2], [L0 / 2, L / 2]]) { const n = cz + si * t * 0.92, P = (q, y) => [cx + q, y, n]; mb.quad(mb.v(...P(a, hb), 0, 0, si), mb.v(...P(b, hb), 0, 0, si), mb.v(...P(b, yT), 0, 0, si), mb.v(...P(a, yT), 0, 0, si)); } } /* (its court face past the lower wall's ends: where no wall covers it) */ else Bd(-L / 2, L / 2, t * 0.92, hb, hn, 0, 'd'); /* (court side: its face there inside the lower wall) */ if (si) { // (court side) the sandstone crest: its face in the gaps between the teeth a ramp, 0.3 behind the teeth's face at their
      // foot back to 0.3 t from the wall's line at the top (kit: the stone at the back of each gap slopes)
      const ob = -si * (t * 0.92 - 0.3), ot = -si * t * 0.3, ii = si * t * 0.3, Q = [[ii, hn], [ob, hn], [ot, h - 0.04], [ii, h - 0.04]];
      const Qc = si > 0 ? Q.slice().reverse() : Q; /* (extrude wants it counter-clockwise) */ unpaint(mb, M.TRIM); if (alongX) extrudeX(mb, Q.map(([q, y]) => [cz + q, y]), cx - L / 2, cx + L / 2); else extrude(mb, Qc.map(([q, y]) => [cx + q, y]), 0, cz + U0, cz + U1); paint(mb, WHITE); } else { mb.ao = 0.42; B(-L / 2, L / 2, t * 0.3, hn, h - 0.04); mb.ao = 1; } /* (court side: its inner part is the crest itself, a continuous sandstone coping, kit) */ /* (its top 4 cm under the merlons': no shared plane) */
    for (const sd of [-1, 1]) { if (sd === si) continue; /* (the court side: the lower wall below) */ paint(mb, RED); Bd(-L / 2, L / 2, 0.06, hb - 0.75, hb - 0.55, sd * (t * 0.94), 'b'); Bd(-L / 2, L / 2, 0.06, 1.95, 2.15, sd * (t * 0.99), 'b'); }
    const nb = max(1, round(L / 14));
    for (let i = 0; i <= nb; i++) {
      const u = -L / 2 + i * L / nb;
      for (const sd of [-1, 1]) { if (sd === si) continue;
        paint(mb, RED); Bd(u - 1.12, u - 0.92, 0.08, 2.0, hb - 0.6, sd * (t * 0.97), 'b'); Bd(u + 0.92, u + 1.12, 0.08, 2.0, hb - 0.6, sd * (t * 0.97), 'b');
        paint(mb, WHITE); Bd(u - 0.8, u + 0.8, 0.2, 1.6, hb - 0.3, sd * (t * 0.96), 'bd'); unpaint(mb, M.TRIM); Bd(u - 1.0, u + 1.0, 0.26, hb - 0.55, hb - 0.2, sd * (t * 0.96), 'b');
      }
    }
    // the court side (kit mesh): a lower wall 1.6 thick against it, its top at 0.765 h, with engaged pilasters every
    // 15.8 m: 2.9 wide, 0.85 proud, on a base, a gilt ring under the lower wall's top, a flared capital whose top slab
    // reaches back over the lower wall to the wall's face, at 0.93 h
    if (si) { const f0 = t * 0.92, fI = f0 + 1.6, yC = h * 0.93, o = (d0, d1) => si * (d0 + d1) / 2, dd = (d0, d1) => (d1 - d0) / 2;
      paint(mb, WHITE); Bd(W0, W1, dd(f0 - 0.05, fI), 1.6, yT, o(f0 - 0.05, fI), 'bdu'); unpaint(mb, M.TRIM); Bd(W0, W1, dd(f0 - 0.05, fI + 0.12), yT, yT + 0.18, o(f0 - 0.05, fI + 0.12), 'bd'); // the lower wall, its coping
      const npl = max(1, round(L0 / 15.8));
      for (let i = 0; i < npl; i++) { const u = -L0 / 2 + (i + 0.5) * L0 / npl;
        unpaint(mb, M.TRIM); B(u - 1.6, u + 1.6, dd(fI - 0.1, fI + 1.1), 1.6, 2.5, lod ? 0 : 0.05, o(fI - 0.1, fI + 1.1)); // its base
        Bd(u - 1.45, u + 1.45, dd(fI - 0.1, fI + 0.85), 2.5, yT - 0.2, o(fI - 0.1, fI + 0.85), 'bdu'); // its shaft
        mb.mat = M.GOLD; mb.eb = mb.ea = 0; Bd(u - 1.5, u + 1.5, dd(fI - 0.1, fI + 0.92), yT - 0.75, yT - 0.55, o(fI - 0.1, fI + 0.92), 'b'); // the gilt ring
        unpaint(mb, M.TRIM); Bd(u - 1.6, u + 1.6, dd(fI - 0.1, fI + 1.0), yT - 0.2, yT + 0.18, o(fI - 0.1, fI + 1.0), 'bu'); Bd(u - 1.6, u + 1.6, dd(ti - 0.05, fI + 1.0), yT + 0.18, yT + 0.6, o(ti - 0.05, fI + 1.0), 'bdu'); Bd(u - 1.8, u + 1.8, dd(ti - 0.05, fI + 1.2), yT + 0.6, yC - 0.45, o(ti - 0.05, fI + 1.2), 'bu'); // the capital, flaring; above the lower wall's coping it runs back to the wall's face (no void under its slab)
        Bd(u - 1.95, u + 1.95, dd(ti - 0.05, fI + 1.3), yC - 0.45, yC, o(ti - 0.05, fI + 1.3), 'b'); } } // its top slab, back to the wall's (thinned) face
    const nm = max(1, round(L / 7.2)), p = L / nm; paint(mb, WHITE);
    for (let i = 0; i < nm; i++) { const u = -L / 2 + (i + 0.5) * p; if (si && (u - p * 0.375 < U0 - 0.01 || u + p * 0.375 > U1 + 0.01)) continue; /* (a tooth that would run into the cross run) */ if (si) T(u, p * 0.375, p * 0.3, (t * 0.92 + ti) / 2, (t * 0.92 + ti) / 2, hn, h, -si * (t * 0.92 - ti) / 2); else T(u, p * 0.375, p * 0.3, t * 0.92, t * 0.92, hn, h); } // the teeth (court side: on the outer part only)
    if (piers) { const np = max(1, round(L / 48)); for (let i = 0; i <= np; i++) { if (!alongX && ((i === 0 && j0) || (i === np && j1))) continue; /* (the cross run's pier stands there) */ const u = -L0 / 2 + i * L0 / np; paint(mb, WHITE); B(u - 1.8, u + 1.8, t + 0.4, 0, h + 0.6); unpaint(mb, M.TRIM); B(u - 2.1, u + 2.1, t + 0.7, h + 0.6, h + 1.1, lod ? 0 : 0.06); /* (barely above the crest, as on the kit) */ } }
    mb.eb = mb.ea = 0;
  };
  const { wallW: W, wallE: E, wallZ: Z, bumpX: X, bumpZ: J, gapZ: G } = KP;
  run(E, Z, W, Z, true, true, true, -1); run(E, -Z, -gate, -Z, true, true, true, 1); run(gate, -Z, W, -Z, true, true, true, 1); run(W, -Z, W, Z, true, true, true, -1, 'in', 'in'); // north, south (the entrance's gap), west (si: the court's side)
  run(E, -Z, E, -J, true, true, true, 1, 'in', 'out'); run(E, J, E, Z, true, true, true, 1, 'out', 'in'); // east, stopping at the bay's side walls (the bay is open to the court)
  run(X, -J, E, -J, false, true, true, 1); run(X, J, E, J, false, true, true, -1); run(X, -J, X, -G, false, true, false, 1, 'in', ''); run(X, G, X, J, false, false, true, 1, '', 'in'); // the bay (its court side toward the terrace inside it); the pavilions fill its middle
  return mb.build();
}
// the far complex's plan, measured off the kit (tools/kitlab/pyr_plan.py, reference/kb3d/plan/plan.json)
// metres at 2.4x, relative to the pyramid's centre; x mirrored from the kit (its east, the terrace's side, is -x here)
const KP = {
  wallW: 121, wallE: -141.6, wallZ: 121.2, // the enclosure's wall lines
  bumpX: -187, bumpZ: 40.8, gapZ: 24, // the bay out round the terrace building (-x side); its walls open |z| < gapZ
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
