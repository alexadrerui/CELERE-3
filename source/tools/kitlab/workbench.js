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
  for (const o of [-4.7, 4.7]) mb.add(tor, o, 0, KP.entranceZ - 6.5);
  const pots = meshKitPots(); for (const [x, z, a] of KP.pots) mb.add(pots, x, 17.3, z, a);
  mb.add(meshKitCauseway(KP.entranceZ - 10.5));
  const zp = KP.entranceZ - 10.5 - 68; mb.add(meshObelisk(22, 1.1, true), 0, 0.55, zp);
  const beam = meshKitBeam(); for (const f of [-0.62, 0, 0.62]) mb.add(beam, sin(f) * 9.5, 0.05, zp - cos(f) * 9.5, PI - f);
  return mb.build();
}
function kitFireBowl(lod) { const mb = new MB(512); fireBowl(mb, 0, 0, 0, 3.0, lod ? 8 : 14); return mb.build(); }

const MODELS = [
  { id: 'complex', name: 'Complexo inteiro', kit: 'complex', build: kitComplex },
  { id: 'pyramid', name: 'Pirâmide', kit: 'BuildingB', build: () => meshPyramidCased(107.75, 99.9) },
  { id: 'entrance', name: 'Entrada (portão)', kit: 'BuildingA', build: (l) => meshKitEntrance(l) },
  { id: 'terrace', name: 'Terraço', kit: 'BuildingC', build: (l) => { const mb = new MB(1 << 15); mb.add(meshKitTerrace(l), 0, 0, 0, PI); return mb.build(); } }, // (turned as in the complex, so it matches the kit photos)
  { id: 'wall', name: 'Muralha', kit: 'Wall', build: (l) => meshEnclosure(11.5, l) },
  { id: 'obelisk', name: 'Obelisco de canto', kit: 'ObeliskA', build: () => meshKitObelisk(2.4) },
  { id: 'banner', name: 'Estandarte', kit: 'BannerA', build: () => meshKitBanner() },
  { id: 'torch', name: 'Tocha', kit: 'StandingTochA', frame: { az: 1.35, ortho: 1.2 }, build: () => meshKitTorch() }, // (the kit photo frames a larger box: its flame)
  { id: 'bowl', name: 'Braseiro', kit: 'FireBowlA', build: kitFireBowl },
  { id: 'pots', name: 'Potes de barro', kit: 'ClayPots', build: () => meshKitPots() },
  { id: 'beam', name: 'Viga caída', kit: '', build: () => meshKitBeam() },
];
