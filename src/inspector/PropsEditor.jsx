import React from 'react'

// PropsEditor renders generic prop controls from a catalog prop-schema.
// Excludes 'columns' (handled by ColumnsEditor) and 'source' (MetricCardEditor).
export default function PropsEditor({ node, schema, onChange }) {
  const props = node.props || {}
  const set = (key, value) => onChange({ ...node, props: { ...props, [key]: value } })

  return (
    <div className="field-grid">
      {schema.map((f) => {
        const v = props[f.key]
        switch (f.kind) {
          case 'bool':
            return (
              <label key={f.key} className="field check">
                <input type="checkbox" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} />
                {f.label}
              </label>
            )
          case 'enum':
            return (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <select value={v ?? f.options[0]} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            )
          case 'number':
            // defaultValue + blur-commit: clamping per keystroke makes values
            // whose first digit is below min untypeable.
            return (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <input type="number" min={f.min} max={f.max} step="0.5" defaultValue={v ?? ''}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                  onBlur={(e) => {
                    if (e.target.value === '') { const next = { ...props }; delete next[f.key]; onChange({ ...node, props: next }); return }
                    let n = Number(e.target.value)
                    if (!Number.isFinite(n)) return
                    if (f.min != null) n = Math.max(f.min, n)
                    if (f.max != null) n = Math.min(f.max, n)
                    set(f.key, n)
                  }} />
              </label>
            )
          case 'color':
            return (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <input type="color" value={v || '#000000'} onChange={(e) => set(f.key, e.target.value)} />
              </label>
            )
          case 'multiline':
            return (
              <label key={f.key} className="field wide">
                <span>{f.label}</span>
                <textarea rows={3} value={v ?? ''} onChange={(e) => set(f.key, e.target.value)} />
              </label>
            )
          default:
            return (
              <label key={f.key} className="field wide">
                <span>{f.label}</span>
                <input value={v ?? ''} onChange={(e) => set(f.key, e.target.value)} />
              </label>
            )
        }
      })}
    </div>
  )
}
