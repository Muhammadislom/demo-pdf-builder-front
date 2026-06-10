// width.js — interpret a node's width into a percentage of its row.
// Accepts the Go wire shapes (number = grid columns out of 12, "NN%" string =
// percent) and, defensively, the legacy {cols}/{percent} object form.
export function widthPct(node) {
  const w = node?.width
  if (w == null) return null
  if (typeof w === 'number') return w > 0 ? (w / 12) * 100 : null
  if (typeof w === 'string') {
    const s = w.trim()
    if (s.endsWith('%')) { const p = parseFloat(s); return Number.isFinite(p) && p > 0 ? p : null }
    const n = parseFloat(s)
    return Number.isFinite(n) && n > 0 ? (n / 12) * 100 : null
  }
  if (typeof w === 'object') {
    if (typeof w.cols === 'number' && w.cols > 0) return (w.cols / 12) * 100
    if (typeof w.percent === 'number' && w.percent > 0) return w.percent
  }
  return null
}

// cellPct distributes a row's width: explicit widths honored, remainder split
// evenly among children without an explicit width.
export function cellPct(children, i) {
  const pcts = children.map(widthPct)
  const specified = pcts.reduce((a, b) => a + (b || 0), 0)
  if (pcts[i] != null) return pcts[i]
  const autos = pcts.filter((p) => p == null).length
  const remain = Math.max(0, 100 - specified)
  return autos ? remain / autos : 100 / children.length
}
