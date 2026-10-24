# Measuring Free My TV on an LG TV

webOS opens Chromium's inspector for Developer Mode apps on port 9998 (`http://<TV>:9998/json/list`). These talk to
it with Node 22+ (its built-in WebSocket), while Free My TV is open on the TV. `TV=<ip>` picks the TV.

- `node tools/tv/bench.mjs <label>`: moves focus along the shelf, the picks and the drawer (arrows only, nothing
  opens) and prints frame times per step, plus where the renderer spent its time. 60 fps is 16.7 ms a frame.
- `node tools/tv/layers.mjs`: which composited layers repaint while focus moves.
- `node tools/tv/shot.mjs out.png [js] [clip]`: a screenshot of the app; a clip with `"scale":2` shows the 4K pixels.
- `node tools/tv/probe.mjs '<js>'`: runs an expression in the app and prints the result.

On 4K webOS TVs the page runs at devicePixelRatio 2: every repaint is four times the pixels of 1080p, so animate only
transform and opacity, and keep what animates on its own layer.
