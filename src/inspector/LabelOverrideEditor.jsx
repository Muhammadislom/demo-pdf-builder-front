import React, { useMemo } from 'react'
import { useStore } from '../state/store.js'
import { rowsFromMock } from '../engine/scalars.js'

// LabelOverrideEditor edits node.labelOverride.byType (typeCode -> display label),
// mirroring Go drawRowList's lo.Apply. Lets a bookkeeper rename how a type reads
// in this block (e.g. FUEL -> "Fuel & DEF") without touching the accounting type.
export default function LabelOverrideEditor({ node, onChange }) {
  const { state } = useStore()
  const byType = node.labelOverride?.byType || {}
  const entries = Object.entries(byType)

  const codes = useMemo(() => {
    const set = new Set(rowsFromMock(state.mock, state.doc).map((r) => r.typeCode).filter(Boolean))
    return [...set]
  }, [state.mock, state.doc])

  const commit = (next) => {
    const keys = Object.keys(next)
    onChange({ ...node, labelOverride: keys.length ? { byType: next } : undefined })
  }
  const setLabel = (code, label) => commit({ ...byType, [code]: label })
  const remove = (code) => { const n = { ...byType }; delete n[code]; commit(n) }
  const addCode = (code) => { if (code && !(code in byType)) commit({ ...byType, [code]: '' }) }

  const available = codes.filter((c) => !(c in byType))

  return (
    <div className="label-override">
      {entries.length === 0 && <div className="muted small">No overrides — rows show their default label.</div>}
      {entries.map(([code, label]) => (
        <div className="lo-row" key={code}>
          <span className="mono small lo-code">{code}</span>
          <span className="muted">→</span>
          <input value={label} placeholder="custom label" onChange={(e) => setLabel(code, e.target.value)} />
          <button className="mini danger" onClick={() => remove(code)}>✕</button>
        </div>
      ))}
      <select defaultValue="" onChange={(e) => { if (e.target.value) { addCode(e.target.value); e.target.value = '' } }}>
        <option value="">+ override a type…</option>
        {available.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  )
}
