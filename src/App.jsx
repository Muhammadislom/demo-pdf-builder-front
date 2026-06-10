import React, { useCallback, useState } from 'react'
import { useStore } from './state/store.js'
import { loadLayout, saveLayout, resetLayout, listLayouts, previewPdf } from './graphql/api.js'
import { explodeNode } from './engine/catalog.js'
import Palette from './palette/Palette.jsx'
import Canvas from './canvas/Canvas.jsx'
import Inspector from './inspector/Inspector.jsx'

// Known statement variants (DriverOwnership) + invoice hints, for the datalist.
const VARIANT_HINTS = {
  statement: ['', 'owner_operator', 'lease_operator', 'company_driver', 'company_driver_percent', 'lease_to_purchase', 'vendor_trucks'],
  invoice: ['', 'factor:triumph', 'factor:rts', 'factor:otr'],
}

// normalizeTree accepts either a bare root node ({type:'page',...}) or a full
// template ({root:{...}}) and returns the root node.
function normalizeTree(tree) {
  if (!tree) return { type: 'page', children: [] }
  if (tree.root) return tree.root
  if (tree.type) return tree
  return { type: 'page', children: [] }
}

export default function App() {
  const { state, dispatch } = useStore()
  const { endpoint, jwt, doc, variant, status, isCustom, source, past, future } = state
  const [showJwt, setShowJwt] = useState(false)

  const setStatus = (msg, kind) => dispatch({ type: 'STATUS', msg, kind })

  const onLoad = useCallback(async () => {
    setStatus('Loading…', 'info')
    try {
      const data = await loadLayout(endpoint, jwt, doc, variant)
      const root = normalizeTree(data.pdfLayout?.tree)
      const blocks = (root.children || []).length
      const src = data.pdfLayout?.source || 'system'
      const isCustom = !!data.pdfLayout?.isCustom
      dispatch({
        type: 'LOADED',
        tree: root,
        mock: data.pdfLayoutMockData || null,
        isCustom,
        source: src,
        theme: data.pdfLayout?.theme ?? null,
        page: data.pdfLayout?.page ?? null,
        msg: `Loaded ${doc}${variant ? ` · ${variant}` : ''} · ${blocks} block(s) · ${src}`,
      })
      if (blocks === 0) {
        setStatus(
          isCustom
            ? `⚠ Loaded an EMPTY custom layout (0 blocks). Press Reset to drop this override and restore the system default.`
            : `⚠ Default layout returned 0 blocks. Add blocks from the palette.`,
          'err',
        )
      }
      // Best-effort: discover the company's actually-saved variants for the picker.
      try {
        const saved = await listLayouts(endpoint, jwt, doc)
        dispatch({ type: 'SET_VARIANTS', variants: saved.map((l) => l.variant).filter(Boolean) })
      } catch { /* non-fatal */ }
    } catch (e) {
      setStatus(`Load failed: ${e.message}`, 'err')
    }
  }, [endpoint, jwt, doc, variant])

  const onSave = useCallback(async () => {
    // Guard: don't silently persist an empty body (the usual cause of a blank
    // "custom" layout). Loading must have happened, and there must be blocks.
    if (!state.mock) {
      setStatus('Load a layout first before saving.', 'err')
      return
    }
    if (!(state.tree.children || []).length) {
      if (!confirm('Save an EMPTY layout? The PDF body will be blank (all rows hidden). Usually you want to Load + edit, or Reset to the default.')) return
    }
    setStatus('Saving…', 'info')
    try {
      const saved = await saveLayout(endpoint, jwt, {
        document: doc,
        variant: variant || null,
        tree: state.tree,
        // round-tripped untouched so a body edit never NULLs stored theme/page
        theme: state.theme ?? null,
        page: state.page ?? null,
      })
      // rev N comes straight from the persisted row; it grows once the backend's
      // server-side increment is deployed (older builds always report 1).
      setStatus(`Saved ✓ rev ${saved.version} — custom layout active for ${doc}${variant ? ` · ${variant}` : ''}`, 'ok')
    } catch (e) {
      setStatus(`Save failed: ${e.message}`, 'err')
    }
  }, [endpoint, jwt, doc, variant, state.tree, state.theme, state.page, state.mock])

  // Preview PDF: render the CURRENT (unsaved) tree through the real backend
  // fpdf engine over the synthetic fixture, and open the result. True WYSIWYG.
  const onPreview = useCallback(async () => {
    if (!state.mock) { setStatus('Load a layout first.', 'err'); return }
    setStatus('Rendering real PDF…', 'info')
    try {
      const b64 = await previewPdf(endpoint, jwt, doc, state.tree)
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      window.open(url, '_blank')
      setStatus('Real PDF opened — rendered by the backend engine over sample data.', 'ok')
    } catch (e) {
      const msg = /Cannot query field/i.test(e.message)
        ? 'this backend build does not expose pdfLayoutPreviewPdf yet — deploy the newer backend.'
        : e.message
      setStatus(`Preview failed: ${msg}`, 'err')
    }
  }, [endpoint, jwt, doc, state.tree, state.mock])

  // Customize body: explode every explodable system block (top-level) into
  // editable fine blocks in one click.
  const onCustomizeBody = useCallback(() => {
    const children = []
    let changed = false
    for (const child of state.tree.children || []) {
      const ex = explodeNode(child, doc)
      if (ex && ex.length) { children.push(...ex); changed = true } else children.push(child)
    }
    if (!changed) { setStatus('Nothing to customize — no editable system blocks here.', 'info'); return }
    dispatch({ type: 'SET_TREE', tree: { ...state.tree, children } })
    setStatus('Body exploded into editable blocks — click any to edit.', 'ok')
  }, [state.tree, doc])

  const onReset = useCallback(async () => {
    if (!confirm(`Reset ${doc}${variant ? ` · ${variant}` : ''} to fallback default? This removes the company override.`)) return
    setStatus('Resetting…', 'info')
    try {
      await resetLayout(endpoint, jwt, doc, variant)
      setStatus('Reset — reloading default…', 'ok')
      await onLoad()
    } catch (e) {
      setStatus(`Reset failed: ${e.message}`, 'err')
    }
  }, [endpoint, jwt, doc, variant, onLoad])

  return (
    <div className="app">
      <header className="bar">
        <div className="bar-top">
          <div className="brand">PDF Layout Builder</div>
          <select value={doc} onChange={(e) => dispatch({ type: 'SET_DOC', doc: e.target.value })}>
            <option value="statement">statement</option>
            <option value="invoice">invoice</option>
          </select>
          <input
            className="conn" style={{ width: 170 }} placeholder="variant (default)" value={variant}
            list="variant-hints" onChange={(e) => dispatch({ type: 'SET_VARIANT', variant: e.target.value })}
          />
          <datalist id="variant-hints">
            {[...new Set([...(VARIANT_HINTS[doc] || []), ...state.savedVariants])].map((v) => <option key={v} value={v} />)}
          </datalist>
          <button onClick={onLoad}>Load</button>
          <button className="primary" onClick={onSave}>Save</button>
          <button onClick={onReset}>Reset</button>
          <button disabled={!state.mock} onClick={onCustomizeBody} title="Turn all system body blocks into editable blocks">Customize body</button>
          <button disabled={!state.mock} onClick={onPreview} title="Render the current tree through the REAL fpdf engine (no save needed)">Preview PDF</button>
          <span className="sep" />
          <button disabled={!past.length} onClick={() => dispatch({ type: 'UNDO' })} title="Undo">↶</button>
          <button disabled={!future.length} onClick={() => dispatch({ type: 'REDO' })} title="Redo">↷</button>
        </div>
        <div className="bar-conn">
          <label className="conn-field">
            <span className="cf-label">GraphQL endpoint</span>
            <input
              className="conn" placeholder="https://host/graphql" value={endpoint}
              onChange={(e) => dispatch({ type: 'SET_CONN', endpoint: e.target.value })}
            />
          </label>
          <label className="conn-field jwt">
            <span className="cf-label">JWT (Bearer)</span>
            <span className="jwt-input">
              <input
                className="conn" type={showJwt ? 'text' : 'password'} placeholder="eyJ…" value={jwt}
                onChange={(e) => dispatch({ type: 'SET_CONN', jwt: e.target.value })}
              />
              <button type="button" onClick={() => setShowJwt((s) => !s)}>{showJwt ? 'Hide' : 'Show'}</button>
            </span>
          </label>
        </div>
        <div className="bar-hint muted small">
          Full URL incl. the GraphQL path — e.g. <code>https://host/query</code> (Apollo Router: usually <code>/graphql</code> or <code>/</code>). A bare host gives 404.
        </div>
      </header>

      <div className={`status ${status.kind}`}>
        {status.msg}
        {source && <span className="chip">{isCustom ? 'custom' : `fallback: ${source}`}</span>}
      </div>

      <main className="panes">
        <Palette />
        <Canvas />
        <Inspector />
      </main>
    </div>
  )
}
