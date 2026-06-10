// rule.js — mirror of internal/service/pdfengine/rule.go
//
// A row's matchable fields (RowVM): kind, typeCode, typeId, sourceKind,
// classification, sign. Operators: eq, ne, in, notIn. Combinators all/any nest.
// A nil/empty rule matches everything (catch-all).

export const RULE_FIELDS = ['kind', 'typeCode', 'typeId', 'sourceKind', 'classification', 'sign']
export const RULE_OPS = ['in', 'notIn', 'eq', 'ne']

// rowField pulls the comparable string value for a field from a row object.
function rowField(row, field) {
  const v = row?.[field]
  return v == null ? '' : String(v)
}

// asArray normalizes ValueSet (scalar-or-array) to a string[].
function asArray(value) {
  if (value == null) return []
  return Array.isArray(value) ? value.map(String) : [String(value)]
}

// matchRule evaluates a rule against one row. Empty rule -> true (catch-all).
export function matchRule(rule, row) {
  if (!rule) return true
  if (rule.all && rule.all.length) return rule.all.every((r) => matchRule(r, row))
  if (rule.any && rule.any.length) return rule.any.some((r) => matchRule(r, row))
  if (!rule.field) return true // empty leaf == catch-all

  const lhs = rowField(row, rule.field)
  const set = asArray(rule.value)
  switch (rule.op) {
    case 'eq':
      return lhs === (set[0] ?? '')
    case 'ne':
      return lhs !== (set[0] ?? '')
    case 'in':
      return set.includes(lhs)
    case 'notIn':
      return !set.includes(lhs)
    default:
      return false
  }
}

// claim applies first-match-wins: returns the unclaimed rows that match `rule`
// and marks them claimed in the shared `claimed` Set (by index).
export function claim(rule, rows, claimed) {
  const out = []
  rows.forEach((row, i) => {
    if (claimed.has(i)) return
    if (matchRule(rule, row)) {
      claimed.add(i)
      out.push(row)
    }
  })
  return out
}

// peek returns matching rows WITHOUT claiming (used by aggregate nodes).
export function peek(rule, rows) {
  return rows.filter((row) => matchRule(rule, row))
}

// matchWithClaimState returns { matched, claimedAway } for the inspector's live
// row-match preview: rows this rule matches, split by whether an earlier node in
// the tree already claimed them.
export function matchWithClaimState(rule, rows, alreadyClaimed) {
  const matched = []
  const claimedAway = []
  rows.forEach((row, i) => {
    if (!matchRule(rule, row)) return
    if (alreadyClaimed.has(i)) claimedAway.push(row)
    else matched.push(row)
  })
  return { matched, claimedAway }
}
