// Page hygiene: what a customer must never see on a page built from a quickstart, found in the
// same crawl as content coverage. Three kinds:
//   language-constant  a raw Joomla language key (TPL_FOLLOW_US) in a text or a read attribute;
//   php-error          PHP "Deprecated / Warning / Notice / Fatal error ... in file.php on line N"
//                      anywhere in the HTML as served, hidden or not;
//   placeholder        an unfilled token ({contact.tel}, ((span)), %sitename%) or a field word left
//                      in upper case inside sentence case copy ("your first TITLE workout!").
// PURE: html + the page's items in, findings out. The patterns live in ../hygiene-rules.json.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { decodeEntities } from './normalize.mjs'

/** The detector rules this audit uses. */
export const HYGIENE_RULES = Object.freeze(
  JSON.parse(readFileSync(fileURLToPath(new URL('../hygiene-rules.json', import.meta.url)), 'utf8'))
)

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 3)}...` : s)
/** Items a visitor or a screen reader meets as words: block text, read attributes, head text. */
const WORDY = new Set(['text', 'attr', 'meta'])
const whereOf = (it) => (it.kind === 'text' ? 'text' : `${it.kind}:${it.attr ?? ''}`)

/** A raw language key: PREFIX_PART(_PART)* with a known prefix, or three parts or more, or a bare J-word. */
function constantsIn(value, rules) {
  const prefixes = new Set(rules.constantPrefixes)
  const bare = new Set(rules.bareConstants ?? [])
  const out = []
  for (const m of String(value).matchAll(
    /(?<![A-Za-z0-9_-])[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*(?![A-Za-z0-9_-])/g
  )) {
    const token = m[0]
    const parts = token.split('_')
    if (
      parts.length === 1
        ? bare.has(token)
        : prefixes.has(parts[0]) || parts.length >= rules.minConstantSegments
    )
      out.push(token)
  }
  return out
}

/** Share of lower-case letters among all letters. */
function lowercaseShare(value) {
  const letters = String(value).match(/\p{L}/gu) ?? []
  if (!letters.length) return 0
  return letters.filter((c) => c !== c.toUpperCase()).length / letters.length
}

/** The first unfilled token or placeholder word in a text, or null. */
function placeholderIn(value, rules) {
  const v = String(value)
  for (const source of rules.tokenPatterns ?? []) {
    const m = new RegExp(source).exec(v)
    if (m) return m[0]
  }
  const word = (w) => new RegExp(`(?<![A-Za-z0-9_])${esc(w)}(?![A-Za-z0-9_])`).exec(v)?.[0] ?? null
  for (const w of rules.markerWords ?? []) if (word(w)) return w
  const trimmed = v.trim()
  for (const w of rules.placeholderWords ?? []) {
    if (trimmed === w) return w
    if (word(w) && lowercaseShare(v) >= rules.minLowercaseShare) return w
  }
  return null
}

/** PHP's own error lines in the HTML as served: tags stripped, so the html_errors form reads like the text one. */
function phpErrorsIn(html, rules) {
  const flat = decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' ')).replace(/[ \t\r\f\v]+/g, ' ')
  const levels = rules.phpLevels.map(esc).join('|')
  const re = new RegExp(
    `(?<![A-Za-z])(${levels})\\s*:\\s+([^\\n]{1,400}?)\\s+in\\s+(\\S+?\\.php)\\s+on\\s+line\\s+(\\d+)`,
    'g'
  )
  const out = []
  for (const m of flat.matchAll(re)) {
    const file = m[3]
    // The site's own path, from the first Joomla folder on: the same on every machine.
    const at = rules.phpPathAnchors
      .map((a) => file.indexOf(`/${a}`))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0]
    const rel = at === undefined ? file.split('/').pop() : file.slice(at + 1)
    out.push({ value: `${m[1]}: ${m[2].trim()} (${rel}:${m[4]})`, evidence: cut(m[0].trim(), 300) })
  }
  return out
}

/**
 * @param {{ html?: string | null, items: any[], rules?: any }} input
 *   `items`: the page's items (merged over viewports, or as the extractor returned them)
 * @returns {{ kind: 'language-constant' | 'php-error' | 'placeholder', value: string, where: string, visible: boolean, evidence: string, token?: string }[]}
 */
export function findHygiene({ html = null, items, rules = HYGIENE_RULES }) {
  const found = []
  const seen = new Set()
  const push = (f) => {
    const k = `${f.kind}|${f.value}|${f.where}`
    if (seen.has(k)) return
    seen.add(k)
    found.push(f)
  }
  for (const it of items ?? []) {
    if (!WORDY.has(it.kind) || typeof it.value !== 'string') continue
    const visible = it.visibleAnywhere ?? it.visible ?? true
    if (!visible && rules.includeHidden === false) continue
    const where = whereOf(it)
    const evidence = cut(String(it.selector ?? ''), 160)
    for (const token of constantsIn(it.value, rules))
      push({ kind: 'language-constant', value: token, where, visible, evidence })
    const token = placeholderIn(it.value, rules)
    if (token) push({ kind: 'placeholder', value: cut(it.value, 200), where, visible, evidence, token })
  }
  for (const e of phpErrorsIn(html, rules))
    push({ kind: 'php-error', value: cut(e.value, 300), where: 'html', visible: false, evidence: e.evidence })
  return found
}
