// W04 and W05 (ADR 0042): every checkable detail in the copy comes from the brief.
import { allTexts } from './copy-view.js'
import { escapeRegExp } from '../../lib/site-copy/text-tools.js'
import { ownerPostExcerptFor } from '../../lib/site-copy/owner-post-excerpts.js'

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s"'<>)]+/gi
const PHONE = /\+?\d[\d\s().-]{5,}\d/g
const TIME = /\b\d{1,2}[:.]\d{2}\s?(?:am|pm)?(?!\d)|\b\d{1,2}\s?(?:am|pm)\b/gi
const NUMBER = /\d[\d.,]*/g
const COUNT_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty'
]
// Consume a whole number phrase so "two" inside "twenty-two" or "two hundred" never backs 2.
const NUMBER_WORD = [
  ...COUNT_WORDS,
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
  'thousand',
  'million',
  'billion',
  'trillion',
  'half',
  'quarter'
].join('|')
const COUNT_PHRASE = new RegExp(
  `(?<![\\p{L}\\p{N}_@/.-])(?:${NUMBER_WORD})(?:[\\s-]+(?:${NUMBER_WORD}|and|a|point))*` +
    `(?![\\p{L}\\p{N}_@/-]|[.,][\\p{L}\\p{N}])`,
  'giu'
)

const tidy = (s) => s.replace(/[.,;:!?)]+$/, '')
const squash = (s) =>
  s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(?<=\d),(?=\d{3})/g, '')
const digits = (s) => s.replace(/\D/g, '')

// Every detail the copy states that a fact must back: { kind, token }. Emails and links come out first so their
// digits are not read again as numbers; phones before times and plain numbers for the same reason.
export function detailsOf(text) {
  const out = []
  let rest = String(text)
  const take = (re, kind, keep = () => true) => {
    rest = rest.replace(re, (m) => {
      const token = tidy(m.trim())
      if (keep(token)) out.push({ kind, token })
      return keep(token) ? ' ' : m
    })
  }
  take(EMAIL, 'email')
  take(URL_RE, 'link')
  take(PHONE, 'phone', (t) => digits(t).length >= 7)
  take(TIME, 'time')
  take(NUMBER, 'number')
  return out
}

function backed({ kind, token }, factsText) {
  if (kind === 'phone') return digits(factsText).includes(digits(token))
  const t = squash(token)
  const re = new RegExp(`(?<![\\p{L}\\p{N}.,@/])${escapeRegExp(t)}(?![\\p{N}@]|[.,]\\p{N})`, 'u')
  if (re.test(squash(factsText))) return true
  if (kind !== 'number' || !/^(?:0|[1-9]\d*)$/.test(token)) return false
  const word = COUNT_WORDS[Number(token)]
  if (!word) return false
  // This changes only support for plain digit counts. Addresses, phones, times and decimals keep
  // their existing exact checks, and a word inside a URL or email cannot supply a count.
  const prose = factsText.replace(EMAIL, ' ').replace(URL_RE, ' ')
  return [...prose.matchAll(COUNT_PHRASE)].some((match) => match[0].toLowerCase() === word)
}

export function checkW04({ R, view, idx, brief }) {
  const everything = [...idx.facts.values()].join(' \n ')
  const seen = new Set()
  for (const s of view.slots) {
    if (s.owner !== 'writer' || seen.has(s.slot)) continue
    seen.add(s.slot)
    const ids = [...new Set([...s.factIds, ...(idx.expected.get(s.slot)?.factIds ?? [])])]
    let bad = false
    const excerpt = ownerPostExcerptFor(s, idx, brief)
    if (excerpt && !excerpt.valid) {
      bad = true
      R.w04.fail(s.slot, `${s.slot}: ${excerpt.detail}`, 'invented-post')
    }
    for (const id of s.factIds)
      if (!idx.facts.has(id)) {
        bad = true
        R.w04.fail(s.slot, `${s.slot}: cites unknown fact ${id}`, 'unknown-fact')
      }
    const factsText = ids.map((id) => idx.facts.get(id) ?? '').join(' \n ')
    for (const d of s.items.flatMap(detailsOf))
      if (!backed(d, factsText)) {
        bad = true
        R.w04.fail(
          s.slot,
          `${s.slot}: ${d.kind} "${d.token}" is not in the facts this slot cites (${ids.join(', ') || 'none'})`,
          'invented'
        )
      }
    if (!bad) R.w04.ok()
  }
  // Alt text and page titles and descriptions cite no fact: their details must exist in some fact of the brief.
  for (const t of allTexts(view).filter((x) =>
    ['alt', 'seo-title', 'seo-description', 'page-title', 'page-body'].includes(x.kind)
  )) {
    let bad = false
    for (const d of detailsOf(t.text))
      if (!backed(d, everything)) {
        bad = true
        R.w04.fail(t.where, `${t.where}: ${d.kind} "${d.token}" is in no fact of the brief`, 'invented')
      }
    if (!bad) R.w04.ok()
  }
}

const QUOTE = /"([^"]+)"|“([^”]+)”|«([^»]+)»/g
const plain = (s) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?…]+|[\s.,;:!?…]+$/g, '')

export function checkW05({ R, view, idx }) {
  const reviews = idx.reviews.map((r) => plain(r))
  const seen = new Set()
  for (const s of view.slots) {
    const exp = idx.expected.get(s.slot)
    if (s.owner !== 'writer' || !exp?.isReview || seen.has(s.slot)) continue
    seen.add(s.slot)
    let bad = false
    for (const m of s.items.join(' ').matchAll(QUOTE)) {
      const passage = plain(m[1] ?? m[2] ?? m[3])
      if (!passage || reviews.some((r) => r.includes(passage))) continue
      bad = true
      R.w05.fail(
        s.slot,
        `${s.slot}: quoted passage "${passage}" is not in any review of the brief`,
        reviews.length ? 'not-a-passage' : 'no-review'
      )
    }
    if (!bad) R.w05.ok()
  }
}
