use image::ImageReader;
use scan_core::{ScanConfig, apply_scan_effect_rgba};
use std::env;
use std::path::PathBuf;
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
    let image = ImageReader::open(&args.input)
        .map_err(|error| format!("failed to open input: {error}"))?
        .decode()
        .map_err(|error| format!("failed to decode input image: {error}"))?;

    let mut rgba = image.to_rgba8();
    let width = rgba.width();
    let height = rgba.height();
    apply_scan_effect_rgba(rgba.as_mut(), width, height, ScanConfig::default());

    rgba.save(&args.output)
        .map_err(|error| format!("failed to save output: {error}"))?;

    println!(
        "processed {} -> {}",
        args.input.display(),
        args.output.display()
    );

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
            .ok_or_else(|| usage("missing input image"))?;
        let output = args
            .next()
            .map(PathBuf::from)
            .ok_or_else(|| usage("missing output image"))?;

        if args.next().is_some() {
            return Err(usage("too many arguments"));
        }

        Ok(Self { input, output })
    }
}

fn usage(message: &str) -> String {
    format!(
        "{message}\n\nUsage:\n  cargo run -p scan-cli -- <input.png|jpg> <output.png|jpg>\n\nNote: this first Rust CLI pass processes raster images. PDF CLI rendering is a separate renderer decision."
    )
}
