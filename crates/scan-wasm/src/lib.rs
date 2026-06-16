use scan_core::{ScanConfig, apply_scan_effect_rgba};
use std::alloc::{Layout, alloc, dealloc};
use std::slice;

#[unsafe(no_mangle)]
pub extern "C" fn alloc_buffer(len: usize) -> *mut u8 {
    if len == 0 {
        return std::ptr::null_mut();
    }

    let layout = Layout::from_size_align(len, 8).expect("valid allocation layout");
    unsafe { alloc(layout) }
}

#[unsafe(no_mangle)]
pub extern "C" fn dealloc_buffer(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }

    let layout = Layout::from_size_align(len, 8).expect("valid allocation layout");
    unsafe { dealloc(ptr, layout) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn apply_scan_effect(
    ptr: *mut u8,
    len: usize,
    width: u32,
    height: u32,
    noise: f32,
    dropout: f32,
    speckles: f32,
    contrast: f32,
    brightness: f32,
    grayscale: u32,
    tint: f32,
    border: u32,
    seed: u32,
) {
    if ptr.is_null() || len == 0 {
        return;
    }

    let buffer = unsafe { slice::from_raw_parts_mut(ptr, len) };
    apply_scan_effect_rgba(
        buffer,
        width,
        height,
        ScanConfig {
            noise,
            dropout,
            speckles,
            contrast,
            brightness,
            grayscale: grayscale != 0,
            tint,
            border: border != 0,
            seed,
        },
    );
}
