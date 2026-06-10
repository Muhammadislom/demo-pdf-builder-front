import React, { useEffect, useState } from 'react'

// NodeJsonEditor — collapsed raw-JSON escape hatch for power users. Unlocks the
// full engine surface the structured editors don't model (e.g. NESTED all/any
// rule groups, exotic prop combos). Valid JSON applies live; invalid shows red
// and does not apply.
export default function NodeJsonEditor({ node, onChange }) {
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const [open, setOpen] = useState(false)

  // Re-sync from the node when it changes EXTERNALLY (other editors / undo).
  // If the current text already parses to this exact node (i.e. our own edit
  // round-tripped), keep the user's text so typing isn't clobbered.
  useEffect(() => {
    if (!open) return
    setText((cur) => {
      try {
        if (JSON.stringify(JSON.parse(cur)) === JSON.stringify(node)) return cur
      } catch { /* fall through to resync */ }
      setBad(false)
      return JSON.stringify(node, null, 2)
    })
  }, [open, node])

  const onEdit = (v) => {
    setText(v)
    try {
      const parsed = JSON.parse(v)
      if (!parsed || typeof parsed !== 'object' || !parsed.type) throw new Error('node must have a type')
      setBad(false)
      onChange(parsed)
    } catch {
      setBad(true)
    }
  }

  return (
    <details className="json-editor" onToggle={(e) => setOpen(e.target.open)}>
      <summary className="muted small">Edit as JSON — full engine surface (nested rule groups, etc.)</summary>
      {open && (
        <textarea
          className={`json-area mono ${bad ? 'bad' : ''}`}
          rows={14}
          value={text}
          spellCheck={false}
          onChange={(e) => onEdit(e.target.value)}
        />
      )}
      {bad && <div className="err small">Invalid JSON — changes not applied.</div>}
    </details>
  )
}
