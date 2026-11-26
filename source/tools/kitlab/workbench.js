// Kit Lab workbench: the models to view, and any model functions being adjusted.
//
// To adjust a model without touching the scene, copy its function from src/meshes.js into this file and edit it here:
// a function declared here replaces the project's one in the Kit Lab only. When it looks right, copy it back into
// src/meshes.js (replacing the old one) and remove it from here.
//
// Each entry: id, name, kit (the part's name in the KitBash3D BldgLgPyramid_A renders, for the reference photos),
// build(lod) returning a built mesh. Coordinates: metres, y up, the model's front facing -z.

const F = FARPYR;
// the complex assembled as in the scene (city.js), around the pyramid's centre
function kitComplex(lod) {
  // laid out on the kit's own plan (KP, below); the entrance faces -z, the terrace building's side is -x
  const mb = new MB(1 << 17), north = PI / 2, [tx, tz] = KP.terrace;
  mb.add(meshPyramidCased(107.75, 99.9));
  mb.add(meshEnclosure(11.5, lod));
  mb.add(meshKitEntrance(lod), 0, 0, KP.entranceZ);
  mb.add(meshKitTerrace(lod), tx, 0, tz, PI); // its front (+x in the mesh) turned out, to -x
  const ob = meshKitObelisk(2.4); for (const [x, z] of KP.obelisks) mb.add(ob, x, 0, z);
  const ban = meshKitBanner(); for (const [x, z] of KP.banners) mb.add(ban, x, 0, z);
  const tor = meshKitTorch(); for (const [x, z] of KP.torches) mb.add(tor, x, 0, z); for (const [x, z] of KP.torchesHigh) mb.add(tor, x, 17.3, z);
  for (const o of [-4.7, 4.7]) mb.add(tor, o, 0.6, KP.entranceZ - 9.4); /* flanking the doorway, in front of the arch's frame (its face at local z -7.75), standing on the plinth; (city.js: the same when the entrance goes to the game) */
  const pots = meshKitPots(); for (const [x, z, a] of KP.pots) mb.add(pots, x, 17.3, z, a);
  mb.add(meshKitCauseway(KP.entranceZ - 10.5));
  const zp = KP.entranceZ - 10.5 - 68; mb.add(meshObelisk(22, 1.1, true), 0, 0.55, zp);
  const beam = meshKitBeam(); for (const f of [-0.62, 0, 0.62]) mb.add(beam, sin(f) * 9.5, 0.05, zp - cos(f) * 9.5, PI - f);
  return mb.build();
}
function kitFireBowl(lod) { const mb = new MB(512); fireBowl(mb, 0, 0, 0, 3.0, lod ? 8 : 14); return mb.build(); }

const MODELS = [ // group 'complex': the pyramid complex, in the scene
  { id: 'complex', name: 'Complexo da pirâmide', kit: 'complex', build: kitComplex },
  { id: 'pyramid', name: 'Pirâmide', kit: 'BuildingB', build: () => meshPyramidCased(107.75, 99.9) },
  { id: 'entrance', name: 'Entrada (portão)', kit: 'BuildingA', kitXform: { c: [-194.62, 260.5], o: [0, 0.45, -7.75] }, build: (l) => meshKitEntrance(l) }, // (kitXform: the kit's point at our origin, for its photos' cameras)
  { id: 'terrace', name: 'Terraço', kit: 'BuildingC', build: (l) => { const mb = new MB(1 << 15); mb.add(meshKitTerrace(l), 0, 0, 0, PI); return mb.build(); } }, // (turned as in the complex, so it matches the kit photos)
  { id: 'wall', name: 'Muralha', kit: 'Wall', build: (l) => meshEnclosure(11.5, l) },
  { id: 'obelisk', name: 'Obelisco de canto', kit: 'ObeliskA', build: () => meshKitObelisk(2.4) },
  { id: 'banner', name: 'Estandarte', kit: 'BannerA', build: () => meshKitBanner() },
  { id: 'torch', name: 'Tocha', kit: 'StandingTochA', frame: { az: 1.35, ortho: 1.2 }, build: () => meshKitTorch() }, // (the kit photo frames a larger box: its flame)
  { id: 'bowl', name: 'Braseiro', kit: 'FireBowlA', build: kitFireBowl },
  { id: 'pots', name: 'Potes de barro', kit: 'ClayPots', build: () => meshKitPots() },
  { id: 'beam', name: 'Viga caída', kit: '', build: () => meshKitBeam() },
];
for (const m of MODELS) { m.group = 'complex'; if (m.id !== 'complex') m.parent = 'complex'; } // (its parts fold under the complex)
// the kit's other large buildings: the kit's renders, size and parts, until a model is built for each (then give the
// entry a build(lod) and it is compared like the rest)
const KIT_LARGE_PT = { BldgLgTempleOfAnubis_A: 'Templo de Anúbis', BldgLgPyramidConstruction_A: 'Pirâmide em construção', BldgLgObelisk_A: 'Grande obelisco',
  BldgLgSacrificialAltar_A: 'Altar de sacrifícios', BldgLgEmbalmingTemple_A: 'Templo de embalsamamento', BldgLgRoyalGarden_A: 'Jardim real',
  BldgLgRoyalPalace_A: 'Palácio real', BldgLgObservatory_A: 'Observatório' };
const RANK = { high: 0, medium: 1, low: 2, '': 3 };
const SZ = { Lg: 0, Md: 1, Sm: 2 };
for (const a of KIT_LARGE.filter((a) => a.id !== 'BldgLgPyramid_A').sort((p, q) => SZ[p.id.slice(4, 6)] - SZ[q.id.slice(4, 6)] || RANK[p.rel] - RANK[q.rel] || q.dims[0] * q.dims[1] - p.dims[0] * p.dims[1]))
  MODELS.push({ id: a.id, name: KIT_LARGE_PT[a.id] || a.id.replace(/^Bldg(Lg|Md|Sm)/, '').replace(/_([A-Z])$/, ' $1').replace(/([a-z])([A-Z])/g, '$1 $2'), kit: a.id, kitAsset: a.id, group: { Lg: 'large', Md: 'medium', Sm: 'small' }[a.id.slice(4, 6)], refs: 'renders', kitInfo: a, build: null });

// ======== the recumbent jackal of the Temple of Anubis (kit SculptureA), sculpted from primitives ========
// Measured off the kit's side and top silhouettes (x2.4), then built by hand: no kit geometry is used. Frame: X along
// the body from the tail (0) to the fore paws (102), lat across, y up; the model faces -z (z = 51 - X).
// a loft along a path: secs = [[X, lat, y, rx, ry], ...]; each section an ellipse, rx across the path (level), ry up;
// closed at both ends
function loftPath(mb, secs, seg = 14, sub = 1, cap = [0.6, 0.6]) { // (cap: how far each end's dome stands out, x its radius; 0 = flat, for an end buried in another part)
  // (sub > 1: the sections smoothed along the path, Catmull-Rom, sub steps between two given ones)
  if (sub > 1 && secs.length > 2) { const S = secs, o = [];
    for (let i = 0; i + 1 < S.length; i++) for (let k = 0; k < sub; k++) { const u = k / sub, p0 = S[max(i - 1, 0)], p1 = S[i], p2 = S[i + 1], p3 = S[min(i + 2, S.length - 1)];
      o.push(p1.map((_, j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u * u + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u * u * u))); }
    o.push(S.at(-1)); secs = o; }
  const P = secs.map(([X, l, y]) => [l, y, 51 - X]), n = P.length, rings = []; let prevSide = null, upSign = 1;
  for (let i = 0; i < n; i++) {
    const a = P[max(i - 1, 0)], b = P[min(i + 1, n - 1)], t = vnorm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    // the ring's frame carried along the path (parallel transport): the first from a level reference, each next one the
    // previous side made square to the new tangent, so a ring never twists at a bend
    let ref = i ? prevSide : (abs(t[0]) < 0.85 ? [1, 0, 0] : [0, 1, 0]);
    const k = ref[0] * t[0] + ref[1] * t[1] + ref[2] * t[2]; let side = vnorm([ref[0] - t[0] * k, ref[1] - t[1] * k, ref[2] - t[2] * k]); prevSide = side;
    let up = vnorm(vcross(t, side)); if (!i && (up[1] < 0 || (abs(up[1]) < 1e-3 && up[2] > 0))) { up = up.map((v) => -v); } if (i) up = vnorm(vcross(t, side)).map((v) => v * upSign); else upSign = vnorm(vcross(t, side))[1] < 0 ? -1 : 1;
    const [, , , rx, ry] = secs[i], ring = [];
    for (let s = 0; s < seg; s++) { const q = TAU * s / seg, c = cos(q), sn = sin(q); ring.push([P[i][0] + side[0] * rx * c + up[0] * ry * sn, P[i][1] + side[1] * rx * c + up[1] * ry * sn, P[i][2] + side[2] * rx * c + up[2] * ry * sn]); }
    rings.push(ring);
  }
  const V = rings.map((rg, i) => rg.map((v, s) => {
    const u = rg[(s + 1) % seg], w = rg[(s + seg - 1) % seg], f = rings[min(i + 1, n - 1)][s], b = rings[max(i - 1, 0)][s];
    let nn = vnorm(vcross([u[0] - w[0], u[1] - w[1], u[2] - w[2]], [f[0] - b[0], f[1] - b[1], f[2] - b[2]]));
    if (nn[0] * (v[0] - P[i][0]) + nn[1] * (v[1] - P[i][1]) + nn[2] * (v[2] - P[i][2]) < 0) nn = nn.map((x) => -x);
    return mb.v(v[0], v[1], v[2], ...nn);
  }));
  for (let i = 0; i + 1 < n; i++) for (let s = 0; s < seg; s++) mb.quad(V[i][s], V[i][(s + 1) % seg], V[i + 1][(s + 1) % seg], V[i + 1][s]);
  for (const [i, j, c] of [[0, 1, cap[0]], [n - 1, n - 2, cap[1]]]) { // caps: a low dome pushed out beyond the end ring
    const d = vnorm([P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]]), r = min(secs[i][3], secs[i][4]) * c;
    const tip = mb.v(P[i][0] + d[0] * r, P[i][1] + d[1] * r, P[i][2] + d[2] * r, ...d);
    for (let s = 0; s < seg; s++) mb.tri(V[i][s], V[i][(s + 1) % seg], tip);
  }
}
function meshKitJackal(lod) {
  const mb = new MB(1 << 16), q = lod ? 10 : 22, sb = lod ? 1 : 3, L = (secs, seg = q, cap) => loftPath(mb, secs, seg, sb, cap), B0 = [0, 0.6], B1 = [0.6, 0], BB = [0, 0];
  mb.mat = M.MARBLE; mb.eb = 0; mb.ea = WEATHERED;
  // torso: rump, back, deep rounded chest coming down between the fore legs
  L([[2.5, 0, 9.5, 5, 5], [5, 0, 11, 10.5, 8.5], [9, 0, 12, 13.5, 10.5], [15, 0, 12.8, 14.5, 12.4], [21, 0, 13.2, 14.5, 13.2], [27, 0, 13.4, 13.8, 12.8],
     [32, 0, 14, 12.4, 10.2], [39, 0, 14.4, 11.8, 9.2], [46, 0, 13.8, 12, 10.2], [53, 0, 14.4, 12.6, 11.8], [59, 0, 16.4, 13, 14.2], [64, 0, 18, 11.8, 15], [68, 0, 19.5, 8.4, 12.5], [70, 0, 20, 4.5, 8]]);
  // the haunches: a firm thigh on each flank, flatter on the outside, the hock standing up at its upper back corner
  for (const sd of [-1, 1]) {
    L([[6.5, sd * 12.2, 13, 2.5, 4], [10, sd * 13.8, 13.2, 4.6, 10.2], [16, sd * 14.2, 13.2, 5, 12.3], [23, sd * 13.6, 12.6, 4.6, 11.4], [28, sd * 12, 11.5, 2.6, 6]]);
    L([[7, sd * 14.2, 20.6, 1, 0.6], [9, sd * 15.4, 21.2, 2.2, 0.9], [11.5, sd * 15.6, 21, 2, 0.9], [13.5, sd * 15, 20.4, 0.9, 0.6]], lod ? 6 : 12); /* (the hock: a low ridge set into the thigh's upper outer corner) */
  }
  // neck: slimmer, arching forward, carrying the head high
  L([[59.5, 0, 22, 8.6, 7.6], [62.4, 0, 28, 7, 6.2], [64.2, 0, 32.5, 6, 5.2], [65.6, 0, 36.5, 5.5, 4.8], [67.4, 0, 42, 5.4, 4.9], [68.8, 0, 46, 5.9, 5.4], [70, 0, 48.5, 5.6, 5.4]], q, BB); /* (its top runs into the skull, no ledge) */
  // head: a narrow, flat-topped skull, a clear stop, a slender muzzle held level
  L([[67.2, 0, 47.2, 5.6, 5.2], [69.2, 0, 49.2, 6.1, 6], [72, 0, 48.2, 5.7, 5.9], [75, 0, 46.4, 4.4, 5.2], [79, 0, 45.4, 3.4, 4.2], [84, 0, 45, 2.4, 3.2], [88.5, 0, 44.9, 1.8, 2.6], [91.6, 0, 45.1, 1.5, 2.1], [92.8, 0, 45.2, 1.2, 1.6], [93.3, 0, 45.2, 0.7, 0.9]], q, B0); /* (a skull taller than wide, a blunt nose, the muzzle taller than wide) */
  // ears: flat broad leaves, cupped forward (thin front to back), rounded at the tip, raked back a little
  for (const sd of [-1, 1]) L([[68.4, sd * 3.1, 47.6, 3.3, 1.6], [67.8, sd * 3.4, 49.5, 3.3, 1.6], [67.3, sd * 3.9, 53.5, 3.1, 1.3], [66.7, sd * 4.4, 57, 2.3, 1], [66.2, sd * 4.8, 59.8, 1.2, 0.7], [65.9, sd * 5.0, 61.3, 0.4, 0.35]], lod ? 6 : 12, B0); /* (rooted deeper in the skull) */
  // fore legs: from the shoulder (inside the chest) down to the elbow, then lying forward on the ground to the paws
  for (const sd of [-1, 1]) L([[58, sd * 7.5, 18, 4.2, 5], [62, sd * 9.2, 11, 4.2, 5], [66, sd * 10.2, 5.6, 3.4, 3.6], [72, sd * 10.4, 3.9, 2.9, 3], [82, sd * 10.5, 3.2, 2.5, 2.6], [93, sd * 10.5, 2.7, 2.4, 2.3], [98, sd * 10.5, 2.2, 2.9, 1.8], [101, sd * 10.5, 1.5, 2.6, 1.1]], q, B0);
  // hind legs: the lower leg folded forward from the thigh, the foot on the ground
  for (const sd of [-1, 1]) L([[22, sd * 14, 6, 3.6, 4.2], [28, sd * 14.6, 3.6, 3.2, 3.2], [35, sd * 14.6, 2.6, 2.8, 2.2], [41, sd * 14.3, 2.1, 2.8, 1.7], [44.5, sd * 13.9, 1.6, 2.3, 1.1]], q, B0);
  // tail: down from the rump, then forward along the ground round the outside of the hind foot
  L([[7, 0, 12, 1.8, 1.8], [3.8, -0.4, 10, 1.6, 1.6], [1.8, -1.6, 6.6, 1.45, 1.45], [1.2, -3.8, 3.6, 1.35, 1.35], [2.2, -7, 2.4, 1.3, 1.25], [5, -11.4, 2.3, 1.25, 1.2], [10, -16.2, 2.3, 1.2, 1.15], [16, -19.2, 2.3, 1.15, 1.1], [22, -20.4, 2.2, 1.05, 1], [26, -19.8, 2.4, 0.9, 0.85]], lod ? 6 : 12, B0); /* (round the rump on the kit's side, forward along the ground outside the hind foot) */
  // the collar: a thin band low on the neck; one flat panel hanging from it, flush on the front of the chest
  mb.ea = 0; mb.mat = M.TRIM;
  loftPath(mb, [[63.3, 0, 32.4, 5.95, 5.2], [64.1, 0, 34.4, 5.65, 4.95]], q, 1);
  L([[70.6, 0, 33.6, 3.2, 0.8], [70.4, 0, 28, 3.6, 0.8], [71, 0, 24, 3.7, 0.8], [72, 0, 20, 3.7, 0.8], [72.9, 0, 16, 3.7, 0.8], [73.2, 0, 13, 3.6, 0.8]], 10, B1); /* (its face 0.4 m in front of the chest's front line at each height) */ /* (thick, set into the chest: only its face shows; down below the elbows) */
  mb.eb = mb.ea = 0; return mb.build();
}

{ // the sculpted jackal, compared with the kit's (turned as the kit's)
  const yaw = -74.476 * DEG, phi = Math.atan2(-cos(yaw), sin(yaw));
  MODELS.push({ id: 'anubis_jackal_s', name: 'Chacal (esculpido)', kit: 'SculptureA', group: 'large', parent: 'BldgLgTempleOfAnubis_A',
    refDir: '../../../reference/kb3d/BldgLgTempleOfAnubis_A/', kitDims: [23.31, 42.01, 26.01], orbit: { step: 22, el: 20 },
    build: (l) => { const mb = new MB(1 << 15); mb.add(meshKitJackal(l), 0, 0, 0, phi); return mb.build(); } });
  const i = MODELS.findIndex((m) => m.id === 'anubis_jackal_s'), j = MODELS.findIndex((m) => m.id === 'BldgLgTempleOfAnubis_A'); MODELS.splice(j + 1, 0, ...MODELS.splice(i, 1));
}
