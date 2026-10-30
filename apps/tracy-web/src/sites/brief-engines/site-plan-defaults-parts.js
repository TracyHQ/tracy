/**
 * The parts of the site plan defaults (`site-plan-defaults.js`) that read one element or one list: the mapped action of a
 * button or link, the writing order in dependency order, and decisions named twice the same way.
 */

const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])
const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '')

/** The page a demo link opens: a Joomla menu item link (`Itemid=<n>`), else a page route. */
function pageOfHref(/** @type {unknown} */ href, /** @type {any[]} */ pages) {
  const link = text(href)
  if (!link || link === '#') return null
  const item = /[?&]Itemid=(\d+)/.exec(link)
  if (item) return pages.find((p) => p.entity === `menuItem-${item[1]}`)?.id ?? null
  const route = link.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+|\/+$/g, '')
  return pages.find((p) => p.route && p.route === route)?.id ?? null
}

/**
 * The mapped action of a button or link, given the pages the plan shows.
 * @returns {{kind: string, target: string} | null}
 */
export function mappedAction(/** @type {any} */ e, /** @type {any} */ ctx) {
  const { site, shownPages, pages, contactPage } = ctx
  const phone = text(site?.phone)
  const email = text(site?.email)
  const reach = () =>
    phone
      ? { kind: 'call', target: phone }
      : email
        ? { kind: 'email', target: email }
        : contactPage
          ? { kind: 'page', target: contactPage }
          : null
  switch (e.action) {
    case 'page-control':
    case 'submit-form':
      return { kind: 'control', target: e.id }
    case 'open-map':
      return text(site?.address) ? { kind: 'map', target: text(site.address) } : null
    case 'go-to-item':
      return e.card ? { kind: 'item', target: e.card.collection } : null
    default: {
      const page = pageOfHref(e.href, pages)
      if (page && shownPages.has(page)) return { kind: 'page', target: page }
      if (e.action === 'primary-cta' || e.action === 'contact') return reach()
      return null
    }
  }
}

/** Pages in dependency order (each after the pages it depends on); the author's order breaks ties; a cycle keeps it. */
export function orderedPages(/** @type {any[]} */ shown, /** @type {string[]} */ authorOrder) {
  const ids = shown.map((p) => p.id)
  const rank = new Map([...authorOrder, ...ids].map((id, i) => [id, i]).reverse())
  const deps = new Map(
    shown.map((p) => [
      p.id,
      list(p.dependsOn)
        .map(String)
        .filter((d) => ids.includes(d))
    ])
  )
  const out = []
  const placed = new Set()
  while (out.length < ids.length) {
    const ready = ids
      .filter((id) => !placed.has(id) && (deps.get(id) ?? []).every((d) => placed.has(d)))
      .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
    if (!ready.length) return authorOrder
    placed.add(ready[0])
    out.push(ready[0])
  }
  return out
}

/** Decisions with a repeat of the same decision (no field differs but its words) taken out; a real conflict stays. */
export function dedupe(/** @type {any[]} */ decisions) {
  const key = (/** @type {any} */ d) => {
    const { element: _, reason: __, note: ___, ...rest } = d
    return JSON.stringify(rest)
  }
  /** @type {Map<string, any[]>} */
  const seen = new Map()
  return decisions.filter((d) => {
    const id = String(d.element)
    const before = seen.get(id) ?? []
    if (before.some((b) => key(b) === key(d))) return false
    seen.set(id, [...before, d])
    return true
  })
}

/** An id as compared for a near miss: trimmed, lower case, no spaces. */
const normId = (/** @type {unknown} */ id) =>
  String(id ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
/** An id without its kind prefix ("picture:", "photo:"). */
const tailOf = (/** @type {string} */ id) => normId(id).replace(/^[a-z-]+:/, '')

/**
 * 🔒 AN ID THE AUTHOR WRITES IS AN ID THAT EXISTS (ticket TracyHQ/tracy#234, 30/10/2026: round 1 of the pilot plan was
 * refused for three invented picture slot ids). The valid id a near miss means, or null: the same id with other case or
 * spaces, or the same id with its kind prefix missing or another one, when exactly one valid id matches. Never a different
 * number: `article-14.43` is not `article-14.40`, and a guess would put a photo in the wrong frame; that is left to the check,
 * whose reason names the valid ids (`closestIds`).
 * @param {unknown} given @param {Iterable<string>} valid
 * @returns {string | null}
 */
export function nearMissId(given, valid) {
  const ids = [...valid]
  const raw = String(given ?? '')
  if (ids.includes(raw)) return raw
  for (const key of [normId, tailOf]) {
    const want = key(raw)
    if (!want) continue
    const hits = ids.filter((id) => key(id) === want)
    if (hits.length === 1) return hits[0]
    if (hits.length > 1) return null
  }
  return null
}

/**
 * The valid ids closest to an unknown one, for a check reason: the longest shared beginning first, then the closest
 * number at the end, at most `n`.
 * @param {unknown} given @param {Iterable<string>} valid @param {number} [n]
 * @returns {string[]}
 */
export function closestIds(given, valid, n = 8) {
  const want = normId(given)
  const shared = (/** @type {string} */ id) => {
    const a = normId(id)
    let i = 0
    while (i < a.length && i < want.length && a[i] === want[i]) i += 1
    return i
  }
  const number = (/** @type {string} */ s) => Number(/(\d+)\D*$/.exec(s)?.[1] ?? Number.NaN)
  const target = number(want)
  const gap = (/** @type {string} */ id) => {
    const d = Math.abs(number(normId(id)) - target)
    return Number.isFinite(d) ? d : Number.POSITIVE_INFINITY
  }
  return [...valid]
    .map((id) => ({ id, shared: shared(id), gap: gap(id) }))
    .sort((a, b) => b.shared - a.shared || a.gap - b.gap)
    .slice(0, n)
    .map((x) => x.id)
}

/**
 * The author's answer with every near-miss id put right (`nearMissId`): the photo of each photo decision, the picture slots
 * it fills, and the element of each decision. What was put right is listed in `repaired`, for the build record; an id with
 * no unambiguous match is left as written, for the check to refuse with the valid ids.
 * @param {any} answer
 * @param {{photoIds: string[], pictureIds: string[], elementIds: string[]}} ids
 * @returns {{answer: any, repaired: Array<{field: string, from: string, to: string}>}}
 */
export function repairIds(answer, { photoIds, pictureIds, elementIds }) {
  /** @type {Array<{field: string, from: string, to: string}>} */
  const repaired = []
  const fix = (/** @type {unknown} */ id, /** @type {string[]} */ valid, /** @type {string} */ field) => {
    if (typeof id !== 'string' || valid.includes(id)) return id
    const to = nearMissId(id, valid)
    if (!to) return id
    repaired.push({ field, from: id, to })
    return to
  }
  if (!answer || typeof answer !== 'object') return { answer, repaired }
  const photos = list(answer.photos).map((p) =>
    p && typeof p === 'object'
      ? {
          ...p,
          photo: fix(p.photo, photoIds, 'photos.photo'),
          ...(Array.isArray(p.slots) ? { slots: p.slots.map((s) => fix(s, pictureIds, 'photos.slots')) } : {})
        }
      : p
  )
  const decisions = list(answer.decisions).map((d) =>
    d && typeof d === 'object'
      ? {
          ...d,
          element: fix(d.element, elementIds, 'decisions.element'),
          ...(typeof d.picture?.photo === 'string'
            ? { picture: { ...d.picture, photo: fix(d.picture.photo, photoIds, 'decisions.picture.photo') } }
            : {})
        }
      : d
  )
  return {
    answer: {
      ...answer,
      ...(Array.isArray(answer.photos) ? { photos } : {}),
      ...(Array.isArray(answer.decisions) ? { decisions } : {})
    },
    repaired
  }
}
