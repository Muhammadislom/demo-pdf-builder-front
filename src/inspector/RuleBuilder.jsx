import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '../state/store.js'
import { claimedBefore } from '../engine/renderModel.js'
import { matchWithClaimState } from '../engine/rule.js'
import { rowsFromMock } from '../engine/scalars.js'
import { ROW_RULE_FIELDS, KIND_LABELS } from '../engine/catalog.js'
import { RULE_OPS as OPS } from '../engine/rule.js'

const MODES = [
  { id: 'catchall', label: 'Catch-all' },
  { id: 'types', label: 'By type' },
  { id: 'kind', label: 'By kind' },
  { id: 'advanced', label: 'Advanced' },
]

function detectMode(rule) {
  if (!rule || (!rule.all?.length && !rule.any?.length && !rule.field)) return 'catchall'
  const any = rule.any
  if (any && any.length === 1 && !any[0].all && !any[0].any) {
    if (any[0].field === 'typeCode' && any[0].op === 'in') return 'types'
    if (any[0].field === 'kind' && any[0].op === 'in') return 'kind'
  }
  return 'advanced'
}

// RuleBuilder: the content-routing editor. Three guided modes + advanced, with a
// LIVE preview of which rows will land in this block under first-match-wins.
export default function RuleBuilder({ node, path, onChange }) {
  const { state } = useStore()
  const rule = node.rule ?? null
  const [mode, setMode] = useState(() => detectMode(rule))
  useEffect(() => { setMode(detectMode(node.rule ?? null)) }, [path.join('.')])

  const setRule = (r) => onChange({ ...node, rule: r })

  const rows = useMemo(() => rowsFromMock(state.mock, state.doc), [state.mock, state.doc])
  const typesByKind = useMemo(() => groupTypes(rows), [rows])
  const kindsPresent = useMemo(() => [...new Set(rows.map((r) => r.kind))], [rows])

  // Live row-match preview (respects earlier blocks' claims).
  const preview = useMemo(() => {
    const { rows: pool, claimed } = claimedBefore(state.tree, path, state.mock, state.doc)
    return matchWithClaimState(rule, pool, claimed)
  }, [state.tree, state.mock, state.doc, path.join('.'), JSON.stringify(rule)])

  const switchMode = (id) => {
    setMode(id)
    if (id === 'catchall') setRule(null)
    else if (id === 'types') setRule(detectMode(rule) === 'types' ? rule : { any: [{ field: 'typeCode', op: 'in', value: [] }] })
    else if (id === 'kind') setRule(detectMode(rule) === 'kind' ? rule : { any: [{ field: 'kind', op: 'in', value: [] }] })
    else setRule(rule && detectMode(rule) === 'advanced' ? rule : { all: [{ field: 'kind', op: 'eq', value: '' }] })
  }

  return (
    <div className="rule-builder">
      <div className="seg">
        {MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => switchMode(m.id)}>{m.label}</button>
        ))}
      </div>

      {mode === 'catchall' && <div className="muted small">All remaining rows land here (catch-all).</div>}

      {mode === 'types' && (
        <TypePicker typesByKind={typesByKind} value={leafValue(rule)} onChange={(vals) => setRule({ any: [{ field: 'typeCode', op: 'in', value: vals }] })} />
      )}

      {mode === 'kind' && (
        <KindPicker kinds={kindsPresent} value={leafValue(rule)} onChange={(vals) => setRule({ any: [{ field: 'kind', op: 'in', value: vals }] })} />
      )}

      {mode === 'advanced' && <AdvancedRule rule={rule} onChange={setRule} rows={rows} />}

      <LivePreview preview={preview} />
    </div>
  )
}

function leafValue(rule) {
  const v = rule?.any?.[0]?.value
  return Array.isArray(v) ? v : v != null ? [String(v)] : []
}

function groupTypes(rows) {
  const g = {}
  for (const r of rows) {
    if (!r.typeCode) continue
    ;(g[r.kind] ||= new Map()).set(r.typeCode, r.label || r.typeCode)
  }
  return Object.fromEntries(Object.entries(g).map(([k, m]) => [k, [...m.entries()].map(([code, label]) => ({ code, label }))]))
}

function TypePicker({ typesByKind, value, onChange }) {
  const set = new Set(value)
  const toggle = (code) => {
    const next = new Set(set)
    next.has(code) ? next.delete(code) : next.add(code)
    onChange([...next])
  }
  const entries = Object.entries(typesByKind)
  if (!entries.length) return <div className="muted small">No types in preview data.</div>
  return (
    <div className="type-picker">
      {entries.map(([kind, types]) => (
        <div key={kind} className="tp-group">
          <div className="tp-kind">{KIND_LABELS[kind] || kind}</div>
          <div className="tp-types">
            {types.map((t) => (
              <label key={t.code} className={`tp-chip ${set.has(t.code) ? 'on' : ''}`}>
                <input type="checkbox" checked={set.has(t.code)} onChange={() => toggle(t.code)} />
                {t.label} <span className="mono small muted">{t.code}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function KindPicker({ kinds, value, onChange }) {
  const all = [...new Set(['other_pay', 'deduction', 'balance_entry', 'charge', ...kinds])]
  const set = new Set(value)
  const toggle = (k) => {
    const next = new Set(set)
    next.has(k) ? next.delete(k) : next.add(k)
    onChange([...next])
  }
  return (
    <div className="kind-picker">
      {all.map((k) => (
        <button key={k} className={`chip-btn ${set.has(k) ? 'on' : ''}`} onClick={() => toggle(k)}>
          {KIND_LABELS[k] || k}
        </button>
      ))}
    </div>
  )
}

function AdvancedRule({ rule, onChange, rows }) {
  const combinator = rule?.all ? 'all' : 'any'
  const leaves = rule?.[combinator] || []
  const setLeaves = (next) => onChange({ [combinator]: next })
  const setCombinator = (c) => onChange({ [c]: leaves })
  const update = (i, patch) => setLeaves(leaves.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const remove = (i) => setLeaves(leaves.filter((_, j) => j !== i))
  const add = () => setLeaves([...leaves, { field: 'typeCode', op: 'in', value: [] }])
  // Reset value shape when op/field changes so list-ops carry an array, scalar-ops a string.
  const blank = (op) => (op === 'in' || op === 'notIn' ? [] : '')
  const changeOp = (i, op) => update(i, { op, value: blank(op) })
  const changeField = (i, field) => update(i, { field, value: blank(leaves[i].op) })

  return (
    <div className="adv-rule">
      <label className="field">
        <span>Combine</span>
        <select value={combinator} onChange={(e) => setCombinator(e.target.value)}>
          <option value="all">ALL (AND)</option>
          <option value="any">ANY (OR)</option>
        </select>
      </label>
      {leaves.map((l, i) => (
        <div className="leaf-row" key={i}>
          <select value={l.field} onChange={(e) => changeField(i, e.target.value)}>
            {ROW_RULE_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={l.op} onChange={(e) => changeOp(i, e.target.value)}>
            {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <ValuePicker field={l.field} op={l.op} value={l.value} rows={rows} onChange={(v) => update(i, { value: v })} />
          <button className="mini danger" onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      <button className="add-btn" onClick={add}>+ Add condition</button>
    </div>
  )
}

// valueOptionsFor returns the distinct values for a field from the sample rows,
// so Advanced conditions pick real values instead of free text.
function valueOptionsFor(field, rows) {
  const uniq = (arr) => [...new Set(arr.filter(Boolean).map(String))]
  switch (field) {
    case 'kind': return uniq([...rows.map((r) => r.kind), 'other_pay', 'deduction', 'balance_entry', 'charge'])
    case 'typeCode': return uniq(rows.map((r) => r.typeCode))
    case 'sourceKind': return uniq(rows.map((r) => r.sourceKind))
    case 'classification': return uniq([...rows.map((r) => r.classification), 'A', 'L'])
    case 'sign': return ['+', '-']
    case 'typeId': return uniq(rows.map((r) => r.typeId))
    default: return []
  }
}

// ValuePicker: multiselect chips for in/notIn, single select for eq/ne. Opaque
// typeId with no sample values falls back to a text input.
function ValuePicker({ field, op, value, rows, onChange }) {
  const options = valueOptionsFor(field, rows)
  const isList = op === 'in' || op === 'notIn'

  if (field === 'typeId' && options.length === 0) {
    const valStr = Array.isArray(value) ? value.join(', ') : (value ?? '')
    return (
      <input
        className="vp-text" value={valStr} placeholder={isList ? 'id, id' : 'id'}
        onChange={(e) => { const raw = e.target.value; onChange(isList ? raw.split(',').map((s) => s.trim()).filter(Boolean) : raw) }}
      />
    )
  }
  if (isList) {
    const set = new Set(Array.isArray(value) ? value.map(String) : value != null ? [String(value)] : [])
    const toggle = (o) => { const n = new Set(set); n.has(o) ? n.delete(o) : n.add(o); onChange([...n]) }
    return (
      <div className="vp-chips">
        {options.length === 0 && <span className="muted small">no values in data</span>}
        {options.map((o) => (
          <button key={o} type="button" className={`chip-btn ${set.has(o) ? 'on' : ''}`} onClick={() => toggle(o)}>{o}</button>
        ))}
      </div>
    )
  }
  const cur = Array.isArray(value) ? (value[0] || '') : (value ?? '')
  return (
    <select className="vp-select" value={cur} onChange={(e) => onChange(e.target.value)}>
      <option value="">— pick —</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function LivePreview({ preview }) {
  const { matched, claimedAway } = preview
  const none = matched.length === 0
  return (
    <div className={`rule-preview ${none ? 'empty' : ''}`}>
      <div className="rp-head"><span className="lr-tag">live</span> → {matched.length} row(s) land here</div>
      {matched.length > 0 && (
        <div className="rp-rows">
          {matched.map((r, i) => <span key={i} className="rp-pill">{r.label || r.typeCode}</span>)}
        </div>
      )}
      {none && claimedAway.length === 0 && (
        <div className="rp-note muted small">Pick at least one type/kind above (or this rule matches nothing in the sample data).</div>
      )}
      {claimedAway.length > 0 && (
        <div className="rp-claimed muted small">
          {claimedAway.length} matching row(s) are already claimed by an earlier block (e.g. the system <b>Body Two Col</b>): {claimedAway.map((r) => r.label || r.typeCode).join(', ')}.
          {none && ' → Move this block above it, or select that block and “Replace with editable blocks” / delete it.'}
        </div>
      )}
    </div>
  )
}
