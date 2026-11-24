# Detailed photo session of any KitBash3D Age of Egypt asset, headless and read-only (the kit file is never saved):
#   blender -b <kit.blend> --python tools/kitlab/asset_detail.py -- <out_dir> <AssetId> [HeroPart ...]
# e.g. ... -- ../reference/kb3d/BldgLgTempleOfAnubis_A BldgLgTempleOfAnubis_A SculptureA
# Renders (1600 x 1200), named as the Kit Lab expects:
# - the whole asset: 8 azimuths at 30 and 12 deg, 8 eye-level views, an orthographic top (complex_ortho_top.png/.json)
# - each distinct part (one per base name): 4 azimuths, 5 orthographic elevations, and close-ups of each face at its
#   foot / middle / top for parts over 12 m
# - each hero part: 16 azimuths at 0, 20 and 45 deg, the 5 elevations, and close-ups on a 3 x 3 grid of each face
# plus manifest.json (views, part sizes) and plan.json (each part's world bounding box).
import bpy, math, os, sys, json, re
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
OUT = os.path.abspath(args[0]); ASSET = args[1]; HEROES = args[2:]
os.makedirs(OUT, exist_ok=True)
ROOT = f"KB3D_AOE_{ASSET}_grp"; PRE = f"KB3D_AOE_{ASSET}_"

S = bpy.data.scenes.new("REF_Detail"); S.render.engine = 'BLENDER_EEVEE'
S.render.resolution_x, S.render.resolution_y = 1600, 1200; S.view_settings.view_transform = 'AgX'
try: S.eevee.taa_render_samples = 32
except Exception: pass
W = bpy.data.worlds.new("REF_W"); W.use_nodes = True
W.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.74, 1); W.node_tree.nodes["Background"].inputs[1].default_value = 0.9
S.world = W
sun = bpy.data.objects.new("REF_SUN", bpy.data.lights.new("REF_SUN", 'SUN')); sun.data.energy = 3.2; sun.data.angle = math.radians(1.5)
sun.rotation_euler = (math.radians(52), 0, math.radians(-35)); S.collection.objects.link(sun)
cam = bpy.data.objects.new("REF_CAM", bpy.data.cameras.new("REF_CAM")); S.collection.objects.link(cam); S.camera = cam
gm = bpy.data.meshes.new("REF_G"); gm.from_pydata([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [], [(0, 1, 2, 3)])
ground = bpy.data.objects.new("REF_G", gm); S.collection.objects.link(ground)
gmat = bpy.data.materials.new("REF_GM"); gmat.use_nodes = True; gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.42, 0.37, 0.3, 1)
gm.materials.append(gmat)
act = bpy.data.collections.new("REF_Active"); S.collection.children.link(act)

root = bpy.data.objects[ROOT]
parts = {o.name[len(PRE):] if o.name.startswith(PRE) else o.name: o for o in root.children_recursive if o.type == 'MESH'}

def bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == 'MESH' for c in o.bound_box]
    return (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))

def show(objs):
    for o in list(act.objects): act.objects.unlink(o)
    for o in objs:
        if o.name not in act.objects: act.objects.link(o)

def aim(loc, target, lens=35, ortho=None):
    cam.location = loc; cam.rotation_euler = (target - loc).to_track_quat('-Z', 'Y').to_euler(); d = (target - loc).length
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
    cam.data.clip_start = max(0.02, d * 0.002); cam.data.clip_end = d * 20 + 500

fit = lambda R, lens=35: R / math.tan(math.atan(18 / lens) * 0.92)
manifest = []
def shot(name, note):
    S.render.filepath = os.path.join(OUT, name + ".png"); bpy.ops.render.render(write_still=True, scene=S.name); manifest.append({"file": name + ".png", "view": note})

def orbit(prefix, objs, azs, el, label, lens=35, margin=1.0):
    lo, hi = bbox(objs); c = (lo + hi) / 2; R = (hi - lo).length / 2 * margin
    ground.location = (c.x, c.y, lo.z - 0.01); ground.scale = (R * 6, R * 6, 1)
    for az in azs:
        a, e = math.radians(az), math.radians(el)
        aim(c + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * fit(R, lens), c, lens)
        shot(f"{prefix}_az{az:03d}_el{el:02d}", f"{label}: perspective from azimuth {az} (0 = from -y), elevation {el}")

def elevations(prefix, objs, label):
    lo, hi = bbox(objs); c = (lo + hi) / 2; d = hi - lo; asp = 4 / 3
    for nm, v, w, h in (("front", Vector((0, -1, 0)), d.x, d.z), ("back", Vector((0, 1, 0)), d.x, d.z), ("left", Vector((-1, 0, 0)), d.y, d.z), ("right", Vector((1, 0, 0)), d.y, d.z), ("top", Vector((0, 0, 1)), d.x, d.y)):
        aim(c + v * (d.length + 20), c, ortho=max(w, h * asp) * 1.08); shot(f"{prefix}_ortho_{nm}", f"{label}: orthographic {nm}")

def closeups(prefix, objs, label, grid=False):
    lo, hi = bbox(objs); c = (lo + hi) / 2; d = hi - lo
    for nm, n, half, across in (("south", Vector((0, -1, 0)), d.y / 2, Vector((1, 0, 0))), ("north", Vector((0, 1, 0)), d.y / 2, Vector((-1, 0, 0))), ("west", Vector((-1, 0, 0)), d.x / 2, Vector((0, -1, 0))), ("east", Vector((1, 0, 0)), d.x / 2, Vector((0, 1, 0)))):
        face = c + n * half; wid = abs(across.dot(d))
        cols = (("l", -0.3), ("c", 0), ("r", 0.3)) if grid else (("c", 0),)
        for hn, hf in (("foot", 0.12), ("mid", 0.5), ("top", 0.88)):
            for cn, cf in cols:
                tgt = Vector((face.x, face.y, lo.z + d.z * hf)) + across * wid * cf
                dist = max(3.0 if grid else 6.0, min(d.z * (0.3 if grid else 0.45), 18.0))
                loc = tgt + n * dist + Vector((0, 0, 1.7 if hn == "foot" else 0)); loc.z = max(loc.z, lo.z + 1.7)
                aim(loc, tgt, 40); shot(f"{prefix}_close_{nm}_{hn}" + (f"_{cn}" if grid else ""), f"{label}: close-up, {nm} face, {hn}" + (f", {cn}" if grid else ""))

everything = [root] + list(root.children_recursive)
show(everything)
orbit("complex", everything, list(range(0, 360, 45)), 30, "Whole asset")
orbit("complex", everything, list(range(0, 360, 45)), 12, "Whole asset", lens=28, margin=0.8)
lo, hi = bbox(everything); c = (lo + hi) / 2
big = max(parts.values(), key=lambda o: (lambda b: (b[1] - b[0]).length)(bbox([o]))); bl, bh = bbox([big]); bc = (bl + bh) / 2
for az in range(0, 360, 45):
    a = math.radians(az); r = (hi - lo).length * 0.42
    aim(Vector((c.x + math.sin(a) * r, c.y - math.cos(a) * r, lo.z + 1.7)), Vector((bc.x, bc.y, lo.z + 12)), 24); shot(f"complex_eye_az{az:03d}", f"Whole asset at eye level from azimuth {az}")
# orthographic top of the whole asset (no terrain), with its centre and width for the Kit Lab overlay
solid = [o for o in parts.values() if not o.name.endswith(("_Terrain", "_Rocks"))]; show(solid)
tl, th = bbox(solid); tc = (tl + th) / 2; sc = max(th.x - tl.x, (th.y - tl.y) * 4 / 3) * 1.05
aim(Vector((tc.x, tc.y, th.z + 300)), Vector((tc.x, tc.y, tl.z)), ortho=sc); shot("complex_ortho_top", "Whole asset, orthographic top")
json.dump({"centre": [round(tc.x, 3), round(tc.y, 3)], "ortho_scale": round(sc, 3)}, open(os.path.join(OUT, "complex_ortho_top.json"), "w"))

# one of each distinct part
seen = {}
for k in sorted(parts):
    base = re.sub(r"[A-Z]$", "", k) if not k.endswith(("Terrain", "Rocks")) else k
    if k in HEROES or base not in seen: seen.setdefault(base, k) if k not in HEROES else None
    if k in HEROES: seen[k] = k
for p in sorted(set(seen.values())):
    objs = [parts[p]] + list(parts[p].children_recursive); show(objs); lo, hi = bbox(objs)
    if p in HEROES:
        for el in (0, 20, 45): orbit(f"part_{p}", objs, list(range(0, 360, 22)), el, f"Part {p} (hero)")
        elevations(f"part_{p}", objs, f"Part {p}"); closeups(f"part_{p}", objs, f"Part {p}", grid=True)
    else:
        orbit(f"part_{p}", objs, [45, 135, 225, 315], 22, f"Part {p}"); elevations(f"part_{p}", objs, f"Part {p}")
        if max(hi - lo) > 12: closeups(f"part_{p}", objs, f"Part {p}")

plan = {k: {"min": [round(v, 2) for v in bbox([o])[0]], "max": [round(v, 2) for v in bbox([o])[1]]} for k, o in parts.items()}
json.dump({"asset": ROOT, "renders": manifest, "parts": {k: [round(x, 2) for x in (bbox([v])[1] - bbox([v])[0])] for k, v in parts.items()}}, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
json.dump({"parts": plan}, open(os.path.join(OUT, "plan.json"), "w"), indent=1)
print("DONE", len(manifest))
