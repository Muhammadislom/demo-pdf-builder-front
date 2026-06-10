import { describe, it, expect } from 'vitest'
import { evalFormula, identifiers, resolveComputed } from './formula.js'
import { aggregate } from './aggregate.js'
import { matchRule, claim, peek } from './rule.js'
import { buildVars, rowsFromMock, buildStrings, stringSourcesForDoc, scalarOptions } from './scalars.js'
import { cloneWithNewIds } from './catalog.js'
import { formatComputed, percent, money, numberGo } from './format.js'
import { cellValue, labelFor } from './cells.js'
import { CATALOG, ROW_COLUMN_FIELDS, explodeNode } from './catalog.js'
import { remapSelection, replaceWithMany } from '../state/tree.js'
import { widthPct } from './width.js'

// These assertions mirror the Go pdfengine / fine_node_render_test.go so the
// JS shared-spec stays byte-for-byte faithful to the backend.

describe('formula', () => {
  it('arithmetic + precedence', () => {
    expect(evalFormula('2 + 3 * 4', {})).toBe(14)
    expect(evalFormula('(2 + 3) * 4', {})).toBe(20)
    expect(evalFormula('-5 + 2', {})).toBe(-3)
  })
  it('functions abs/min/max/round', () => {
    expect(evalFormula('abs(-7)', {})).toBe(7)
    expect(evalFormula('min(3, 9, 1)', {})).toBe(1)
    expect(evalFormula('max(3, 9, 1)', {})).toBe(9)
    expect(evalFormula('round(3.14159, 2)', {})).toBe(3.14)
    expect(evalFormula('round(3.7)', {})).toBe(4)
  })
  it('mirrors the Go Adjusted = grossTotal - deductionsTotal = 5764.31 case', () => {
    const v = evalFormula('grossTotal - deductionsTotal', { grossTotal: 7436, deductionsTotal: 1671.69 })
    expect(Number(v.toFixed(2))).toBe(5764.31)
  })
  it('lenient: unknown ident -> 0, div by zero -> 0', () => {
    expect(evalFormula('nope + 1', {}, { lenient: true })).toBe(1)
    expect(evalFormula('5 / 0', {}, { lenient: true })).toBe(0)
  })
  it('strict: unknown ident + div by zero throw', () => {
    expect(() => evalFormula('nope + 1', {}, { lenient: false })).toThrow()
    expect(() => evalFormula('5 / 0', {}, { lenient: false })).toThrow()
  })
  it('syntax errors throw even when lenient', () => {
    expect(() => evalFormula('1 + * 2', {}, { lenient: true })).toThrow()
    expect(() => evalFormula('(1 + 2', {}, { lenient: true })).toThrow()
  })
  it('identifiers excludes function names', () => {
    expect(identifiers('max(netPay, 0) - fee').sort()).toEqual(['fee', 'netPay'])
  })
  it('resolveComputed folds ids in order', () => {
    const nodes = [
      { computed: { id: 'a', expr: 'gross * 0.5' } },
      { computed: { id: 'b', expr: 'a + 100' } },
    ]
    const out = resolveComputed(nodes, { gross: 1000 })
    expect(out.a).toBe(500)
    expect(out.b).toBe(600)
  })
})

describe('aggregate', () => {
  const rows = [
    { total: 1621.69, signMul: -1 },
    { total: 50, signMul: -1 },
  ]
  it('effective applies signMul', () => {
    expect(Number(aggregate({ agg: 'sum', signMode: 'effective' }, rows).toFixed(2))).toBe(-1671.69)
  })
  it('magnitude uses absolute values', () => {
    expect(Number(aggregate({ agg: 'sum', signMode: 'magnitude' }, rows).toFixed(2))).toBe(1671.69)
  })
  it('raw uses stored totals', () => {
    expect(Number(aggregate({ agg: 'sum', signMode: 'raw' }, rows).toFixed(2))).toBe(1671.69)
  })
  it('count ignores sign', () => {
    expect(aggregate({ agg: 'count' }, rows)).toBe(2)
  })
})

describe('rule', () => {
  const rows = [
    { kind: 'deduction', typeCode: 'FUEL', classification: 'A' },
    { kind: 'deduction', typeCode: 'TOLL', classification: 'A' },
    { kind: 'balance_entry', typeCode: 'ESCROW', classification: 'L' },
    { kind: 'other_pay', typeCode: 'REIMBURSEMENT', classification: 'L' },
  ]
  it('eq / in / notIn / ne', () => {
    expect(matchRule({ field: 'kind', op: 'eq', value: 'deduction' }, rows[0])).toBe(true)
    expect(matchRule({ field: 'kind', op: 'in', value: ['deduction', 'balance_entry'] }, rows[2])).toBe(true)
    expect(matchRule({ field: 'kind', op: 'notIn', value: ['deduction'] }, rows[3])).toBe(true)
    expect(matchRule({ field: 'classification', op: 'ne', value: 'A' }, rows[2])).toBe(true)
  })
  it('all / any nesting', () => {
    const r = { all: [{ field: 'kind', op: 'eq', value: 'deduction' }, { field: 'typeCode', op: 'eq', value: 'FUEL' }] }
    expect(matchRule(r, rows[0])).toBe(true)
    expect(matchRule(r, rows[1])).toBe(false)
  })
  it('nil/empty rule is catch-all', () => {
    expect(matchRule(null, rows[0])).toBe(true)
    expect(matchRule({}, rows[0])).toBe(true)
  })
  it('first-match-wins: second list gets the remainder', () => {
    const claimed = new Set()
    const a = claim({ any: [{ field: 'typeCode', op: 'in', value: ['FUEL'] }] }, rows, claimed)
    const b = claim(null, rows, claimed) // catch-all
    expect(a.map((r) => r.typeCode)).toEqual(['FUEL'])
    expect(b.map((r) => r.typeCode)).toEqual(['TOLL', 'ESCROW', 'REIMBURSEMENT'])
    // peek does NOT claim
    expect(peek({ field: 'kind', op: 'eq', value: 'deduction' }, rows).length).toBe(2)
  })
})

describe('scalars (statement)', () => {
  const mock = {
    statement: { grossTotal: 7436, netPay: 3476.31, grandTotal: 3476.31, tripsTotal: 3476 },
    ledger: { ESCROW: 300, OPEN_ITEMS: -425, REIMBURSEMENT: 175 },
    rows: [
      { kind: 'deduction', typeCode: 'FUEL', sign: '-', total: 1621.69 },
      { kind: 'deduction', typeCode: 'TOLL', sign: '-', total: 50 },
      { kind: 'other_pay', typeCode: 'REIMBURSEMENT', sign: '+', total: 175 },
      { kind: 'balance_entry', typeCode: 'ESCROW', sign: '-', total: 300 },
    ],
  }
  it('derives canonical + per-kind + ledger scalars', () => {
    const v = buildVars(mock, 'statement')
    expect(v.grossTotal).toBe(7436)
    expect(v.netPay).toBe(3476.31)
    expect(Number(v.deductionsTotal.toFixed(2))).toBe(1671.69) // magnitude
    expect(v.otherPayTotal).toBe(175)
    expect(v.balanceTotal).toBe(-300)
    expect(v.escrowBalance).toBe(300)
    expect(v.openItems).toBe(-425)
  })
  it('rowsFromMock normalizes signMul', () => {
    const rows = rowsFromMock(mock, 'statement')
    expect(rows[0].signMul).toBe(-1)
    expect(rows[2].signMul).toBe(1)
  })
})

// ---- regression tests for the audit fixes (must match the Go backend) ----

describe('width wire format (Go Width: number cols | "NN%" string — never an object)', () => {
  it('catalog Row children use a bare number, not an object', () => {
    const row = CATALOG.row.make('statement')
    for (const child of row.children) {
      expect(typeof child.width).toBe('number')
    }
  })
  it('a node tree with width serializes to a number/string, never an object', () => {
    const node = { type: 'metric_card', width: 6 }
    const round = JSON.parse(JSON.stringify(node))
    expect(['number', 'string']).toContain(typeof round.width)
    expect(typeof round.width).not.toBe('object')
  })
  it('widthPct interprets number cols, "NN%" string, and legacy object', () => {
    expect(widthPct({ width: 6 })).toBe(50)
    expect(widthPct({ width: 12 })).toBe(100)
    expect(widthPct({ width: '40%' })).toBe(40)
    expect(widthPct({ width: { cols: 3 } })).toBe(25) // defensive legacy
    expect(widthPct({})).toBe(null)
  })
})

describe('formatComputed mirrors Go formatComputed (percent special, else money)', () => {
  it('non-percent renders as money (the "number" option does not exist on the engine)', () => {
    expect(formatComputed(1234.5, 'money')).toBe('$1,234.50')
    expect(formatComputed(1234.5, 'number')).toBe('$1,234.50') // falls through to money, like Go
    expect(formatComputed(-50, 'money')).toBe('($50.00)')
  })
  it('percent uses %.2f%% with NO thousands grouping', () => {
    expect(formatComputed(1234.5, 'percent')).toBe('1234.50%')
    expect(percent(1234.5)).toBe('1234.50%')
  })
})

describe('cellValue mirrors Go rowFieldValue', () => {
  const r = { kind: 'deduction', typeCode: 'FUEL', label: 'Fuel', note: '495 gal', classification: 'A', sign: '-', amount: 1621.69, quantity: 1, total: 1621.69 }
  it('kind is raw (not humanized)', () => { expect(cellValue(r, 'kind')).toBe('deduction') })
  it('label falls back to typeCode', () => { expect(cellValue({ typeCode: 'TOLL' }, 'label')).toBe('TOLL') })
  it('effective applies signMul', () => { expect(cellValue(r, 'effective')).toBe('($1,621.69)') })
  it('quantity uses Go formatNumber', () => { expect(cellValue({ quantity: 1 }, 'quantity')).toBe('1') })
  it('unknown field renders blank (like Go default)', () => { expect(cellValue(r, 'sign')).toBe('') })
  it('sign is NOT offered as a column field (Go has no case for it)', () => {
    expect(ROW_COLUMN_FIELDS).not.toContain('sign')
  })
})

describe('catalog accepts flags match backend capability', () => {
  it('labelOverride only on list — Go applies it in drawRowList, not drawConfigTable', () => {
    expect(CATALOG.list.accepts.labelOverride).toBe(true)
    expect(CATALOG.table.accepts.labelOverride).toBeFalsy()
  })
  it('table supports a binding switch (routed rows vs trips)', () => {
    expect(CATALOG.table.accepts.binding).toBe(true)
  })
})

describe('labelFor applies per-type LabelOverride then falls back', () => {
  const lo = { byType: { FUEL: 'Fuel & DEF' } }
  it('uses override when present', () => { expect(labelFor({ typeCode: 'FUEL', label: 'Fuel' }, lo)).toBe('Fuel & DEF') })
  it('falls back to label then typeCode', () => {
    expect(labelFor({ typeCode: 'TOLL', label: 'Toll' }, lo)).toBe('Toll')
    expect(labelFor({ typeCode: 'TOLL' }, lo)).toBe('TOLL')
  })
})

describe('numberGo mirrors Go formatNumber', () => {
  it('0 -> "0", integer grouped, decimal %.2f ungrouped', () => {
    expect(numberGo(0)).toBe('0')
    expect(numberGo(1234)).toBe('1,234')
    expect(numberGo(1234.5)).toBe('1234.50')
  })
})

describe('explodeNode turns system blocks into editable fine nodes', () => {
  const RENDERABLE = new Set(['row', 'column', 'table', 'list', 'metric_card', 'section_title', 'field', 'text', 'aggregate', 'computed_value', 'divider'])
  const walk = (n, fn) => { fn(n); (n.children || []).forEach((c) => walk(c, fn)) }

  it('metric_row -> row of 4 metric_cards with numeric widths', () => {
    const out = explodeNode({ type: 'metric_row' }, 'statement')
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('row')
    expect(out[0].children).toHaveLength(4)
    out[0].children.forEach((c) => { expect(c.type).toBe('metric_card'); expect(typeof c.width).toBe('number') })
  })
  it('body_two_col -> row[column|column] of renderable nodes', () => {
    const out = explodeNode({ type: 'body_two_col' }, 'statement')
    expect(out[0].type).toBe('row')
    expect(out[0].children.map((c) => c.type)).toEqual(['column', 'column'])
    walk(out[0], (n) => {
      expect(RENDERABLE.has(n.type)).toBe(true)
      if (n.width != null) expect(typeof n.width).toBe('number') // never an object (Go wire format)
    })
  })
  it('every exploded node carries an id and no object widths', () => {
    for (const t of ['metric_row', 'footer_cards', 'body_two_col']) {
      explodeNode({ type: t }, 'statement').forEach((root) => walk(root, (n) => {
        expect(n.id).toBeTruthy()
        expect(typeof n.width === 'object' && n.width !== null).toBe(false)
      }))
    }
  })
  it('a non-explodable node returns null', () => {
    expect(explodeNode({ type: 'list' }, 'statement')).toBe(null)
  })
})

describe('100%-power additions (ledger scalars / scalar options / clone / width %)', () => {
  const mock = {
    statement: { grossTotal: 7436, netPay: -250 },
    ledger: { ESCROW: 300, OPEN_ITEMS: -425, REIMBURSEMENT: 175, ADVANCE: -425 },
    rows: [],
  }
  it('buildVars exposes balance_<CODE> for every ledger code (mirrors Go)', () => {
    const v = buildVars(mock, 'statement')
    expect(v.balance_ESCROW).toBe(300)
    expect(v.balance_OPEN_ITEMS).toBe(-425)
    expect(v.balance_ADVANCE).toBe(-425)
  })
  it('scalarOptions includes ledger codes and other computed ids, excluding self', () => {
    const tree = { type: 'page', children: [
      { type: 'computed_value', computed: { id: 'adj', expr: 'netPay - 1', label: 'Adjusted' } },
      { type: 'computed_value', computed: { id: 'half', expr: 'adj / 2' } },
    ] }
    const names = scalarOptions(mock, 'statement', tree, 'half').map((s) => s.name)
    expect(names).toContain('balance_ADVANCE')
    expect(names).toContain('adj')
    expect(names).not.toContain('half') // no self-reference
  })
  it('cloneWithNewIds regenerates node + computed ids deeply', () => {
    const node = { type: 'row', id: 'r1', children: [
      { type: 'computed_value', id: 'c1', computed: { id: 'f1', expr: '1' } },
    ] }
    const copy = cloneWithNewIds(node)
    expect(copy.id).not.toBe('r1')
    expect(copy.children[0].id).not.toBe('c1')
    expect(copy.children[0].computed.id).not.toBe('f1')
    expect(copy.children[0].computed.expr).toBe('1')
    // original untouched
    expect(node.id).toBe('r1')
  })
  it('percent width serializes as a "NN%" string (Go wire format)', () => {
    const node = { type: 'metric_card', width: '40%' }
    const round = JSON.parse(JSON.stringify(node))
    expect(round.width).toBe('40%')
    expect(widthPct({ width: '40%' })).toBe(40)
  })
})

describe('field bound-text strings (mirror Go stmtStrings/invoiceStrings)', () => {
  const mock = {
    company: { name: 'Acme Carrier', address: '1 Main St', usdot: '123', mc: '456' },
    statement: { driverName: 'John Doe', unitNumber: '7', number: 'ST-1', periodStart: '2025-06-02', periodEnd: '2025-06-08' },
  }
  it('builds statement string sources', () => {
    const s = buildStrings(mock, 'statement')
    expect(s.companyName).toBe('Acme Carrier')
    expect(s.companyIds).toBe('USDOT 123 · MC 456')
    expect(s.driverName).toBe('John Doe')
    expect(s.payTo).toBe('John Doe')
    expect(s.period).toBe('2025-06-02 – 2025-06-08')
  })
  it('every source-list key is resolvable (statement + invoice)', () => {
    const s = buildStrings(mock, 'statement')
    for (const k of stringSourcesForDoc('statement')) expect(k in s).toBe(true)
    const iv = buildStrings({ invoice: { number: 'INV-9' }, customer: { name: 'Broker LLC' } }, 'invoice')
    expect(iv.invoiceNumber).toBe('INV-9')
    expect(iv.customerName).toBe('Broker LLC')
    for (const k of stringSourcesForDoc('invoice')) expect(k in iv).toBe(true)
  })
})

describe('explode header/driver into field-bound blocks (Phase 2)', () => {
  const RENDERABLE = new Set(['row', 'column', 'table', 'list', 'metric_card', 'section_title', 'field', 'text', 'aggregate', 'computed_value', 'divider'])
  const walk = (n, fn) => { fn(n); (n.children || []).forEach((c) => walk(c, fn)) }
  it('header_band -> row of field/text, renderable, numeric widths', () => {
    const out = explodeNode({ type: 'header_band' }, 'statement')
    expect(out[0].type).toBe('row')
    let hasField = false
    walk(out[0], (n) => {
      expect(RENDERABLE.has(n.type)).toBe(true)
      if (n.width != null) expect(typeof n.width).toBe('number')
      if (n.type === 'field') hasField = true
    })
    expect(hasField).toBe(true)
  })
  it('driver_row -> fields bound to driverName + payTo', () => {
    const out = explodeNode({ type: 'driver_row' }, 'statement')
    const sources = []
    walk(out[0], (n) => { if (n.type === 'field') sources.push(n.props.source) })
    expect(sources).toContain('driverName')
    expect(sources).toContain('payTo')
  })
})

describe('replaceWithMany swaps a node for several at its index', () => {
  it('preserves siblings', () => {
    const root = { type: 'page', children: [{ type: 'a' }, { type: 'b' }, { type: 'c' }] }
    const next = replaceWithMany(root, [1], [{ type: 'x' }, { type: 'y' }])
    expect(next.children.map((c) => c.type)).toEqual(['a', 'x', 'y', 'c'])
  })
  it('root path is a no-op', () => {
    const root = { type: 'page', children: [] }
    expect(replaceWithMany(root, [], [{ type: 'x' }])).toBe(root)
  })
})

describe('remapSelection keeps selection on the moved node after reorder', () => {
  it('moved node followed; displaced sibling shifts', () => {
    // row at [0] with children; select child [0,1], move 1 -> 0
    expect(remapSelection([0, 1], [0], 1, 0)).toEqual([0, 0])
    // selecting the displaced sibling [0,0] when 1 moves to 0 -> it shifts to [0,1]
    expect(remapSelection([0, 0], [0], 1, 0)).toEqual([0, 1])
  })
  it('top-level reorder remaps the head index', () => {
    expect(remapSelection([2], [], 2, 0)).toEqual([0])
    expect(remapSelection([0], [], 2, 0)).toEqual([1])
  })
  it('selection in a different subtree is unchanged', () => {
    expect(remapSelection([3, 0], [0], 1, 0)).toEqual([3, 0])
    expect(remapSelection(null, [], 0, 1)).toBe(null)
  })
})
