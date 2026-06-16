import { PDFDocument } from 'pdf-lib'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface RenderedPage {
  canvas: HTMLCanvasElement
  width: number
  height: number
  ppi: number
  renderMs: number
}

export async function loadPdf(file: File): Promise<PDFDocumentProxy> {
  const bytes = await file.arrayBuffer()
  return getDocument({ data: bytes }).promise
}

export async function renderPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number
): Promise<RenderedPage> {
  const started = performance.now()
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })

  if (!ctx) {
    throw new Error('Canvas is not supported')
  }

  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  page.cleanup()

  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    ppi: scale * 72,
    renderMs: performance.now() - started
  }
}

export async function buildOnePagePdf(
  imageBlob: Blob,
  widthPx: number,
  heightPx: number,
  ppi: number
): Promise<Blob> {
  const pdf = await PDFDocument.create()
  const imageBytes = await imageBlob.arrayBuffer()
  const image = await pdf.embedJpg(imageBytes)
  const widthPt = (widthPx / ppi) * 72
  const heightPt = (heightPx / ppi) * 72
  const page = pdf.addPage([widthPt, heightPt])

  page.drawImage(image, {
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt
  })

  pdf.setTitle('Scanned PDF visual spike')
  pdf.setCreator('scanned-pdf')
  pdf.setProducer('scanned-pdf')

  const bytes = await pdf.save()
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
}
