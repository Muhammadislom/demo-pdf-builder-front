# PDF Layout Builder

Visual block-tree builder for **backend-accounting** configurable PDFs (Statement + Invoice).
It exposes the full power of the Go render engine (`internal/service/pdfengine`) through
discoverable, picker-driven controls with **live preview** — no raw JSON, no manual text guessing.

This supersedes the old single-file demo (`../pdf-builder-demo/`), which stays as a rollback.

## Run

```bash
npm install
npm run dev          # → http://localhost:5173
```

Then in the header bar:
1. **Endpoint** — your backend GraphQL URL (default `http://localhost:8080/query`).
2. **JWT** — a Bearer token with perms `settings.pdf_layouts.view` / `settings.pdf_layouts.edit`.
3. Pick **document** (statement / invoice) and optional **variant**, press **Load**.

> The backend must allow this dev origin via `HTTP_ALLOWED_ORIGINS` (CORS). Endpoint + JWT
> persist in `localStorage`. To render a saved template into a real PDF, set
> `PDF_LAYOUT_ENGINE=true` on the backend (the feature is additive / off by default).

## What it does

- **Palette** (grouped + searchable): Data / Computed / Layout / Text / System blocks valid for the doc.
- **Canvas**: live PDF approximation. Drag the ⠿ grip to reorder; click to select.
- **Inspector** (the flexibility, made visible):
  - **Content rule** — route `other_pay` / `deduction` / driver-balance rows by type, kind, or an
    advanced field/op/value rule, with a **live "which rows land here"** preview (respects
    first-match-wins from earlier blocks).
  - **Formula** — clickable scalar chips + function menu (`abs/min/max/round`, `+ − × ÷`) and a
    **live evaluated result**. Display-only; canonical money (netPay / Invoice.Total) is never overridden.
  - **Aggregate** — sum / count × effective / magnitude / raw, with a live total.
  - **Table columns** — operator-defined header / field / format / align / width.
  - **Width** — grid slider (½ / ⅓ / ⅔ …) for blocks inside a Row.
  - **Metric card** — scalar/formula source picker with a live value.
- **Undo / redo**, save (`savePdfLayout`) and reset-to-default (`resetPdfLayout`).

## Architecture

```
src/
  engine/      JS MIRROR of pdfengine (the shared-spec — must match Go 1:1)
    rule.js        matchRule + first-match-wins claim/peek
    aggregate.js   sum/count × effective/magnitude/raw
    formula.js     whitelist AST (+ − * /, abs/min/max/round) + resolveComputed
    scalars.js     stmtScalars / invoice scalars + row-pool extraction
    catalog.js     node catalog — drives palette + inspector
    renderModel.js pure claiming pass (+ claimedBefore for live previews)
    format.js      money/percent/number (mirrors fpdf formatters)
  state/       reducer store with undo/redo + tree utils
  graphql/     pdfLayout / pdfLayoutMockData / savePdfLayout / resetPdfLayout
  palette/ canvas/ inspector/   UI
```

### Parity

`engine/*` is a direct port of the Go engine. `npm test` runs vitest assertions that mirror
`fine_node_render_test.go` (e.g. `grossTotal - deductionsTotal = 5764.31`, aggregate sign modes,
first-match-wins). Keep both in sync when the Go engine changes.

```bash
npm test
```

## Limits (v1)

- Reorder via drag (not free canvas-drop); width via slider (no pixel resize) — by design.
- Only catalog node types; no free-pixel canvas (would diverge from the backend).
- Preview ≈ PDF (same tokens/fields, not pixel-exact). For exact output, generate against the
  backend with `PDF_LAYOUT_ENGINE=true`.
- "Balances across **all** accounting types" surfaces the scalars the engine exposes today
  (escrow / open-items / reimbursement + per-kind totals). Exposing every ledger code as a scalar
  is an optional backend extension (plan §19 Phase B).
