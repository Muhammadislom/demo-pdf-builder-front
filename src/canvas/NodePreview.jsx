import React from 'react'
import { money, formatComputed } from '../engine/format.js'
import { signMul, aggregate } from '../engine/aggregate.js'
import { evalFormula } from '../engine/formula.js'
import { cellValue, labelFor } from '../engine/cells.js'
import { cellPct } from '../engine/width.js'
import { samePath } from '../state/tree.js'
import { meta } from '../engine/catalog.js'

// NodePreview renders one node as an HTML approximation of the PDF block.
// Reads claimed rows / aggregate values / scalars from the precomputed model.
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
    // ---- System / coarse: rendered from mock data, like the real PDF ----
    case 'header_band': {
      const co = mock?.company || {}, st = mock?.statement || {}
      return wrap('coarse', (
        <div className="hdr-band">
          <div className="hb-left">
            <div className="hb-logo">{initials(co.name)}</div>
            <div>
              <div className="hb-name">{co.name || 'Carrier'}</div>
              {co.address && <div className="hb-sub">{co.address}</div>}
              {(co.usdot || co.mc) && <div className="hb-sub">{co.usdot ? `USDOT ${co.usdot}` : ''}{co.mc ? `${co.usdot ? ' · ' : ''}MC ${co.mc}` : ''}</div>}
            </div>
          </div>
          <div className="hb-right">
            <div className="hb-plabel">PAY PERIOD</div>
            <div className="hb-period">{st.periodStart} – {st.periodEnd}</div>
            {st.number && <div className="hb-sub">Statement {st.number}</div>}
          </div>
        </div>
      ))
    }
    case 'driver_row': {
      const st = mock?.statement || {}
      return wrap('coarse', (
        <div className="drv-row">
          <div className="drv-av">{initials(st.driverName)}</div>
          <div className="drv-main">
            <div className="drv-name">{st.driverName || 'Driver'}</div>
            <div className="hb-sub">{st.unitNumber ? `Unit #${st.unitNumber} · ` : ''}Pay to {st.driverName || '—'}</div>
          </div>
          <span className="pill">Driver</span>
        </div>
      ))
    }
    case 'metric_row': {
      const s = model.scalars
      return wrap('coarse', (
        <div className="metric-strip">
          <MiniCard label="GROSS" value={money(s.grossTotal)} cls="blue" />
          <MiniCard label="DEDUCTIONS" value={money(s.deductionsTotal)} cls="red" />
          <MiniCard label="EARNINGS" value={money(s.netPay)} cls="green" />
          <MiniCard label="ESCROW" value={money(s.escrowBalance)} />
        </div>
      ))
    }
    case 'body_two_col': {
      const rows = model.assign[key] || []
      const trips = mock?.trips || []
      return wrap('coarse', (
        <div className="body2">
          <div className="b2-col">
            <div className="list-title">Trips</div>
            <table className="cfg-table">
              <thead><tr><th>Load</th><th>Route</th><th className="r">Earned</th></tr></thead>
              <tbody>{trips.map((t, i) => (
                <tr key={i}><td>{t.loadNumber}</td><td className="b2-route">{t.route}</td><td className="r">{money(t.earned)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="b2-col">
            <div className="list-title">Deductions &amp; balances</div>
            {rows.length === 0 && <div className="muted small">none</div>}
            {rows.map((r, i) => (
              <div className="list-row" key={i}>
                <div className="lr-main"><span className="lr-label">{labelFor(r)}</span>{r.note && <span className="lr-note">{r.note}</span>}</div>
                <span className={`lr-amt ${r.total * signMul(r) < 0 ? 'neg' : 'pos'}`}>{money(r.total * signMul(r))}</span>
              </div>
            ))}
          </div>
        </div>
      ))
    }
    case 'footer_cards': {
      const s = model.scalars
      return wrap('coarse', (
        <div className="footer-strip">
          <MiniCard label="OPEN ITEMS" value={money(s.openItems)} />
          <MiniCard label="REIMBURSEMENT" value={money(s.reimbursement)} />
          <MiniCard label="NET PAY" value={money(s.netPay)} cls="green" />
        </div>
      ))
    }
    case 'invoice_header': {
      const inv = mock?.invoice || {}, cust = mock?.customer || {}
      return wrap('coarse', (
        <div className="hdr-band">
          <div className="hb-left"><div><div className="hb-name">INVOICE {inv.number}</div>{cust.name && <div className="hb-sub">Bill to: {cust.name}</div>}</div></div>
          <div className="hb-right"><div className="hb-plabel">TOTAL</div><div className="hb-period">{money(inv.total)}</div></div>
        </div>
      ))
    }
    case 'invoice_details':
    case 'invoice_meta':
    case 'invoice_stops':
      return wrap('coarse', (
        <div className="coarse-note"><b>{meta(node.type).label}</b> <span className="muted small">{meta(node.type).desc}</span></div>
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
      return wrap('section-title', <h3>{node.props?.title || 'Section'}</h3>)

    case 'divider':
      return wrap('divider', <hr />)

    case 'text':
      return wrap('text', <p>{node.props?.text || ''}</p>)

    case 'field': {
      const p = node.props || {}
      const raw = model.strings?.[p.source] || ''
      const val = (p.label || '') + raw
      const cls = p.style === 'heading' ? 'fld-heading' : p.style === 'muted' ? 'fld-muted' : 'fld-normal'
      return wrap('field', (
        <div className={`fld ${cls}`}>{val || <span className="muted small">({p.source || 'pick a source'})</span>}</div>
      ))
    }

    case 'list':
    case 'rows': {
      const rows = model.assign[key] || []
      const sm = node.props?.signMode || 'effective'
      return wrap('list', (
        <>
          {node.props?.title && <div className="list-title">{node.props.title}</div>}
          {rows.length === 0 && <div className="muted small empty-rows">No rows match this rule</div>}
          {rows.map((r, i) => (
            <div className="list-row" key={i}>
              <div className="lr-main">
                <span className="lr-label">{labelFor(r, node.labelOverride)}</span>
                {r.note && <span className="lr-note">{r.note}</span>}
              </div>
              <span className={`lr-amt ${amtClass(r, sm)}`}>{money(amtForRow(r, sm))}</span>
            </div>
          ))}
          {node.props?.showTotal && rows.length > 0 && (
            <div className="list-total">
              <span>Total</span>
              <span>{money(aggregate({ agg: 'sum', signMode: sm }, rows))}</span>
            </div>
          )}
        </>
      ))
    }

    case 'table': {
      if (node.binding?.source === 'trips') {
        const trips = mock?.trips || []
        return wrap('table', (
          <>
            {node.props?.title && <div className="list-title">{node.props.title}</div>}
            <table className="cfg-table">
              <thead><tr><th>Load</th><th>Route</th><th className="r">Miles</th><th className="r">Earned</th></tr></thead>
              <tbody>
                {trips.map((t, i) => (
                  <tr key={i}>
                    <td>{t.loadNumber}</td><td>{t.route}</td>
                    <td className="r">{Number(t.miles || 0).toLocaleString()}</td>
                    <td className="r">{money(t.earned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ))
      }
      const rows = model.assign[key] || []
      const cols = node.props?.columns || []
      return wrap('table', (
        <>
          {node.props?.title && <div className="list-title">{node.props.title}</div>}
          <table className="cfg-table">
            <thead><tr>{cols.map((c, i) => <th key={i} className={c.align === 'R' ? 'r' : ''}>{c.header}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={cols.length || 1} className="muted">No rows match</td></tr>}
              {rows.map((r, i) => (
                <tr key={i}>{cols.map((c, j) => <td key={j} className={c.align === 'R' ? 'r' : ''}>{cellValue(r, c.field)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </>
      ))
    }

    case 'aggregate': {
      const v = model.aggVal[key] ?? 0
      return wrap('value-box', (
        <div className="vb">
          <span className="vb-label">{node.aggregate?.label || 'Total'}</span>
          <span className="vb-value">{money(v)}</span>
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
        <div className="vb">
          <span className="vb-label">{c.label || 'Computed'}</span>
          <span className="vb-value">{bad ? '—' : formatComputed(v, c.format || 'money')}</span>
          <span className="vb-meta muted small mono">{c.expr}</span>
        </div>
      ))
    }

    case 'metric_card': {
      const p = node.props || {}
      const v = resolveSource(p.source, model.scalars)
      return wrap(`metric ${p.accent ? 'accent' : ''}`, (
        <div className="mc">
          <span className="mc-label">{p.label || p.source}</span>
          <span className="mc-value">{formatComputed(v, p.format || 'money')}</span>
          {p.sub && <span className="mc-sub">{p.sub}</span>}
        </div>
      ))
    }

    case 'row':
      return wrap('row', (
        <div className="lay-row">
          {(node.children || []).map((c, i) => (
            <div className="lay-cell" style={{ flex: `0 0 ${cellPct(node.children, i)}%` }} key={c.id || i}>
              <NodePreview node={c} path={[...path, i]} model={model} doc={doc} mock={mock} selected={selected} onSelect={onSelect} />
            </div>
          ))}
        </div>
      ))

    case 'column':
      return wrap('column', (
        <div className="lay-col">
          {(node.children || []).map((c, i) => (
            <NodePreview key={c.id || i} node={c} path={[...path, i]} model={model} doc={doc} mock={mock} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      ))

    default:
      return wrap('unknown', <div className="muted">Unknown block: {node.type}</div>)
  }
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
function MiniCard({ label, value, cls = '' }) {
  return (
    <div className={`mini-card ${cls}`}>
      <span className="mc-label">{label}</span>
      <span className="mc-value">{value}</span>
    </div>
  )
}
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}
