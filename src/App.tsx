import { useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { applyScanEffect, defaultScanConfig, type ScanConfig } from './scanEffect'
import { buildOnePagePdf, loadPdf, renderPage } from './pdf'

interface PreviewState {
  originalUrl: string
  originalCanvas: HTMLCanvasElement
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
  const [scanConfig, setScanConfig] = useState<ScanConfig>(defaultScanConfig)
  const [status, setStatus] = useState('Drop a PDF to generate a visual spike.')
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  const urlsRef = useRef<string[]>([])

  useEffect(() => {
    return revokeObjectUrls
  }, [])

  useEffect(() => {
    if (!preview) return

    let cancelled = false
    const timeout = window.setTimeout(() => {
      setRescanning(true)
      void applyScanEffect(preview.originalCanvas, scanConfig)
        .then((scanned) => {
          if (cancelled) {
            return
          }

          setPreview((current) => {
            if (!current) return current
            URL.revokeObjectURL(current.scannedUrl)

            return {
              ...current,
              scannedUrl: makeObjectUrl(scanned.blob),
              scannedBlob: scanned.blob,
              width: scanned.canvas.width,
              height: scanned.canvas.height,
              timings: {
                ...current.timings,
                effectMs: scanned.effectMs,
                encodeMs: scanned.encodeMs
              }
            }
          })
          setStatus('Updated scanned preview from Rust/WASM controls.')
        })
        .catch((cause) => {
          console.error(cause)
          if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to update scan.')
        })
        .finally(() => {
          if (!cancelled) setRescanning(false)
        })
    }, 90)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [preview?.originalCanvas, scanConfig])

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
    revokeObjectUrls()
    setPreview(null)
    setStatus('Loading PDF...')

    try {
      const loadStarted = performance.now()
      const nextPdf = await loadPdf(nextFile)
      const loadMs = performance.now() - loadStarted

      setPdf(nextPdf)
      setStatus(`Rendering page 1 of ${nextPdf.numPages}...`)

      const rendered = await renderPage(nextPdf, 1, 1.6)
      const scanned = await applyScanEffect(rendered.canvas, scanConfig)
      const originalBlob = await canvasToBlob(rendered.canvas, 'image/jpeg', 0.88)

      setPreview({
        originalUrl: makeObjectUrl(originalBlob),
        originalCanvas: rendered.canvas,
        scannedUrl: makeObjectUrl(scanned.blob),
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

  function makeObjectUrl(blob: Blob) {
    const url = URL.createObjectURL(blob)
    urlsRef.current.push(url)
    return url
  }

  function revokeObjectUrls() {
    for (const url of urlsRef.current) {
      URL.revokeObjectURL(url)
    }
    urlsRef.current = []
  }

  return (
    <main className="app">
      <section className="toolbar">
        <div>
          <h1>Scanned PDF</h1>
          <p>Rust/WASM scan controls over a one-page browser PDF render.</p>
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

          <ScanControls config={scanConfig} onChange={setScanConfig} disabled={rescanning} />

          <section className="notice">
            This spike rasterizes the page. Exported output will not preserve selectable text,
            form fields, search, or accessibility semantics. {rescanning ? 'Updating preview...' : ''}
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

function ScanControls({
  config,
  onChange,
  disabled
}: {
  config: ScanConfig
  onChange: (config: ScanConfig) => void
  disabled: boolean
}) {
  const update = <Key extends keyof ScanConfig>(key: Key, value: ScanConfig[Key]) => {
    onChange({ ...config, [key]: value })
  }

  return (
    <section className="controls" aria-label="Scan controls">
      <Slider label="Rotation" value={config.rotation} min={-1.5} max={1.5} step={0.01} suffix="deg" onChange={(value) => update('rotation', value)} />
      <Slider label="Blur" value={config.blur} min={0} max={1.4} step={0.01} suffix="px" onChange={(value) => update('blur', value)} />
      <Slider label="Noise" value={config.noise} min={0} max={0.25} step={0.005} onChange={(value) => update('noise', value)} />
      <Slider label="Dropout" value={config.dropout} min={0} max={0.012} step={0.0002} onChange={(value) => update('dropout', value)} />
      <Slider label="Speckles" value={config.speckles} min={0} max={1} step={0.01} onChange={(value) => update('speckles', value)} />
      <Slider label="Contrast" value={config.contrast} min={0.7} max={1.8} step={0.01} onChange={(value) => update('contrast', value)} />
      <Slider label="Brightness" value={config.brightness} min={0.8} max={1.3} step={0.01} onChange={(value) => update('brightness', value)} />
      <Slider label="Tint" value={config.tint} min={0} max={1} step={0.01} onChange={(value) => update('tint', value)} />
      <Slider label="JPEG quality" value={config.jpegQuality} min={0.35} max={0.95} step={0.01} onChange={(value) => update('jpegQuality', value)} />

      <label className="toggle">
        <input type="checkbox" checked={config.grayscale} onChange={(event) => update('grayscale', event.currentTarget.checked)} />
        Grayscale
      </label>
      <label className="toggle">
        <input type="checkbox" checked={config.border} onChange={(event) => update('border', event.currentTarget.checked)} />
        Border
      </label>
      <button type="button" onClick={() => onChange(defaultScanConfig)} disabled={disabled}>
        Reset
      </button>
    </section>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  const display = suffix ? `${formatNumber(value)} ${suffix}` : formatNumber(value)

  return (
    <label className="slider">
      <span>
        {label}
        <strong>{display}</strong>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
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

function formatNumber(value: number) {
  if (Math.abs(value) < 0.01 && value !== 0) return value.toFixed(4)
  if (Math.abs(value) < 0.1 && value !== 0) return value.toFixed(3)
  return value.toFixed(2)
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
