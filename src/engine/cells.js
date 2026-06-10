// cells.js — exact mirror of Go rowFieldValue (pdf_service.go) for table cells.
// Formatting is by FIELD NAME (the column `format` prop is intentionally NOT
// honored — Go ignores it); unknown fields render as "" (blank), same as Go.

import { money, numberGo } from './format.js'
import { signMul } from './aggregate.js'

export function cellValue(r, field) {
  switch (field) {
    case 'label':
      return r.label || r.typeCode || ''
    case 'typeCode':
      return r.typeCode || ''
    case 'kind':
      return r.kind || '' // raw, NOT humanized (matches Go)
    case 'sourceKind':
      return r.sourceKind || ''
    case 'classification':
      return r.classification || ''
    case 'note':
      return r.note || ''
    case 'amount':
      return money(r.amount)
    case 'quantity':
      return numberGo(r.quantity)
    case 'total':
      return money(r.total)
    case 'effective':
      return money((Number(r.total) || 0) * signMul(r))
    default:
      return '' // fields with no Go case (e.g. sign) render blank
  }
}

// labelFor mirrors drawRowList's label resolution: per-type LabelOverride, then
// row label, then typeCode.
export function labelFor(row, labelOverride) {
  const byType = labelOverride?.byType
  if (byType && row.typeCode && byType[row.typeCode]) return byType[row.typeCode]
  return row.label || row.typeCode || ''
}
