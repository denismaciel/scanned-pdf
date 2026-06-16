# scanned-pdf
Browser-based PDF tool that makes PDFs look scanned

## Current spike

The app is now split into:

- A Rust scan-effect core in `crates/scan-core`.
- A Rust CLI in `crates/scan-cli`.
- A raw WebAssembly build in `crates/scan-wasm`.
- A Vite/React website that renders PDFs with `pdfjs-dist`, applies the Rust/WASM effect with live controls, and exports with `pdf-lib`.

PDF rendering still happens in the browser through `pdfjs-dist`. The Rust CLI can process raster images and can render PDF pages through either PDFium or experimental Hayro.

## Development

```sh
nix develop
npm install
npm run dev
```

`npm run dev` builds the Rust WASM module before starting Vite.

## Build

```sh
npm run build
```

The WASM build uses Nix to provide `lld`:

```sh
nix shell nixpkgs#lld -c cargo build -p scan-wasm --release --target wasm32-unknown-unknown
```

## CLI

```sh
cargo run -p scan-cli -- input.png output.png
cargo run -p scan-cli -- input.pdf output-pages/
cargo run -p scan-cli -- --renderer hayro input.pdf output-pages/
```

PDF CLI mode currently writes scanned page PNGs. PDF reassembly is next.

Renderers:

- `pdfium`: default, better fidelity, requires bundled/native PDFium.
- `hayro`: pure Rust, better for single-binary distribution, experimental.

## Nix

The flake provides a development shell with:

- Rust/Cargo
- Node.js 22
- `lld` for `wasm32-unknown-unknown`

```sh
nix develop
```
