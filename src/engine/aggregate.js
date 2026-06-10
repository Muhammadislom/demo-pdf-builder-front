// aggregate.js — mirror of internal/service/pdfengine/aggregate.go
//
// agg: sum | count.  signMode (sum only): effective | magnitude | raw.
//   effective = Σ total × signMul   (the real +/- total, like the backend)
//   magnitude = Σ |total|           (always positive)
//   raw       = Σ total             (as stored, no sign adjustment)
// count ignores signMode and returns row count.

export const AGG_KINDS = ['sum', 'count']
export const SIGN_MODES = ['effective', 'magnitude', 'raw']

export function signMul(row) {
  if (typeof row?.signMul === 'number' && row.signMul !== 0) return row.signMul
  return row?.sign === '-' ? -1 : 1
}

export function aggregate(spec, rows) {
  const kind = spec?.agg || 'sum'
  const mode = spec?.signMode || 'effective'
  if (kind === 'count') return rows.length
  return rows.reduce((acc, row) => {
    const total = Number(row?.total) || 0
    switch (mode) {
      case 'magnitude':
        return acc + Math.abs(total)
      case 'raw':
        return acc + total
      case 'effective':
      default:
        return acc + total * signMul(row)
    }
  }, 0)
}
