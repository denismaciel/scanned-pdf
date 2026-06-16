{
  description = "Browser and Rust CLI scanned-PDF tool";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.cargo
            pkgs.lld
            pkgs.nodejs_22
            pkgs.pdfium-binaries
            pkgs.rustc
          ];

          shellHook = ''
            export LD_LIBRARY_PATH="${pkgs.pdfium-binaries}/lib:$LD_LIBRARY_PATH"
            echo "scanned-pdf dev shell"
            echo "  npm install"
            echo "  npm run dev"
            echo "  cargo run -p scan-cli -- input.png output.png"
          '';
        };
      });
}
