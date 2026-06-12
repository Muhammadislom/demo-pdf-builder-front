// renderModel.js — pure pre-pass over the tree that resolves everything the
// preview needs, in document order, BEFORE React renders. This is where
// first-match-wins claiming happens (mutating during React render would be
// non-deterministic), and it also surfaces orphan rows for the warning.

import { claim, peek } from './rule.js'
import { aggregate } from './aggregate.js'
import { buildVars, rowsFromMock, buildStrings } from './scalars.js'
import { resolveComputed } from './formula.js'
import { collectComputed } from '../state/tree.js'

// Coarse system blocks that consume the full row breakdown (like the real
// engine's body / charges block). metric_row / footer_cards read scalars, not
// the row-pool, so they are NOT claimers.
const COARSE_CLAIMERS = new Set(['body_two_col', 'invoice_charges'])
// card_design_v2: the full-width deductions section claims DEDUCTION rows only
// (mirrors drawDeductionsSection rendering d.Deductions); other_pay rows that
// no custom block claims correctly surface as orphans — the real PDF does not
// render them either.
const DEDUCTIONS_RULE = { any: [{ field: 'kind', op: 'in', value: ['deduction', 'balance_entry'] }] }

function isRowList(node) {
  if (node.type === 'list' || node.type === 'rows') return true
  if (node.type === 'table' && node.binding?.source !== 'trips') return true
  return false
}

// claimFor applies ONE claiming policy for both the canvas model and the
// RuleBuilder live preview — the two surfaces must never disagree about which
// rows an earlier block consumed. Returns the claimed rows or null (node does
// not claim).
function claimFor(node, rows, claimed) {
  if (COARSE_CLAIMERS.has(node.type)) return claim(null, rows, claimed)
  if (node.type === 'deductions_section') return claim(DEDUCTIONS_RULE, rows, claimed)
  if (isRowList(node)) return claim(node.rule, rows, claimed)
  return null
}

export function buildRenderModel(root, mock, doc) {
  const rows = rowsFromMock(mock, doc)
  const baseVars = buildVars(mock, doc)
  const scalars = resolveComputed(collectComputed(root), baseVars)
  const strings = buildStrings(mock, doc)
  const claimed = new Set()
  const assign = {} // pathKey -> rows[]
  const aggVal = {} // pathKey -> number
  let hasRowPool = false
  let hasCoarseClaimer = false

  const visit = (node, path) => {
    const key = path.join('.')
    const taken = claimFor(node, rows, claimed)
    if (taken !== null) {
      if (isRowList(node)) hasRowPool = true
      else hasCoarseClaimer = true
      assign[key] = taken
    } else if (node.type === 'aggregate') {
      aggVal[key] = aggregate(node.aggregate, peek(node.rule, rows))
    }
    ;(node.children || []).forEach((c, i) => visit(c, [...path, i]))
  }
  ;(root.children || []).forEach((c, i) => visit(c, [i]))

  const orphans = rows.filter((_, i) => !claimed.has(i))
  return { rows, scalars, strings, assign, aggVal, hasRowPool, hasCoarseClaimer, orphans }
}

function pathEq(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// claimedBefore returns { rows, claimed } where `claimed` is the set of row
// indices already taken by row-list blocks that appear BEFORE `target` in
// document (pre-order) order. Used by the inspector's live row-match preview so
// the operator sees what's left for the selected block under first-match-wins.
export function claimedBefore(root, target, mock, doc) {
  const rows = rowsFromMock(mock, doc)
  const claimed = new Set()
  let stop = false
  const visit = (node, path) => {
    if (stop) return
    if (pathEq(path, target)) { stop = true; return }
    claimFor(node, rows, claimed) // SAME policy as buildRenderModel.visit
    ;(node.children || []).forEach((c, i) => { if (!stop) visit(c, [...path, i]) })
  }
  ;(root.children || []).forEach((c, i) => { if (!stop) visit(c, [i]) })
  return { rows, claimed }
}
