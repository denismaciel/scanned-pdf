# scanned-pdf
Browser-based PDF tool that makes PDFs look scanned

## Current spike

The app is now split into:

- A Rust scan-effect core in `crates/scan-core`.
- A Rust CLI in `crates/scan-cli`.
- A raw WebAssembly build in `crates/scan-wasm`.
- A Vite/React website that renders PDFs with `pdfjs-dist`, applies the Rust/WASM effect, and exports with `pdf-lib`.

PDF rendering still happens in the browser through `pdfjs-dist`. The Rust CLI currently processes raster images; PDF support for the CLI needs a renderer decision such as PDFium or Poppler.

## Development

```sh
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
```

The first CLI pass supports PNG/JPEG images, not PDFs yet.
