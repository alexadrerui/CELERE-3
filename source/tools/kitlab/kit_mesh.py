# Export the kit's own meshes for the Kit Lab's 3D comparison (LOCAL ONLY: the KitBash3D geometry is licensed; the
# files go to reference/kb3d/mesh/, which git ignores, and the Kit Lab reads them at run time. They must never be
# copied into src/, the build, or any committed file):
#   blender -b <kit.blend> --python tools/kitlab/kit_mesh.py -- <out_dir> <Asset[,Asset...]|buildings> [Part,...] [--budget N] [--base]
# "buildings": every BldgLg/BldgMd/BldgSm asset. Without parts: every mesh part of the asset except Terrain and Rocks.
# --budget N: at most about N triangles per asset (default 400000): heavier assets are thinned with a Decimate
# modifier added for the export only (the kit file is never saved). --base: without the file's own modifiers.
# Per part: <Asset>_<Part>.bin, triangles in the kit's world (Blender: metres, z up, not scaled), 9 float32 a
# triangle, then one uint8 a triangle (its material's index); index.json lists each part's file, triangle count,
# material names and box, and each asset's box.
import bpy, os, sys, json, struct, re
a = sys.argv[sys.argv.index("--") + 1:]
OUT = os.path.abspath(a[0]); os.makedirs(OUT, exist_ok=True)
opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
budget = int(opt("--budget", 400000)); base = "--base" in a
pos_args = [x for i, x in enumerate(a[1:], 1) if not x.startswith("--") and a[i - 1] != "--budget"]
assets = pos_args[0]; want_parts = [p for p in (pos_args[1].split(",") if len(pos_args) > 1 else []) if p]
if assets == "buildings":
    assets = sorted({m.group(1) for o in bpy.data.objects for m in [re.match(r"^KB3D_AOE_(Bldg(?:Lg|Md|Sm)\w+?_[A-Z])_grp$", o.name)] if m})
    assets = [x for x in assets if x != "BldgLgPyramid_A"]  # (the complex we model: exported at full detail on its own)
else: assets = assets.split(",")
idx_path = os.path.join(OUT, "index.json")
index = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
dg = bpy.context.evaluated_depsgraph_get()
def tri_count(o):
    src = o if base else o.evaluated_get(dg); me = src.to_mesh(); me.calc_loop_triangles(); n = len(me.loop_triangles); src.to_mesh_clear(); return n
for A in assets:
    pre = f"KB3D_AOE_{A}_"; root = bpy.data.objects.get(pre + "grp")
    if not root: print("KITMESH missing", A); continue
    parts = {o.name[len(pre):]: o for o in root.children_recursive if o.type == 'MESH' and o.name.startswith(pre)}
    want = want_parts or [p for p in parts if p not in ("Terrain", "Rocks")]
    counts = {p: tri_count(parts[p]) for p in want}; total = sum(counts.values()); ratio = min(1.0, budget / max(1, total))
    alo = [1e9] * 3; ahi = [-1e9] * 3; done = 0
    for p in want:
        o = parts[p]; mod = None
        if ratio < 0.999 and counts[p] > 2000:
            mod = o.modifiers.new("REF_DEC", 'DECIMATE'); mod.ratio = max(0.02, ratio); dg.update()
        src = o if base and not mod else o.evaluated_get(dg)
        me = src.to_mesh(); me.calc_loop_triangles(); M = o.matrix_world
        mats = [m.name if m else "" for m in o.data.materials]
        V = [M @ v.co for v in me.vertices]; tris = me.loop_triangles
        pos = bytearray(); mat = bytearray(); lo = [1e9] * 3; hi = [-1e9] * 3
        for t in tris:
            for vi in t.vertices:
                v = V[vi]; pos += struct.pack("<3f", v.x, v.y, v.z)
                for k in range(3): lo[k] = min(lo[k], v[k]); hi[k] = max(hi[k], v[k])
            mat.append(min(255, t.material_index))
        nt = len(tris); src.to_mesh_clear()
        if mod: o.modifiers.remove(mod); dg.update()
        fn = f"{A}_{p}.bin"
        with open(os.path.join(OUT, fn), "wb") as f: f.write(pos); f.write(mat)
        index[f"{A}/{p}"] = {"file": fn, "tris": nt, "mats": mats, "box": [lo, hi], "base": base, "ratio": round(ratio, 4)}
        for k in range(3): alo[k] = min(alo[k], lo[k]); ahi[k] = max(ahi[k], hi[k])
        done += nt
    index[f"{A}/"] = {"asset": True, "box": [alo, ahi], "tris": done, "ratio": round(ratio, 4)}
    json.dump(index, open(idx_path, "w"), indent=1)
    print("KITMESH", A, len(want), "parts", done, "tris", "ratio", round(ratio, 3))
print("KITMESH DONE")
