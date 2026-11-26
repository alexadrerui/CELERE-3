# Close photo session of ONE kit part (plus the parts sitting on it), framed on a box of it, read-only:
#   blender -b <kit.blend> --python tools/kitlab/part_closeups.py -- <out_dir> <AssetId> <Part> [--with P1,P2] [--box x0,y0,x1,y1]
# --box: kit x/y (world) limits of the region to frame (e.g. a building without its long forecourt); default the part.
# Renders 1600 x 1200: an orbit every 22.5 deg at 5, 20, 40 and 65 deg up; orthographic front/back/left/right/top of the
# box; close-ups of each face on a 4 x 3 grid from 0.35 and 0.7 of the box height away; a ring of views at eye level
# round the box. Names: <Part>_orbit_az###_el##, _ortho_*, _face_<side>_<row><col>_<near|far>, _eye_az###.
import bpy, math, os, sys, json
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
OUT = os.path.abspath(a[0]); ASSET, PART = a[1], a[2]; os.makedirs(OUT, exist_ok=True)
opt = lambda k: a[a.index(k) + 1] if k in a else None
WITH = (opt("--with") or "").split(",") if opt("--with") else []
pre = f"KB3D_AOE_{ASSET}_"
objs = [bpy.data.objects[pre + PART]] + [bpy.data.objects[pre + w] for w in WITH]
S = bpy.data.scenes.new("REF_Close"); S.render.engine = 'BLENDER_EEVEE'; S.render.resolution_x, S.render.resolution_y = 1600, 1200
S.view_settings.view_transform = 'AgX'
W = bpy.data.worlds.new("REF_CW"); W.use_nodes = True; W.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.74, 1); W.node_tree.nodes["Background"].inputs[1].default_value = 0.9; S.world = W
sun = bpy.data.objects.new("REF_CS", bpy.data.lights.new("REF_CS", 'SUN')); sun.data.energy = 3.2; sun.data.angle = math.radians(1.5); sun.rotation_euler = (math.radians(52), 0, math.radians(-35)); S.collection.objects.link(sun)
col = bpy.data.collections.new("REF_CC"); S.collection.children.link(col)
for o in objs: col.objects.link(o)
cam = bpy.data.objects.new("REF_CCAM", bpy.data.cameras.new("REF_CCAM")); S.collection.objects.link(cam); S.camera = cam
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
if opt("--box"):
    x0, y0, x1, y1 = map(float, opt("--box").split(",")); lo.x, lo.y, hi.x, hi.y = max(lo.x, x0), max(lo.y, y0), min(hi.x, x1), min(hi.y, y1)
c = (lo + hi) / 2; d = hi - lo; R = d.length / 2
CAMT = [None]
def aim(loc, tgt, lens=35, ortho=None):
    cam.location = loc; cam.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler(); CAMT[0] = tgt.copy()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
    cam.data.clip_start = 0.05; cam.data.clip_end = 2000
man = []
def shot(n, note):  # (each shot keeps its camera: the Kit Lab puts our model in the same view; "tgt" from aim())
    S.render.filepath = os.path.join(OUT, n + ".png"); bpy.ops.render.render(write_still=True, scene=S.name)
    cd = cam.data; k = {"ortho": cd.ortho_scale} if cd.type == 'ORTHO' else {"lens": cd.lens}
    man.append({"file": n + ".png", "view": note, "cam": {"loc": list(cam.location), "tgt": list(CAMT[0]), **k}})
fit = R / math.tan(math.atan(18 / 35) * 0.92)
for el in (5, 20, 40, 65):
    for k in range(16):
        az = 22.5 * k; t, e = math.radians(az), math.radians(el)
        aim(c + Vector((math.sin(t) * math.cos(e), -math.cos(t) * math.cos(e), math.sin(e))) * fit, c); shot(f"{PART}_orbit_az{round(az):03d}_el{el:02d}", f"orbit az {az} el {el} (0 = from -y, the front)")
asp = 4 / 3
for nm, v, w, h in (("front", Vector((0, -1, 0)), d.x, d.z), ("back", Vector((0, 1, 0)), d.x, d.z), ("left", Vector((-1, 0, 0)), d.y, d.z), ("right", Vector((1, 0, 0)), d.y, d.z), ("top", Vector((0, 0, 1)), d.x, d.y)):
    aim(c + v * (d.length + 50), c, ortho=max(w, h * asp) * 1.06); shot(f"{PART}_ortho_{nm}", f"orthographic {nm}")
for side, n, half, across, wid in (("front", Vector((0, -1, 0)), d.y / 2, Vector((1, 0, 0)), d.x), ("back", Vector((0, 1, 0)), d.y / 2, Vector((-1, 0, 0)), d.x),
                                   ("left", Vector((-1, 0, 0)), d.x / 2, Vector((0, -1, 0)), d.y), ("right", Vector((1, 0, 0)), d.x / 2, Vector((0, 1, 0)), d.y)):
    for r, hf in enumerate((0.15, 0.5, 0.85)):
        for cc, cf in enumerate((-0.375, -0.125, 0.125, 0.375)):
            tgt = c + n * half + across * wid * cf; tgt.z = lo.z + d.z * hf
            for dn, df in (("near", 0.35), ("far", 0.7)):
                loc = tgt + n * (d.z * df) + Vector((0, 0, d.z * 0.08)); loc.z = max(loc.z, lo.z + 1.7)
                aim(loc, tgt, 35); shot(f"{PART}_face_{side}_{r}{cc}_{dn}", f"{side} face, row {r} (0 foot, 2 top), column {cc} (0 left), {dn}")
for k in range(12):
    t = math.radians(30 * k); r = max(d.x, d.y) * 0.9
    aim(Vector((c.x + math.sin(t) * r, c.y - math.cos(t) * r, lo.z + 1.7)), Vector((c.x, c.y, lo.z + d.z * 0.45)), 24); shot(f"{PART}_eye_az{30 * k:03d}", f"eye level from az {30 * k}")
json.dump({"part": PART, "box": [list(lo), list(hi)], "shots": man}, open(os.path.join(OUT, f"{PART}_closeups.json"), "w"), indent=1)
print("CLOSE DONE", len(man))
