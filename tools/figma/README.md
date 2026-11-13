# Editable Figma copy of the site

Every time the site goes live, a new snapshot of it goes into the Figma file
**portfolio.27 website** (https://www.figma.com/design/ZvS3oZJ97UlncdfpGPT7DB).
The snapshot is real layers: frames with auto layout, editable text in the site's
fonts, and images as fills. It is not a screenshot.

- Page **Desktop**: the site at 1440 px wide.
- Page **Phone**: the site at 390 px wide.
- Each release adds a new top-level frame named `<Page> · v<N> · <date>`, placed to the
  right of the older ones. Older frames, including any hand-edited ones, are never touched.
  Re-running the same label replaces only the frame with that exact name.

## Sync a release (run by Claude after each push to main)

1. Serve the site and extract both viewports (about 3 minutes):

   ```sh
   python3 -m http.server 8765 &        # from the repo root
   node tools/figma/extract.mjs --url=http://localhost:8765/
   ```

   Writes `out/figma/desktop.json`, `out/figma/phone.json` and `out/figma/assets/`
   (git-ignored). Spotify and the three.js head are blocked, so the site's fallbacks are
   captured instead; canvases, SVG icons and gradients are captured as images.

2. Build the Figma scripts, using the archive version as the label:

   ```sh
   node tools/figma/build-calls.mjs v10
   ```

   Writes `out/figma/calls/<viewport>-NN.js` (each under the 50k limit) and `plan.json`.

3. Run each `calls/*.js` file, in order, through `use_figma` on the file above. The first
   chunk of a viewport creates the root frame; later chunks append to it. Each run returns
   `images`: save the lists of a viewport, concatenated, as `out/figma/images-<viewport>.json`.

4. Upload the images:

   ```sh
   node tools/figma/upload.mjs map desktop out/figma/images-desktop.json
   ```

   Call `upload_assets` with the printed node ids (60 per call) **and `currentPageId`** set
   to that page's id (Desktop or Phone). Save the returned `targetNodeId submitUrl` pairs
   as `out/figma/urls.txt`, then:

   ```sh
   node tools/figma/upload.mjs out/figma/upload-desktop.json out/figma/urls.txt
   ```

5. Check with `get_screenshot` on one section of each new frame.

## Known gaps

- Spotify embeds come in as grey placeholders named `iframe`.
- The talking head is a still of the 3D point cloud.
- Hover states and animations are not carried over.
