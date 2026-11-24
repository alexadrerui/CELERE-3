# Detailed photo session of KB3D_AOE_BldgLgPyramid_A, run headless:
#   blender -b <kit.blend> --python pyr_detail.py -- <out_dir>
# Read-only: the kit file is never saved. Writes PNGs and a manifest.json to out_dir.
import bpy, math, os, sys, json, re
from mathutils import Vector

OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
os.makedirs(OUT, exist_ok=True)
ROOT = "KB3D_AOE_BldgLgPyramid_A_grp"
kit = bpy.data.scenes["KB3D_AgeOfEgypt-Native"]

S = bpy.data.scenes.new("REF_Detail")
S.render.engine = 'BLENDER_EEVEE'
S.render.resolution_x, S.render.resolution_y = 1600, 1200
S.view_settings.view_transform = 'AgX'
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
parts = {re.sub(r"^KB3D_AOE_BldgLgPyramid_A_", "", c.name): c for c in root.children_recursive if c.type == 'MESH'}

def bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == 'MESH' for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi

def show(objs):
    for o in list(act.objects): act.objects.unlink(o)
    for o in objs:
        if o.name not in act.objects: act.objects.link(o)

def aim(loc, target, lens=35, ortho=None):
    cam.location = loc; cam.rotation_euler = (target - loc).to_track_quat('-Z', 'Y').to_euler()
    d = (target - loc).length
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
    cam.data.clip_start = max(0.05, d * 0.002); cam.data.clip_end = d * 20 + 500

def fit_dist(R, lens=35):
    return R / math.tan(math.atan(18 / lens) * 0.92)  # sensor 36 mm, a little margin

manifest = []
def shot(name, note):
    S.render.filepath = os.path.join(OUT, name + ".png"); bpy.ops.render.render(write_still=True, scene=S.name)
    manifest.append({"file": name + ".png", "view": note})

def orbit(prefix, objs, az_list, el, label, lens=35, margin=1.0):
    lo, hi = bbox(objs); c = (lo + hi) / 2; R = (hi - lo).length / 2 * margin
    ground.location = (c.x, c.y, lo.z - 0.01); ground.scale = (R * 6, R * 6, 1)
    for az in az_list:
        a, e = math.radians(az), math.radians(el)
        d = fit_dist(R, lens); loc = c + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * d
        aim(loc, c, lens); shot(f"{prefix}_az{az:03d}_el{el:02d}", f"{label}: perspective from azimuth {az} deg (0 = from -y), elevation {el} deg")

def elevations(prefix, objs, label):
    lo, hi = bbox(objs); c = (lo + hi) / 2; d = hi - lo; asp = S.render.resolution_x / S.render.resolution_y
    for nm, v, w, h in (("front", Vector((0, -1, 0)), d.x, d.z), ("back", Vector((0, 1, 0)), d.x, d.z), ("left", Vector((-1, 0, 0)), d.y, d.z), ("right", Vector((1, 0, 0)), d.y, d.z), ("top", Vector((0, 0, 1)), d.x, d.y)):
        aim(c + v * (d.length + 20), c, ortho=max(w, h * asp) * 1.08)
        shot(f"{prefix}_ortho_{nm}", f"{label}: orthographic {nm} view")

def closeups(prefix, objs, label):
    # eye-level and mid-height close-ups on each of the four faces, plus the top
    lo, hi = bbox(objs); c = (lo + hi) / 2; d = hi - lo
    for nm, n, half in (("south", Vector((0, -1, 0)), d.y / 2), ("north", Vector((0, 1, 0)), d.y / 2), ("west", Vector((-1, 0, 0)), d.x / 2), ("east", Vector((1, 0, 0)), d.x / 2)):
        face = c + n * half
        for hn, hf in (("foot", 0.12), ("mid", 0.5), ("top", 0.88)):
            tgt = Vector((face.x, face.y, lo.z + d.z * hf)); dist = max(6.0, min(d.z * 0.45, 18.0))
            loc = tgt + n * dist + Vector((0, 0, 1.7 if hn == "foot" else 0)); loc.z = max(loc.z, lo.z + 1.7)
            aim(loc, tgt, 40); shot(f"{prefix}_close_{nm}_{hn}", f"{label}: close-up of the {nm} face at its {hn} (camera {dist:.0f} m away)")

all_objs = [root] + list(root.children_recursive)
# 1) the whole complex: 8 azimuths high, 8 lower, plus eye-level views toward the pyramid from around
show(all_objs)
orbit("complex", all_objs, list(range(0, 360, 45)), 30, "Whole complex")
orbit("complex", all_objs, list(range(0, 360, 45)), 12, "Whole complex", lens=28, margin=0.8)
lo, hi = bbox(all_objs); c = (lo + hi) / 2; py = bbox([parts["BuildingB"]]); pc = (py[0] + py[1]) / 2
for az in range(0, 360, 45):
    a = math.radians(az); r = (hi - lo).length * 0.42
    loc = Vector((c.x + math.sin(a) * r, c.y - math.cos(a) * r, lo.z + 1.7)); aim(loc, Vector((pc.x, pc.y, lo.z + 12)), 24)
    shot(f"complex_eye_az{az:03d}", f"Whole complex: at eye level (1.7 m) from azimuth {az} deg, looking at the pyramid")

# 2) each distinct part on its own (one of each repeated kind)
unique = ["BuildingB", "BuildingA", "BuildingC", "Wall", "ObeliskA", "BannerA", "FireBowlA", "TorchBowlA", "StandingTochA", "ClayPots", "ClayPotA", "Rocks"]
for p in unique:
    if p not in parts: continue
    objs = [parts[p]] + list(parts[p].children_recursive); show(objs)
    lo, hi = bbox(objs); big = max(hi - lo) > 12
    orbit(f"part_{p}", objs, [45, 135, 225, 315], 22, f"Part {p}")
    elevations(f"part_{p}", objs, f"Part {p}")
    if big: closeups(f"part_{p}", objs, f"Part {p}")

json.dump({"asset": ROOT, "renders": manifest, "parts": {k: [round(x, 2) for x in (bbox([v])[1] - bbox([v])[0])] for k, v in parts.items()}}, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
print("DONE", len(manifest))
