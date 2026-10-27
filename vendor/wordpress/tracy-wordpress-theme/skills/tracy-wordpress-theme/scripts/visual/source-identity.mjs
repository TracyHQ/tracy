// Identity of a source document for the preflight lock.
//
// A Joomla page carries a per-session CSRF token in every load: a hidden `<input>` of every form (the
// token is the input's NAME) and the `csrf.token` key of the `joomla-script-options` JSON block. Two
// loads of one page then differ in a few bytes and no single hash stands for "the bytes the source
// serves". The policy `joomla-csrf-v1` replaces the token in exactly those two forms — nothing else —
// with a placeholder before hashing, and only when every occurrence carries one and the same token.
// The raw digest is kept beside it: capture and `--verify` apply the same policy, and a change to
// anything else (text, styles, scripts, URLs, a token-like string elsewhere) still changes the identity.
import { createHash } from 'node:crypto'
import { JSDOM } from 'jsdom'

export const CSRF_POLICY = 'joomla-csrf-v1'
const PLACEHOLDER = '{{joomla-csrf-token}}'
const HEX32 = /^[0-9a-f]{32}$/
const sha = (x) => `sha256:${createHash('sha256').update(x).digest('hex')}`

/** `{ type, name, value }` of a tag whose attributes are exactly type/name/value in double quotes; else null. */
function strictAttrs(text, allowed) {
  const out = {}
  const re = /\s*([a-zA-Z-]+)="([^"]*)"/y
  let pos = 0
  for (;;) {
    re.lastIndex = pos
    const m = re.exec(text)
    if (!m) break
    const k = m[1].toLowerCase()
    if (!allowed.includes(k) || k in out) return null
    out[k] = m[2]
    pos = re.lastIndex
  }
  return /^\s*\/?\s*$/.test(text.slice(pos)) ? out : null
}

// The markup is parsed by the HTML parser (jsdom, with source locations), so what is a form field is
// decided by the same rules a browser uses: an input-shaped string in a comment, a raw-text element,
// `<plaintext>` or a `<template>` (however nested) is never an element of the page tree. Only a hidden
// `<input>` whose form owner is a `<form>` outside `<noscript>`, and the body of a
// `<script class="joomla-script-options">`, are candidates; each is then held to its exact source form
// and replaced at the offsets the parser reports.
const inNoscript = (el) => Boolean(el.closest('noscript'))

function maskScriptOptions(attrsText, body) {
  const a = strictAttrs(attrsText, ['type', 'class'])
  if (!a || a.type !== 'application/json' || !/(?:^|\s)joomla-script-options(?:\s|$)/.test(a.class ?? '')) return null
  let json
  try {
    json = JSON.parse(body)
  } catch {
    return null
  }
  const token = json !== null && typeof json === 'object' ? json['csrf.token'] : null
  if (typeof token !== 'string' || !HEX32.test(token)) return null
  const masked = body.replace(new RegExp(`("csrf\\.token"\\s*:\\s*")${token}(")`), `$1${PLACEHOLDER}$2`)
  if (masked === body) return null
  return { token, masked }
}

/** Text with the supported CSRF token forms replaced, and the tokens found: `{ text, tokens }`. */
export function maskCsrf(html) {
  const dom = new JSDOM(html, { includeNodeLocations: true })
  const edits = [] // { start, end, replacement }, source offsets
  const tokens = []
  for (const input of dom.window.document.querySelectorAll('form input')) {
    if (inNoscript(input) || !input.closest('form') || input.form !== input.closest('form')) continue
    const loc = dom.nodeLocation(input)
    const tag = loc?.startTag
    if (!tag) continue
    const open = html.slice(tag.startOffset, tag.endOffset)
    const m = /^<input\b([^]*?)>$/i.exec(open)
    const a = m && strictAttrs(m[1], ['type', 'name', 'value'])
    if (!a || String(a.type).toLowerCase() !== 'hidden' || !HEX32.test(a.name ?? '') || a.value !== '1') continue
    const at = open.indexOf(`name="${a.name}"`)
    if (at < 0) continue
    const start = tag.startOffset + at
    edits.push({ start, end: start + `name="${a.name}"`.length, replacement: `name="${PLACEHOLDER}"` })
    tokens.push(a.name)
  }
  for (const script of dom.window.document.querySelectorAll('script.joomla-script-options')) {
    if (inNoscript(script)) continue
    const loc = dom.nodeLocation(script)
    if (!loc?.startTag || !loc.endTag) continue
    const open = html.slice(loc.startTag.startOffset, loc.startTag.endOffset)
    const m = /^<script\b([^]*?)>$/i.exec(open)
    if (!m) continue
    const body = html.slice(loc.startTag.endOffset, loc.endTag.startOffset)
    const r = maskScriptOptions(m[1], body)
    if (!r) continue
    edits.push({ start: loc.startTag.endOffset, end: loc.endTag.startOffset, replacement: r.masked })
    tokens.push(r.token)
  }
  edits.sort((x, y) => y.start - x.start)
  let text = html
  for (const e of edits) text = text.slice(0, e.start) + e.replacement + text.slice(e.end)
  return { text, tokens }
}

/**
 * The identity of a response body: `{ policy, sha256, normalized, fields }`. `policy` is `raw` (the
 * body's own digest) unless the body is HTML in which every supported CSRF form carries one token.
 * @param {Buffer} buf
 * @param {{ html?: boolean }} [opts]  the caller says whether the resource is a document
 */
export function sourceIdentity(buf, { html = true } = {}) {
  const raw = { policy: 'raw', sha256: sha(buf), normalized: false, fields: 0 }
  if (!html) return raw
  const text = buf.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(buf)) return raw
  const { text: masked, tokens } = maskCsrf(text)
  if (!tokens.length || new Set(tokens).size !== 1) return raw
  return { policy: CSRF_POLICY, sha256: sha(masked), normalized: true, fields: tokens.length }
}

export const sameIdentity = (a, b) => Boolean(a && b && a.policy === b.policy && a.sha256 === b.sha256)

/**
 * Font-CSS services that answer with different CSS per user agent and per load (Google Fonts serves a
 * `unicode-range` split for one browser and a single face for another). Their stylesheets are recorded
 * in the lock but not compared: what they load is sealed as the font FILES (`fonts.files`), which are
 * stable. A stylesheet of any other third party stays compared.
 */
export const VOLATILE_STYLESHEET_HOSTS = Object.freeze(['fonts.googleapis.com', 'fonts.googleapis.cn', 'fonts.bunny.net', 'use.typekit.net'])
export function volatileStylesheet(url) {
  try {
    return VOLATILE_STYLESHEET_HOSTS.includes(new URL(url).hostname)
  } catch {
    return false
  }
}
