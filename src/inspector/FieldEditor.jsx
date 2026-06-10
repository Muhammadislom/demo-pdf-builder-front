import React, { useMemo } from 'react'
import { useStore } from '../state/store.js'
import { stringSourcesForDoc, buildStrings } from '../engine/scalars.js'

// FieldEditor edits a `field` (bound-text) node: which string source it shows,
// the style, and an optional label prefix. Shows the live resolved text. Source
// names match the Go engine so the saved template renders the same string.
export default function FieldEditor({ node, onChange }) {
  const { state } = useStore()
  const p = node.props || {}
  const set = (patch) => onChange({ ...node, props: { ...p, ...patch } })
  const sources = useMemo(() => stringSourcesForDoc(state.doc), [state.doc])
  const strings = useMemo(() => buildStrings(state.mock, state.doc), [state.mock, state.doc])
  const live = (p.label || '') + (strings[p.source] || '')

  return (
    <div className="field-grid">
      <label className="field wide">
        <span>Source</span>
        <select value={p.source || ''} onChange={(e) => set({ source: e.target.value })}>
          <option value="">— pick a field —</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Style</span>
        <select value={p.style || 'normal'} onChange={(e) => set({ style: e.target.value })}>
          {['normal', 'heading', 'muted'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="field wide">
        <span>Label prefix (optional)</span>
        <input value={p.label || ''} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. Pay to: " />
      </label>
      <div className="live-result">
        <span className="lr-tag">live</span>
        {live ? <b>{live}</b> : <span className="muted">pick a source</span>}
      </div>
    </div>
  )
}
