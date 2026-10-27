// The picture slots of a content contract, as the picture planner reads them: one group per demo FILE (a file shown in
// several slots is replaced everywhere at once), what role it plays, which pages show it, what its section is about and
// how large the demo is. Pure: the contract and, optionally, what was measured of the demo files on the site.
//
// 🔒 NEVER REPLACED, EACH WITH ITS REASON: a logo or mark (a photo of it invents another brand), a map, a face (an avatar
// is somebody's; a testimonial's face would be an invented person), an icon, decoration, an error page, a fact that needs
// evidence, and a cut-out — a transparent PNG replaced by a rectangular photo shows a box in the middle of the design. A
// PNG whose transparency was not measured counts as a cut-out until it is.

const NEVER = [
  [/\bmaps?\b|google\.[a-z.]+\/maps/i, 'a map: a picture of a place would invent one'],
  [/\blogos?\b|hp-brand|\bbrand\b|favicon/i, 'a logo or mark: a photo of it would invent another brand'],
  [/avatars?|author-img|\bauthor\b|testimonial|\bfaces?\b/i, 'a face (avatar): somebody’s own picture'],
  [/\bicons?\b|\bflags?\b|sprite|\bbadges?\b|signature|partners?|clients?/i, 'an icon or mark'],
  [/decor|\bshapes?\b|pattern|\bmask\b|ornament|cut-?out/i, 'decoration, not a photograph'],
  [/\b404\b|offline|error[- ]page|erro-page/i, 'an error or offline page']
]

// Role by the words of a slot, first match wins; tested on the slot's own name, then its section, then the file.
const ROLES = [
  ['hero', /slideshow|\bslides?\b|slide-\d|\bhero\b|image-hero|carousel/i],
  ['banner', /\bbanner\b/i],
  ['background', /\bbg\b|-bg\b|background|image-bg/i],
  ['dish', /\bdish|\bfood\b|menu-img|\bproducts?\b/i],
  ['gallery', /gallery|big-photo/i],
  ['video', /video/i],
  ['section-main', /feature-main|main-img|img-features|\bintro\b|about|history/i],
  ['cta', /\bcta\b|cta-media/i],
  ['section-sub', /sub-feature|thumb/i]
]
/** Which role wins when one file plays several. */
const RANK = [
  'hero',
  'banner',
  'background',
  'section-main',
  'dish',
  'gallery',
  'cta',
  'video',
  'section-sub',
  'section',
  'article'
]
/** A demo smaller than this on its long side is an icon, whatever its slot is called. */
const ICON_PX = 120
const HOME_ROUTES = new Set(['homepage', 'home'])
const STOP = new Set([
  'and',
  'the',
  'of',
  'with',
  'a',
  'an',
  'our',
  'us',
  'to',
  'for',
  'in',
  'on',
  'style',
  'image',
  'img',
  'custom',
  'page',
  'demo'
])

export const SLOT_MAP_VERSION = 1

/** A sample as a file path: the fragment a Joomla image field carries dropped, no leading slash. */
export function fileOf(sample) {
  return String(sample ?? '')
    .split('#')[0]
    .trim()
    .replace(/^\/+/, '')
}

/** The width and height a sample declares (`…?width=1920&height=824`, Joomla's media field), or null. */
export function declaredSize(sample) {
  const query = String(sample ?? '').split('?')[1]
  if (!query) return null
  const params = new URLSearchParams(query)
  const width = Number(params.get('width'))
  const height = Number(params.get('height'))
  return width > 0 && height > 0 ? { width, height } : null
}

export function foldWords(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w))
}

/** A slot's label split into the section it sits in and its own name (`Sea food / dish-image`, `home — bento.tile-image.1`). */
function partsOf(slot) {
  const label = String(slot.label ?? '')
  const wp = label.split(' — ')
  if (wp.length > 1) {
    const block = slot.target?.block ?? wp[1]
    return {
      section: String(block).split('.')[0],
      name: String(block).split('.').slice(1).join('.') || String(block)
    }
  }
  const at = label.lastIndexOf(' / ')
  return at >= 0 ? { section: label.slice(0, at), name: label.slice(at + 3) } : { section: '', name: label }
}

function roleOf(slot, file) {
  const { section, name } = partsOf(slot)
  if ((slot.entity ?? '').startsWith('article-') && !String(slot.label ?? '').includes(' / '))
    return 'article'
  // The Hero section's picture is the hero, whatever its own name says (`Hero / ft-bg`).
  if (ROLES[0][1].test(section) || ROLES[0][1].test(name)) return 'hero'
  for (const text of [name, section, file]) for (const [role, re] of ROLES) if (re.test(text)) return role
  return 'section'
}

function neverOf(slot, file, demo) {
  if (slot.requiresEvidence) return 'a fact that needs evidence (a real person or record)'
  const { section, name } = partsOf(slot)
  const words = `${name} ${section} ${slot.target?.block ?? ''} ${file}`
  for (const [re, reason] of NEVER) if (re.test(words)) return reason
  if (/^https?:/i.test(file)) return 'not a file of the site'
  if (demo && Math.max(demo.width, demo.height) < ICON_PX) return `an icon (smaller than ${ICON_PX}px)`
  if (/\.png$/i.test(file)) {
    if (demo?.alpha === true) return 'a cut-out (transparent PNG): a photograph would show a box'
    if (demo?.alpha !== false) return 'a PNG that may be a cut-out: its transparency was not measured'
  }
  return null
}

/** The pages (routes) that show each entity, in page order, and where on each page. */
function pagesIndex(pages) {
  /** @type {Map<string, Array<{route: string, page: number, at: number}>>} */
  const index = new Map()
  const add = (entity, hit) => {
    const list = index.get(entity) ?? []
    if (!list.some((h) => h.route === hit.route)) list.push(hit)
    index.set(entity, list)
  }
  pages.forEach((page, p) => {
    const route = String(page.route ?? '')
    if (!route) return
    if (page.entity) add(page.entity, { route, page: p, at: 0 })
    const article = /view=article&id=(\d+)/.exec(page.link ?? '')
    if (article) add(`article-${article[1]}`, { route, page: p, at: 0 })
    ;(page.assignedModules ?? []).forEach((m, at) => {
      if (m.published !== undefined && String(m.published) !== '1') return
      add(m.entity, { route, page: p, at: at + 1 })
    })
  })
  return index
}

/** The route a WordPress entity stands for (`page-home` → `home`), or null. */
function wpRoute(entity) {
  const m = /^page-(.+)$/.exec(entity ?? '')
  return m ? m[1] : null
}

/**
 * @param {{slots: any[], pages?: any[]}} contentMap
 * @param {{cms?: string, keepRoute?: (route: string) => boolean, demo?: Map<string, {width: number, height: number, alpha?: boolean}>, homeRoute?: string}} [opts]
 * @returns {{groups: Array<{id: string, file: string, role: string, home: boolean, routes: string[], occurrences: Array<{key: string, entity: string, label: string, sample: string}>, topic: string[], demo: {width: number, height: number} | null}>, never: Array<{file: string, reason: string, keys: string[]}>, skipped: Array<{file: string, reason: string}>}}
 */
export function slotMap(
  contentMap,
  { cms = 'joomla', keepRoute = () => true, demo = new Map(), homeRoute } = {}
) {
  const pages = contentMap.pages ?? []
  const index = pagesIndex(pages)
  const homes = new Set(HOME_ROUTES)
  if (homeRoute) homes.add(homeRoute)
  /** @type {Map<string, any>} */
  const files = new Map()
  ;(contentMap.slots ?? []).forEach((slot, n) => {
    if (slot.type !== 'image') return
    const file = fileOf(slot.sample)
    if (!file) return
    const entry = files.get(file) ?? { file, slots: [], first: n, declared: null }
    entry.slots.push(slot)
    entry.declared ??= declaredSize(slot.sample)
    files.set(file, entry)
  })

  const groups = []
  const never = []
  const skipped = []
  for (const entry of files.values()) {
    const measured = demo.get(entry.file) ?? null
    // The file the site serves beats what the contract declares: a sealed site checks the shape against the file.
    const size =
      measured?.width && measured?.height
        ? { width: measured.width, height: measured.height }
        : entry.declared
    const sized = size ? { ...size, alpha: measured?.alpha } : measured
    const reason = entry.slots.map((slot) => neverOf(slot, entry.file, sized)).find(Boolean)
    if (reason) {
      never.push({ file: entry.file, reason, keys: entry.slots.map((s) => s.key) })
      continue
    }
    const hits = []
    for (const slot of entry.slots) {
      const own =
        cms === 'wordpress'
          ? wpRoute(slot.entity)
            ? [{ route: wpRoute(slot.entity), page: 0, at: 0 }]
            : []
          : (index.get(slot.entity) ?? [])
      for (const hit of own) if (!hits.some((h) => h.route === hit.route)) hits.push(hit)
    }
    const kept = hits.filter((h) => keepRoute(h.route))
    // A demo blog post no page of the contract shows is the blog's: the engine keeps those posts as the template wrote them.
    if (hits.length === 0 && entry.slots.every((slot) => (slot.entity ?? '').startsWith('article-'))) {
      skipped.push({ file: entry.file, reason: 'a blog post of the template, kept as written' })
      continue
    }
    if (hits.length > 0 && kept.length === 0) {
      skipped.push({ file: entry.file, reason: 'on no page the site keeps' })
      continue
    }
    const roles = entry.slots.map((slot) => roleOf(slot, entry.file))
    const role = RANK.find((r) => roles.includes(r)) ?? 'section'
    const topic = [...new Set(entry.slots.flatMap((slot) => foldWords(partsOf(slot).section)))]
    groups.push({
      id: entry.file,
      file: entry.file,
      role,
      home: kept.some((h) => homes.has(h.route)),
      routes: kept.map((h) => h.route).sort(),
      occurrences: entry.slots.map((s) => ({
        key: s.key,
        entity: s.entity,
        label: s.label ?? '',
        sample: s.sample
      })),
      topic,
      demo: size,
      // Page order, then the place on the page, then the contract's own order: stable, never a database's.
      sort: [
        kept.some((h) => homes.has(h.route)) ? (role === 'hero' ? 0 : 1) : 2,
        Math.min(...kept.map((h) => h.page), Number.MAX_SAFE_INTEGER),
        Math.min(...kept.filter((h) => homes.has(h.route) || true).map((h) => h.at), Number.MAX_SAFE_INTEGER),
        entry.first
      ]
    })
  }
  groups.sort((a, b) => {
    for (let i = 0; i < a.sort.length; i += 1) if (a.sort[i] !== b.sort[i]) return a.sort[i] - b.sort[i]
    return 0
  })
  return { groups: groups.map(({ sort: _sort, ...g }) => g), never, skipped }
}
