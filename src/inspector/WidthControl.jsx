import React from 'react'

const FRAC = { 12: 'full', 6: '½', 4: '⅓', 8: '⅔', 3: '¼', 9: '¾' }

// WidthControl edits node.width in the Go wire format: a bare number (grid
// columns 1..12) or a "NN%" string (percent). Only meaningful when the node is
// a child of a row. "Auto" clears the width so the row splits space evenly.
export default function WidthControl({ node, onChange }) {
  const w = node.width
  const isPct = typeof w === 'string' && w.trim().endsWith('%')
  const cols = typeof w === 'number' ? w : null
  const pct = isPct ? Math.round(parseFloat(w)) || 50 : null
  const mode = w == null ? 'auto' : isPct ? 'percent' : 'cols'

  const set = (width) => onChange({ ...node, width })
  const setMode = (m) => {
    if (m === 'auto') set(undefined)
    else if (m === 'percent') set(`${pct ?? (cols != null ? Math.round((cols / 12) * 100) : 50)}%`)
    else set(cols ?? (pct != null ? Math.max(1, Math.min(12, Math.round((pct / 100) * 12))) : 6))
  }

  return (
    <div className="width-ctl">
      <div className="seg">
        {[['auto', 'Auto'], ['cols', 'Grid'], ['percent', '%']].map(([m, label]) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
        ))}
      </div>
      {mode === 'cols' && (
        <>
          <input type="range" min={1} max={12} step={1} value={cols ?? 6} onChange={(e) => set(Number(e.target.value))} />
          <div className="width-label">{cols ?? 6}/12 {FRAC[cols] ? `(${FRAC[cols]})` : ''}</div>
        </>
      )}
      {mode === 'percent' && (
        <>
          <input type="range" min={5} max={100} step={5} value={pct ?? 50} onChange={(e) => set(`${e.target.value}%`)} />
          <div className="width-label">{pct ?? 50}%</div>
        </>
      )}
      {mode === 'auto' && <div className="width-label muted">splits evenly with siblings</div>}
    </div>
  )
}
