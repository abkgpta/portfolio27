# Rebuilding the viewer model

1. `python tess.py` tessellates the signed-off STEP files (needs `build123d`) into `.npz` meshes with real surface normals. The grow light LED, spotlight lens and clock face are split out so they can glow at night.
2. `python pack.py` writes `og-parts-raw.glb` (mm, Z up, one node per part).
3. `npx gltfpack -i og-parts-raw.glb -o ../og-parts.glb -c -kn -km` compresses it with meshopt.
4. `python data.py` rebuilds `../og-data.json` from `cmf.json` (colours, materials, specs) and the part list.

Paths point at the project's shared CAD and CMF folders. Layouts (compact, moderate, expanded) live in `og-viewer.js`.
