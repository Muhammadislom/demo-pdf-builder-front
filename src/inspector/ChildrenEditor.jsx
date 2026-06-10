import React from 'react'
import { useStore } from '../state/store.js'
import { getNode } from '../state/tree.js'
import { meta, prettyType } from '../engine/catalog.js'

const FRAC = [
  { label: 'auto', cols: null },
  { label: 'full', cols: 12 },
  { label: '½', cols: 6 },
  { label: '⅓', cols: 4 },
  { label: '⅔', cols: 8 },
  { label: '¼', cols: 3 },
  { label: '¾', cols: 9 },
]

// ChildrenEditor manages a row/column's children: add (from allowed child
// types), reorder, remove, set per-child width, and select-to-edit.
export default function ChildrenEditor({ node, path }) {
  const { state, dispatch } = useStore()
  const m = meta(node.type)
  const children = node.children || []
  const childTypes = m.childTypes || ['metric_card', 'list', 'aggregate', 'computed_value', 'text']

  const addChild = (type) => {
    const child = meta(type).make(state.doc)
    dispatch({ type: 'INSERT', parentPath: path, index: null, node: child })
  }
  const setWidth = (i, cols) => {
    const child = getNode(state.tree, [...path, i])
    // width stored as a bare number (Go wire format), not an object.
    dispatch({ type: 'REPLACE_NODE', path: [...path, i], node: { ...child, width: cols == null ? undefined : cols } })
  }

  return (
    <div className="children-editor">
      {children.length === 0 && <div className="muted small">No children yet.</div>}
      {children.map((c, i) => (
        <div className="child-row" key={c.id || i}>
          <button className="child-pick" onClick={() => dispatch({ type: 'SELECT', path: [...path, i] })}>
            {meta(c.type).label}
          </button>
          {node.type === 'row' && (
            <select value={typeof c.width === 'number' ? c.width : ''} onChange={(e) => setWidth(i, e.target.value === '' ? null : Number(e.target.value))} title="width">
              {FRAC.map((f) => <option key={f.label} value={f.cols ?? ''}>{f.label}</option>)}
            </select>
          )}
          <button className="mini" onClick={() => dispatch({ type: 'REORDER', parentPath: path, from: i, to: Math.max(0, i - 1) })} title="up">↑</button>
          <button className="mini" onClick={() => dispatch({ type: 'REORDER', parentPath: path, from: i, to: Math.min(children.length - 1, i + 1) })} title="down">↓</button>
          <button className="mini danger" onClick={() => dispatch({ type: 'REMOVE', path: [...path, i] })} title="remove">✕</button>
        </div>
      ))}
      <div className="add-child">
        <select defaultValue="" onChange={(e) => { if (e.target.value) { addChild(e.target.value); e.target.value = '' } }}>
          <option value="">+ add child…</option>
          {childTypes.map((t) => <option key={t} value={t}>{prettyType(t)}</option>)}
        </select>
      </div>
    </div>
  )
}
