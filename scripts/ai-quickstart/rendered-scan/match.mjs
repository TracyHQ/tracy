// The matching rules of the demo scan (ticket #585): which observations of a rendered page are demo words or demo
// pictures of a corpus (`corpus.mjs`). An excerpt is always the template's own words (the corpus side), never the
// page's, so a customer's sentence that shares a few words with the demo is never copied into a report. Pure.
import { textKey } from '../../../apps/tracy-web/src/site-check/demo-baseline.js'
import { fileKey, isSentence, normalise, phoneKey, segmentsOf, shinglesOf } from './normalise.mjs'

/** The longest excerpt kept: a finding points at the demo words, it does not copy a passage. */
export const EXCERPT = 60
/** Shared shingles that make a partial overlap: two (six words in a row), or the whole of a five-word sentence. */
export const OVERLAP_SHINGLES = 2
const TEXT_KINDS = new Set(['text', 'block', 'attr', 'title', 'meta', 'jsonld'])
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
const PHONE = /\+?\d[\d\s().-]{5,}\d/g
const bare = (s) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const unescaped = (text) => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

export const excerptOf = (text) => {
  const chars = [...String(text ?? '')]
  return chars.length > EXCERPT ? `${chars.slice(0, EXCERPT - 3).join('')}...` : chars.join('')
}

/** One regular expression for every high signal phrase, matched whole (no letter or digit on either side). */
function phraseMatcher(corpus) {
  if (corpus.phraseRe !== undefined) return corpus.phraseRe
  const names = [...corpus.phrases.keys()].sort((a, b) => b.length - a.length)
  corpus.phraseRe = names.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escaped).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
    : null
  return corpus.phraseRe
}

/** The high signal strings a text holds: a demo company name, address, email or phone number. */
function signalsIn(value, corpus) {
  const out = []
  // A name inside an email address or a link is that address, matched on its own below.
  const n = normalise(
    String(value)
      .replace(EMAIL, ' ')
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, ' ')
  )
  const re = phraseMatcher(corpus)
  if (re) for (const m of n.matchAll(re)) out.push(corpus.phrases.get(m[0]) ?? m[0])
  for (const m of String(value).matchAll(EMAIL)) if (corpus.emails.has(m[0].toLowerCase())) out.push(m[0])
  for (const m of String(value).matchAll(PHONE)) {
    const demo = corpus.phones.get(phoneKey(m[0]))
    if (demo) out.push(demo)
  }
  return out
}

/** The demo words one text observation holds: `[{rule, excerpt}]`. */
export function demoWordsIn(value, corpus) {
  const hits = []
  const seen = new Set()
  const hit = (rule, excerpt) => {
    if (seen.has(excerpt)) return
    seen.add(excerpt)
    hits.push({ rule, excerpt })
  }
  const n = bare(normalise(value))
  if (!n || corpus.interface.has(n)) return hits
  const signals = signalsIn(value, corpus)
  // A whole block the untouched site showed, by the host's own hash; a short one only when it names a signal.
  const squashed = String(value).replace(/\s+/g, ' ').trim().slice(0, 500)
  if (corpus.blockKeys.has(textKey(squashed)) && (isSentence(n) || signals.length))
    hit('baseline_block', squashed)
  const matched = new Set()
  for (const seg of segmentsOf(value)) {
    if (corpus.interface.has(seg)) continue
    if (corpus.segments.has(seg)) {
      matched.add(seg)
      hit('sentence', corpus.segments.get(seg))
    }
  }
  // A demo sentence kept inside longer words: shared shingles with one corpus sentence.
  const shared = new Map()
  for (const sh of new Set(shinglesOf(normalise(value))))
    for (const seg of corpus.shingles.get(sh) ?? [])
      if (!matched.has(seg)) shared.set(seg, (shared.get(seg) ?? 0) + 1)
  for (const [seg, count] of shared)
    if (count >= Math.min(OVERLAP_SHINGLES, corpus.shingleCount.get(seg) ?? OVERLAP_SHINGLES))
      hit('overlap', corpus.segments.get(seg))
  for (const s of signals) hit('signal', s)
  return hits
}

/** The demo picture an address shows: the corpus file it is (under any base path), or null. */
export function demoPictureOf(address, corpus, sha = null) {
  if (typeof sha === 'string' && corpus.pictures.shas.has(sha.toLowerCase())) return fileKey(address) ?? sha
  const key = fileKey(address)
  if (!key) return null
  const parts = key.split('/')
  for (let i = 0; i < parts.length; i++) {
    const tail = parts.slice(i).join('/')
    if (corpus.design.has(tail)) return null
    if (corpus.pictures.files.has(tail)) return tail
  }
  return null
}

/**
 * The findings of one page's observations: `{kind, page, place, excerpt}`, one per demo excerpt and place.
 * `shaOf(address)`, when given, answers the sha256 of a picture the corpus does not know by its path.
 */
export async function findingsOf(page, observations, corpus, shaOf = null) {
  const out = []
  const seen = new Set()
  const push = (kind, place, excerpt) => {
    const key = `${kind}\u0000${place?.element ?? ''}\u0000${excerpt}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ kind, page, place, excerpt: excerptOf(excerpt) })
  }
  for (const o of observations) {
    if (typeof o?.value !== 'string') continue
    if (TEXT_KINDS.has(o.kind))
      for (const h of demoWordsIn(o.value, corpus)) push('demo_text', o.place, h.excerpt)
    else if (o.kind === 'href' && /^(?:mailto|tel):/i.test(o.value))
      for (const s of signalsIn(unescaped(o.value.replace(/^[a-z]+:/i, '')), corpus))
        push('demo_text', o.place, s)
    else if (o.kind === 'image') {
      let file = demoPictureOf(o.value, corpus, o.sha256 ?? null)
      if (!file && shaOf && corpus.pictures.shas.size)
        file = demoPictureOf(o.value, corpus, await shaOf(o.value))
      if (file) push('demo_image', o.place, file)
    }
  }
  return out
}
