// The classifier of the marker test (ticket #585): every observation of every render read against the markers the
// build wrote. A value that is a marker is the build's own; anything else a page shows (words, a picture, a link, an
// alt, a title, a meta) is a leak unless an exemption of `exemptions.mjs` covers it, and each leak is named by its
// page, its place and its true source (`sources.mjs`). Leaks seen on several widths and theme sides are one finding with
// the list of where. The other way round: each value the build wrote that no page shows is `not_seen`. Pure.
import { codesIn, markerShare } from './marker-codec.mjs'
import { exemptionOf } from './exemptions.mjs'
import { notSeenOf } from './not-seen.mjs'

/** The finding groups of the record, in the order the record lists them. */
export const GROUPS = Object.freeze([
  'raw_markup',
  'unmarked_text',
  'unmarked_picture',
  'unmarked_link',
  'empty_picture',
  'unmarked_embed',
  'kit_reason_false',
  'outside_request'
])
/** A kit reason that says no page draws the string it keeps. */
const NOT_DRAWN = /\bnot[- ]drawn\b|no (?:kit )?page draws it|not drawn as visible text/i
/** The requests that load an embed (a frame, a video or audio): their address is content, so one that is no marker
 * and not from a host the adapter declares is a leak; every other request to another host (a font, a script, a
 * stylesheet) is a note. */
const EMBED_REQUESTS = /^request\[(?:document|media)\]$/
const TEXT = new Set(['text', 'attr', 'title', 'meta', 'jsonld'])
/** Markup or template code that reached a page as words: a tag, an entity left escaped, the code notation. */
const RAW = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?>|&(?:lt|gt|amp|quot|#\d+);|\(\(|\)\)/i

/** Where a page was read: `<theme> <width>`. */
const whereOf = (r) => `${r.theme} ${r.width}`

/**
 * @param {{renders: object[], origin: string, registry: Array<{code: string}>, writePlan: object,
 *   uploaded: Record<string, string>, ids?: Record<string, number>, resolve: {text: Function, picture: Function},
 *   kept: Map<string, string>, rules?: Function[], siteValues?: Map<string, object>, builtYear?: number}} input
 *   `uploaded`: the picture paths the write uploaded and `ids` the records it made (the write record); `rules`: the
 *   framework adapter's exemptions; `siteValues`: values of the site's own data the caller read (an account name an
 *   article prints), by value, with their source
 * @returns {{findings: object[], exempt: object[], seen: Set<string>, notSeen: object[]}}
 */
export function classify({
  renders,
  origin,
  registry,
  writePlan,
  uploaded,
  ids = {},
  resolve,
  kept,
  rules = [],
  siteValues = new Map(),
  builtYear,
  declaredHosts = new Set()
}) {
  const problems = []
  // Only the codes the build registered are markers: anything else that looks like one is read as words.
  const known = new Set((registry ?? []).map((e) => e.code))
  const codes = (v) => codesIn(v, known)
  const byKey = new Map()
  const exempt = new Map()
  const seen = new Set()
  const markerPictures = new Set(Object.values(uploaded ?? {}).map((p) => String(p).replace(/^\/+/, '')))
  const seenPictures = new Set()
  // The values the write plan wrote that hold no marker (a network name the build gives a marker link's label):
  // the build's own words, derived from the marker data, named by their plan entry.
  const planWords = new Map()
  for (const op of writePlan?.ops ?? [])
    for (const v of op.values ?? [])
      if (typeof v.value === 'string' && v.entry && !codes(v.value).length && !planWords.has(v.value.trim()))
        planWords.set(v.value.trim(), { class: 'write', entry: v.entry, rule: v.rule ?? null })
  const add = (map, key, item, r) => {
    const had = map.get(key)
    if (had) {
      had.where.add(whereOf(r))
      if (r.visible !== false) had.visible = true
    } else map.set(key, { ...item, where: new Set([whereOf(r)]) })
  }
  // A crop of the finding: its box on the full page shot of the render, when the render kept one.
  const cropOf = (r, o) => (r.shot && o.box ? { shot: r.shot, box: o.box, where: whereOf(r) } : null)
  const leak = (group, r, o, extra = {}) => {
    const had = byKey.get(`${group}|${r.pageType}|${o.kind}|${o.place?.element}|${o.value}`)
    if (had && !had.crop) had.crop = cropOf(r, o)
    add(
      byKey,
      `${group}|${r.pageType}|${o.kind}|${o.place?.element}|${o.value}`,
      {
        group,
        page: r.pageType,
        path: r.path,
        kind: o.kind,
        place: o.place,
        value: o.value,
        visible: o.visible !== false,
        crop: cropOf(r, o),
        ...extra
      },
      { ...r, visible: o.visible }
    )
  }
  for (const r of renders) {
    for (const o of r.observations ?? []) {
      if (typeof o?.value !== 'string') continue
      for (const code of codes(o.value)) seen.add(code)
      if (o.kind === 'block') continue
      if (o.kind === 'problem') {
        problems.push({ page: r.pageType, element: o.place?.element ?? null, value: o.value })
        continue
      }
      if (o.kind === 'request') {
        const host = hostOf(o.value)
        if (codes(o.value).length) leak('raw_markup', r, o, { why: 'a marker address loaded as a resource' })
        else if (EMBED_REQUESTS.test(o.place?.element ?? '') && !declaredHosts.has(host))
          leak('unmarked_embed', r, o, {
            why: 'an embed loaded from another site',
            source: { class: 'outside', host }
          })
        else leak('outside_request', r, o, { source: { class: 'outside', host } })
        continue
      }
      if (o.kind === 'embed' || o.kind === 'media') {
        const v = o.value.trim()
        const host = hostOf(v)
        if (!v || codes(v).length || declaredHosts.has(host)) continue
        if (o.kind === 'embed' && sitePath(v, origin) !== null) continue
        leak('unmarked_embed', r, o, {
          why: 'an embed or media address that is no marker',
          source: resolve.picture(v)
        })
        continue
      }
      if (o.kind === 'href') {
        const why = linkLeak(o.value, origin, codes)
        if (why) leak('unmarked_link', r, o, { why, source: resolve.text(o.value) })
        continue
      }
      if (o.kind === 'image') {
        const path = sitePath(o.value, origin)
        if (path !== null && markerPictures.has(path)) {
          seenPictures.add(path)
          continue
        }
        if (path === '' || o.value.trim() === '') {
          leak('empty_picture', r, o, {
            why: 'a picture with no address (the page itself)',
            source: { class: 'unknown', searched: [], why: 'the element names no picture to search for' }
          })
          continue
        }
        if (/^data:/i.test(o.value)) {
          leak(
            'unmarked_picture',
            r,
            { ...o, value: `${o.value.slice(0, 48)}...` },
            { source: resolve.picture(o.value) }
          )
          continue
        }
        leak('unmarked_picture', r, o, { source: resolve.picture(o.value) })
        continue
      }
      if (!TEXT.has(o.kind)) continue
      const share = markerShare(o.value, { known })
      // The marker filler alone: the gate's own words (the search words a search page echoes).
      if (share.kind === 'filler') {
        add(
          exempt,
          `filler|${o.kind}`,
          {
            why: 'marker_filler',
            kind: o.kind,
            value: o.value,
            page: r.pageType,
            visible: o.visible !== false
          },
          { ...r, visible: o.visible }
        )
        continue
      }
      if (share.kind === 'marker') {
        if (RAW.test(o.value)) leak('raw_markup', r, o, { why: 'markup or template code printed as words' })
        continue
      }
      if (RAW.test(o.value) && !/^https?:/.test(o.value)) {
        leak('raw_markup', r, o, { why: 'markup or template code printed as words' })
        continue
      }
      const rest = share.kind === 'mixed' || share.rest !== o.value.trim() ? share.rest : o.value
      // A marker picture named by its path in words (structured data, a share image): the build's own.
      if (markerPictures.has(sitePath(rest, origin) ?? '')) continue
      const written = planWords.get(rest.trim())
      if (written?.rule === 'field:data') {
        add(
          exempt,
          `derived|${o.kind}|${rest}`,
          {
            why: `derived_from_marker_data: ${written.entry}`,
            kind: o.kind,
            value: rest,
            page: r.pageType,
            visible: o.visible !== false
          },
          { ...r, visible: o.visible }
        )
        continue
      }
      const whole = resolve.text(o.value)
      const source =
        written ??
        (siteValues.has(rest) ? { class: 'write', ...siteValues.get(rest) } : null) ??
        (whole.class === 'unknown' && rest !== o.value ? resolve.text(rest) : whole)
      const why = exemptionOf(
        { ...o, value: rest },
        { origin, kept, source, builtYear, rules, pageStatus: r.expected ?? 200 }
      )
      // A kept string whose reason says no page draws it, in this page: the kit's reason is false. Hidden words are
      // in the page all the same (product decision 5); only a reason that claims "not drawn as visible text" holds
      // for hidden words.
      const claimsOnlyInvisible = /visible/i.test(why ?? '')
      if (
        why?.startsWith('kept_by_kit') &&
        NOT_DRAWN.test(why) &&
        (!claimsOnlyInvisible || o.visible !== false)
      ) {
        leak('kit_reason_false', r, o, {
          why: `the kit keeps ${source.key} and says no page draws it, but this page shows it`,
          source
        })
        continue
      }
      if (why) {
        add(
          exempt,
          `${why}|${o.kind}|${rest}`,
          { why, kind: o.kind, value: rest, page: r.pageType, visible: o.visible !== false },
          { ...r, visible: o.visible }
        )
        continue
      }
      leak('unmarked_text', r, o, { rest: rest !== o.value ? rest : undefined, source })
    }
  }
  const findings = [...byKey.values()].map((f) => ({ ...f, where: [...f.where].sort() }))
  return {
    findings,
    exempt: [...exempt.values()].map((e) => ({ ...e, where: [...e.where].sort() })),
    seen,
    problems,
    notSeen: notSeenOf({ writePlan, registry, seen, renders, ids, uploaded, pictures: seenPictures })
  }
}

const hostOf = (url) => {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

/** The path of a site address (no leading slash), '' for the site itself, null for another host or no address. */
function sitePath(url, origin) {
  try {
    const u = new URL(url, origin)
    if (u.origin !== new URL(origin).origin) return null
    return decodeURIComponent(u.pathname).replace(/^\/+/, '')
  } catch {
    return null
  }
}

/** Why a link leaks, or null: a link of the site itself, an anchor, a marker address, or a script call stay. */
function linkLeak(href, origin, codes) {
  const v = href.trim()
  if (!v || v.startsWith('#') || /^javascript:/i.test(v)) return null
  if (/^(?:mailto|tel|sms):/i.test(v)) return codes(v).length ? null : 'a contact link that is no marker'
  if (sitePath(v, origin) !== null) return null
  return codes(v).length ? null : 'a link to another site that is no marker'
}
