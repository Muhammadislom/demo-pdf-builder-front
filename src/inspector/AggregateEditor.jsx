import React, { useMemo } from 'react'
import { useStore } from '../state/store.js'
import { AGG_KINDS, SIGN_MODES, aggregate } from '../engine/aggregate.js'
import { peek } from '../engine/rule.js'
import { rowsFromMock } from '../engine/scalars.js'
import { money } from '../engine/format.js'

// AggregateEditor edits node.aggregate {agg, signMode, label} and shows the live
// result over the rows matched by the node's content rule (set below in the
// Content rule section). Display-only — never affects backend totals.
export default function AggregateEditor({ node, onChange }) {
  const { state } = useStore()
  const spec = node.aggregate || { agg: 'sum', signMode: 'effective', label: 'Total' }
  const set = (patch) => onChange({ ...node, aggregate: { ...spec, ...patch } })

  const live = useMemo(() => {
    const rows = rowsFromMock(state.mock, state.doc)
    const matched = peek(node.rule, rows)
    return { value: aggregate(spec, matched), count: matched.length }
  }, [state.mock, state.doc, node.rule, spec.agg, spec.signMode])

  return (
    <div className="field-grid">
      <label className="field">
        <span>Operation</span>
        <select value={spec.agg} onChange={(e) => set({ agg: e.target.value })}>
          {AGG_KINDS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
      {spec.agg === 'sum' && (
        <label className="field">
          <span>Sign mode</span>
          <select value={spec.signMode || 'effective'} onChange={(e) => set({ signMode: e.target.value })}>
            {SIGN_MODES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}
      <label className="field wide">
        <span>Label</span>
        <input value={spec.label || ''} onChange={(e) => set({ label: e.target.value })} />
      </label>
      <div className="live-result">
        <span className="lr-tag">live</span>
        {spec.agg === 'count'
          ? <b>{live.count} rows</b>
          : <b>{money(live.value)}</b>}
        <span className="muted small"> over {live.count} matched row(s)</span>
      </div>
    </div>
  )
}
