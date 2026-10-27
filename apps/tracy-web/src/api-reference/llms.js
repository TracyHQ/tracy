/**
 * `llms.txt` FOR THE PUBLIC API REFERENCE — the same document `/docs/api` draws, as plain text a
 * language model reads in one pass (https://llmstxt.org: `# Title`, `> summary`, `## Section`s of
 * `- [name](url): notes` lines).
 *
 * Built from the OpenAPI document, never written by hand, so it lists exactly the operations the
 * public page lists: one line per operation (`METHOD path — summary`) grouped by tag in the order
 * the reference shows them, then the actions of the Apply door, then where the full reference lives.
 */

const METHODS = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options', 'trace']

/** One line of prose: markdown emphasis and code marks kept, newlines folded. */
const line = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()

/** The first paragraph of the document's introduction — the `>` summary. */
function summaryOf(description) {
  const first = String(description ?? '')
    .split(/\n\s*\n/)
    .find((p) => p.trim() && !p.trim().startsWith('#'))
  return line(first)
}

/**
 * @param {object} doc an OpenAPI 3.1 document from `buildOpenApi` (the public one)
 * @returns {string} llms.txt
 */
export function buildLlmsTxt(doc) {
  const origin = String(doc.servers?.[0]?.url ?? '').replace(/\/+$/, '')
  const operations = []
  for (const [path, item] of Object.entries(doc.paths ?? {}))
    for (const method of METHODS) {
      const op = item?.[method]
      if (op) operations.push({ method: method.toUpperCase(), path, op })
    }
  const tagOrder = (doc.tags ?? []).map((tag) => tag.name)
  for (const { op } of operations)
    for (const tag of op.tags?.length ? op.tags : ['Other']) if (!tagOrder.includes(tag)) tagOrder.push(tag)

  const out = [`# ${doc.info?.title ?? 'API'}`, '', `> ${summaryOf(doc.info?.description)}`, '']
  out.push(
    `API version: ${doc.info?.version ?? 'unknown'}. Every call is JSON over HTTPS; authentication is named on each operation of the full reference.`,
    ''
  )
  for (const tag of tagOrder) {
    const inTag = operations.filter(({ op }) => (op.tags?.length ? op.tags[0] : 'Other') === tag)
    if (inTag.length === 0) continue
    const about = (doc.tags ?? []).find((t) => t.name === tag)?.description
    out.push(`## ${tag}`, '')
    if (about) out.push(line(about), '')
    for (const { method, path, op } of inTag)
      out.push(`- ${method} ${path} — ${line(op.summary) || `${method} ${path}`}`)
    out.push('')
  }

  const apply = doc.paths?.['/api/sites/{key}/apply']?.post
  const variants = apply?.requestBody?.content?.['application/json']?.schema?.oneOf ?? []
  if (variants.length > 0) {
    out.push(
      '## Apply actions',
      '',
      'Sent as `{ "action": "…", "params": { … } }` to `POST /api/sites/{key}/apply`.',
      ''
    )
    for (const variant of variants) {
      const action = variant?.properties?.action?.const ?? variant?.title
      const first = String(variant?.description ?? '').split(/\n\s*\n/)[0]
      out.push(`- ${action}${first ? ` — ${line(first)}` : ''}`)
    }
    out.push('')
  }

  out.push(
    '## Reference',
    '',
    `- [API reference](${origin}/docs/api): every operation, its parameters, answers and refusals, with a try-it panel`,
    `- [OpenAPI document](${origin}/docs/api/openapi.json): the machine-readable OpenAPI 3.1 description this file is generated from`,
    ''
  )
  return out.join('\n')
}
