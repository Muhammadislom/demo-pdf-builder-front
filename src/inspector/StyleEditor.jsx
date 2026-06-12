import React, { useEffect, useState } from 'react'

// StyleEditor — schema-driven per-node Style controls. The schema comes from
// the catalog (server styleSchema, bundled fallback): each entry is
// {key, kind: 'color'|'enum'|'number'|'bool', label, options?, min?, max?}.
// Writes node.style — the SAME object the Go painters consume (textColor /
// fillColor / accentColor / align / fontSize / bold / radius / padding).
// Empty/cleared fields are deleted so an untouched node stays byte-identical
// to the system look.
export default function StyleEditor({ node, schema, onChange }) {
  const style = node.style || {}
  // In-progress (invalid) hex text stays LOCAL — node.style only ever carries
  // valid #rrggbb values, so the backend's hard-fail style validation never
  // rejects a save/preview mid-typing.
  const [drafts, setDrafts] = useState({})
  // Reset in-progress drafts when the selection moves to another node —
  // otherwise a half-typed value from node A masks (and would write onto) B.
  useEffect(() => { setDrafts({}) }, [node])
  const set = (key, value) => {
    const next = { ...style }
    if (value === '' || value == null || (typeof value === 'number' && Number.isNaN(value))) delete next[key]
    else next[key] = value // note: false is a meaningful value (tri-state bold)
    onChange({ ...node, style: Object.keys(next).length ? next : undefined })
  }

  return (
    <div className="field-grid style-editor">
      {schema.map((f) => {
        const v = style[f.key]
        switch (f.kind) {
          case 'color':
            return (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <span className="style-color">
                  <input type="color" value={v || '#000000'} onChange={(e) => { setDrafts((d) => ({ ...d, [f.key]: undefined })); set(f.key, e.target.value) }} />
                  <input type="text" placeholder="#rrggbb" value={drafts[f.key] ?? v ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim()
                      if (raw === '') { setDrafts((d) => ({ ...d, [f.key]: undefined })); set(f.key, '') }
                      else if (/^#[0-9a-fA-F]{6}$/.test(raw)) { setDrafts((d) => ({ ...d, [f.key]: undefined })); set(f.key, raw) }
                      else setDrafts((d) => ({ ...d, [f.key]: raw })) // typing in progress — local only
                    }} />
                  {v && <button type="button" className="mini" title="clear" onClick={() => { setDrafts((d) => ({ ...d, [f.key]: undefined })); set(f.key, '') }}>✕</button>}
                </span>
              </label>
            )
          case 'enum':
            return (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <div className="seg">
                  {(f.options || []).map((o) => (
                    <button key={o} type="button" className={v === o ? 'on' : ''} onClick={() => set(f.key, v === o ? '' : o)}>{o}</button>
                  ))}
                </div>
              </label>
            )
          case 'number':
            // Free typing in a local draft; clamp + commit on blur/Enter so
            // values like 12 (min 6) are typeable digit by digit.
            return (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <input type="number" min={f.min} max={f.max} step="0.5"
                  value={drafts[f.key] ?? v ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                  onBlur={(e) => {
                    setDrafts((d) => ({ ...d, [f.key]: undefined }))
                    if (e.target.value === '') { set(f.key, ''); return }
                    let n = Number(e.target.value)
                    if (!Number.isFinite(n)) return
                    if (f.min != null) n = Math.max(f.min, n)
                    if (f.max != null) n = Math.min(f.max, n)
                    set(f.key, n)
                  }} />
              </label>
            )
          case 'bool':
            // Tri-state: the engine's *bool distinguishes default / on / off
            // (e.g. bold:false un-bolds a default-bold section title).
            return (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <div className="seg">
                  <button type="button" className={v == null ? 'on' : ''} onClick={() => set(f.key, '')}>default</button>
                  <button type="button" className={v === true ? 'on' : ''} onClick={() => set(f.key, true)}>on</button>
                  <button type="button" className={v === false ? 'on' : ''} onClick={() => set(f.key, false)}>off</button>
                </div>
              </label>
            )
          default:
            return null
        }
      })}
      {Object.keys(style).length > 0 && (
        <button type="button" className="mini" onClick={() => onChange({ ...node, style: undefined })}>Reset style to default</button>
      )}
    </div>
  )
}
