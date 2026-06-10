// api.js — thin GraphQL client for the backend-accounting pdf_layout surface.
// Endpoint + JWT come from the header bar (persisted in localStorage).

// normalizeEndpoint tolerates a host pasted without a scheme (otherwise the
// browser treats it as a path relative to the builder origin → 404).
export function normalizeEndpoint(endpoint) {
  const e = (endpoint || '').trim()
  if (!e) return e
  return /^https?:\/\//i.test(e) ? e : `https://${e}`
}

export async function gql(endpoint, jwt, query, variables) {
  const res = await fetch(normalizeEndpoint(endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  })
  let json
  try {
    json = await res.json()
  } catch {
    throw new Error(`HTTP ${res.status}: non-JSON response`)
  }
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return json.data
}

const Q_LOAD = `
query($doc: PdfDocKind!, $v: String) {
  pdfLayout(document: $doc, variant: $v) { document variant isCustom source tree theme page }
  pdfLayoutMockData(document: $doc)
}`

// Real-PDF preview: renders the (unsaved) tree through the actual fpdf engine
// over the same synthetic fixture, returning base64. Requires the backend to
// expose pdfLayoutPreviewPdf (newer deploys).
const Q_PREVIEW = `
query($doc: PdfDocKind!, $tree: JSON!) {
  pdfLayoutPreviewPdf(document: $doc, tree: $tree)
}`

const Q_LAYOUTS = `query($doc: PdfDocKind!) { pdfLayouts(document: $doc) { id document variant version updatedAt } }`

const M_SAVE = `
mutation($in: SavePdfLayoutInput!) {
  savePdfLayout(input: $in) { id document variant version }
}`

const M_RESET = `mutation($doc: PdfDocKind!, $v: String) { resetPdfLayout(document: $doc, variant: $v) }`

export async function loadLayout(endpoint, jwt, doc, variant) {
  return gql(endpoint, jwt, Q_LOAD, { doc, v: variant || null })
}
export async function listLayouts(endpoint, jwt, doc) {
  const d = await gql(endpoint, jwt, Q_LAYOUTS, { doc })
  return d.pdfLayouts || []
}
export async function saveLayout(endpoint, jwt, input) {
  const d = await gql(endpoint, jwt, M_SAVE, { in: input })
  return d.savePdfLayout
}
export async function resetLayout(endpoint, jwt, doc, variant) {
  const d = await gql(endpoint, jwt, M_RESET, { doc, v: variant || null })
  return d.resetPdfLayout
}
export async function previewPdf(endpoint, jwt, doc, tree) {
  const d = await gql(endpoint, jwt, Q_PREVIEW, { doc, tree })
  return d.pdfLayoutPreviewPdf // base64 string
}
