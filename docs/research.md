# Browser scanned-PDF research

## Goal

Build a browser-only tool that accepts a PDF, makes each page look like it was scanned, and exports a new PDF without uploading the document.

## Repos inspected

Research clones were placed in `/tmp/scanned-pdf-research.KS1fqW`.

### lookscanned/lookscanned.io

- URL: https://github.com/lookscanned/lookscanned.io
- Shape: Vue 3 + Vite frontend app.
- PDF input: `pdfjs-dist` renders PDF pages to canvas blobs.
- Scan effect:
  - Canvas path: web workers + `OffscreenCanvas`.
  - Applies CSS canvas filters: blur, grayscale, brightness, sepia/yellowing, contrast.
  - Applies small randomized page rotation.
  - Adds generated SVG turbulence/specular noise over the page.
  - Optional black border.
  - Caches noise blobs by intensity.
  - Magica path: ImageMagick compiled to WebAssembly through `magica-re-export`.
  - Magica command uses rotate/distort, colorspace, blur, Gaussian noise, brightness/contrast, and colorize.
- PDF output: `pdf-lib` embeds processed PNG/JPEG page images into a new PDF, preserving physical page size from pixel dimensions and PPI.
- Other notes: includes metadata spoofing such as Toshiba-like creator/producer strings.

### domdomegg/pdf-scanner

- URL: https://github.com/domdomegg/pdf-scanner
- Shape: React app built with CRA/CRACO.
- PDF input: `mupdf-js` loads PDF and renders each page as PNG at a requested resolution.
- Scan effect: `jimp` processes page images.
  - Converts to grayscale.
  - Builds a mask for white-background areas and overlays white breakup dots.
  - Composites random black speckle JPEG assets in multiply mode.
  - Increases contrast.
  - Applies randomized small rotation and white background containment.
  - Adds per-pixel random brightness noise.
- PDF output: `pdfkit` in browser, with Node polyfills, emits a PDF blob from JPEG pages.
- Other notes: sets scanner-like metadata such as `Xerox AltaLink C8045`.

### navchandar/look-like-scanned

- URL: https://github.com/navchandar/look-like-scanned
- Shape: Python CLI/library.
- PDF input: `pypdfium2` renders each PDF page at 2x scale.
- Scan effect: Pillow pipeline.
  - JPEG re-encode to create compression artifacts.
  - Slight random brightness jitter.
  - Random rotation from about -0.55 to 0.55 degrees.
  - Optional grayscale/photocopy effect with contrast boost.
  - Optional Gaussian blur.
  - Optional uneven blur via gradient mask, simulating uneven focus.
  - Optional salt-and-pepper noise.
  - User controls for contrast, sharpness, brightness.
- PDF output: `pypdfium2` creates a new PDF where each processed JPEG is inserted as a page image.

### apurvmishra99/pdf-to-scan

- URL: https://github.com/apurvmishra99/pdf-to-scan
- Shape: small Python CLI.
- PDF input/effects/output: Wand/ImageMagick renders and transforms the PDF directly, then Ghostscript rewrites/compresses it.
- Scan effect:
  - Grayscale colorspace.
  - Linear stretch.
  - Slight blur.
  - Gaussian noise.
  - Fixed 0.5 degree rotation.
- Limitation: depends on native Ghostscript and ImageMagick, so it is not browser-suitable.

## Common architecture pattern

Every useful implementation follows the same pipeline:

1. Render PDF pages to raster images.
2. Apply scan-like image degradation.
3. Rebuild a PDF where each page is a full-page bitmap.

This necessarily loses selectable text unless a later OCR/text-layer feature is added. For an MVP that is acceptable because real scans are image-based too.

## Scan-look techniques

- Small random rotation/skew per page.
- Slight blur or uneven focus.
- Grayscale or reduced saturation.
- Contrast and brightness changes.
- Yellow/warm paper tint.
- Gaussian noise or SVG turbulence noise.
- Salt-and-pepper noise.
- Random black specks, dust, and white dropout over text.
- JPEG compression artifacts.
- Scanner-like metadata in the output PDF.
- Optional page border/shadow-like edge artifacts.

## Recommended stack

### MVP

- Frontend: Vite + React or Svelte.
- PDF render: `pdfjs-dist`.
- Image processing: browser canvas + `OffscreenCanvas` workers.
- PDF build: `pdf-lib`.
- Output format: JPEG by default, PNG optional for high quality.

This is the smallest browser-native stack. It avoids shipping a large ImageMagick WASM payload and keeps iteration fast.

### Performance path

Use Rust/WASM only for the pixel-processing kernel after the MVP proves the UX and effect model:

- Keep `pdfjs-dist` for PDF rendering. Rust PDF renderers in WASM are possible but will add size/licensing/complexity.
- Keep `pdf-lib` or evaluate a Rust PDF writer later. PDF assembly is not the bottleneck compared with rasterization and effects.
- Add Rust/WASM for deterministic per-pixel operations: noise, thresholding, contrast curves, dropout, vignettes, paper texture blending.
- Run page processing in web workers to keep the UI responsive.

### Why not Rust-first

Rust/WASM is attractive for speed, but the hardest browser pieces are PDF rendering and PDF writing. Existing JS libraries already solve those well. A Rust-first approach risks spending time on packaging and PDF edge cases before the scan effect is good.

## Proposed MVP features

- Drag/drop PDF.
- Page preview before export.
- Presets: subtle scan, office scanner, photocopy, degraded fax.
- Controls: rotation, rotation variance, blur, noise, contrast, brightness, grayscale, paper warmth, JPEG quality.
- Export scanned PDF.
- Entirely local processing.

## Open implementation questions

- Whether text preservation/OCR layer matters later.
- Max PDF size/page count target.
- Whether output should prioritize realism, small file size, or speed.
- Whether to support images as input in addition to PDFs.
