# Implementation plan

## Product idea

Build a browser-only PDF tool that makes digital PDFs look like scanned documents. The user uploads a PDF locally, adjusts scan-effect controls, sees a live preview, and exports a new PDF. Documents should never leave the browser.

The project wedge is local-only processing plus a better interactive tuning experience and more convincing scan realism than simple existing converters.

The app should not spoof scanner hardware metadata by default. It can identify itself as the producing app, but fake device metadata is out of scope for the MVP.

## User workflow

1. Open the app.
2. Drop or select a PDF.
3. See page 1 rendered with the default scan preset.
4. Change controls and see the selected page update quickly.
5. Navigate between pages to inspect the effect.
6. Export the full processed PDF.
7. Download the result.

## MVP scope

- Client-only PDF processing.
- Drag/drop and file picker input.
- Single-page live preview.
- Page navigation for preview.
- Presets:
  - subtle scan
  - office scanner
  - photocopy
  - degraded fax
- Controls:
  - grayscale
  - border
  - paper tint
  - rotation
  - rotation variance
  - blur
  - uneven blur
  - noise
  - speckles
  - text dropout
  - contrast
  - brightness
  - JPEG quality
- Full PDF export.
- Export progress.
- Visual realism spike before full benchmark work.
- Benchmark page or command before UI polish.
- Warning that output is rasterized and loses selectable text.
- Output-size estimate or warning.

## Non-goals for MVP

- Server-side processing.
- OCR.
- Preserving selectable text.
- PDF form preservation.
- Scanner metadata spoofing.
- Batch processing multiple PDFs.
- Mobile-first heavy optimization.
- Native desktop app.

## Architecture

The app has four main layers:

1. UI layer: file input, preview, controls, progress, export action.
2. PDF layer: load PDF, render pages to bitmaps.
3. Scan-effect layer: transform page bitmaps using a serializable config.
4. Export layer: assemble processed page images into a new PDF.

The core pipeline is:

```text
PDF file
  -> load document
  -> render selected page to bitmap
  -> apply scan effect
  -> show preview

PDF file
  -> render all pages to bitmaps
  -> apply scan effect per page
  -> assemble image pages into PDF
  -> download
```

Preview and export should share the same effect function and config. They can differ in render scale.

## Recommended stack

- App framework: Vite + React.
- Language: TypeScript.
- PDF rendering: `pdfjs-dist`.
- Image processing: Canvas and `OffscreenCanvas`.
- Workers: web workers for preview/export processing.
- PDF output: `pdf-lib`.
- Benchmarking: browser benchmark harness using `performance.mark()`, `PerformanceObserver`, and downloadable JSON.

Rust/WASM should remain optional until benchmarks show the scan-effect stage is the bottleneck.

## Core modules

### `pdf-loader`

Responsibilities:

- Accept a `File`.
- Load it with `pdfjs-dist`.
- Expose page count and page dimensions.
- Render a page at a requested scale.
- Cache rendered source page images by page and scale.

### `scan-config`

Responsibilities:

- Define `ScanConfig`.
- Define presets.
- Normalize control values.
- Provide deterministic per-page seeds.

### `scan-effects`

Responsibilities:

- Apply the scan effect to an image.
- Support preview and export paths.
- Keep output deterministic for the same page/config/seed.
- Provide feature flags for expensive effects.

Initial effects:

- grayscale
- contrast
- brightness
- blur
- paper tint
- small rotation
- noise
- speckles
- dropout
- JPEG compression

### `preview-engine`

Responsibilities:

- Watch selected page and config.
- Debounce control changes.
- Cancel stale jobs.
- Render low-scale preview.
- Ensure older jobs cannot overwrite newer previews.
- Report timings for benchmarks.

### `export-engine`

Responsibilities:

- Render every page at export scale.
- Apply scan effects per page.
- Build the output PDF.
- Emit progress.
- Support cancellation.
- Report timings for benchmarks.

### `benchmark-harness`

Responsibilities:

- Run fixture PDFs through renderer/effect/export variants.
- Simulate live slider/toggle changes.
- Collect p50/p95/max timings.
- Record long tasks and approximate memory where available.
- Export JSON results.

## Live preview strategy

Live preview should optimize perceived responsiveness:

- Render only the selected page while controls are changing.
- Use a preview scale lower than export scale.
- Cache source render output so setting changes do not re-render the PDF page.
- Debounce slider changes by 50-150 ms.
- Cancel in-flight jobs when new settings arrive.
- Keep workers hot where possible.
- Use deterministic seeds so preview and export match.

Some controls can update immediately, while expensive controls may update after drag end if benchmarks require it.

Likely immediate controls:

- brightness
- contrast
- grayscale
- paper tint
- blur

Potentially expensive controls:

- speckles
- dropout
- heavy noise
- uneven blur
- JPEG compression preview

## Benchmark-first sequence

1. Build the smallest visual spike: one PDF page, hardcoded canvas effects, and one exported PDF.
2. Judge whether the scan effect is visually convincing enough to continue.
3. Scaffold the app and lightweight benchmark harness.
4. Add PDF loading and page rendering.
5. Add baseline preview without effects.
6. Measure PDF render speed for a small fixture set.
7. Add the shared canvas effect function.
8. Measure live preview latency.
9. Move processing into workers only when measurements or UX show a need.
10. Measure main-thread blocking and cancellation behavior.
11. Add PDF export.
12. Measure export throughput and output size.
13. Compare targeted alternatives only where data shows a bottleneck.

Do not add Rust/WASM before step 12 unless canvas processing clearly fails the live-preview targets.

## Milestones

### Milestone 1: Scaffold and docs

- Vite app initialized.
- Docs present.
- Basic CI/build script.
- Minimal visual spike exists.

### Milestone 2: PDF render baseline

- User can load a PDF.
- App renders selected page.
- Initial scan effect can be inspected visually.

### Milestone 3: Live preview effects

- Scan config and presets exist.
- Controls update selected-page preview.
- Source page render cache works.
- Cancellable preview jobs work.

### Milestone 4: Benchmark harness

- Benchmark harness route exists.
- Benchmark records page render timings.
- Benchmark records preview update timings.
- Benchmark records output file size.

### Milestone 5: Worker processing

- Preview processing runs in worker where supported.
- Export processing runs page-by-page with progress.
- Benchmarks record long tasks and p95 latency.

### Milestone 6: PDF export

- Exported PDF has same page count.
- Page dimensions are preserved.
- Download works.
- Output size is acceptable.

### Milestone 7: Performance pass

- Run full benchmark suite.
- Choose final render scale defaults.
- Decide whether Rust/WASM is needed.
- Mark expensive controls as live or on-release based on data.

## Acceptance criteria

- App works offline after assets load.
- PDF contents are processed locally.
- Live preview p95 latency is under 300 ms for common PDFs at preview scale.
- No stale preview result overwrites newer settings.
- Export progress updates once per page or better.
- Exported PDF page count matches input.
- Exported PDF page dimensions are close to input dimensions.
- Users are told that output is rasterized and loses selectable text.
- Output size is shown or warned about before download when it grows significantly.
- Output metadata does not falsely claim scanner hardware origin.
- Benchmark results can be exported as JSON.

## Open questions

- Default output quality and file size target.
- Maximum PDF page count before showing a warning.
- Whether image input should be supported in v1.
- Whether preview should compare before/after side by side.
- Whether OCR/text layer preservation matters later.
