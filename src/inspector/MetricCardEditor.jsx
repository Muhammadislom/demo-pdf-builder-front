import React, { useMemo } from 'react'
import { useStore } from '../state/store.js'
import { scalarOptions, buildVars } from '../engine/scalars.js'
import { evalFormula, resolveComputed } from '../engine/formula.js'
import { collectComputed } from '../state/tree.js'
import { formatComputed } from '../engine/format.js'

// MetricCardEditor picks the value source for a metric card. Source is normally
// a scalar name (renders the same number in the real PDF) but a formula is also
// accepted. Shows the live resolved value. (label/sub/format/accent are edited
// in the Properties section.)
export default function MetricCardEditor({ node, onChange }) {
  const { state } = useStore()
  const source = node.props?.source || ''
  const setSource = (v) => onChange({ ...node, props: { ...(node.props || {}), source: v } })
  const scalars = useMemo(
    () => scalarOptions(state.mock, state.doc, state.tree, null),
    [state.mock, state.doc, state.tree],
  )

  const live = useMemo(() => {
    const vars = resolveComputed(collectComputed(state.tree), buildVars(state.mock, state.doc))
    if (Object.prototype.hasOwnProperty.call(vars, source)) return { ok: true, v: vars[source] }
    try { return { ok: true, v: evalFormula(source, vars, { lenient: true }) } } catch (e) { return { ok: false, err: e.message } }
  }, [state.mock, state.doc, state.tree, source])

  return (
    <div className="field-grid">
      <label className="field wide">
        <span>Source (scalar or formula)</span>
        <input list="metric-scalars" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. netPay or gross - fees" />
        <datalist id="metric-scalars">
          {scalars.map((s) => <option key={s.name} value={s.name}>{s.desc}</option>)}
        </datalist>
      </label>
      <div className="scalar-chips">
        {scalars.map((s) => (
          <button key={s.name} className="chip-btn" title={s.desc} onClick={() => setSource(s.name)}>{s.name}</button>
        ))}
      </div>
      <div className="live-result">
        <span className="lr-tag">live</span>
        {live.ok ? <b>{formatComputed(live.v, node.props?.format || 'money')}</b> : <span className="err">⚠ {live.err}</span>}
      </div>
    </div>
  )
}
