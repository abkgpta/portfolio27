# Studio room (prototype)

A homepage idea: the portfolio as a 3D studio room. Each object is a real project model and opens that project.

- overgrwth: `assets/og-system.glb`, the signed-off 3 in CAD build.
- CortX: the team dock, the headset (seated on head form 1), the back unit and the coach tablet.
- DASH: built in code from the overview spec (42 x 28 x 11 mm pod, 64 x 32 dot screen). The screen shows the time in India, live.

three.js r170 from jsDelivr. Uses the shared ABK loader (`/abk/loader.js`). `room.js` renders on demand, so it costs nothing while nobody moves.
Models are shrunk with `tools/room/quantize_glb.py` (KHR_mesh_quantization: 16-bit positions, 8-bit normals), 5.9 MB down to 3.3 MB with the same geometry.
Every view is fitted to the free part of the screen (clear of the title, the dock and the project panel), so it reframes for any phone or desktop size.

Not linked from the live site. Preview only until abhik approves.
