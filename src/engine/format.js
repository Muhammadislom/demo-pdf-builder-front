// format.js — mirrors the fpdf-side formatters used by the Go renderer so the
// builder preview reads like the real PDF.

// money mirrors formatUSDParens: negatives are shown in accountancy parens.
//   1234.5  -> "$1,234.50"
//  -1234.5  -> "($1,234.50)"
export function money(v) {
  const n = Number(v) || 0
  const body = '$' + thousands(Math.abs(n).toFixed(2))
  return n < 0 ? `(${body})` : body
}

// number renders a magnitude with optional decimal places; a negative gets a
// leading '-' (used by the 'number' format case). NOT a Go mirror — see numberGo.
export function number(v, dp = 2) {
  const n = Number(v) || 0
  return (n < 0 ? '-' : '') + thousands(Math.abs(n).toFixed(dp))
}

// numberGo mirrors Go formatNumber exactly (used for table `quantity` cells):
//   0 -> "0"; integer -> grouped int; otherwise "%.2f" with NO grouping.
export function numberGo(v) {
  const n = Number(v) || 0
  if (n === 0) return '0'
  if (Number.isInteger(n)) return thousands(String(n))
  return n.toFixed(2)
}

// percent mirrors Go fmt.Sprintf("%.2f%%", v) — NO thousands grouping, signed.
export function percent(v) {
  return `${(Number(v) || 0).toFixed(2)}%`
}

// formatComputed mirrors Go formatComputed (computed_value + metric_card):
// only 'percent' is special; everything else renders as money. The engine has
// no plain-number display for these, so the builder must not offer one.
export function formatComputed(v, fmt) {
  return fmt === 'percent' ? percent(v) : money(v)
}

// format dispatches by a generic `format` prop (kept for misc UI; computed /
// metric / table cells use formatComputed / cellValue instead).
export function format(v, kind) {
  switch (kind) {
    case 'percent':
      return percent(v)
    case 'number':
      return number(v, 0)
    case 'text':
      return String(v ?? '')
    case 'money':
    default:
      return money(v)
  }
}

function thousands(s) {
  const [int, frac] = String(s).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac != null ? `${grouped}.${frac}` : grouped
}
