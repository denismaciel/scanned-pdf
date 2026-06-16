use hayro::hayro_interpret::InterpreterSettings;
use hayro::hayro_syntax::Pdf;
use hayro::{RenderCache, RenderSettings, render};
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
        return process_pdf(&args.input, &args.output, args.renderer);
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

fn process_pdf(input: &Path, output_dir: &Path, renderer: PdfRenderer) -> Result<(), String> {
    match renderer {
        PdfRenderer::Pdfium => process_pdf_with_pdfium(input, output_dir),
        PdfRenderer::Hayro => process_pdf_with_hayro(input, output_dir),
    }
}

fn process_pdf_with_pdfium(input: &Path, output_dir: &Path) -> Result<(), String> {
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

fn process_pdf_with_hayro(input: &Path, output_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(output_dir).map_err(|error| {
        format!(
            "failed to create output directory {}: {error}",
            output_dir.display()
        )
    })?;

    let bytes = fs::read(input).map_err(|error| format!("failed to read PDF: {error}"))?;
    let pdf =
        Pdf::new(bytes).map_err(|error| format!("failed to load PDF with Hayro: {error:?}"))?;
    let cache = RenderCache::new();
    let interpreter_settings = InterpreterSettings::default();
    let render_settings = RenderSettings {
        x_scale: 2.0,
        y_scale: 2.0,
        bg_color: hayro::vello_cpu::color::palette::css::WHITE,
        ..RenderSettings::default()
    };

    for (index, page) in pdf.pages().iter().enumerate() {
        let pixmap = render(page, &cache, &interpreter_settings, &render_settings);
        let png = pixmap
            .into_png()
            .map_err(|error| format!("failed to encode Hayro page {}: {error}", index + 1))?;
        let image = image::load_from_memory(&png)
            .map_err(|error| format!("failed to decode Hayro page {}: {error}", index + 1))?;
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
        println!(
            "processed page {} with hayro -> {}",
            index + 1,
            output.display()
        );
    }

    Ok(())
}

struct Args {
    input: PathBuf,
    output: PathBuf,
    renderer: PdfRenderer,
}

impl Args {
    fn parse() -> Result<Self, String> {
        let mut renderer = PdfRenderer::Pdfium;
        let mut positional = Vec::new();

        let mut args = env::args().skip(1);
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--renderer" => {
                    let value = args
                        .next()
                        .ok_or_else(|| usage("missing value for --renderer"))?;
                    renderer = PdfRenderer::parse(&value)?;
                }
                "--hayro" => renderer = PdfRenderer::Hayro,
                "--pdfium" => renderer = PdfRenderer::Pdfium,
                "-h" | "--help" => return Err(usage("")),
                _ => positional.push(PathBuf::from(arg)),
            }
        }

        let mut positional = positional.into_iter();
        let input = positional.next().ok_or_else(|| usage("missing input"))?;
        let output = positional.next().ok_or_else(|| usage("missing output"))?;

        if positional.next().is_some() {
            return Err(usage("too many arguments"));
        }

        Ok(Self {
            input,
            output,
            renderer,
        })
    }
}

fn usage(message: &str) -> String {
    let prefix = if message.is_empty() {
        String::new()
    } else {
        format!("{message}\n\n")
    };
    format!(
        "{prefix}Usage:\n  cargo run -p scan-cli -- <input.png|jpg> <output.png|jpg>\n  cargo run -p scan-cli -- <input.pdf> <output-directory>\n  cargo run -p scan-cli -- --renderer hayro <input.pdf> <output-directory>\n\nPDF mode renders scanned page PNGs. PDFium is the default renderer; Hayro is experimental. PDF reassembly is the next CLI step."
    )
}

fn is_pdf(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
}

#[derive(Clone, Copy)]
enum PdfRenderer {
    Pdfium,
    Hayro,
}

impl PdfRenderer {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "pdfium" => Ok(Self::Pdfium),
            "hayro" => Ok(Self::Hayro),
            _ => Err(usage("renderer must be 'pdfium' or 'hayro'")),
        }
    }
}
