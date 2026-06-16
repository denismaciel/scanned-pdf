#[derive(Clone, Copy, Debug)]
pub struct ScanConfig {
    pub noise: f32,
    pub dropout: f32,
    pub speckles: f32,
    pub contrast: f32,
    pub brightness: f32,
    pub grayscale: bool,
    pub tint: f32,
    pub border: bool,
    pub seed: u32,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            noise: 0.07,
            dropout: 0.0018,
            speckles: 0.08,
            contrast: 1.16,
            brightness: 1.04,
            grayscale: true,
            tint: 0.12,
            border: true,
            seed: 3187,
        }
    }
}

pub fn apply_scan_effect_rgba(buffer: &mut [u8], width: u32, height: u32, config: ScanConfig) {
    if width == 0 || height == 0 {
        return;
    }

    let expected = width as usize * height as usize * 4;
    if buffer.len() < expected {
        return;
    }

    let mut rng = SmallRng::new(config.seed);
    let contrast = config.contrast.max(0.0);
    let brightness = config.brightness.max(0.0);
    let noise_span = (config.noise.max(0.0) * 255.0).min(80.0);
    let tint = config.tint.clamp(0.0, 1.0);
    let dropout = config.dropout.clamp(0.0, 0.1);

    for px in buffer[..expected].chunks_exact_mut(4) {
        let mut r = px[0] as f32;
        let mut g = px[1] as f32;
        let mut b = px[2] as f32;

        if config.grayscale {
            let gray = (r * 0.299) + (g * 0.587) + (b * 0.114);
            r = gray;
            g = gray;
            b = gray;
        }

        r = adjust_tone(r, contrast, brightness);
        g = adjust_tone(g, contrast, brightness);
        b = adjust_tone(b, contrast, brightness);

        if tint > 0.0 {
            r = mix(r, 248.0, tint * 0.18);
            g = mix(g, 241.0, tint * 0.14);
            b = mix(b, 209.0, tint * 0.24);
        }

        let noise = (rng.next_f32() - 0.5) * noise_span;
        let dropout_boost = if rng.next_f32() < dropout { 38.0 } else { 0.0 };
        let dust = if rng.next_f32() < dropout * 0.5 {
            -75.0
        } else {
            0.0
        };

        px[0] = clamp_u8(r + noise + dropout_boost + dust);
        px[1] = clamp_u8(g + noise + dropout_boost + dust);
        px[2] = clamp_u8(b + noise + dropout_boost + dust);
        px[3] = 255;
    }

    add_speckles(buffer, width, height, config.speckles, &mut rng);

    if config.border {
        add_border(buffer, width, height);
    }
}

fn add_speckles(buffer: &mut [u8], width: u32, height: u32, intensity: f32, rng: &mut SmallRng) {
    let intensity = intensity.clamp(0.0, 1.0);
    if intensity == 0.0 {
        return;
    }

    let count = (((width as f32 * height as f32) / 80_000.0) * intensity)
        .round()
        .max(4.0) as u32;

    for _ in 0..count {
        let x = (rng.next_f32() * width as f32) as i32;
        let y = (rng.next_f32() * height as f32) as i32;
        let radius = 1 + (rng.next_f32() * 2.0) as i32;
        let strength = 0.82 - (rng.next_f32() * 0.12);

        for yy in (y - radius)..=(y + radius) {
            for xx in (x - radius)..=(x + radius) {
                if xx < 0 || yy < 0 || xx >= width as i32 || yy >= height as i32 {
                    continue;
                }

                let dx = xx - x;
                let dy = yy - y;
                if dx * dx + dy * dy > radius * radius {
                    continue;
                }

                let idx = ((yy as u32 * width + xx as u32) * 4) as usize;
                buffer[idx] = (buffer[idx] as f32 * strength) as u8;
                buffer[idx + 1] = (buffer[idx + 1] as f32 * strength) as u8;
                buffer[idx + 2] = (buffer[idx + 2] as f32 * strength) as u8;
            }
        }
    }
}

fn add_border(buffer: &mut [u8], width: u32, height: u32) {
    let darken = |buffer: &mut [u8], x: u32, y: u32| {
        let idx = ((y * width + x) * 4) as usize;
        buffer[idx] = (buffer[idx] as f32 * 0.72) as u8;
        buffer[idx + 1] = (buffer[idx + 1] as f32 * 0.72) as u8;
        buffer[idx + 2] = (buffer[idx + 2] as f32 * 0.72) as u8;
    };

    for x in 0..width {
        darken(buffer, x, 0);
        darken(buffer, x, height - 1);
    }

    for y in 0..height {
        darken(buffer, 0, y);
        darken(buffer, width - 1, y);
    }
}

fn adjust_tone(value: f32, contrast: f32, brightness: f32) -> f32 {
    ((value - 128.0) * contrast + 128.0) * brightness
}

fn mix(value: f32, target: f32, amount: f32) -> f32 {
    value * (1.0 - amount) + target * amount
}

fn clamp_u8(value: f32) -> u8 {
    value.round().clamp(0.0, 255.0) as u8
}

struct SmallRng {
    state: u32,
}

impl SmallRng {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    fn next_f32(&mut self) -> f32 {
        self.state = self.state.wrapping_add(0x6d2b_79f5);
        let mut next = self.state;
        next = (next ^ (next >> 15)).wrapping_mul(next | 1);
        next ^= next.wrapping_add((next ^ (next >> 7)).wrapping_mul(next | 61));
        ((next ^ (next >> 14)) as f32) / (u32::MAX as f32)
    }
}
