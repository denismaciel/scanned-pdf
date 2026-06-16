export interface ScanResult {
  canvas: HTMLCanvasElement
  blob: Blob
  effectMs: number
  encodeMs: number
}

export async function applyScanEffect(source: HTMLCanvasElement): Promise<ScanResult> {
  const effectStarted = performance.now()
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
  ctx.rotate((-0.42 * Math.PI) / 180)
  ctx.translate(-canvas.width / 2, -canvas.height / 2)
  ctx.filter = 'grayscale(1) contrast(1.16) brightness(1.04) sepia(0.12) blur(0.35px)'
  ctx.drawImage(source, 0, 0)
  ctx.restore()

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const rand = seededRandom(3187)

  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.floor((rand() - 0.5) * 18)
    const dropout = rand() < 0.0018 ? 38 : 0
    const dust = rand() < 0.0009 ? -75 : 0

    data[i] = clamp(data[i] + noise + dropout + dust)
    data[i + 1] = clamp(data[i + 1] + noise + dropout + dust)
    data[i + 2] = clamp(data[i + 2] + noise + dropout + dust)
    data[i + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
  addSpeckles(ctx, canvas.width, canvas.height, rand)

  ctx.strokeStyle = 'rgba(31, 29, 24, 0.34)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)

  const effectMs = performance.now() - effectStarted
  const encodeStarted = performance.now()
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.78)

  return {
    canvas,
    blob,
    effectMs,
    encodeMs: performance.now() - encodeStarted
  }
}

function addSpeckles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rand: () => number
) {
  const count = Math.max(12, Math.floor((width * height) / 110000))

  ctx.save()
  ctx.globalCompositeOperation = 'multiply'

  for (let i = 0; i < count; i++) {
    const radius = 0.5 + rand() * 1.7
    ctx.fillStyle = `rgba(24, 22, 18, ${0.08 + rand() * 0.18})`
    ctx.beginPath()
    ctx.ellipse(rand() * width, rand() * height, radius, radius * (0.5 + rand()), 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
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

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value))
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5
    let next = state
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}
