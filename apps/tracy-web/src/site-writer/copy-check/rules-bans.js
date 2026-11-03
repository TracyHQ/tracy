// W08, W09, W10 and W11 (ADR 0042): banned phrases, page meta, self-describing sentences, long dashes.
import { allTexts } from './copy-view.js'
import { bannedPhrases } from './inputs-index.js'
import { hasPhrase } from './text-tools.js'

export const ALT_MAX = 125
export const TITLE_MAX = 60
export const DESCRIPTION_MAX = 160

// W10: sentences that describe the page or the section itself instead of the business. Case-insensitive.
export const SELF_DESCRIBING = [
  /\bthis (section|page|block|row|card|banner|layout|template)\b/i,
  /\bhere you (will|can) find\b/i,
  /\b(show|shows|showing) the shape of\b/i,
  /\bmade to show\b/i,
  /\b(section|block|page) (above|below)\b/i,
  /\bdemo (text|content)\b/i,
  /\blorem ipsum\b/i
]

// U+2014 and U+2013, built from code points so this file holds no long dash itself.
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`, 'g')
const isWritten = (t) => t.kind !== 'label'

export function checkW08({ R, view, plan, brief }) {
  const banned = bannedPhrases(plan, brief)
  for (const t of allTexts(view).filter(isWritten)) {
    let bad = false
    for (const b of banned)
      if (hasPhrase(t.text, b.phrase)) {
        bad = true
        R.w08.fail(t.where, `${t.where}: contains "${b.phrase}" from the ${b.list}`, 'banned-phrase')
      }
    if (!bad) R.w08.ok()
  }
}

export function checkW09({ R, view, idx }) {
  const alts = new Map(view.alts.map((a) => [a.frame, a.text]))
  for (const f of idx.frames) {
    const text = alts.get(f)
    if (text === undefined || text.trim() === '')
      R.w09.fail(f, `${f}: planned picture frame has no alt text`, 'alt-missing')
    else if (text.length > ALT_MAX)
      R.w09.fail(f, `${f}: alt is ${text.length} characters, limit ${ALT_MAX}`, 'alt-long')
    else R.w09.ok()
  }
  for (const a of view.alts)
    if (!idx.frames.has(a.frame))
      R.w09.fail(a.frame, `${a.frame}: alt text for a frame the plan does not have`, 'alt-unknown')
  const byPage = new Map(view.seo.map((s) => [s.page, s]))
  const titles = new Map()
  for (const p of idx.pages) {
    const s = byPage.get(p)
    if (!s) {
      R.w09.fail(p, `${p}: kept page has no seo entry (title and description)`, 'seo-missing')
      continue
    }
    let bad = false
    const fail = (detail, cause) => {
      bad = true
      R.w09.fail(p, `${p}: ${detail}`, cause)
    }
    if (s.title.trim() === '') fail('title is empty', 'title-missing')
    else if (s.title.length > TITLE_MAX)
      fail(`title is ${s.title.length} characters, limit ${TITLE_MAX}`, 'title-long')
    if (s.description.trim() === '') fail('description is empty', 'description-missing')
    else if (s.description.length > DESCRIPTION_MAX)
      fail(`description is ${s.description.length} characters, limit ${DESCRIPTION_MAX}`, 'description-long')
    const key = s.title.trim().toLowerCase()
    if (key && titles.has(key)) fail(`same title as ${titles.get(key)}`, 'title-duplicate')
    else if (key) titles.set(key, p)
    if (!bad) R.w09.ok()
  }
  for (const s of view.seo)
    if (!idx.pages.includes(s.page))
      R.w09.fail(s.page, `${s.page}: seo entry for a page the plan does not keep`, 'seo-unknown')
}

export function checkW10({ R, view }) {
  for (const t of allTexts(view).filter(isWritten)) {
    const hit = SELF_DESCRIBING.map((re) => re.exec(t.text)).find(Boolean)
    if (hit)
      R.w10.fail(t.where, `${t.where}: sentence describes the page itself ("${hit[0]}")`, 'self-describing')
    else R.w10.ok()
  }
}

export function checkW11({ R, view }) {
  for (const t of allTexts(view)) {
    const n = (t.text.match(LONG_DASH) ?? []).length
    if (n) R.w11.fail(t.where, `${t.where}: ${n} long dash${n > 1 ? 'es' : ''} in the text`, 'long-dash')
    else R.w11.ok()
  }
}
