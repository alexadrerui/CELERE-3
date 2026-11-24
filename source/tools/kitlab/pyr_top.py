# Orthographic top view of the whole KB3D_AOE_BldgLgPyramid_A complex, read-only, for the Kit Lab's plan overlay.
#   blender -b <kit.blend> --python tools/kitlab/pyr_top.py -- <out_dir>
# Writes complex_ortho_top.png (1600 x 1200) and complex_ortho_top.json: its centre (kit x, y) and ortho_scale (width).
import bpy, sys, os, json, math
from mathutils import Vector
OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 1]); os.makedirs(OUT, exist_ok=True)
root = bpy.data.objects["KB3D_AOE_BldgLgPyramid_A_grp"]
S = bpy.data.scenes.new("REF_Top"); S.render.engine = 'BLENDER_EEVEE'; S.render.resolution_x, S.render.resolution_y = 1600, 1200
W = bpy.data.worlds.new("REF_TW"); W.use_nodes = True; W.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.74, 1); S.world = W
sun = bpy.data.objects.new("REF_TS", bpy.data.lights.new("REF_TS", 'SUN')); sun.data.energy = 3; sun.rotation_euler = (math.radians(35), 0, math.radians(-35)); S.collection.objects.link(sun)
col = bpy.data.collections.new("REF_TC"); S.collection.children.link(col)
objs = [o for o in root.children_recursive if o.type == 'MESH' and not o.name.endswith(("_Terrain", "_Rocks"))]
for o in objs: col.objects.link(o)
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), 0)); hi = Vector((max(p.x for p in pts), max(p.y for p in pts), 0)); c = (lo + hi) / 2
cam = bpy.data.objects.new("REF_TCAM", bpy.data.cameras.new("REF_TCAM")); S.collection.objects.link(cam); S.camera = cam
scale = max(hi.x - lo.x, (hi.y - lo.y) * 4 / 3) * 1.05
cam.location = (c.x, c.y, 400); cam.rotation_euler = (0, 0, 0); cam.data.type = 'ORTHO'; cam.data.ortho_scale = scale; cam.data.clip_end = 1000
S.render.filepath = os.path.join(OUT, "complex_ortho_top.png"); bpy.ops.render.render(write_still=True, scene=S.name)
json.dump({"centre": [round(c.x, 3), round(c.y, 3)], "ortho_scale": round(scale, 3)}, open(os.path.join(OUT, "complex_ortho_top.json"), "w"))
print("TOP DONE")
