# Benchmark plan

## Purpose

Use measurements to answer two questions before locking the implementation:

1. Is live preview feasible when toggles and sliders change?
2. Which implementation choices improve speed, memory, and responsiveness?

The benchmark should measure the actual user pipeline, not isolated micro-optimizations only.

Do not build the full benchmark matrix before the visual spike. First prove that the scan effect can look convincing on one page. Then benchmark the smallest set of scenarios needed to choose the implementation.

## Performance targets

These are initial targets. Adjust after measuring real devices.

- First preview after PDF selection: under 1000 ms for a normal one-page text PDF.
- Toggle response to visible preview update: under 150 ms p50, under 300 ms p95.
- Slider drag feedback: under 100 ms p50 for preview-only effects, under 200 ms p95.
- Main-thread long tasks: no task over 50 ms during normal control changes.
- Export throughput: under 1000 ms per page for common office PDFs at default quality.
- Browser memory: avoid sustained growth across repeated preview updates.
- Output size: warn when output is more than 5x the input size or above a configurable absolute threshold.

If preview cannot hit these targets at export quality, the app should use a lower preview scale and reserve full quality for export.
If expensive effects cannot hit live-update targets, they should update on slider release by default.

## Pipeline stages to measure

- PDF load and parse.
- First page rasterization.
- Selected page rasterization at preview scale.
- Selected page rasterization at export scale.
- Scan-effect processing.
- Canvas/blob conversion.
- Preview image paint latency.
- Full export page processing.
- PDF assembly.
- Download blob creation.
- Output file size growth.
- UI responsiveness during preview and export.

## Benchmark PDFs

Keep sample files in a later `benchmarks/fixtures/` directory. Use generated or permissively licensed documents.

Start with three fixtures:

- `text-1p.pdf`
- `image-1p.pdf`
- `mixed-10p.pdf`

Add the larger set only after the basic pipeline exists:

- `text-1p.pdf`: one page, mostly text.
- `text-10p.pdf`: ten pages, mostly text.
- `image-1p.pdf`: one page with a large image.
- `mixed-10p.pdf`: text, tables, vector shapes, and images.
- `heavy-vector-1p.pdf`: many vector paths.
- `large-50p.pdf`: realistic longer document.
- `scanned-input-10p.pdf`: already raster/scanned-looking input.

Each fixture should have recorded file size, page count, page dimensions, and rough content type.

## Config cases

Run the same PDF through several deterministic scan configs:

- `baseline`: render only, no scan effects.
- `subtle`: small rotation, slight contrast, light noise.
- `office`: grayscale, blur, moderate noise, paper tint.
- `photocopy`: grayscale, high contrast, dropout, speckles.
- `worst-common`: high noise, uneven blur, speckles, JPEG compression.

Every config must include a fixed seed so benchmark runs are comparable.

## Implementation variants to compare

### PDF rasterization

- `pdfjs-dist` rendering into canvas.
- `mupdf-js` rendering into PNG.

Decision criteria:

- First-page render time.
- Repeated page render time.
- Worker support and bundling complexity.
- Output fidelity on text, vector, and image-heavy pages.
- Memory behavior.

### Preview processing

- Main-thread canvas filters.
- Worker `OffscreenCanvas` filters.
- Canvas filters plus manual pixel pass for noise/dropout.
- JS typed-array pixel processing.
- Rust/WASM pixel kernel, only if JS/canvas is too slow.

Decision criteria:

- Toggle-to-visible-preview latency.
- p95 latency during slider drag.
- Main-thread blocking.
- Visual consistency between preview and export.
- Bundle size and implementation complexity.

### PDF output

- `pdf-lib` image-per-page output.
- `jsPDF` image-per-page output.
- `pdfkit` in browser only if needed.

Decision criteria:

- Assembly time.
- Output file size.
- Memory use.
- Page size fidelity.
- Browser bundling cost.

## Measurements

Use `performance.mark()` and `performance.measure()` around each stage:

- `pdf.load`
- `pdf.render.preview`
- `pdf.render.export`
- `effect.preview`
- `effect.export`
- `preview.blob`
- `preview.paint`
- `export.page`
- `export.pdf_assembly`
- `export.total`

For live-update feasibility, record complete input-to-preview latency:

- User changes setting.
- Debounce starts.
- Previous job is cancelled.
- New preview job starts.
- Effect finishes.
- Preview blob/object URL is ready.
- Browser paints the new image.

Also record:

- p50, p95, max duration.
- Pages per second for export.
- Peak page bitmap dimensions and bytes.
- Approximate memory via `performance.memory` when available.
- Long tasks via `PerformanceObserver` with `longtask`.
- Number of cancelled preview jobs during slider drag.

## Harness design

Add a benchmark page or route separate from the product UI:

- Loads fixture PDFs from local assets.
- Runs selected PDF/config/variant combinations.
- Runs each scenario at least five times after one warmup.
- Writes JSON results to the browser console and downloadable `.json`.
- Can run one scenario interactively or the full suite.
- Shows current stage so slow tests are diagnosable.

The harness should avoid test code in product components. Shared scan/render functions should be imported by both the app and benchmarks.

Build the harness incrementally:

1. Manual timing logs for the visual spike.
2. A small route that runs one PDF/config pair.
3. JSON export after metrics are stable.
4. Broader fixture/variant matrix only when needed.

## Live preview test

Simulate real user interaction:

1. Load a fixture PDF.
2. Render page 1 at preview scale.
3. Apply a sequence of setting changes every 50 ms for two seconds.
4. Cancel stale jobs as new changes arrive.
5. Record the latency of the final visible preview after each accepted change.
6. Repeat for text, image-heavy, and mixed PDFs.

Pass condition:

- The UI remains responsive.
- p95 accepted-change latency is under 300 ms.
- No memory growth after repeated runs.
- Cancelled jobs do not finish and overwrite newer previews.

## Export test

For each fixture and config:

1. Load PDF.
2. Render all pages at export scale.
3. Apply effects.
4. Assemble PDF.
5. Record total time, per-page time, output size, and memory.

Pass condition:

- Progress updates at least once per page.
- No main-thread freeze during worker-enabled variants.
- Output page count and dimensions match the input.

## Benchmark-driven decisions

Use results to make these decisions:

- Preview render scale default.
- Whether preview processing needs workers from the start.
- Whether Rust/WASM is justified.
- Whether `pdfjs-dist` or `mupdf-js` should be the default renderer.
- Which effects are safe for real-time sliders.
- Which effects should update only on slider release.
- PDF output library choice.
- Maximum recommended page count or warnings for large files.
- Output quality defaults and file-size warning thresholds.

## Expected first implementation

Start with:

- `pdfjs-dist` for rasterization.
- Canvas preview path on the main thread for the visual spike.
- `pdf-lib` for output.
- Deterministic effect function shared by preview and export.
- Minimal measurements before building a full benchmark harness.

Only introduce Rust/WASM after benchmark evidence shows the scan-effect stage is the bottleneck.
