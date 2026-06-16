# Rust implementation

## Shape

The Rust implementation starts with the scan-effect kernel, not PDF rendering.

- `crates/scan-core`: shared Rust library that mutates RGBA image buffers.
- `crates/scan-wasm`: raw WebAssembly exports for the website.
- `crates/scan-cli`: command-line frontend using the same `scan-core` effect.
- `src/scanEffect.ts`: browser bridge that copies canvas `ImageData` into WASM memory, runs the effect, and copies pixels back.

## Why start here

The scan-effect kernel is the part that can be shared cleanly between CLI and browser. PDF rendering is platform-specific:

- Browser: `pdfjs-dist` is already reliable and avoids shipping a Rust PDF renderer to WASM.
- CLI: needs a native renderer decision, likely PDFium or Poppler.

Starting with the image kernel lets both frontends share behavior now while keeping the PDF renderer choice deliberate.

## Current capabilities

- Website:
  - Load PDF in browser.
  - Render page 1 with `pdfjs-dist`.
  - Apply Rust/WASM scan effect.
  - Export one-page PDF with `pdf-lib`.
- CLI:
  - Read PNG/JPEG.
  - Apply the same Rust scan effect.
  - Write PNG/JPEG.

## WASM ABI

The WASM crate avoids `wasm-bindgen` for now because it is not installed in the environment. It exports a tiny C-like ABI:

- `alloc_buffer(len) -> ptr`
- `dealloc_buffer(ptr, len)`
- `apply_scan_effect(ptr, len, width, height, config...)`

The TypeScript bridge owns copying pixels into and out of WASM memory.

## Next decisions

- Choose the CLI PDF renderer:
  - PDFium via `pdfium-render`.
  - Poppler via system tools or bindings.
  - MuPDF if licensing and bindings fit.
- Move preview processing into a worker once controls are live.
- Expose the Rust `ScanConfig` through website controls.
- Add benchmark comparison between JS effect and Rust/WASM effect.
