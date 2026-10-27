// A fingerprint of the SOURCE a sweep or a release measured against, so that evidence taken on one source is never reused for
// another that happens to answer on the same URL.
//
// WHAT IT IS. A fingerprint of the served HOME page plus the template identity the dossier declares — not a hash of every asset
// of the source. It catches a rebuilt, replaced or edited source whose home page changes; it does not see a change that never
// reaches the home HTML. {algorithm, url, htmlSha256, template: {name, version}|null, id}.
//   · `htmlSha256` is the SHA-256 of the served HTML with line endings normalised and ONLY the volatile fields below removed.
//   · `template` is provenance.json `source.template` (name, version) when the dossier has it: a declared identity, not a package hash.
//   · `id` is the hash of the three, the one value two fingerprints are compared on.
//
// VOLATILE (the only parts removed; scripts, text, URLs and presentation attributes are never stripped):
//   1. the content of <meta name="csrf-token"> (a per-request token)
//   2. a hidden form input whose NAME is 32 hex characters (a per-session form token: its name changes per session)
//   3. the value of a `nonce` attribute (a per-request script/style nonce)
// all three only as attributes of tags: the body of a script or style element and the text of the page are never touched.
//
// A page that cannot be read (status, type, size, timeout) is an error, never a fingerprint.
//   node scripts/lib/source-fingerprint.mjs --url <home url> [--template-name <n> --template-version <v>]   → JSON on stdout, exit 0; {error} on stderr, exit 1
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'parse5'

export const FINGERPRINT_ALGORITHM = 'tracy-source-fingerprint/v1'
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024
export const SOURCE_TIMEOUT_MS = 30000

const sha = (s) => createHash('sha256').update(s).digest('hex')
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)

/** The value span (without quotes) of an attribute, from its source text. */
function valueSpan(text, loc) {
  const raw = text.slice(loc.startOffset, loc.endOffset)
  const m = /^[^\s=/>]+\s*=\s*(["']?)/.exec(raw)
  if (!m) return null
  const start = loc.startOffset + m[0].length
  return { start, end: m[1] ? loc.startOffset + raw.lastIndexOf(m[1]) : loc.endOffset }
}

/**
 * The served HTML with line endings normalised and the declared volatile values replaced. The page is parsed by an HTML5 parser (parse5) as a browser with
 * scripting ON reads it — so the inside of <noscript>, <script>, <style>, <textarea>, <title>, <plaintext> and comments is text, never markup — and only
 * these attribute VALUES of the elements it really built are replaced, at the exact source span the parser reports: the `content` of
 * `<meta name="csrf-token">`, the `name` of a hidden `<input>` whose name is 32 hex characters, and any `nonce`. Every other byte is kept as served.
 */
export function normaliseHtml(html) {
  const text = String(html).replace(/\r\n?/g, '\n')
  const doc = parse(text, { sourceCodeLocationInfo: true, scriptingEnabled: true })
  const edits = []
  const attr = (node, name) => node.attrs.find((a) => a.name === name)
  const replace = (node, name, value) => {
    const loc = node.sourceCodeLocation?.attrs?.[name]
    const span = loc ? valueSpan(text, loc) : null
    if (span) edits.push([span.start, span.end, value])
  }
  const walk = (node) => {
    if (node.tagName) {
      if (attr(node, 'nonce')) replace(node, 'nonce', '')
      if (node.tagName === 'meta' && attr(node, 'name')?.value.toLowerCase() === 'csrf-token' && attr(node, 'content')) replace(node, 'content', '')
      if (node.tagName === 'input' && attr(node, 'type')?.value.toLowerCase() === 'hidden' && /^[0-9a-f]{32}$/i.test(attr(node, 'name')?.value ?? '')) replace(node, 'name', '[token]')
    }
    for (const child of node.childNodes ?? []) walk(child)
    if (node.content) walk(node.content)
  }
  walk(doc)
  let out = ''
  let at = 0
  for (const [from, to, value] of edits.sort((a, b) => a[0] - b[0])) {
    out += text.slice(at, from) + value
    at = to
  }
  return out + text.slice(at)
}

/** The template identity a spec-pack's provenance.json declares, or null. */
export function templateOf(specDir) {
  if (!specDir) return null
  const file = path.join(specDir, 'provenance.json')
  if (!existsSync(file)) return null
  try {
    const t = JSON.parse(readFileSync(file, 'utf8'))?.source?.template
    if (!isObj(t) || typeof t.name !== 'string' || !t.name.trim()) return null
    return { name: t.name, version: typeof t.version === 'string' && t.version.trim() ? t.version : null }
  } catch {
    return null
  }
}

/** The fingerprint of an already-read home page. */
export function fingerprintOf({ url, html, template = null }) {
  const htmlSha256 = sha(normaliseHtml(html))
  const tpl = template ? { name: template.name, version: template.version ?? null } : null
  return { algorithm: FINGERPRINT_ALGORITHM, url, htmlSha256, template: tpl, id: idOf(url, htmlSha256, tpl) }
}
const idOf = (url, htmlSha256, tpl) => sha(JSON.stringify([FINGERPRINT_ALGORITHM, url, htmlSha256, tpl]))

/** Why `f` is not a source fingerprint of this algorithm: a list of messages, empty when it is one. */
export function validateFingerprint(f) {
  if (!isObj(f)) return ['the source fingerprint is not an object']
  const out = []
  if (f.algorithm !== FINGERPRINT_ALGORITHM) out.push(`algorithm is ${JSON.stringify(f.algorithm ?? null)}, not ${FINGERPRINT_ALGORITHM}`)
  try {
    if (!/^https?:$/.test(new URL(f.url).protocol)) throw new Error('scheme')
  } catch {
    out.push('url is not an http(s) URL')
  }
  if (!/^[0-9a-f]{64}$/.test(f.htmlSha256 ?? '')) out.push('htmlSha256 is not a hex sha256')
  if (f.template !== null && !(isObj(f.template) && typeof f.template.name === 'string' && f.template.name && (f.template.version === null || typeof f.template.version === 'string'))) out.push('template is neither null nor {name, version}')
  if (!out.length && f.id !== idOf(f.url, f.htmlSha256, f.template)) out.push('id does not follow from the other fields')
  return out
}

/** Why two fingerprints are not the same source, or null. `a` is the evidence, `b` the source now. */
export function differsFrom(a, b) {
  const bad = [...validateFingerprint(a).map((m) => `evidence: ${m}`), ...validateFingerprint(b).map((m) => `current: ${m}`)]
  if (bad.length) return bad.join('; ')
  if (a.id === b.id) return null
  const parts = []
  if (a.url !== b.url) parts.push(`the home URL (${a.url} → ${b.url})`)
  if (a.htmlSha256 !== b.htmlSha256) parts.push('the served home page')
  if (JSON.stringify(a.template) !== JSON.stringify(b.template)) parts.push('the declared template identity')
  return `the source differs in ${parts.join(', ')}`
}

/**
 * Read the home page and fingerprint it. `fetchImpl` is injectable. → {ok: true, fingerprint} | {ok: false, error}. Never throws.
 * @param {{url: string, template?: object|null, fetchImpl?: typeof fetch, timeoutMs?: number, maxBytes?: number}} o
 */
export async function readSourceFingerprint({ url, template = null, fetchImpl = fetch, timeoutMs = SOURCE_TIMEOUT_MS, maxBytes = MAX_SOURCE_BYTES }) {
  try {
    const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'tracy-source-fingerprint', accept: 'text/html' } })
    if (res.status !== 200) return { ok: false, error: `${url} answered ${res.status}, not 200` }
    const type = String(res.headers.get('content-type') ?? '')
    if (!/\b(text\/html|application\/xhtml\+xml)\b/i.test(type)) return { ok: false, error: `${url} answered ${type || 'no content type'}, not HTML` }
    const chunks = []
    let size = 0
    for await (const chunk of res.body) {
      size += chunk.length
      if (size > maxBytes) {
        res.body.cancel?.().catch?.(() => {})
        return { ok: false, error: `${url} is larger than ${maxBytes} bytes` }
      }
      chunks.push(Buffer.from(chunk))
    }
    const html = Buffer.concat(chunks).toString('utf8')
    if (!html.trim()) return { ok: false, error: `${url} answered an empty page` }
    return { ok: true, fingerprint: fingerprintOf({ url, html, template }) }
  } catch (e) {
    return { ok: false, error: `${url} could not be read: ${String(e?.message ?? e).split('\n')[0]}` }
  }
}

/** The home URL the fingerprint is taken on: the dossier contract's source site when it is on the sweep's origin, else the sweep's own origin. */
export function homeUrlOf({ source, contract = null }) {
  let origin
  try {
    origin = new URL(source).origin
  } catch {
    return null
  }
  const declared = contract?.source?.site
  try {
    const u = new URL(declared)
    if (/^https?:$/.test(u.protocol) && u.origin === origin) return u.href
  } catch {
    // fall through to the origin
  }
  return `${origin}/`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2)
  const opt = (n) => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined)
  const url = opt('--url')
  if (!url) {
    console.error('usage: source-fingerprint.mjs --url <home url> [--template-name <n> --template-version <v>]')
    process.exit(2)
  }
  const template = opt('--template-name') ? { name: opt('--template-name'), version: opt('--template-version') ?? null } : null
  const r = await readSourceFingerprint({ url, template })
  if (!r.ok) {
    console.error(JSON.stringify({ error: r.error }))
    process.exit(1)
  }
  console.log(JSON.stringify(r.fingerprint))
}
