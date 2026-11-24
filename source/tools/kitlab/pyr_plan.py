# Plan of KB3D_AOE_BldgLgPyramid_A, headless and read-only:
#   blender -b <kit.blend> --python tools/kitlab/pyr_plan.py -- <out_dir>
# Writes plan.json (each part's world bounding box, the wall's footprint as line segments at its foot, the stairs'
# runs) and plan_top.png (an orthographic top view of the whole complex).
import bpy, bmesh, math, os, sys, json, re
from mathutils import Vector

OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 1]); os.makedirs(OUT, exist_ok=True)
root = bpy.data.objects["KB3D_AOE_BldgLgPyramid_A_grp"]
name = lambda o: re.sub(r"^KB3D_AOE_BldgLgPyramid_A_", "", o.name)
parts = {}
for o in root.children_recursive:
    if o.type != 'MESH': continue
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    parts[name(o)] = {"min": [round(min(p[i] for p in pts), 2) for i in range(3)], "max": [round(max(p[i] for p in pts), 2) for i in range(3)]}

def foot_edges(o, z_band):
    # edges of the mesh lying near the ground (z within z_band of its lowest point), in world x, y
    dg = bpy.context.evaluated_depsgraph_get(); m = o.evaluated_get(dg).to_mesh(); mw = o.matrix_world
    vs = [mw @ v.co for v in m.vertices]; z0 = min(v.z for v in vs); E = []
    for e in m.edges:
        a, b = vs[e.vertices[0]], vs[e.vertices[1]]
        if a.z - z0 < z_band and b.z - z0 < z_band and (a.xy - b.xy).length > 0.5: E.append([round(a.x, 2), round(a.y, 2), round(b.x, 2), round(b.y, 2)])
    o.evaluated_get(dg).to_mesh_clear(); return z0, E

plan = {"parts": parts}
for p in ("Wall", "BuildingC", "BuildingA"):
    obj = next(o for o in root.children_recursive if name(o) == p)
    z0, E = foot_edges(obj, 0.15); plan[p + "_foot"] = {"z": round(z0, 2), "edges": E}
# wall profile: vertices on a section across the south run, to read its base (skirt) and height
w = next(o for o in root.children_recursive if name(o) == "Wall")
dg = bpy.context.evaluated_depsgraph_get(); m = w.evaluated_get(dg).to_mesh(); mw = w.matrix_world
cx = (parts["Wall"]["min"][0] + parts["Wall"]["max"][0]) / 2
sec = sorted({(round((mw @ v.co).y, 2), round((mw @ v.co).z, 2)) for v in m.vertices if abs((mw @ v.co).x - cx - 10) < 0.6})
plan["Wall_section_x"] = round(cx + 10, 2); plan["Wall_section"] = sec
w.evaluated_get(dg).to_mesh_clear()
json.dump(plan, open(os.path.join(OUT, "plan.json"), "w"), indent=1)

# top view
S = bpy.data.scenes["KB3D_AgeOfEgypt-Native"]; S.render.resolution_x = S.render.resolution_y = 1600; S.render.engine = 'BLENDER_EEVEE'
cam = bpy.data.objects.new("PLAN_CAM", bpy.data.cameras.new("PLAN_CAM")); S.collection.objects.link(cam)
lo = Vector((min(v["min"][0] for v in parts.values()), min(v["min"][1] for v in parts.values()), 0)); hi = Vector((max(v["max"][0] for v in parts.values()), max(v["max"][1] for v in parts.values()), 0))
c = (lo + hi) / 2; cam.location = (c.x, c.y, 300); cam.rotation_euler = (0, 0, 0); cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(hi.x - lo.x, hi.y - lo.y) * 1.05; cam.data.clip_end = 1000
S.camera = cam; S.render.filepath = os.path.join(OUT, "plan_top.png"); bpy.ops.render.render(write_still=True, scene=S.name)
plan["top_view"] = {"centre": [round(c.x, 2), round(c.y, 2)], "ortho_scale": round(cam.data.ortho_scale, 2), "px": 1600}
json.dump(plan, open(os.path.join(OUT, "plan.json"), "w"), indent=1)
print("PLAN DONE")
