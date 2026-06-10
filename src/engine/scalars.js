// scalars.js — mirror of stmtScalars / invoice scalars in pdf_render_engine.go.
// These are the ONLY values a formula / metric_card source can reference, and
// the exact names must match the Go side so a saved template renders the same
// numbers in the real PDF.

import { aggregate } from './aggregate.js'

// STATEMENT_SCALARS / INVOICE_SCALARS drive the picker chips. `group` is for UI
// grouping; `desc` is the tooltip.
export const STATEMENT_SCALARS = [
  { name: 'grossTotal', group: 'Totals', desc: 'Gross pay across trips' },
  { name: 'netPay', group: 'Totals', desc: 'Net pay (canonical, backend-computed)' },
  { name: 'grandTotal', group: 'Totals', desc: 'Alias of netPay' },
  { name: 'tripsTotal', group: 'Totals', desc: 'Sum of trip earnings' },
  { name: 'deductionsTotal', group: 'By kind', desc: '|Σ deduction rows| (magnitude)' },
  { name: 'otherPayTotal', group: 'By kind', desc: 'Σ other_pay rows (effective)' },
  { name: 'balanceTotal', group: 'By kind', desc: 'Σ balance_entry rows (effective)' },
  { name: 'escrowBalance', group: 'Ledger', desc: 'Running ESCROW balance' },
  { name: 'openItems', group: 'Ledger', desc: 'Running OPEN_ITEMS balance' },
  { name: 'reimbursement', group: 'Ledger', desc: 'Running REIMBURSEMENT balance' },
]

export const INVOICE_SCALARS = [
  { name: 'invoiceTotal', group: 'Totals', desc: 'Invoice grand total (backend-computed)' },
]

export function scalarsForDoc(doc) {
  return doc === 'invoice' ? INVOICE_SCALARS : STATEMENT_SCALARS
}

// scalarOptions returns the FULL dynamic picker list: static scalars + a
// balance_<CODE> entry per ledger code in the mock (mirrors Go stmtScalars'
// LedgerBalances loop) + the ids of other computed_value nodes in the tree
// (the formula DAG lets formulas reference each other). `selfId` excludes the
// node being edited so it can't reference itself.
export function scalarOptions(mock, doc, tree, selfId) {
  const out = [...scalarsForDoc(doc)]
  if (doc !== 'invoice') {
    for (const code of Object.keys(mock?.ledger || {})) {
      out.push({ name: `balance_${code}`, group: 'Ledger by code', desc: `Running ${code} balance (all statements)` })
    }
  }
  const walk = (n) => {
    if (!n) return
    if (n.type === 'computed_value' && n.computed?.id && n.computed.id !== selfId) {
      out.push({ name: n.computed.id, group: 'Computed', desc: n.computed.label ? `Formula: ${n.computed.label}` : `Formula ${n.computed.id}` })
    }
    ;(n.children || []).forEach(walk)
  }
  if (tree) walk(tree)
  return out
}

// String-binding sources for `field` nodes — MUST match Go stmtStrings /
// invoiceStrings keys so a saved template renders the same text.
export const STATEMENT_STRING_SOURCES = [
  'companyName', 'companyAddress', 'companyPhone', 'companyIds', 'driverName', 'unitNumber',
  'payTo', 'statementNumber', 'classification', 'periodStart', 'periodEnd', 'period',
]
export const INVOICE_STRING_SOURCES = [
  'invoiceNumber', 'customerName', 'customerAddress', 'carrierName', 'loadNumber', 'invoiceDate', 'dueDate',
]
export function stringSourcesForDoc(doc) {
  return doc === 'invoice' ? INVOICE_STRING_SOURCES : STATEMENT_STRING_SOURCES
}

// buildStrings mirrors Go stmtStrings/invoiceStrings against the mock data.
export function buildStrings(mock, doc) {
  if (doc === 'invoice') {
    const inv = mock?.invoice || {}, c = mock?.customer || {}, co = mock?.company || {}
    return {
      invoiceNumber: inv.number || '', customerName: c.name || '', customerAddress: c.address || '',
      carrierName: co.name || '', loadNumber: inv.loadNumber || '', invoiceDate: inv.date || '', dueDate: inv.dueDate || '',
    }
  }
  const s = mock?.statement || {}, co = mock?.company || {}
  const ids = [co.usdot ? `USDOT ${co.usdot}` : '', co.mc ? `MC ${co.mc}` : ''].filter(Boolean).join(' · ')
  return {
    companyName: co.name || '', companyAddress: co.address || '', companyPhone: co.phone || '', companyIds: ids,
    driverName: s.driverName || '', unitNumber: s.unitNumber || '', payTo: s.payTo || s.driverName || '',
    statementNumber: s.number || '', classification: s.classification || '',
    periodStart: s.periodStart || '', periodEnd: s.periodEnd || '', period: `${s.periodStart || ''} – ${s.periodEnd || ''}`,
  }
}

// rows() extracts the row-pool from mock data, normalized for the engine.
export function rowsFromMock(mock, doc) {
  if (!mock) return []
  if (doc === 'invoice') {
    const items = mock.lineItems || mock.line_items || []
    return items.map((it) => ({
      kind: 'charge',
      typeCode: it.type || it.typeCode || '',
      classification: 'A',
      sign: '+',
      label: it.description || it.label || it.type || '',
      note: it.note || '',
      amount: num(it.amount ?? it.charges),
      quantity: num(it.quantity, 1),
      total: num(it.amount ?? it.charges),
      signMul: 1,
    }))
  }
  return (mock.rows || []).map((r) => ({
    kind: r.kind || '',
    typeCode: r.typeCode || '',
    typeId: r.typeId || '',
    sourceKind: r.sourceKind || '',
    classification: r.classification || '',
    sign: r.sign || '+',
    label: r.label || '',
    note: r.note || '',
    amount: num(r.amount),
    quantity: num(r.quantity, 1),
    total: num(r.total),
    signMul: r.sign === '-' ? -1 : 1,
  }))
}

// buildVars derives the named-scalar map used by formula evaluation, mirroring
// stmtScalars(): canonical totals from the statement block + per-kind effective
// sums from the row pool + running ledger balances.
export function buildVars(mock, doc) {
  if (doc === 'invoice') {
    return { invoiceTotal: num(mock?.invoice?.total) }
  }
  const s = mock?.statement || {}
  const rows = rowsFromMock(mock, 'statement')
  const ledger = mock?.ledger || {}
  const byKind = (k, mode) => aggregate({ agg: 'sum', signMode: mode }, rows.filter((r) => r.kind === k))
  const vars = {
    grossTotal: num(s.grossTotal),
    netPay: num(s.netPay),
    grandTotal: num(s.grandTotal ?? s.netPay),
    tripsTotal: num(s.tripsTotal),
    deductionsTotal: Math.abs(byKind('deduction', 'effective')),
    otherPayTotal: byKind('other_pay', 'effective'),
    balanceTotal: byKind('balance_entry', 'effective'),
    escrowBalance: num(ledger.ESCROW),
    openItems: num(ledger.OPEN_ITEMS),
    reimbursement: num(ledger.REIMBURSEMENT),
  }
  // Per-code running ledger balances — mirrors Go stmtScalars (balance_<CODE>).
  for (const [code, v] of Object.entries(ledger)) {
    vars[`balance_${code}`] = num(v)
  }
  return vars
}

function num(v, d = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
