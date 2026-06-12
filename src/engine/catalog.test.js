import { describe, it, expect, afterEach } from 'vitest'
import {
  initCatalog, meta, paletteFor, explodeNode, dict, catalogSource, setActiveDoc, CATALOG,
} from './catalog.js'

// A minimal server pdfNodeCatalog payload (the wire contract, catalogVersion 1).
const SERVER = {
  catalogVersion: 1,
  engineVersion: 'card_v2-test',
  document: 'statement',
  capabilities: ['preview_pdf', 'explode', 'card_design_v2', 'style'],
  placeholderId: '$id',
  groups: [
    { key: 'Data', label: 'Data', order: 1 },
    { key: 'System', label: 'System', order: 5 },
  ],
  types: {
    page: { type: 'page', label: 'Page', group: 'System', system: true, palette: false, accepts: { children: true } },
    list: {
      type: 'list', label: 'List (routed rows)', group: 'Data', palette: true,
      accepts: { rule: true, props: true, style: true },
      props: [{ key: 'title', kind: 'text', label: 'Title' }],
      style: [{ key: 'textColor', kind: 'color', label: 'Label color' }],
      default: { id: '$id', type: 'list', props: { title: 'Deductions' }, rule: { any: [{ field: 'kind', op: 'in', value: ['deduction'] }] } },
    },
    trips_section: {
      type: 'trips_section', label: 'Trips Section', group: 'System', system: true, palette: true, explodable: true,
      accepts: {},
      default: { id: '$id', type: 'trips_section' },
      explode: [
        { id: '$id', type: 'section_title', props: { title: 'Your trips this week' } },
        { id: '$id', type: 'table', binding: { source: 'trips' }, props: { title: '' } },
      ],
    },
    // A type this frontend build has never heard of — must still be usable.
    fancy_block: {
      type: 'fancy_block', label: 'Fancy Block', group: 'Data', palette: true,
      accepts: { props: true },
      props: [{ key: 'mood', kind: 'enum', label: 'Mood', options: [{ value: 'calm' }, { value: 'loud' }] }],
      default: { id: '$id', type: 'fancy_block', props: { mood: 'calm' } },
    },
  },
  dict: {
    ruleFields: ['kind', 'typeCode'],
    ruleOps: ['eq', 'in'],
    kinds: [{ value: 'other_pay', label: 'Other pay' }, { value: 'deduction', label: 'Deduction' }],
    columnFields: ['label', 'total'],
    signModes: ['effective'],
    aggKinds: ['sum'],
    formats: ['money'],
    scalars: [{ key: 'netPay', label: 'Net pay' }, { key: 'balanceTotal', label: 'Deprecated', deprecated: true }],
    strings: [{ key: 'companyName', label: 'Company name' }],
  },
}

afterEach(() => { initCatalog('statement', null); setActiveDoc('statement') })

describe('server catalog adapter', () => {
  it('hydrates and reports source', () => {
    expect(catalogSource('statement')).toBe('bundled')
    expect(initCatalog('statement', SERVER)).toBe(true)
    expect(catalogSource('statement')).toBe('server')
  })

  it('refuses a higher catalogVersion (falls back to bundled)', () => {
    expect(initCatalog('statement', { ...SERVER, catalogVersion: 2 })).toBe(false)
    expect(catalogSource('statement')).toBe('bundled')
  })

  it('meta() adapts server entries: schemas, style, factory with fresh ids', () => {
    initCatalog('statement', SERVER)
    const m = meta('list', 'statement')
    expect(m.label).toBe('List (routed rows)')
    expect(m.props[0].key).toBe('title')
    expect(m.styleSchema[0].key).toBe('textColor')
    const a = m.make('statement')
    const b = m.make('statement')
    expect(a.id).toBeTruthy()
    expect(a.id).not.toBe('$id')
    expect(a.id).not.toBe(b.id)
    expect(a.rule.any[0].value).toEqual(['deduction'])
  })

  it('unknown-to-this-build server types are fully usable (puzzle-assembler)', () => {
    initCatalog('statement', SERVER)
    const m = meta('fancy_block', 'statement')
    expect(m.label).toBe('Fancy Block')
    expect(m.props[0].options).toEqual(['calm', 'loud']) // PropOption -> plain strings
    const n = m.make('statement')
    expect(n.type).toBe('fancy_block')
    expect(n.props.mood).toBe('calm')
  })

  it('paletteFor uses server groups/order and hides page + deprecated', () => {
    initCatalog('statement', SERVER)
    const groups = paletteFor('statement')
    expect(groups.map((g) => g.group)).toEqual(['Data', 'System'])
    const types = groups.flatMap((g) => g.items.map((i) => i.type))
    expect(types).toContain('fancy_block')
    expect(types).not.toContain('page')
  })

  it('explodeNode prefers the server recipe with fresh ids', () => {
    initCatalog('statement', SERVER)
    const out = explodeNode({ type: 'trips_section' }, 'statement')
    expect(out.map((n) => n.type)).toEqual(['section_title', 'table'])
    expect(out[0].id).not.toBe('$id')
    expect(out[1].binding.source).toBe('trips')
  })

  it('dict() normalizes server dictionaries; bundled fallback keeps live kinds only', () => {
    initCatalog('statement', SERVER)
    const d = dict('statement')
    expect(d.kinds.map((k) => k.value)).toEqual(['other_pay', 'deduction'])
    expect(d.scalars[0].name).toBe('netPay')
    expect(d.strings[0].name).toBe('companyName')
    initCatalog('statement', null)
    const fb = dict('statement')
    expect(fb.kinds.map((k) => k.value)).toEqual(['other_pay', 'deduction'])
    expect(fb.scalars).toBe(null)
  })

  it('bundled catalog ships the card_design_v2 system set', () => {
    for (const t of ['trips_section', 'deductions_section', 'account_balance_cards']) {
      expect(CATALOG[t]).toBeTruthy()
      expect(CATALOG[t].system).toBe(true)
    }
    expect(CATALOG.body_two_col.deprecated).toBe(true)
    expect(CATALOG.footer_cards.palette).toBe(false)
  })
})
