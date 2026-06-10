import React from 'react'
import { ROW_COLUMN_FIELDS } from '../engine/catalog.js'

const ALIGNS = ['L', 'R']
// No per-column format control: Go rowFieldValue formats table cells strictly by
// FIELD NAME (money fields → money, quantity → number, text fields → raw) and
// ignores any column `format`. Exposing one would be a dead, misleading control.

// ColumnsEditor edits a table node's operator-defined columns
// (header / field / format / align / width). Stored in node.props.columns.
export default function ColumnsEditor({ node, onChange }) {
  const cols = node.props?.columns || []
  const setCols = (next) => onChange({ ...node, props: { ...(node.props || {}), columns: next } })
  const update = (i, patch) => setCols(cols.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const remove = (i) => setCols(cols.filter((_, j) => j !== i))
  const move = (i, d) => {
    const j = i + d
    if (j < 0 || j >= cols.length) return
    const next = cols.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    setCols(next)
  }
  const add = () => setCols([...cols, { header: 'Column', field: 'label', align: 'L', width: 2 }])

  return (
    <div className="cols-editor">
      {cols.map((c, i) => (
        <div className="col-row" key={i}>
          <input className="col-h" value={c.header || ''} placeholder="Header" onChange={(e) => update(i, { header: e.target.value })} />
          <select value={c.field || 'label'} onChange={(e) => update(i, { field: e.target.value })}>
            {ROW_COLUMN_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={c.align || 'L'} onChange={(e) => update(i, { align: e.target.value })}>
            {ALIGNS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="col-w" type="number" min={1} value={c.width ?? 1} title="width weight" onChange={(e) => update(i, { width: Number(e.target.value) })} />
          <button className="mini" onClick={() => move(i, -1)} title="up">↑</button>
          <button className="mini" onClick={() => move(i, 1)} title="down">↓</button>
          <button className="mini danger" onClick={() => remove(i)} title="remove">✕</button>
        </div>
      ))}
      <button className="add-btn" onClick={add}>+ Add column</button>
    </div>
  )
}
