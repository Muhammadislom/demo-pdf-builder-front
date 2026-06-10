import React, { useMemo, useRef } from 'react'
import { useStore } from '../state/store.js'
import { scalarOptions, buildVars } from '../engine/scalars.js'
import { resolveComputed } from '../engine/formula.js'
import { collectComputed } from '../state/tree.js'
import { evalFormula, functionNames, identifiers } from '../engine/formula.js'
import { formatComputed, money } from '../engine/format.js'

const FUNC_SNIPPETS = { abs: 'abs(', min: 'min(', max: 'max(', round: 'round(' }

// FormulaBuilder edits a computed_value's formula with clickable scalar chips,
// a function menu, and a live evaluated result. No need to type scalar names.
export default function FormulaBuilder({ node, onChange }) {
  const { state } = useStore()
  const c = node.computed || { id: '', expr: '', format: 'money', label: '' }
  const inputRef = useRef(null)
  // Full dynamic picker: static + balance_<CODE> from the ledger + other
  // computed ids in the tree (excluding self — no self-reference).
  const scalars = useMemo(
    () => scalarOptions(state.mock, state.doc, state.tree, c.id),
    [state.mock, state.doc, state.tree, c.id],
  )
  // vars include other computed values resolved in tree order so a formula
  // referencing another formula previews correctly.
  const vars = useMemo(() => {
    const base = buildVars(state.mock, state.doc)
    const others = collectComputed(state.tree).filter((n) => n.computed?.id !== c.id)
    return resolveComputed(others, base)
  }, [state.mock, state.doc, state.tree, c.id])

  const setComputed = (patch) => onChange({ ...node, computed: { ...c, ...patch } })

  const insert = (text) => {
    const el = inputRef.current
    const cur = c.expr || ''
    let next, caret
    if (el && typeof el.selectionStart === 'number') {
      const s = el.selectionStart
      const e = el.selectionEnd
      next = cur.slice(0, s) + text + cur.slice(e)
      caret = s + text.length
    } else {
      next = cur + text
      caret = next.length
    }
    setComputed({ expr: next })
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(caret, caret) } })
  }

  const live = useMemo(() => {
    if (!c.expr?.trim()) return { state: 'empty' }
    try {
      const v = evalFormula(c.expr, vars, { lenient: true })
      return { state: 'ok', value: v }
    } catch (e) {
      return { state: 'err', err: e.message }
    }
  }, [c.expr, vars])

  const known = new Set(scalars.map((s) => s.name))
  const used = identifiers(c.expr || '')
  const unknown = used.filter((u) => !known.has(u) && !Object.prototype.hasOwnProperty.call(vars, u))

  return (
    <div className="formula-builder">
      <label className="field wide">
        <span>Label</span>
        <input value={c.label || ''} onChange={(e) => setComputed({ label: e.target.value })} placeholder="Adjusted Net" />
      </label>

      <label className="field wide">
        <span>Expression</span>
        <input
          ref={inputRef} className="mono" value={c.expr || ''}
          onChange={(e) => setComputed({ expr: e.target.value })}
          placeholder="netPay - deductionsTotal"
        />
      </label>

      <div className="fb-tools">
        <div className="fb-funcs">
          {functionNames().map((f) => (
            <button key={f} className="chip-btn fn" onClick={() => insert(FUNC_SNIPPETS[f] || `${f}(`)}>{f}()</button>
          ))}
          {['+', '−', '×', '÷', '(', ')'].map((op, i) => (
            <button key={op} className="chip-btn op" onClick={() => insert({ '−': ' - ', '×': ' * ', '÷': ' / ' }[op] || ` ${op} `)}>{op}</button>
          ))}
        </div>
        <div className="fb-scalars">
          {scalars.map((s) => (
            <button key={s.name} className="chip-btn" title={`${s.desc} = ${money(vars[s.name])}`} onClick={() => insert(s.name)}>
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Format</span>
        <select value={c.format || 'money'} onChange={(e) => setComputed({ format: e.target.value })}>
          {['money', 'percent'].map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>

      <div className="live-result">
        <span className="lr-tag">live</span>
        {live.state === 'ok' && <b>{formatComputed(live.value, c.format || 'money')}</b>}
        {live.state === 'empty' && <span className="muted">enter an expression</span>}
        {live.state === 'err' && <span className="err">⚠ {live.err}</span>}
      </div>
      {unknown.length > 0 && live.state !== 'err' && (
        <div className="muted small">Unknown scalar(s) treated as 0: {unknown.join(', ')}</div>
      )}
    </div>
  )
}
