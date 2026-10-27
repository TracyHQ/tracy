/**
 * A Design inspiration card, drafted from the demo itself.
 *
 * WHAT THIS IS FOR. The sheet's own line says it: "Version and demo are read; the rest is yours."
 * The rest was seven fields typed by hand for every template, and most of them are not opinions —
 * they are facts the demo already states. This reads the demo and fills what it can.
 *
 * 🔒 IT DRAFTS, IT DOES NOT PUBLISH. Everything here lands in the form for a person to look at and
 * press Publish on. That is not politeness: `CLAUDE.md` §0 rule 3 — a missing field is left empty
 * or disabled, and inventing one is WORSE than leaving it blank, because a reader believes it. A
 * category the model returns that is not one of Design inspiration's own is dropped, not rounded
 * to the nearest.
 *
 * THREE TIERS, AND ONLY ONE OF THEM NEEDS A MODEL:
 *   read      — provider, template, languages, version, demo: already on the release
 *   measured  — layouts (the demo's own top-level menu), dark (the page under
 *               `prefers-color-scheme: dark`), image (the first shot taken)
 *   judged    — category and blurb, and only these two
 *
 * So a deployment with no `MODEL_API_KEY` still gets a card with its layouts, its dark flag and its
 * provider filled in; it types one sentence and picks from a list of 22. That is the difference
 * between a button that needs a key and one that is better with one.
 */
import { DESIGN_CATEGORIES } from './design-inspiration.js'

/** A card lists the pages its preview dialog shows, not a site map. Home plus five is a card. */
export const DRAFT_MAX_LAYOUTS = 6

/** The store's own key shape, so a drafted layout is one the card may actually carry. */
const KEY = /^[a-z0-9][a-z0-9-]*$/

const slug = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * A layout's key: `/company/about` → `company-about`, `/` → `home`.
 *
 * 🔒 FROM THE PATH, NOT THE LABEL. The key names the picture (`<template>-<release>-<key>-<width>.png`), so
 * it must be the store's shape or the shot is refused after all the browser work is done — and a
 * label is written for humans in whatever language the site is in. Measured while building this:
 * a Vietnamese menu item "Về chúng tôi" slugs to `v-ch-ng-t-i`, which is a valid key and a
 * meaningless one, while its path already said `company-about`. A path is ASCII, unique within the
 * site, and stable when someone rewords a menu.
 *
 * The label is the fallback for a path that carries nothing (a site whose pages are `?id=7`), and
 * the position is the last resort — ugly and always valid, which beats dropping a page the site's
 * own menu says it has.
 */
export function layoutKey(label, path, index) {
  if (path === '/') return 'home'
  const fromPath = slug(path)
  if (KEY.test(fromPath)) return fromPath.slice(0, 40)
  const fromLabel = slug(label)
  if (KEY.test(fromLabel)) return fromLabel.slice(0, 40)
  return `page-${String(index + 1)}`
}

/**
 * The layouts a card should carry, from the demo's own navigation.
 *
 * ⚠ CAPPED, AND THAT IS NOT TIDINESS. Every layout is TWO screenshots, and a capture walks them one
 * at a time: measured 17/09, ja-voyara's top-level menu is 16 items — 32 shots, minutes of work —
 * and ja-kinetic's is 12. A card showing six pages is a card; sixteen is a site map nobody scrolls.
 * The rest of the menu is not lost, it is simply not proposed: rows are still added by hand.
 */
export function layoutsFrom(links, max = DRAFT_MAX_LAYOUTS) {
  const seen = new Set()
  const layouts = []
  for (const link of Array.isArray(links) ? links : []) {
    if (layouts.length >= max) break
    const path = typeof link?.path === 'string' && link.path.startsWith('/') ? link.path : null
    if (path === null || seen.has(path)) continue
    const label =
      String(link?.label ?? '')
        .trim()
        .slice(0, 40) || 'Page'
    const key = layoutKey(label, path, layouts.length)
    if (layouts.some((l) => l.key === key)) continue
    seen.add(path)
    // `count` is carried only when the demo's own menu measured one. A card field nobody measured
    // is a field a person has to check, and this one draws on the customer's screen as a claim.
    const count = Number.isInteger(link?.count) && link.count > 1 ? link.count : undefined
    // Where the page ANSWERS, when the outline found that it is not the same string as its `path`.
    // The two differ on any site whose pretty paths are not real addresses — every Joomla demo
    // Tracy provisions, which runs SEF with rewriting off. Carried verbatim and only when present:
    // this is a fact read off the demo, not something to reconstruct here.
    const address =
      typeof link?.address === 'string' && link.address.startsWith('/') && link.address !== path
        ? link.address
        : undefined
    layouts.push({
      key,
      label,
      path,
      ...(address === undefined ? {} : { address }),
      ...(count === undefined ? {} : { count }),
      shots: {}
    })
  }
  return layouts
}

/** How long the model has to answer before the draft goes out without its two judged fields. */
export const JUDGE_TIMEOUT_MS = 15000

/** Why a model call gave no answer, in words for the sheet. */
function modelFailure(error, signal) {
  const timedOut = signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError'
  return timedOut
    ? 'the model did not answer in time'
    : `the model could not be reached (${String(error?.message ?? error).slice(0, 200)})`
}

/**
 * Ask the model for the two fields nothing can measure: which of Design inspiration's categories
 * this site belongs in, and one sentence about it.
 *
 * 🔒 A CATEGORY OUTSIDE THE LIST IS DROPPED. The list is closed and the filter is built on it; a
 * value near-but-not-in it would pass through the form and fail at publish, or worse, be corrected
 * to something nobody chose. Empty is a field an administrator fills in five seconds.
 *
 * @returns {Promise<{ category: string | null, blurb: string | null, why: string | null }>}
 */
export async function judgeCard({
  outline,
  label,
  platform,
  model,
  fetchImpl = fetch,
  timeoutMs = JUDGE_TIMEOUT_MS
}) {
  if (!model) return { category: null, blurb: null, why: 'no model is configured on this server' }
  const menu = (outline?.links ?? []).map((l) => l.label).join(', ')
  // 🔒 A DEADLINE OF ITS OWN. The door waits on this call after the demo was read; a model that
  // never answers used to hold the whole press past the proxy's limit, and the layouts already
  // read were lost with it (11/10/2026). Out of time is two blank fields and a reason.
  const signal = AbortSignal.timeout(timeoutMs)
  let res
  try {
    res = await fetchImpl(`${model.baseUrl}/chat/completions`, {
      signal,
      method: 'POST',
      headers: { authorization: `Bearer ${model.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model.words,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You file a website template into a catalogue.\n' +
              `Answer with JSON only: {"category": string, "blurb": string}.\n` +
              '\n' +
              // ⚠ THE LIST IS ABOUT DESIGN, NOT INDUSTRY, AND A MODEL GUESSES INDUSTRY. Measured
              // 17/09 on ja_voyara: both llama 8b and 70b answered a travel category — reasonable,
              // and not one of ours, so both were dropped and the field stayed empty. Numbering the
              // options and demanding the number is what turns a free-text guess into a choice.
              'Pick the ONE line below that best fits, and answer with its exact text.\n' +
              'These are DESIGN categories — how the template LOOKS and what shape of site it is — ' +
              'not the industry of its demo content. A travel site with a clean corporate layout is ' +
              'a corporate design, not a travel category.\n' +
              DESIGN_CATEGORIES.map((c, i) => `${String(i + 1)}. ${c}`).join('\n') +
              '\n\n' +
              'blurb is ONE sentence, at most 160 characters, saying what kind of site this is and ' +
              'what its demo content is about. No marketing adjectives, no "stunning", no exclamation.'
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                template: label,
                cms: platform,
                title: outline?.title ?? '',
                metaDescription: outline?.description ?? '',
                menu,
                pageText: (outline?.text ?? '').slice(0, 1200)
              },
              null,
              2
            )
          }
        ]
      })
    })
  } catch (error) {
    return { category: null, blurb: null, why: modelFailure(error, signal) }
  }
  if (!res.ok) return { category: null, blurb: null, why: `the model answered HTTP ${res.status}` }
  let said
  try {
    said = (await res.json())?.choices?.[0]?.message?.content ?? ''
  } catch (error) {
    return { category: null, blurb: null, why: modelFailure(error, signal) }
  }
  if (typeof said !== 'string') said = ''
  let parsed
  try {
    parsed = JSON.parse(said.replace(/^```(?:json)?|```$/g, '').trim())
  } catch {
    return { category: null, blurb: null, why: 'the model did not answer with JSON' }
  }
  // A model told to pick from a numbered list answers in three shapes, measured 17/09: the text,
  // the number alone, or `"21. Themed & Unique"` — both, and DISAGREEING (21 is not that line).
  //
  // 🔒 WHERE THEY DISAGREE, THE TEXT WINS. A number is an index into a list the model cannot see
  // the ordering of; the words are what it actually meant. Trusting the digit would file a card
  // under a category whose name the model never wrote.
  const chose = typeof parsed?.category === 'string' ? parsed.category.trim() : ''
  const withoutIndex = chose.replace(/^\d+[.)]\s*/, '')
  const byNumber = /^\d+$/.test(chose) ? (DESIGN_CATEGORIES[Number(chose) - 1] ?? null) : null
  const category = DESIGN_CATEGORIES.includes(withoutIndex) ? withoutIndex : byNumber
  const blurb = typeof parsed?.blurb === 'string' ? parsed.blurb.trim().slice(0, 300) : null
  return {
    category,
    blurb: blurb || null,
    // 🔒 WHAT IT SUGGESTED IS SHOWN, NOT SWALLOWED. It is not rounded to the nearest of ours —
    // that would put a category nobody chose on a card a customer reads — but a person picking
    // from 22 options is helped by knowing the machine said "Travel & Hospitality".
    why:
      category === null && chose !== ''
        ? `the model suggested ${JSON.stringify(chose)}, which is not one of Design templates' own`
        : category === null
          ? 'the model named no category'
          : null
  }
}
