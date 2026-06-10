import React, { useState, useMemo } from 'react'
import { useStore } from '../state/store.js'
import { paletteFor, meta } from '../engine/catalog.js'
import { getNode } from '../state/tree.js'

// Palette: grouped, searchable list of node types valid for the current doc.
// Click adds the node. Target = the selected container (row/column) if one is
// selected and accepts children; otherwise the page root.
export default function Palette() {
  const { state, dispatch } = useStore()
  const { doc, selected, tree } = state
  const [q, setQ] = useState('')

  const groups = useMemo(() => paletteFor(doc), [doc])

  // Determine insertion target path.
  const target = useMemo(() => {
    if (selected) {
      const node = getNode(tree, selected)
      if (node && meta(node.type).accepts?.children) return selected
    }
    return [] // root
  }, [selected, tree])

  const targetLabel = target.length ? `${meta(getNode(tree, target)?.type).label}` : 'page root'

  const add = (m) => {
    const node = m.make(doc)
    dispatch({ type: 'INSERT', parentPath: target, index: null, node })
  }

  const ql = q.trim().toLowerCase()
  return (
    <aside className="palette">
      <div className="palette-head">
        <strong>Add block</strong>
        <div className="muted small">into: {targetLabel}</div>
        <input placeholder="search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="palette-body">
        {groups.map(({ group, items }) => {
          const filtered = items.filter((m) => !ql || m.label.toLowerCase().includes(ql) || m.type.includes(ql))
          if (!filtered.length) return null
          return (
            <div key={group} className="palette-group">
              <div className="palette-group-title">{group}</div>
              {filtered.map((m) => (
                <button key={m.type} className={`palette-item ${m.system ? 'sys' : ''}`} onClick={() => add(m)} title={m.desc || m.type}>
                  <span className="pi-label">{m.label}</span>
                  {m.system && <span className="pi-tag">system</span>}
                </button>
              ))}
            </div>
          )
        })}
      </div>
      <div className="palette-foot muted small">
        Tip: select a Row/Column block to add cards inside it.
      </div>
    </aside>
  )
}
