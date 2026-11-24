# Kit Lab

> **Before touching any kit model, read [LICOES.md](LICOES.md)** — the mistakes already made on this complex and the
> checklist that prevents them.

A workbench for the models built after the KitBash3D *Age of Egypt* kit (BldgLgPyramid_A), apart from the scene.

```
cd source
npm run kitlab          # http://localhost:8130 — rebuilds and reloads when a model file changes
npm run kitlab:build    # only writes tools/kitlab/kitlab.html (it also opens straight from disk)
```

## What it shows

- **Models**: each kit part we build (pyramid, entrance, terrace, wall, corner obelisk, banner, torch, fire bowl, pots,
  fallen beam) and the whole complex assembled as in the scene.
- **Views** that frame the model exactly as the kit photos do: front, back, left, right and top elevations, and the
  four 3/4 views (the complex: eight azimuths, high or low). Drag to orbit, right-drag to pan, wheel to zoom, `F` to
  frame again.
- **The kit photo** beside the model, or laid over it with adjustable opacity, to compare silhouettes.
- **Dimensions** of our model against the kit's (scaled 2.4×), with the difference per axis.
- **Checks**: faces seen from behind are painted magenta (a missing or inside-out face shows as a magenta hole),
  edges, LOD 0/1/2.

Colours are by material only: the scene's shaders don't run here, so judge shape, proportion and placement here and
materials in the scene.

## Adjusting a model without touching the scene

1. Copy the model's function (e.g. `meshKitEntrance`) from `src/meshes.js` into `workbench.js`.
2. Edit it there. A function declared in `workbench.js` replaces the project's one in the Kit Lab only.
3. When it looks right, copy it back over the old one in `src/meshes.js` and delete it from `workbench.js`.

To add a model to the list, add an entry to `MODELS` in `workbench.js` (`kit` is the part's name in the kit renders).

## Kit photos

The renders of the licensed kit stay on this computer, in `reference/kb3d/pyramid_detail/` (git-ignored). They are made
in Blender, headless, from the kit's .blend (read-only, never saved):

```
blender -b <kb3d_ageofegypt-native.blend> --python tools/kitlab/pyr_detail.py -- ../reference/kb3d/pyramid_detail
```

Without them the lab still works, with no photos.
