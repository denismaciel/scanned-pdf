import { useEffect, useMemo, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { applyScanEffect } from './scanEffect'
import { buildOnePagePdf, loadPdf, renderPage } from './pdf'

interface PreviewState {
  originalUrl: string
  scannedUrl: string
  scannedBlob: Blob
  width: number
  height: number
  ppi: number
  timings: {
    loadMs: number
    renderMs: number
    effectMs: number
    encodeMs: number
  }
}

export function App() {
  const [file, setFile] = useState<File | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [status, setStatus] = useState('Drop a PDF to generate a visual spike.')
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview.originalUrl)
        URL.revokeObjectURL(preview.scannedUrl)
      }
    }
  }, [preview])

  const fileLabel = useMemo(() => {
    if (!file) return 'No PDF selected'
    return `${file.name} (${formatBytes(file.size)})`
  }, [file])

  async function handleFile(nextFile: File) {
    if (nextFile.type !== 'application/pdf' && !nextFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF file.')
      return
    }

    setError(null)
    setFile(nextFile)
    setPdf(null)
    setPreview(null)
    setStatus('Loading PDF...')

    try {
      const loadStarted = performance.now()
      const nextPdf = await loadPdf(nextFile)
      const loadMs = performance.now() - loadStarted

      setPdf(nextPdf)
      setStatus(`Rendering page 1 of ${nextPdf.numPages}...`)

      const rendered = await renderPage(nextPdf, 1, 1.6)
      const scanned = await applyScanEffect(rendered.canvas)
      const originalBlob = await canvasToBlob(rendered.canvas, 'image/jpeg', 0.88)

      setPreview({
        originalUrl: URL.createObjectURL(originalBlob),
        scannedUrl: URL.createObjectURL(scanned.blob),
        scannedBlob: scanned.blob,
        width: scanned.canvas.width,
        height: scanned.canvas.height,
        ppi: rendered.ppi,
        timings: {
          loadMs,
          renderMs: rendered.renderMs,
          effectMs: scanned.effectMs,
          encodeMs: scanned.encodeMs
        }
      })
      setStatus('Visual spike ready. Inspect the scanned preview, then export page 1.')
    } catch (cause) {
      console.error(cause)
      setError(cause instanceof Error ? cause.message : 'Failed to process PDF.')
      setStatus('Processing failed.')
    }
  }

  async function exportPreview() {
    if (!preview || exporting) return

    setExporting(true)
    setError(null)

    try {
      const pdfBlob = await buildOnePagePdf(
        preview.scannedBlob,
        preview.width,
        preview.height,
        preview.ppi
      )
      const url = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${file?.name.replace(/\.pdf$/i, '') || 'document'}-scanned-spike.pdf`
      link.click()
      URL.revokeObjectURL(url)
      setStatus(`Exported one-page scanned PDF (${formatBytes(pdfBlob.size)}).`)
    } catch (cause) {
      console.error(cause)
      setError(cause instanceof Error ? cause.message : 'Failed to export PDF.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <main className="app">
      <section className="toolbar">
        <div>
          <h1>Scanned PDF</h1>
          <p>Visual spike: one-page render, hardcoded scan effect, one-page export.</p>
        </div>
        <label className="fileButton">
          Choose PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              const nextFile = event.currentTarget.files?.[0]
              if (nextFile) void handleFile(nextFile)
            }}
          />
        </label>
      </section>

      <section
        className="dropZone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const nextFile = event.dataTransfer.files[0]
          if (nextFile) void handleFile(nextFile)
        }}
      >
        <div>
          <strong>{fileLabel}</strong>
          <span>{status}</span>
          {pdf && <span>{pdf.numPages} page{pdf.numPages === 1 ? '' : 's'} loaded. Spike renders page 1 only.</span>}
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      {preview && (
        <>
          <section className="meta">
            <Metric label="Load" value={formatMs(preview.timings.loadMs)} />
            <Metric label="Render" value={formatMs(preview.timings.renderMs)} />
            <Metric label="Effect" value={formatMs(preview.timings.effectMs)} />
            <Metric label="JPEG" value={formatMs(preview.timings.encodeMs)} />
            <Metric label="Scan JPEG" value={formatBytes(preview.scannedBlob.size)} />
            <button onClick={exportPreview} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export page 1'}
            </button>
          </section>

          <section className="notice">
            This spike rasterizes the page. Exported output will not preserve selectable text,
            form fields, search, or accessibility semantics.
          </section>

          <section className="previewGrid">
            <PreviewPanel title="Original page 1" src={preview.originalUrl} />
            <PreviewPanel title="Scanned effect" src={preview.scannedUrl} />
          </section>
        </>
      )}
    </main>
  )
}

function PreviewPanel({ title, src }: { title: string; src: string }) {
  return (
    <article className="previewPanel">
      <header>{title}</header>
      <div className="pageFrame">
        <img src={src} alt={title} />
      </div>
    </article>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
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

function formatMs(value: number) {
  return `${Math.round(value)} ms`
}

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}
