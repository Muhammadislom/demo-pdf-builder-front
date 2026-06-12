// catalog.js — the node catalog ADAPTER. The source of truth is the BACKEND
// (`pdfNodeCatalog` — node types, inspector schemas, factory defaults, explode
// recipes, dictionaries): call initCatalog(serverPayload) after loading and
// every consumer below (palette, inspector, explode, pickers) is driven by the
// server. The hardcoded tables in this file are the BUNDLED FALLBACK for older
// backends that don't expose the query yet — frozen at the card_design_v2
// vocabulary, kept in sync with pdfengine/catalog.go.

// ---------------------------------------------------------------------------
// Bundled dictionaries (fallback; the server dict wins when hydrated)
// ---------------------------------------------------------------------------

// Row-pool fields available for rule matching and table columns.
export const ROW_RULE_FIELDS = ['kind', 'typeCode', 'typeId', 'sourceKind', 'classification', 'sign']
// Column fields the Go rowFieldValue switch supports (others render blank, so
// they're not offered). Note: 'sign' is a valid RULE field but NOT a column.
export const ROW_COLUMN_FIELDS = [
  'label', 'typeCode', 'kind', 'sourceKind', 'classification', 'note', 'amount', 'quantity', 'total', 'effective',
]
// LIVE row kinds (post-20260710 paydown vocabulary). 'balance_entry' no longer
// occurs in real data — it stays in KIND_LABELS only so legacy saved rules
// still display a human label.
export const STATEMENT_KINDS = ['other_pay', 'deduction']
export const INVOICE_KINDS = ['charge']

export const KIND_LABELS = {
  other_pay: 'Other pay',
  deduction: 'Deduction',
  balance_entry: 'Driver balance (legacy)',
  charge: 'Charge',
}

// Default columns for a fresh table node. (No `format` key — Go formats table
// cells by field name and ignores a per-column format.)
export const DEFAULT_COLUMNS = [
  { header: 'Type', field: 'label', align: 'L', width: 3 },
  { header: 'Note', field: 'note', align: 'L', width: 3 },
  { header: 'Amount', field: 'effective', align: 'R', width: 2 },
]

// Bundled style schemas (mirror pdfengine catalog StyleSpec; bounds mirror
// validateStyle). The server styleSchema wins when hydrated.
const TEXT_STYLE = [
  { key: 'textColor', kind: 'color', label: 'Text color' },
  { key: 'fontSize', kind: 'number', label: 'Font size (pt)', min: 6, max: 24 },
  { key: 'bold', kind: 'bool', label: 'Bold' },
  { key: 'align', kind: 'enum', label: 'Align', options: ['L', 'C', 'R'] },
]
const CARD_STYLE = [
  { key: 'textColor', kind: 'color', label: 'Value color' },
  { key: 'fillColor', kind: 'color', label: 'Card fill' },
  { key: 'accentColor', kind: 'color', label: 'Border color' },
  { key: 'fontSize', kind: 'number', label: 'Value size (pt)', min: 6, max: 24 },
  { key: 'radius', kind: 'number', label: 'Corner radius (mm)', min: 0, max: 6 },
  { key: 'padding', kind: 'number', label: 'Padding (mm)', min: 0, max: 12 },
]
const LIST_STYLE = [
  { key: 'textColor', kind: 'color', label: 'Label color' },
  { key: 'fontSize', kind: 'number', label: 'Row font size (pt)', min: 6, max: 24 },
  { key: 'fillColor', kind: 'color', label: 'Total box fill' },
  { key: 'accentColor', kind: 'color', label: 'Total box color' },
  { key: 'radius', kind: 'number', label: 'Corner radius (mm)', min: 0, max: 6 },
  { key: 'padding', kind: 'number', label: 'Padding (mm)', min: 0, max: 12 },
]
const TABLE_STYLE = [
  { key: 'textColor', kind: 'color', label: 'Cell color' },
  { key: 'accentColor', kind: 'color', label: 'Header color' },
  { key: 'fontSize', kind: 'number', label: 'Cell font size (pt)', min: 6, max: 24 },
]

// uid generates short ids for new nodes / computed values (no crypto dep needed).
let _seq = 0
export function uid(prefix = 'n') {
  _seq += 1
  return `${prefix}_${_seq.toString(36)}${Date.now().toString(36).slice(-3)}`
}

// ---------------------------------------------------------------------------
// Bundled CATALOG (fallback): type -> metadata.
//   group      : palette section
//   docs       : which documents allow it
//   system     : rendered by the engine as-is (no editable body) — system chrome
//   accepts    : which sub-structures the inspector exposes
//   props      : editable prop schema ({key, kind, label, options?, min?, max?})
//   styleSchema: editable per-node Style fields (colors / size / radius / …)
//   make()     : factory for a fresh node when added from the palette
// ---------------------------------------------------------------------------
export const CATALOG = {
  // ---- System / coarse (statement, card_design_v2) ----
  header_band: sys('header_band', 'System', ['statement'], 'Company name, address & pay period', { explodable: true }),
  driver_row: sys('driver_row', 'System', ['statement'], 'Driver name + unit / class / pay basis', { explodable: true }),
  metric_row: sys('metric_row', 'System', ['statement'], 'GROSS / DEDUCTIONS / NET PAY cards', { explodable: true }),
  trips_section: sys('trips_section', 'System', ['statement'], 'Full-width trips table (loaded/empty miles, totals)', { explodable: true }),
  deductions_section: sys('deductions_section', 'System', ['statement'], 'Full-width deductions list with total', { explodable: true }),
  account_balance_cards: sys('account_balance_cards', 'System', ['statement'], 'Open Items / Balance owed / Escrow cards', { explodable: true }),
  // Legacy aliases (pre-card-design saved layouts): still render — the engine
  // maps them onto the new sections — but are hidden from the palette.
  body_two_col: sys('body_two_col', 'System', ['statement'], 'Legacy alias → trips section + deductions section', { explodable: true, deprecated: true, palette: false }),
  footer_cards: sys('footer_cards', 'System', ['statement'], 'Legacy alias → Account balance cards', { explodable: true, deprecated: true, palette: false }),
  // ---- System / coarse (invoice) ----
  invoice_header: sys('invoice_header', 'System', ['invoice'], 'Invoice number + customer', { explodable: true }),
  invoice_details: sys('invoice_details', 'System', ['invoice'], 'Invoice details', { explodable: true }),
  invoice_meta: sys('invoice_meta', 'System', ['invoice'], 'Invoice meta', { explodable: true }),
  invoice_stops: sys('invoice_stops', 'System', ['invoice'], 'Stops / delivery', { explodable: true }),
  invoice_charges: sys('invoice_charges', 'System', ['invoice'], 'Charges summary (claims rows)', { explodable: true }),

  // ---- Layout ----
  row: {
    type: 'row', label: 'Row (side by side)', group: 'Layout', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: true, width: true, props: true },
    props: [{ key: 'gap', kind: 'number', label: 'Gap between cells (mm)', min: 0, max: 12 }],
    childTypes: ['metric_card', 'list', 'table', 'aggregate', 'computed_value', 'text', 'field', 'section_title', 'divider', 'column'],
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
    childTypes: ['metric_card', 'list', 'table', 'aggregate', 'computed_value', 'text', 'field', 'section_title', 'divider', 'row'],
    make: () => ({ type: 'column', id: uid('col'), children: [] }),
  },

  // ---- Data-driven (route rows via rule) ----
  list: {
    type: 'list', label: 'List (routed rows)', group: 'Data', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: true, aggregate: false, computed: false, children: false, width: true, props: true, labelOverride: true, style: true },
    styleSchema: LIST_STYLE,
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
    accepts: { rule: true, aggregate: false, computed: false, children: false, width: true, props: true, columns: true, binding: true, style: true },
    styleSchema: TABLE_STYLE,
    props: [
      { key: 'title', kind: 'text', label: 'Title' },
      { key: 'showTotal', kind: 'bool', label: 'Show total row' },
    ],
    make: (doc) => ({
      type: 'table', id: uid('tbl'),
      props: { title: 'Charges', showTotal: true, columns: DEFAULT_COLUMNS.map((c) => ({ ...c })) },
      rule: doc === 'invoice' ? null : { any: [{ field: 'kind', op: 'in', value: ['deduction'] }] },
    }),
  },
  aggregate: {
    type: 'aggregate', label: 'Aggregate (sum / count)', group: 'Data', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: true, aggregate: true, computed: false, children: false, width: true, props: false, style: true },
    styleSchema: CARD_STYLE,
    make: (doc) => ({
      type: 'aggregate', id: uid('agg'),
      aggregate: { agg: 'sum', signMode: 'effective', label: 'Total' },
      rule: doc === 'invoice' ? null : { any: [{ field: 'kind', op: 'in', value: ['deduction'] }] },
    }),
  },

  // ---- Computed / display ----
  computed_value: {
    type: 'computed_value', label: 'Computed value (formula)', group: 'Computed', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: true, children: false, width: true, props: false, style: true },
    styleSchema: CARD_STYLE,
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
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: true, props: true, metric: true, style: true },
    styleSchema: CARD_STYLE,
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
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: false, props: true, style: true },
    styleSchema: TEXT_STYLE,
    props: [{ key: 'title', kind: 'text', label: 'Title' }],
    make: () => ({ type: 'section_title', id: uid('st'), props: { title: 'Section' } }),
  },
  text: {
    type: 'text', label: 'Text block', group: 'Text', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: false, props: true, style: true },
    styleSchema: TEXT_STYLE,
    props: [{ key: 'text', kind: 'multiline', label: 'Text' }],
    make: () => ({ type: 'text', id: uid('txt'), props: { text: 'Thank you for your service.' } }),
  },
  field: {
    type: 'field', label: 'Field (bound text)', group: 'Text', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: true, props: false, boundText: true, style: true },
    styleSchema: TEXT_STYLE,
    make: (doc) => ({ type: 'field', id: uid('fld'), props: { source: doc === 'invoice' ? 'customerName' : 'driverName', style: 'normal' } }),
  },
  divider: {
    type: 'divider', label: 'Divider', group: 'Text', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: false, props: false, style: true },
    styleSchema: [{ key: 'accentColor', kind: 'color', label: 'Line color' }],
    make: () => ({ type: 'divider', id: uid('div') }),
  },
}

// cloneWithNewIds deep-clones a node and regenerates every id (node ids and
// computed-value ids) so a duplicate never collides with the original — a
// duplicated formula gets a fresh id and the original keeps its references.
// Placeholder "$id" ids from server templates get fresh ids the same way.
export function cloneWithNewIds(node) {
  const copy = JSON.parse(JSON.stringify(node))
  const walk = (n) => {
    if (n.id != null) n.id = uid(String(n.type || 'n').slice(0, 3))
    if (n.computed?.id != null && (n.computed.id === PLACEHOLDER_ID || n.computed.id)) n.computed.id = uid('f')
    ;(n.children || []).forEach(walk)
  }
  walk(copy)
  return copy
}

function sys(type, group, docs, desc, extra = {}) {
  return {
    type, label: prettyType(type), group, docs, system: true, desc, palette: true,
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
function titleNode(title) {
  return { type: 'section_title', id: uid('st'), props: { title } }
}

// bundledExplode — the fallback explode recipes, matching the card_design_v2
// recipes pdfengine/catalog.go ships. Widths are bare numbers (Go wire format).
function bundledExplode(node, doc) {
  switch (node.type) {
    case 'header_band':
      return [{ type: 'row', id: uid('row'), children: [
        { type: 'column', id: uid('col'), width: 7, children: [
          fldNode('companyName', 'heading'), fldNode('companyAddress', 'muted'), fldNode('companyPhone', 'muted'),
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
    // card_design_v2: THREE metric cards (GROSS / DEDUCTIONS / NET PAY).
    case 'metric_row':
      return [{ type: 'row', id: uid('row'), children: [
        { ...mcNode('Gross', 'grossTotal'), width: 4 },
        { ...mcNode('Deductions', 'deductionsTotal'), width: 4 },
        { ...mcNode('Net pay', 'netPay', true), width: 4 },
      ] }]
    case 'trips_section':
      return [
        titleNode('Your trips this week'),
        { type: 'table', id: uid('tbl'), binding: { source: 'trips' }, props: { title: '' } },
      ]
    case 'deductions_section':
      return [
        titleNode('Deductions'),
        { type: 'list', id: uid('list'), props: { title: '', signMode: 'effective', showTotal: true },
          rule: { any: [{ field: 'kind', op: 'in', value: ['deduction'] }] } },
      ]
    case 'account_balance_cards':
      return [{ type: 'row', id: uid('row'), children: [
        { ...mcNode('Open Items', 'openItems'), width: 4 },
        { ...mcNode('Escrow', 'escrowBalance'), width: 4 },
        { ...mcNode('Net pay', 'netPay', true), width: 4 },
      ] }]
    // Legacy aliases explode to the new full-width stacked sections.
    case 'body_two_col':
      return [...bundledExplode({ type: 'trips_section' }, doc), ...bundledExplode({ type: 'deductions_section' }, doc)]
    case 'footer_cards':
      return [titleNode('Account balance'), ...bundledExplode({ type: 'account_balance_cards' }, doc)]
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

// ---------------------------------------------------------------------------
// Server-catalog hydration (initCatalog) + unified accessors
// ---------------------------------------------------------------------------

export const PLACEHOLDER_ID = '$id'

// server = { [doc]: normalizedCatalog } — per-document payloads as loaded.
const server = { statement: null, invoice: null }

// initCatalog hydrates (or clears, payload=null) the server catalog for a doc.
// Refuses a higher catalogVersion than this build understands (falls back to
// bundled — the contract is versioned for exactly this).
export function initCatalog(doc, payload) {
  if (!payload || typeof payload !== 'object' || (payload.catalogVersion || 1) > 1) {
    server[doc] = null
    return false
  }
  server[doc] = payload
  return true
}

export function catalogSource(doc) {
  return server[doc] ? 'server' : 'bundled'
}

export function catalogCapabilities(doc) {
  return server[doc]?.capabilities || []
}

// instantiateTemplate deep-clones a server node template and replaces every
// placeholder id with a fresh client id (cloneWithNewIds regenerates ALL ids,
// which also covers "$id").
function instantiateTemplate(tpl) {
  return cloneWithNewIds(tpl)
}

// adaptServerEntry maps one server catalog entry to the internal meta shape
// every consumer uses (same shape as the bundled CATALOG entries).
function adaptServerEntry(doc, e) {
  const props = (e.props || []).map((p) => ({
    key: p.key, kind: p.kind, label: p.label,
    options: (p.options || []).map((o) => (typeof o === 'string' ? o : o.value)),
    min: p.min, max: p.max,
  }))
  const styleSchema = (e.style || []).map((p) => ({
    key: p.key, kind: p.kind, label: p.label,
    options: (p.options || []).map((o) => (typeof o === 'string' ? o : o.value)),
    min: p.min, max: p.max,
  }))
  return {
    type: e.type,
    label: e.label || prettyType(e.type),
    group: e.group || 'Other',
    docs: [doc],
    desc: e.desc || '',
    system: !!e.system,
    palette: e.palette !== false,
    deprecated: !!e.deprecated,
    explodable: !!e.explodable && (e.explode || []).length > 0,
    accepts: e.accepts || {},
    childTypes: e.childTypes,
    props: props.length ? props : undefined,
    styleSchema: styleSchema.length ? styleSchema : undefined,
    make: () => (e.default ? instantiateTemplate(e.default) : { type: e.type, id: uid('n') }),
    _explode: e.explode || null,
  }
}

// meta(type, doc?) — node metadata: server catalog → bundled → generic
// fallback (unknown types stay visible/selectable; the real look is the PDF
// preview's job).
export function meta(type, doc) {
  const d = doc || activeDoc
  const se = server[d]?.types?.[type]
  if (se) return adaptServerEntry(d, se)
  return CATALOG[type] || {
    type, label: prettyType(type), group: 'Other', docs: ['statement', 'invoice'], system: false,
    accepts: { rule: false, aggregate: false, computed: false, children: false, width: false, props: false },
    make: () => ({ type, id: uid('n') }),
  }
}

// activeDoc lets meta() resolve against the right per-document server catalog
// without threading `doc` through every consumer. Set by App on load/doc-switch.
let activeDoc = 'statement'
export function setActiveDoc(doc) { activeDoc = doc }

// paletteFor returns catalog entries valid for a document, grouped for display.
export function paletteFor(doc) {
  const sc = server[doc]
  if (sc?.types) {
    const groups = {}
    for (const e of Object.values(sc.types)) {
      const m = adaptServerEntry(doc, e)
      if (!m.palette || m.deprecated || e.type === 'page') continue
      ;(groups[m.group] ||= []).push(m)
    }
    const order = (sc.groups || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((g) => g.key)
    const fallbackOrder = ['Data', 'Computed', 'Layout', 'Text', 'System']
    const keys = order.length ? order : fallbackOrder
    return keys.filter((g) => groups[g]).map((g) => ({ group: g, items: groups[g] }))
  }
  const groups = {}
  for (const m of Object.values(CATALOG)) {
    if (!m.docs.includes(doc) || m.palette === false || m.deprecated) continue
    ;(groups[m.group] ||= []).push(m)
  }
  const order = ['Data', 'Computed', 'Layout', 'Text', 'System']
  return order.filter((g) => groups[g]).map((g) => ({ group: g, items: groups[g] }))
}

// explodeNode replaces a coarse/system block with equivalent EDITABLE fine
// blocks carrying the same data — server recipe when hydrated, bundled
// fallback otherwise. Returns null for non-explodable types.
export function explodeNode(node, doc) {
  const se = server[doc]?.types?.[node.type]
  if (se && (se.explode || []).length) {
    return se.explode.map((tpl) => instantiateTemplate(tpl))
  }
  return bundledExplode(node, doc)
}

// dict(doc) — the binding dictionaries (rule fields/ops, kinds, column fields,
// sign modes, formats, scalars, strings). Server dict when hydrated, bundled
// constants otherwise. Shapes are normalized for the pickers.
export function dict(doc) {
  const sd = server[doc]?.dict
  if (sd) {
    return {
      ruleFields: sd.ruleFields || ROW_RULE_FIELDS,
      ruleOps: sd.ruleOps || ['eq', 'ne', 'in', 'notIn'],
      kinds: (sd.kinds || []).map((k) => ({ value: k.value, label: k.label || KIND_LABELS[k.value] || k.value })),
      columnFields: sd.columnFields || ROW_COLUMN_FIELDS,
      signModes: sd.signModes || ['effective', 'magnitude', 'raw'],
      aggKinds: sd.aggKinds || ['sum', 'count'],
      formats: sd.formats || ['money', 'percent'],
      scalars: (sd.scalars || []).map((s) => ({ name: s.key, group: s.deprecated ? 'Deprecated' : 'Totals', desc: s.label })),
      strings: (sd.strings || []).map((s) => ({ name: s.key, desc: s.label })),
    }
  }
  const kinds = (doc === 'invoice' ? INVOICE_KINDS : STATEMENT_KINDS).map((k) => ({ value: k, label: KIND_LABELS[k] || k }))
  return {
    ruleFields: ROW_RULE_FIELDS,
    ruleOps: ['eq', 'ne', 'in', 'notIn'],
    kinds,
    columnFields: ROW_COLUMN_FIELDS,
    signModes: ['effective', 'magnitude', 'raw'],
    aggKinds: ['sum', 'count'],
    formats: ['money', 'percent'],
    scalars: null, // null → scalars.js falls back to its bundled list
    strings: null,
  }
}

export function kindLabel(k, doc) {
  const d = dict(doc || activeDoc)
  return d.kinds.find((x) => x.value === k)?.label || KIND_LABELS[k] || k
}
