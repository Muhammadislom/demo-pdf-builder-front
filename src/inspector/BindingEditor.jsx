import React from 'react'

// BindingEditor picks a table's data source. Default = routed rows (the rule +
// columns below apply). "Trips table" binds to the trip list — the engine then
// renders the fixed Load/Route/Miles/Earned table (drawTripsTable) and the
// rule/columns are ignored. Mirrors renderFineNodeAt's binding.source === 'trips'.
export default function BindingEditor({ node, onChange }) {
  const isTrips = node.binding?.source === 'trips'
  const set = (mode) => {
    if (mode === 'trips') onChange({ ...node, binding: { source: 'trips' } })
    else { const { binding, ...rest } = node; onChange(rest) }
  }
  return (
    <div className="binding-editor">
      <label className="field">
        <span>Data source</span>
        <select value={isTrips ? 'trips' : 'rows'} onChange={(e) => set(e.target.value)}>
          <option value="rows">Routed rows (rule + columns)</option>
          <option value="trips">Trips table (fixed Load / Route / Miles / Earned)</option>
        </select>
      </label>
      {isTrips && <div className="muted small">Trips mode renders the built-in trips table — the rule and columns below are ignored.</div>}
    </div>
  )
}
