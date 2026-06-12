import React from 'react'
import { money, formatComputed } from '../engine/format.js'
import { signMul, aggregate } from '../engine/aggregate.js'
import { evalFormula } from '../engine/formula.js'
import { cellValue, labelFor } from '../engine/cells.js'
import { cellPct } from '../engine/width.js'
import { samePath } from '../state/tree.js'
import { meta } from '../engine/catalog.js'
import { styleOf, styleVal } from './style.js'

// NodePreview renders one node as an HTML approximation of the PDF block —
// system branches mirror the card_design_v2 painters (drawHeaderBandNew /
// drawMetricCards3 / drawTripsSection / drawDeductionsSection /
// drawAccountBalanceCards in pdf_service.go). Reads claimed rows / aggregate
// values / scalars from the precomputed model. The TRUE look is the PDF panel;
// this is the editing approximation.
export default function NodePreview({ node, path, model, doc, mock, selected, onSelect }) {
  const key = path.join('.')
  const isSel = samePath(selected, path)
  const sel = (e) => onSelect(path, e)

  const wrap = (cls, content) => (
    <div className={`node ${cls} ${isSel ? 'selected' : ''}`} onClick={sel}>
      {content}
    </div>
  )

  switch (node.type) {
    // ---- System / coarse: card_design_v2, rendered from mock data ----
    case 'header_band': {
      const co = mock?.company || {}, st = mock?.statement || {}
      const ids = co.ids || [co.usdot ? `USDOT ${co.usdot}` : '', co.mc ? `MC ${co.mc}` : ''].filter(Boolean).join(' · ')
      return wrap('coarse', (
        <div className="hdr2">
          <div className="h2-left">
            <div className="h2-name">{co.name || 'Carrier'}</div>
            {co.address && <div className="h2-sub">{co.address}</div>}
            {co.phone && <div className="h2-sub">{co.phone}</div>}
            {ids && <div className="h2-sub">{ids}</div>}
          </div>
          <div className="h2-right">
            <div className="h2-plabel">PAY PERIOD</div>
            <div className="h2-period">{st.periodStart} – {st.periodEnd}</div>
            <div className="h2-sub">Statement date {st.periodEnd}</div>
          </div>
        </div>
      ))
    }
    case 'driver_row': {
      const st = mock?.statement || {}
      const parts = [st.unitNumber ? `Unit #${st.unitNumber}` : '', st.driverClass || '', st.payBasis || ''].filter(Boolean)
      return wrap('coarse', (
        <div className="drv-row">
          <div className="drv-av">{initials(st.driverName)}</div>
          <div className="drv-main">
            <div className="drv-name">{st.driverName || 'Driver'}</div>
            <div className="h2-sub">{parts.join(' · ') || `Pay to ${st.driverName || '—'}`}</div>
          </div>
        </div>
      ))
    }
    case 'metric_row': {
      const s = model.scalars
      const dedCount = (mock?.rows || []).filter((r) => r.kind === 'deduction').length
      return wrap('coarse', (
        <div className="metric-strip">
          <MCard label="GROSS" value={money(s.grossTotal)} valCls="blue" sub={mock?.statement?.grossSub} />
          <MCard label="DEDUCTIONS" value={money(-Math.abs(s.deductionsTotal))} valCls="red" sub={`${dedCount} charges`} />
          <MCard label="NET PAY" value={money(s.netPay)} cls="netpay" valCls="green" sub="After deductions" />
        </div>
      ))
    }
    case 'trips_section':
      return wrap('coarse', <TripsSection mock={mock} />)
    case 'deductions_section': {
      const rows = model.assign[key] || []
      return wrap('coarse', <DeductionsSection rows={rows} />)
    }
    case 'account_balance_cards': {
      const s = model.scalars
      return wrap('coarse', (
        <div className="bal-strip">
          <BalCard label="Open Items" suffix="carried forward" value={money(s.openItems)} neg={s.openItems < 0} />
          <BalCard label="Balance owed" suffix="to carrier" value={money(Math.max(0, -(s.openItems + s.reimbursement)))} amber />
          <BalCard label="Escrow" suffix="refundable" value={money(s.escrowBalance)} amber />
        </div>
      ))
    }
    // Legacy aliases: render the NEW stacked sections (the Go engine does the same).
    case 'body_two_col': {
      const rows = model.assign[key] || []
      return wrap('coarse', (
        <div>
          <TripsSection mock={mock} />
          <DeductionsSection rows={rows.filter((r) => r.kind === 'deduction' || r.kind === 'balance_entry')} />
        </div>
      ))
    }
    case 'footer_cards': {
      const s = model.scalars
      return wrap('coarse', (
        <div>
          <div className="d2-title" style={{ marginBottom: 6 }}>Account balance</div>
          <div className="bal-strip">
            <BalCard label="Open Items" suffix="carried forward" value={money(s.openItems)} neg={s.openItems < 0} />
            <BalCard label="Balance owed" suffix="to carrier" value={money(Math.max(0, -(s.openItems + s.reimbursement)))} amber />
            <BalCard label="Escrow" suffix="refundable" value={money(s.escrowBalance)} amber />
          </div>
        </div>
      ))
    }
    case 'invoice_header': {
      const inv = mock?.invoice || {}, cust = mock?.customer || {}
      return wrap('coarse', (
        <div className="hdr2">
          <div className="h2-left"><div className="h2-name">INVOICE {inv.number}</div>{cust.name && <div className="h2-sub">Bill to: {cust.name}</div>}</div>
          <div className="h2-right"><div className="h2-plabel">TOTAL</div><div className="h2-period">{money(inv.total)}</div></div>
        </div>
      ))
    }
    case 'invoice_details':
    case 'invoice_meta':
    case 'invoice_stops':
      return wrap('coarse', (
        <div className="coarse-note"><b>{meta(node.type, doc).label}</b> <span className="muted small">{meta(node.type, doc).desc}</span></div>
      ))
    case 'invoice_charges': {
      const rows = model.assign[key] || []
      return wrap('coarse', (
        <div>
          <div className="list-title">Charges</div>
          <table className="cfg-table">
            <thead><tr><th>Type</th><th>Description</th><th className="r">Amount</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}><td>{r.typeCode}</td><td>{r.label}</td><td className="r">{money(r.total)}</td></tr>
            ))}</tbody>
          </table>
          <div className="list-total"><span>Total</span><span>{money(model.scalars.invoiceTotal)}</span></div>
        </div>
      ))
    }

    case 'section_title':
      return wrap('section-title', <h3 style={styleOf(node, { fontPx: 13 })}>{node.props?.title || 'Section'}</h3>)

    case 'divider':
      return wrap('divider', <hr style={node.style?.accentColor ? { borderTopColor: node.style.accentColor } : undefined} />)

    case 'text':
      return wrap('text', <p style={styleOf(node, { fontPx: 13 })}>{node.props?.text || ''}</p>)

    case 'field': {
      const p = node.props || {}
      const raw = model.strings?.[p.source] || ''
      const val = (p.label || '') + raw
      const cls = p.style === 'heading' ? 'fld-heading' : p.style === 'muted' ? 'fld-muted' : 'fld-normal'
      return wrap('field', (
        <div className={`fld ${cls}`} style={styleOf(node, { fontPx: p.style === 'heading' ? 14 : 13 })}>
          {val || <span className="muted small">({p.source || 'pick a source'})</span>}
        </div>
      ))
    }

    case 'list':
    case 'rows': {
      const rows = model.assign[key] || []
      const sm = node.props?.signMode || 'effective'
      const st = node.style || {}
      const rowStyle = styleOf(node, { fontPx: 13, skipAlign: true })
      return wrap('list', (
        <div style={st.padding ? { paddingLeft: st.padding * 2, paddingRight: st.padding * 2 } : undefined}>
          {node.props?.title && <div className="list-title" style={st.textColor ? { color: st.textColor } : undefined}>{node.props.title}</div>}
          {rows.length === 0 && <div className="muted small empty-rows">No rows match this rule</div>}
          {rows.map((r, i) => (
            <div className="list-row" key={i}>
              <div className="lr-main">
                <span className="lr-label" style={rowStyle}>{labelFor(r, node.labelOverride)}</span>
                {r.note && <span className="lr-note">{r.note}</span>}
              </div>
              <span className={`lr-amt ${amtClass(r, sm)}`}>{money(amtForRow(r, sm))}</span>
            </div>
          ))}
          {node.props?.showTotal !== false && rows.length > 0 && (
            <div className="list-total list-total-box" style={{
              ...(st.fillColor ? { background: st.fillColor } : {}),
              ...(st.accentColor ? { color: st.accentColor, borderColor: st.accentColor } : {}),
              ...(st.radius != null ? { borderRadius: st.radius * 2 } : {}),
            }}>
              <span>Total</span>
              <span>{money(aggregate({ agg: 'sum', signMode: sm }, rows))}</span>
            </div>
          )}
        </div>
      ))
    }

    case 'table': {
      const st = node.style || {}
      const cellStyle = { ...(st.textColor ? { color: st.textColor } : {}), ...(st.fontSize ? { fontSize: styleVal(st.fontSize) } : {}) }
      const headStyle = st.accentColor ? { color: st.accentColor } : undefined
      if (node.binding?.source === 'trips') {
        const trips = mock?.trips || []
        let totLoaded = 0, totEmpty = 0, totEarned = 0
        for (const t of trips) { totLoaded += Number(t.loaded || 0); totEmpty += Number(t.empty || 0); totEarned += Number(t.earned || 0) }
        return wrap('table', (
          <>
            {node.props?.title && <div className="list-title">{node.props.title}</div>}
            <table className="cfg-table trips-table">
              <thead><tr style={headStyle}><th>Load #</th><th>Route</th><th className="r">Loaded</th><th className="r">Empty</th><th className="r">Earned</th></tr></thead>
              <tbody>
                {trips.map((t, i) => (
                  <tr key={i} style={cellStyle}>
                    <td className="t2-load">{t.loadNumber}</td><td>{t.route}</td>
                    <td className="r">{milesFmt(t.loaded ?? t.miles)}</td>
                    <td className="r muted">{milesFmt(t.empty ?? 0)}</td>
                    <td className="r b">{money(t.earned)}</td>
                  </tr>
                ))}
                <tr className="t2-total">
                  <td>Total</td><td></td>
                  <td className="r">{milesFmt(totLoaded)}</td>
                  <td className="r">{milesFmt(totEmpty)}</td>
                  <td className="r">{money(totEarned)}</td>
                </tr>
              </tbody>
            </table>
          </>
        ))
      }
      const rows = model.assign[key] || []
      const cols = node.props?.columns || []
      const showTotal = node.props?.showTotal === true // Go table default = false (legacy saved tables)
      const total = rows.reduce((acc, r) => acc + (Number(r.total) || 0) * signMul(r), 0)
      return wrap('table', (
        <>
          {node.props?.title && <div className="list-title" style={st.textColor ? { color: st.textColor } : undefined}>{node.props.title}</div>}
          <table className="cfg-table">
            <thead><tr style={headStyle}>{cols.map((c, i) => <th key={i} className={c.align === 'R' ? 'r' : ''}>{c.header}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={cols.length || 1} className="muted">No rows match</td></tr>}
              {rows.map((r, i) => (
                <tr key={i} style={cellStyle}>{cols.map((c, j) => <td key={j} className={c.align === 'R' ? 'r' : ''}>{cellValue(r, c.field)}</td>)}</tr>
              ))}
              {showTotal && rows.length > 0 && (
                <tr className="t2-total" style={cellStyle}><td>Total</td>{cols.slice(1, -1).map((_, j) => <td key={j}></td>)}<td className="r">{money(total)}</td></tr>
              )}
            </tbody>
          </table>
        </>
      ))
    }

    case 'aggregate': {
      const v = model.aggVal[key] ?? 0
      return wrap('value-box', (
        <div className="vb" style={cardBoxStyle(node)}>
          <span className="vb-label">{node.aggregate?.label || 'Total'}</span>
          <span className="vb-value" style={cardValStyle(node)}>{money(v)}</span>
          <span className="vb-meta muted small">{node.aggregate?.agg} · {node.aggregate?.signMode || 'effective'}</span>
        </div>
      ))
    }

    case 'computed_value': {
      const c = node.computed || {}
      let v = model.scalars[c.id]
      let bad = false
      if (v == null) { try { v = evalFormula(c.expr || '', model.scalars, { lenient: true }) } catch { bad = true } }
      return wrap('value-box', (
        <div className="vb" style={cardBoxStyle(node)}>
          <span className="vb-label">{c.label || 'Computed'}</span>
          <span className="vb-value" style={cardValStyle(node)}>{bad ? '—' : formatComputed(v, c.format || 'money')}</span>
          <span className="vb-meta muted small mono">{c.expr}</span>
        </div>
      ))
    }

    case 'metric_card': {
      const p = node.props || {}
      const v = resolveSource(p.source, model.scalars)
      return wrap(`metric ${p.accent ? 'accent' : ''}`, (
        <div className="mc" style={cardBoxStyle(node)}>
          <span className="mc-label">{p.label || p.source}</span>
          <span className="mc-value" style={cardValStyle(node)}>{formatComputed(v, p.format || 'money')}</span>
          {p.sub && <span className="mc-sub">{p.sub}</span>}
        </div>
      ))
    }

    case 'row': {
      const gap = clamp(Number(node.props?.gap), 0, 12)
      return wrap('row', (
        <div className="lay-row" style={Number.isFinite(gap) ? { gap: gap * 2 } : undefined}>
          {(node.children || []).map((c, i) => (
            <div className="lay-cell" style={{ flex: `0 0 ${cellPct(node.children, i)}%` }} key={c.id || i}>
              <NodePreview node={c} path={[...path, i]} model={model} doc={doc} mock={mock} selected={selected} onSelect={onSelect} />
            </div>
          ))}
        </div>
      ))
    }

    case 'column':
      return wrap('column', (
        <div className="lay-col">
          {(node.children || []).map((c, i) => (
            <NodePreview key={c.id || i} node={c} path={[...path, i]} model={model} doc={doc} mock={mock} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      ))

    default: {
      // Unknown (likely newer-backend) type: neutral visible card — name + key
      // props + child recursion. The REAL look comes from the PDF preview.
      const m = meta(node.type, doc)
      const summary = node.props?.title || node.props?.label || node.props?.text || ''
      return wrap('unknown', (
        <div className="unknown-card">
          <div><b>{m.label}</b>{summary ? <span className="muted"> — {summary}</span> : null}</div>
          {(node.children || []).map((c, i) => (
            <NodePreview key={c.id || i} node={c} path={[...path, i]} model={model} doc={doc} mock={mock} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      ))
    }
  }
}

// ---- card_design_v2 system sub-components (shared by new + legacy types) ----

function TripsSection({ mock }) {
  const trips = mock?.trips || []
  const pill = mock?.statement?.tripsPill || ''
  let totMiles = 0, totLoaded = 0, totEmpty = 0, totEarned = 0
  for (const t of trips) {
    totMiles += Number(t.miles || 0)
    totLoaded += Number(t.loaded ?? t.miles ?? 0)
    totEmpty += Number(t.empty ?? 0)
    totEarned += Number(t.earned || 0)
  }
  return (
    <div className="trips2">
      <div className="d2-head">
        <span className="d2-title">Your trips this week{pill && <span className="pill2">{pill}</span>}</span>
        <span className="d2-hint">{trips.length} delivered · {milesFmt(totMiles)} mi driven</span>
      </div>
      <table className="cfg-table trips-table">
        <thead><tr><th>Load #</th><th>Route</th><th className="r">Loaded</th><th className="r">Empty</th><th className="r">Earned</th></tr></thead>
        <tbody>
          {trips.map((t, i) => (
            <tr key={i}>
              <td className="t2-load">{t.loadNumber}</td><td>{t.route}</td>
              <td className="r">{milesFmt(t.loaded ?? t.miles)}</td>
              <td className="r muted">{milesFmt(t.empty ?? 0)}</td>
              <td className="r b">{money(t.earned)}</td>
            </tr>
          ))}
          <tr className="t2-total">
            <td>Total</td><td></td>
            <td className="r">{milesFmt(totLoaded)}</td>
            <td className="r">{milesFmt(totEmpty)}</td>
            <td className="r">{money(totEarned)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function DeductionsSection({ rows }) {
  const total = rows.reduce((acc, r) => acc + (Number(r.total) || 0) * signMul(r), 0)
  return (
    <div className="ded2">
      <div className="d2-head">
        <span className="d2-title">Deductions</span>
        <span className="d2-hint">{rows.length} charges</span>
      </div>
      {rows.length === 0 && <div className="muted small">No deductions this period</div>}
      {rows.map((r, i) => (
        <div className="list-row" key={i}>
          <div className="lr-main"><span className="lr-label">{labelFor(r)}</span>{r.note && <span className="lr-note">{r.note}</span>}</div>
          <span className={`lr-amt ${r.total * signMul(r) < 0 ? 'neg' : 'pos'}`}>{money(r.total * signMul(r))}</span>
        </div>
      ))}
      <div className="d2-total">
        <span>Total deductions</span>
        <span className="neg">{money(total)}</span>
      </div>
    </div>
  )
}

function MCard({ label, value, sub, cls = '', valCls = '' }) {
  return (
    <div className={`mcard ${cls}`}>
      <span className="mc-label">{label}</span>
      <span className={`mc-value ${valCls}`}>{value}</span>
      {sub && <span className="mc-sub">{sub}</span>}
    </div>
  )
}

function BalCard({ label, suffix, value, amber, neg }) {
  return (
    <div className="bal-card">
      <span className="bc-left"><b>{label}</b> <span className="muted small">{suffix}</span></span>
      <span className={`bc-val ${amber ? 'amber' : ''} ${neg ? 'neg' : ''}`}>{value}</span>
    </div>
  )
}

// ---- helpers ----
function amtForRow(r, signMode) {
  const total = Number(r.total) || 0
  if (signMode === 'magnitude') return Math.abs(total)
  if (signMode === 'raw') return total
  return total * signMul(r)
}
function amtClass(r, signMode) {
  const v = amtForRow(r, signMode)
  return v < 0 ? 'neg' : v > 0 ? 'pos' : ''
}
function resolveSource(source, scalars) {
  if (!source) return 0
  if (Object.prototype.hasOwnProperty.call(scalars, source)) return scalars[source]
  try { return evalFormula(source, scalars, { lenient: true }) } catch { return 0 }
}
function cardBoxStyle(node) {
  const st = node.style || {}
  return {
    ...(st.fillColor ? { background: st.fillColor } : {}),
    ...(st.accentColor ? { borderColor: st.accentColor, borderWidth: 1, borderStyle: 'solid' } : {}),
    ...(st.radius != null ? { borderRadius: st.radius * 2 } : {}),
    ...(st.padding != null ? { padding: st.padding * 2 } : {}),
  }
}
function cardValStyle(node) {
  const st = node.style || {}
  return {
    ...(st.textColor ? { color: st.textColor } : {}),
    ...(st.fontSize ? { fontSize: styleVal(st.fontSize) } : {}),
  }
}
function milesFmt(v) {
  const n = Number(v) || 0
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return NaN
  return Math.min(hi, Math.max(lo, v))
}
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}
