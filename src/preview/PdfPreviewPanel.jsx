import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store.js'
import { previewPdf } from '../graphql/api.js'

// PdfPreviewPanel — the GROUND-TRUTH half of the hybrid preview: renders the
// CURRENT (unsaved) tree through the REAL backend fpdf engine
// (pdfLayoutPreviewPdf) into an inline iframe. Debounced; the last good PDF
// stays visible (dimmed) while a newer render is in flight; stale responses
// are dropped via a monotonically-increasing request sequence.
const DEBOUNCE_MS = 700

export default function PdfPreviewPanel({ onClose }) {
  const { state } = useStore()
  const { endpoint, jwt, doc, tree, mock } = state
  const [url, setUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const seq = useRef(0)
  const urlRef = useRef(null)

  useEffect(() => {
    if (!mock) return undefined
    if (!(tree.children || []).length) {
      seq.current += 1 // cancel any in-flight render — its PDF is for a tree that no longer exists
      setErr('')
      setBusy(false)
      return undefined
    }
    const mySeq = ++seq.current
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const b64 = await previewPdf(endpoint, jwt, doc, tree)
        if (seq.current !== mySeq) return // a newer edit superseded this render
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const next = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = next
        setUrl(`${next}#toolbar=0&navpanes=0`)
        setErr('')
      } catch (e) {
        if (seq.current !== mySeq) return
        setErr(/Cannot query field/i.test(e.message)
          ? 'This backend build does not expose pdfLayoutPreviewPdf — deploy the newer backend.'
          : e.message)
      } finally {
        if (seq.current === mySeq) setBusy(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [endpoint, jwt, doc, tree, mock])

  // Revoke the object URL on unmount (panel toggled off).
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  return (
    <section className="pdf-panel">
      <div className="pdf-panel-head">
        <b>PDF preview</b>
        <span className="muted small">real backend render</span>
        <span style={{ flex: 1 }} />
        {url && <a href={urlRef.current} target="_blank" rel="noreferrer" className="small">Open in tab</a>}
        <button className="mini" onClick={onClose} title="Close panel">✕</button>
      </div>
      <div className={`pdf-panel-body ${busy ? 'stale' : ''}`}>
        {err && <div className="pdf-err">⚠ {err}</div>}
        {!err && url && <iframe title="PDF preview" src={url} />}
        {!err && !url && <div className="pdf-empty">{busy ? 'Rendering…' : 'Edit the layout to render a preview.'}</div>}
        {busy && url && <span className="pdf-spin">rendering…</span>}
      </div>
    </section>
  )
}
