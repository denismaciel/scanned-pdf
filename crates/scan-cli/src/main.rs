use image::ImageReader;
use pdfium_render::prelude::*;
use scan_core::{ScanConfig, apply_scan_effect_rgba};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let args = Args::parse()?;

    if is_pdf(&args.input) {
        return process_pdf(&args.input, &args.output);
    }

    process_image(&args.input, &args.output)
}

fn process_image(input: &Path, output: &Path) -> Result<(), String> {
    let image = ImageReader::open(input)
        .map_err(|error| format!("failed to open input: {error}"))?
        .decode()
        .map_err(|error| format!("failed to decode input image: {error}"))?;

    let mut rgba = image.to_rgba8();
    let width = rgba.width();
    let height = rgba.height();
    apply_scan_effect_rgba(rgba.as_mut(), width, height, ScanConfig::default());

    rgba.save(output)
        .map_err(|error| format!("failed to save output: {error}"))?;

    println!("processed {} -> {}", input.display(), output.display());

    Ok(())
}

fn process_pdf(input: &Path, output_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(output_dir).map_err(|error| {
        format!(
            "failed to create output directory {}: {error}",
            output_dir.display()
        )
    })?;

    let pdfium = Pdfium::new(
        Pdfium::bind_to_system_library()
            .map_err(|error| format!("failed to bind to PDFium library: {error}"))?,
    );
    let document = pdfium
        .load_pdf_from_file(input, None)
        .map_err(|error| format!("failed to load PDF: {error}"))?;
    let render_config = PdfRenderConfig::new()
        .set_target_width(1600)
        .render_form_data(true)
        .render_annotations(true);

    for (index, page) in document.pages().iter().enumerate() {
        let image = page
            .render_with_config(&render_config)
            .map_err(|error| format!("failed to render page {}: {error}", index + 1))?
            .as_image()
            .map_err(|error| format!("failed to convert page {} to image: {error}", index + 1))?;
        let mut rgba = image.to_rgba8();
        let width = rgba.width();
        let height = rgba.height();

        apply_scan_effect_rgba(
            rgba.as_mut(),
            width,
            height,
            ScanConfig {
                seed: 3187 + index as u32,
                ..ScanConfig::default()
            },
        );

        let output = output_dir.join(format!("page-{:04}.png", index + 1));
        rgba.save(&output)
            .map_err(|error| format!("failed to save {}: {error}", output.display()))?;
        println!("processed page {} -> {}", index + 1, output.display());
    }

    Ok(())
}

struct Args {
    input: PathBuf,
    output: PathBuf,
}

impl Args {
    fn parse() -> Result<Self, String> {
        let mut args = env::args_os().skip(1);

        let input = args
            .next()
            .map(PathBuf::from)
            .ok_or_else(|| usage("missing input"))?;
        let output = args
            .next()
            .map(PathBuf::from)
            .ok_or_else(|| usage("missing output"))?;

        if args.next().is_some() {
            return Err(usage("too many arguments"));
        }

        Ok(Self { input, output })
    }
}

fn usage(message: &str) -> String {
    format!(
        "{message}\n\nUsage:\n  cargo run -p scan-cli -- <input.png|jpg> <output.png|jpg>\n  cargo run -p scan-cli -- <input.pdf> <output-directory>\n\nPDF mode renders scanned page PNGs. PDF reassembly is the next CLI step."
    )
}

fn is_pdf(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
}
