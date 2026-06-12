// style.js — maps a node's per-node Style overrides (the same `style` object
// the Go painters consume) onto inline CSS for the HTML approximation. Applied
// to the INNER content element, never to the `.node` selection wrapper, so
// user styling and the builder's selection visuals don't fight.

// pt → px factor for the preview scale (the page is ~720px wide for a
// 191.9mm-content Letter page → ~1.33 px/pt reads right at 13px base).
const PT_TO_PX = 1.33

export function styleVal(pt) {
  return `${Math.round(pt * PT_TO_PX)}px`
}

// styleOf returns inline CSS for text-ish nodes (section_title / text / field).
// opts.fontPx is the node's default font size in px (used only as a no-op
// reference; absent style keys add NO inline css, so the class default holds).
export function styleOf(node, opts = {}) {
  const st = node.style
  if (!st) return undefined
  const css = {}
  if (st.textColor) css.color = st.textColor
  if (st.fontSize) css.fontSize = styleVal(st.fontSize)
  if (st.bold != null) css.fontWeight = st.bold ? 700 : 400
  if (!opts.skipAlign && st.align) css.textAlign = st.align === 'C' ? 'center' : st.align === 'R' ? 'right' : 'left'
  return Object.keys(css).length ? css : undefined
}
