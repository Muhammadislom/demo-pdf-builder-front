// formula.js — mirror of internal/service/pdfengine/formula.go
//
// Whitelisted arithmetic over named scalars: + - * /, parens, unary +/-,
// and functions abs / min / max / round(x[,dp]). Identifiers must resolve to a
// known function or a scalar in `vars`.
//
// Two modes:
//   lenient (live preview): unknown var -> 0, division by zero -> 0, but a
//                           *syntax* error still throws (so the UI flags it red).
//   strict  (mirrors save-time ValidateExpr): unknown var / div-by-zero throw.

const FUNCS = new Set(['abs', 'min', 'max', 'round'])

export function functionNames() {
  return [...FUNCS]
}

// identifiers returns the variable names referenced by an expression (function
// names excluded). Used to highlight which scalars a formula depends on.
export function identifiers(expr) {
  const out = new Set()
  for (const m of String(expr || '').matchAll(/[A-Za-z_][A-Za-z0-9_.]*/g)) {
    if (!FUNCS.has(m[0])) out.add(m[0])
  }
  return [...out]
}

export function evalFormula(expr, vars, opts = {}) {
  const lenient = opts.lenient !== false // default lenient
  const toks = tokenize(String(expr ?? ''))
  const p = { toks, i: 0, vars, lenient }
  if (p.toks.length === 0) throw new Error('empty expression')
  const v = parseExpr(p)
  if (p.i !== p.toks.length) throw new Error(`unexpected token "${p.toks[p.i]?.v}"`)
  return v
}

// ---- tokenizer ----
function tokenize(s) {
  const toks = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue }
    if ('+-*/(),'.includes(c)) { toks.push({ t: c }); i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i + 1
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      toks.push({ t: 'num', v: parseFloat(s.slice(i, j)) })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1
      while (j < s.length && /[A-Za-z0-9_.]/.test(s[j])) j++
      toks.push({ t: 'id', v: s.slice(i, j) })
      i = j
      continue
    }
    throw new Error(`bad character "${c}"`)
  }
  return toks
}

// ---- recursive descent ----
function peek(p) { return p.toks[p.i] }
function next(p) { return p.toks[p.i++] }

function parseExpr(p) {
  let v = parseTerm(p)
  while (peek(p) && (peek(p).t === '+' || peek(p).t === '-')) {
    const op = next(p).t
    const rhs = parseTerm(p)
    v = op === '+' ? v + rhs : v - rhs
  }
  return v
}

function parseTerm(p) {
  let v = parseFactor(p)
  while (peek(p) && (peek(p).t === '*' || peek(p).t === '/')) {
    const op = next(p).t
    const rhs = parseFactor(p)
    if (op === '*') v *= rhs
    else {
      if (rhs === 0) {
        if (p.lenient) { v = 0; continue }
        throw new Error('division by zero')
      }
      v /= rhs
    }
  }
  return v
}

function parseFactor(p) {
  const t = peek(p)
  if (t && (t.t === '+' || t.t === '-')) {
    next(p)
    const v = parseFactor(p)
    return t.t === '-' ? -v : v
  }
  return parsePrimary(p)
}

function parsePrimary(p) {
  const t = next(p)
  if (!t) throw new Error('unexpected end of expression')
  if (t.t === 'num') return t.v
  if (t.t === '(') {
    const v = parseExpr(p)
    if (!peek(p) || peek(p).t !== ')') throw new Error('missing )')
    next(p)
    return v
  }
  if (t.t === 'id') {
    // function call?
    if (peek(p) && peek(p).t === '(') {
      next(p) // (
      const args = []
      if (peek(p) && peek(p).t !== ')') {
        args.push(parseExpr(p))
        while (peek(p) && peek(p).t === ',') { next(p); args.push(parseExpr(p)) }
      }
      if (!peek(p) || peek(p).t !== ')') throw new Error('missing ) in call')
      next(p)
      return applyFunc(t.v, args)
    }
    // scalar lookup
    if (Object.prototype.hasOwnProperty.call(p.vars, t.v)) return Number(p.vars[t.v]) || 0
    if (p.lenient) return 0
    throw new Error(`unknown identifier "${t.v}"`)
  }
  throw new Error(`unexpected token "${t.t}"`)
}

function applyFunc(name, args) {
  switch (name) {
    case 'abs':
      if (args.length !== 1) throw new Error('abs expects 1 arg')
      return Math.abs(args[0])
    case 'min':
      if (args.length < 1) throw new Error('min expects >=1 arg')
      return Math.min(...args)
    case 'max':
      if (args.length < 1) throw new Error('max expects >=1 arg')
      return Math.max(...args)
    case 'round': {
      if (args.length < 1 || args.length > 2) throw new Error('round expects 1 or 2 args')
      const dp = args.length === 2 ? args[1] : 0
      const f = Math.pow(10, dp)
      return Math.round(args[0] * f) / f
    }
    default:
      throw new Error(`unknown function "${name}"`)
  }
}

// resolveComputed walks computed_value nodes (in tree order) and folds their
// results into the scalars map under their `id`, so later formulas/cards can
// reference them. Mirrors ResolveComputed (best-effort for live preview).
export function resolveComputed(computedNodes, scalars) {
  const out = { ...scalars }
  for (const n of computedNodes) {
    const c = n.computed
    if (!c?.id || !c?.expr) continue
    try {
      out[c.id] = evalFormula(c.expr, out, { lenient: true })
    } catch {
      out[c.id] = 0
    }
  }
  return out
}
