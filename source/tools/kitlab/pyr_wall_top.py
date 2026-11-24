# The kit wall's crest: its vertices near the top (where the wall stands at full height), as plan lines.
#   blender -b <kit.blend> --python tools/kitlab/pyr_wall_top.py -- <out_dir>
import bpy, sys, os, json, re
from collections import Counter
OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 1]); os.makedirs(OUT, exist_ok=True)
root = bpy.data.objects["KB3D_AOE_BldgLgPyramid_A_grp"]
w = next(o for o in root.children_recursive if re.sub(r"^KB3D_AOE_BldgLgPyramid_A_", "", o.name) == "Wall")
dg = bpy.context.evaluated_depsgraph_get(); m = w.evaluated_get(dg).to_mesh(); mw = w.matrix_world
P = [mw @ v.co for v in m.vertices]; zt = max(p.z for p in P)
cx, cy = -194.65, 315.28
res = {}
for band, lo in (("crest", zt - 1.3), ("mid", 2.0)):
    pts = [(p.x - cx, p.y - cy) for p in P if (p.z > lo if band == "crest" else 1.6 < p.z < 2.4)]
    X = Counter(round(x) for x, y in pts); Y = Counter(round(y) for x, y in pts)
    res[band] = {"x": {k: [round(min(y for x, y in pts if round(x) == k), 1), round(max(y for x, y in pts if round(x) == k), 1)] for k, v in X.items() if v >= 6},
                 "y": {k: [round(min(x for x, y in pts if round(y) == k), 1), round(max(x for x, y in pts if round(y) == k), 1)] for k, v in Y.items() if v >= 6}}
json.dump(res, open(os.path.join(OUT, "wall_lines.json"), "w"), indent=1, sort_keys=True)
print("WALL DONE")
