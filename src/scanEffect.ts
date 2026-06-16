import wasmUrl from './wasm/scan_wasm.wasm?url'

export interface ScanConfig {
  rotation: number
  blur: number
  noise: number
  dropout: number
  speckles: number
  contrast: number
  brightness: number
  grayscale: boolean
  tint: number
  border: boolean
  jpegQuality: number
  seed: number
}

export const defaultScanConfig: ScanConfig = {
  rotation: -0.42,
  blur: 0.35,
  noise: 0.07,
  dropout: 0.0018,
  speckles: 0.08,
  contrast: 1.16,
  brightness: 1.04,
  grayscale: true,
  tint: 0.12,
  border: true,
  jpegQuality: 0.78,
  seed: 3187
}

export interface ScanResult {
  canvas: HTMLCanvasElement
  blob: Blob
  effectMs: number
  encodeMs: number
}

interface ScanWasmExports {
  memory: WebAssembly.Memory
  alloc_buffer(len: number): number
  dealloc_buffer(ptr: number, len: number): void
  apply_scan_effect(
    ptr: number,
    len: number,
    width: number,
    height: number,
    noise: number,
    dropout: number,
    speckles: number,
    contrast: number,
    brightness: number,
    grayscale: number,
    tint: number,
    border: number,
    seed: number
  ): void
}

let wasmPromise: Promise<ScanWasmExports> | null = null

export async function applyScanEffect(
  source: HTMLCanvasElement,
  config: ScanConfig = defaultScanConfig
): Promise<ScanResult> {
  const effectStarted = performance.now()
  const wasm = await getScanWasm()
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })

  if (!ctx) {
    throw new Error('Canvas is not supported')
  }

  canvas.width = source.width
  canvas.height = source.height

  ctx.fillStyle = '#f8f5e8'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((config.rotation * Math.PI) / 180)
  ctx.translate(-canvas.width / 2, -canvas.height / 2)
  ctx.filter = `blur(${config.blur}px)`
  ctx.drawImage(source, 0, 0)
  ctx.restore()

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  runWasmScan(wasm, imageData.data, canvas.width, canvas.height, config)

  ctx.putImageData(imageData, 0, 0)

  const effectMs = performance.now() - effectStarted
  const encodeStarted = performance.now()
  const blob = await canvasToBlob(canvas, 'image/jpeg', config.jpegQuality)

  return {
    canvas,
    blob,
    effectMs,
    encodeMs: performance.now() - encodeStarted
  }
}

async function getScanWasm(): Promise<ScanWasmExports> {
  wasmPromise ??= WebAssembly.instantiateStreaming(fetch(wasmUrl), {}).then((result) => {
    return result.instance.exports as unknown as ScanWasmExports
  })

  return wasmPromise
}

function runWasmScan(
  wasm: ScanWasmExports,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  config: ScanConfig
) {
  const ptr = wasm.alloc_buffer(data.byteLength)

  if (!ptr) {
    throw new Error('WASM allocation failed')
  }

  try {
    const input = new Uint8Array(wasm.memory.buffer, ptr, data.byteLength)
    input.set(data)

    wasm.apply_scan_effect(
      ptr,
      data.byteLength,
      width,
      height,
      config.noise,
      config.dropout,
      config.speckles,
      config.contrast,
      config.brightness,
      config.grayscale ? 1 : 0,
      config.tint,
      config.border ? 1 : 0,
      config.seed
    )

    data.set(new Uint8Array(wasm.memory.buffer, ptr, data.byteLength))
  } finally {
    wasm.dealloc_buffer(ptr, data.byteLength)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to encode canvas'))
      },
      type,
      quality
    )
  })
}
