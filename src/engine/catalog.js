// catalog.js — the single source of truth for the node palette + inspector.
// Mirrors the backend node catalog (pdf_render_engine.go renderStatementNode /
// renderInvoiceNode / renderFineNodeAt). Every editable control in the UI is
// derived from these entries, so adding engine support = one entry here.

// Row-pool fields available for rule matching and table columns.
export const ROW_RULE_FIELDS = ['kind', 'typeCode', 'typeId', 'sourceKind', 'classification', 'sign']
// Column fields the Go rowFieldValue switch supports (others render blank, so
// they're not offered). Note: 'sign' is a valid RULE field but NOT a column.
export const ROW_COLUMN_FIELDS = [
  'label', 'typeCode', 'kind', 'sourceKind', 'classification', 'note', 'amount', 'quantity', 'total', 'effective',
]
// Row kinds present in statements (+ charge for invoices).
export const STATEMENT_KINDS = ['other_pay', 'deduction', 'balance_entry']
export const INVOICE_KINDS = ['charge']

export const KIND_LABELS = {
  other_pay: 'Other pay',
  deduction: 'Deduction',
  balance_entry: 'Driver balance',
  charge: 'Charge',
}

// Default columns for a fresh table node. (No `format` key — Go formats table
// cells by field name and ignores a per-column format.)
export const DEFAULT_COLUMNS = [
  { header: 'Type', field: 'label', align: 'L', width: 3 },
  { header: 'Note', field: 'note', align: 'L', width: 3 },
  { header: 'Amount', field: 'effective', align: 'R', width: 2 },
]

// uid generates short ids for new nodes / computed values (no crypto dep needed).
let _seq = 0
export function uid(prefix = 'n') {
  _seq += 1
  return `${prefix}_${_seq.toString(36)}${Date.now().toString(36).slice(-3)}`
}

// CATALOG: type -> metadata.
//   group   : palette section
//   docs    : which documents allow it
//   system  : rendered by the engine as-is (no editable body) — system chrome
//   accepts : which sub-structures the inspector exposes
//   props   : editable prop schema ({key, kind, label, options?})
//   make()  : factory for a fresh node when added from the palette
export const CATALOG = {
  // ---- System / coarse (statement) ----
  header_band: sys('header_band', 'System', ['statement'], 'Company header band', { explodable: true }),
  driver_row: sys('driver_row', 'System', ['statement'], 'Driver row + classification pill', { explodable: true }),
  metric_row: sys('metric_row', 'System', ['statement'], 'Gross / Deductions / Earnings / Escrow cards', { explodable: true }),
  body_two_col: sys('body_two_col', 'System', ['statement'], 'Trips table + deductions list (claims rows)', { explodable: true }),
  footer_cards: sys('footer_cards', 'System', ['statement'], 'Balance breakdown + pay-to', { explodable: true }),
  // ---- System / coarse (invoice) ----
  invoice_header: sys('invoice_header', 'System', ['invoice'], 'Invoice number + customer', { explodable: true }),
  invoice_details: sys('invoice_details', 'System', ['invoice'], 'Invoice details', { explodable: true }),
  invoice_meta: sys('invoice_meta', 'System', ['invoice'], 'Invoice meta', { explodable: true }),
  invoice_stops: sys('invoice_stops', 'System', ['invoice'], 'Stops / delivery', { explodable: true }),
  invoice_charges: sys('invoice_charges', 'System', ['invoice'], 'Charges summary (claims rows)', { explodable: true }),

  // ---- Layout ----
  row: {
    type: 'row', label: 'Row (side by side)', group: 'Layout', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: true, width: true, props: false },
    childTypes: ['metric_card', 'list', 'table', 'aggregate', 'computed_value', 'text', 'column'],
    make: () => ({
      type: 'row', id: uid('row'), children: [
        { type: 'metric_card', id: uid('mc'), width: 6, props: { label: 'Gross', source: 'grossTotal', format: 'money' } },
        { type: 'metric_card', id: uid('mc'), width: 6, props: { label: 'Net pay', source: 'netPay', format: 'money', accent: true } },
      ],
    }),
  },
  column: {
    type: 'column', label: 'Column (stacked)', group: 'Layout', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: true, width: true, props: false },
    childTypes: ['metric_card', 'list', 'table', 'aggregate', 'computed_value', 'text', 'row'],
    make: () => ({ type: 'column', id: uid('col'), children: [] }),
  },

  // ---- Data-driven (route rows via rule) ----
  list: {
    type: 'list', label: 'List (routed rows)', group: 'Data', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: true, aggregate: false, computed: false, children: false, width: true, props: true, labelOverride: true },
    props: [
      { key: 'title', kind: 'text', label: 'Title' },
      { key: 'signMode', kind: 'enum', label: 'Amount sign', options: ['effective', 'magnitude', 'raw'] },
      { key: 'showTotal', kind: 'bool', label: 'Show total row' },
    ],
    make: (doc) => ({
      type: 'list', id: uid('list'),
      props: { title: 'Deductions', signMode: 'effective', showTotal: true },
      rule: doc === 'invoice'
        ? null
        : { any: [{ field: 'kind', op: 'in', value: ['deduction'] }] },
    }),
  },
  table: {
    type: 'table', label: 'Table (custom columns)', group: 'Data', docs: ['statement', 'invoice'], system: false,
    // No labelOverride: Go applies LabelOverride only in drawRowList (lists), not
    // drawConfigTable (tables) — exposing it here would be a dead control.
    accepts: { rule: true, aggregate: false, computed: false, children: false, width: true, props: true, columns: true, binding: true },
    props: [
      { key: 'title', kind: 'text', label: 'Title' },
      { key: 'showTotal', kind: 'bool', label: 'Show total row' },
    ],
    make: (doc) => ({
      type: 'table', id: uid('tbl'),
      props: { title: 'Charges', showTotal: true, columns: DEFAULT_COLUMNS.map((c) => ({ ...c })) },
      rule: doc === 'invoice' ? null : { any: [{ field: 'kind', op: 'in', value: ['deduction', 'balance_entry'] }] },
    }),
  },
  aggregate: {
    type: 'aggregate', label: 'Aggregate (sum / count)', group: 'Data', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: true, aggregate: true, computed: false, children: false, width: true, props: false },
    make: (doc) => ({
      type: 'aggregate', id: uid('agg'),
      aggregate: { agg: 'sum', signMode: 'effective', label: 'Total' },
      rule: doc === 'invoice' ? null : { any: [{ field: 'kind', op: 'in', value: ['deduction'] }] },
    }),
  },

  // ---- Computed / display ----
  computed_value: {
    type: 'computed_value', label: 'Computed value (formula)', group: 'Computed', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: true, children: false, width: true, props: false },
    make: (doc) => ({
      type: 'computed_value', id: uid('cv'),
      computed: {
        id: uid('f'),
        expr: doc === 'invoice' ? 'invoiceTotal' : 'netPay - deductionsTotal',
        format: 'money',
        label: 'Adjusted',
      },
    }),
  },
  metric_card: {
    type: 'metric_card', label: 'Metric card', group: 'Computed', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: true, props: true, metric: true },
    props: [
      { key: 'label', kind: 'text', label: 'Label' },
      { key: 'sub', kind: 'text', label: 'Sub-label' },
      { key: 'format', kind: 'enum', label: 'Format', options: ['money', 'percent'] },
      { key: 'accent', kind: 'bool', label: 'Accent (filled)' },
    ],
    make: (doc) => ({
      type: 'metric_card', id: uid('mc'),
      props: { label: 'Net pay', source: doc === 'invoice' ? 'invoiceTotal' : 'netPay', format: 'money', accent: true },
    }),
  },

  // ---- Text / structure ----
  section_title: {
    type: 'section_title', label: 'Section title', group: 'Text', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: false, props: true },
    props: [{ key: 'title', kind: 'text', label: 'Title' }],
    make: () => ({ type: 'section_title', id: uid('st'), props: { title: 'Section' } }),
  },
  text: {
    type: 'text', label: 'Text block', group: 'Text', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: false, props: true },
    props: [{ key: 'text', kind: 'multiline', label: 'Text' }],
    make: () => ({ type: 'text', id: uid('txt'), props: { text: 'Thank you for your service.' } }),
  },
  field: {
    type: 'field', label: 'Field (bound text)', group: 'Text', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: true, props: false, boundText: true },
    make: (doc) => ({ type: 'field', id: uid('fld'), props: { source: doc === 'invoice' ? 'customerName' : 'driverName', style: 'normal' } }),
  },
  divider: {
    type: 'divider', label: 'Divider', group: 'Text', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: false, props: false },
    make: () => ({ type: 'divider', id: uid('div') }),
  },
}

// cloneWithNewIds deep-clones a node and regenerates every id (node ids and
// computed-value ids) so a duplicate never collides with the original — a
// duplicated formula gets a fresh id and the original keeps its references.
export function cloneWithNewIds(node) {
  const copy = JSON.parse(JSON.stringify(node))
  const walk = (n) => {
    if (n.id) n.id = uid(String(n.type || 'n').slice(0, 3))
    if (n.computed?.id) n.computed.id = uid('f')
    ;(n.children || []).forEach(walk)
  }
  walk(copy)
  return copy
}

function sys(type, group, docs, desc, extra = {}) {
  return {
    type, label: prettyType(type), group, docs, system: true, desc,
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: false, props: false },
    make: () => ({ type, id: uid('sys') }),
    ...extra,
  }
}

// mcNode builds a metric_card bound to a numeric scalar.
function mcNode(label, source, accent) {
  return { type: 'metric_card', id: uid('mc'), props: { label, source, format: 'money', ...(accent ? { accent: true } : {}) } }
}
// fldNode builds a data-bound text field (string source + style + optional label prefix).
function fldNode(source, style, label) {
  return { type: 'field', id: uid('fld'), props: { source, style: style || 'normal', ...(label ? { label } : {}) } }
}
function textNode(text) {
  return { type: 'text', id: uid('txt'), props: { text } }
}

// explodeNode replaces a coarse/system block with equivalent EDITABLE fine
// blocks carrying the same data — now composable/reorderable. Returns null for
// non-explodable types. Widths are bare numbers (Go wire format).
export function explodeNode(node, doc) {
  switch (node.type) {
    case 'header_band':
      return [{ type: 'row', id: uid('row'), children: [
        { type: 'column', id: uid('col'), width: 7, children: [
          fldNode('companyName', 'heading'), fldNode('companyAddress', 'muted'), fldNode('companyIds', 'muted'),
        ] },
        { type: 'column', id: uid('col'), width: 5, children: [
          textNode('PAY PERIOD'), fldNode('period', 'normal'), fldNode('statementNumber', 'muted', 'Statement '),
        ] },
      ] }]
    case 'driver_row':
      return [{ type: 'row', id: uid('row'), children: [
        { ...fldNode('driverName', 'heading'), width: 7 },
        { ...fldNode('payTo', 'muted', 'Pay to '), width: 5 },
      ] }]
    case 'invoice_header':
      return [{ type: 'row', id: uid('row'), children: [
        { type: 'column', id: uid('col'), width: 7, children: [
          fldNode('invoiceNumber', 'heading', 'INVOICE '), fldNode('customerName', 'muted', 'Bill to: '),
        ] },
        { type: 'column', id: uid('col'), width: 5, children: [
          textNode('TOTAL'), { ...mcNode('Total', 'invoiceTotal', true) },
        ] },
      ] }]
    case 'invoice_details':
      return [{ type: 'row', id: uid('row'), children: [
        { ...fldNode('invoiceDate', 'normal', 'Date: '), width: 4 },
        { ...fldNode('dueDate', 'normal', 'Due: '), width: 4 },
        { ...fldNode('loadNumber', 'normal', 'Load #'), width: 4 },
      ] }]
    case 'invoice_meta':
      return [fldNode('carrierName', 'muted')]
    case 'invoice_stops':
      return [{ type: 'row', id: uid('row'), children: [
        { ...fldNode('customerName', 'normal', 'Bill to: '), width: 6 },
        { ...fldNode('customerAddress', 'muted'), width: 6 },
      ] }]
    case 'metric_row':
      return [{ type: 'row', id: uid('row'), children: [
        { ...mcNode('Gross', 'grossTotal'), width: 3 },
        { ...mcNode('Deductions', 'deductionsTotal'), width: 3 },
        { ...mcNode('Earnings', 'netPay', true), width: 3 },
        { ...mcNode('Escrow', 'escrowBalance'), width: 3 },
      ] }]
    case 'footer_cards':
      return [{ type: 'row', id: uid('row'), children: [
        { ...mcNode('Open items', 'openItems'), width: 4 },
        { ...mcNode('Reimbursement', 'reimbursement'), width: 4 },
        { ...mcNode('Net pay', 'netPay', true), width: 4 },
      ] }]
    case 'body_two_col':
      return [{ type: 'row', id: uid('row'), children: [
        { type: 'column', id: uid('col'), width: 7, children: [
          { type: 'section_title', id: uid('st'), props: { title: 'Trips' } },
          { type: 'table', id: uid('tbl'), binding: { source: 'trips' }, props: { title: '' } },
        ] },
        { type: 'column', id: uid('col'), width: 5, children: [
          { type: 'section_title', id: uid('st'), props: { title: 'Deductions & balances' } },
          { type: 'list', id: uid('list'), props: { title: '', signMode: 'effective', showTotal: true },
            rule: { any: [{ field: 'kind', op: 'in', value: ['deduction', 'balance_entry'] }] } },
        ] },
      ] }]
    case 'invoice_charges':
      return [{ type: 'table', id: uid('tbl'),
        props: { title: 'Charges', showTotal: true, columns: [
          { header: 'Type', field: 'typeCode', align: 'L', width: 2 },
          { header: 'Description', field: 'label', align: 'L', width: 3 },
          { header: 'Amount', field: 'total', align: 'R', width: 2 },
        ] },
        rule: null }]
    default:
      return null
  }
}

export function prettyType(t) {
  return String(t || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function meta(type) {
  return CATALOG[type] || {
    type, label: prettyType(type), group: 'Other', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: false, props: false },
    make: () => ({ type, id: uid('n') }),
  }
}

// paletteFor returns catalog entries valid for a document, grouped for display.
export function paletteFor(doc) {
  const groups = {}
  for (const m of Object.values(CATALOG)) {
    if (!m.docs.includes(doc)) continue
    ;(groups[m.group] ||= []).push(m)
  }
  // Stable group order.
  const order = ['Data', 'Computed', 'Layout', 'Text', 'System']
  return order.filter((g) => groups[g]).map((g) => ({ group: g, items: groups[g] }))
}
