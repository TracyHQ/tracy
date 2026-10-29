/**
 * Post-build QA of what each placed photo means where it stands (#140, spec #132): `photos-match-slots` and
 * `faces-named`, both blocking.
 *
 * A shown picture is traced back to its brief asset by its file (`placedSlots`, read from the build's import receipts,
 * else `placedSources`). Its slot is the contract slot the receipt's plan row aimed at (`placedSlots`: role, group kind,
 * and the offering or person when the build bound one); without a recorded binding, the card's own words (`card`, read by the page reader) name the one
 * offering or person of the brief the card shows, under the brief's closed-list rule (`picture-links.mjs` `namedIn`:
 * words naming exactly one item, the longest name winning). What the photo shows comes from the brief's labels
 * (`photoLinks`: depicts, portraitOf, faces, ownPhoto).
 *
 * 🔒 GENERAL WHEN UNSURE, ON THE PAGE TOO. A photo linked to no offering, or with no label at all, never fills an
 * offering slot; a photo portraying nobody the brief names never fills a person slot. A visible face belongs to a person
 * the brief names, or is the owner's own photo in a general slot.
 */

const DETAIL_MAX = 20
/** The roles and group kinds of place content roles v3 (ADR 0040) that hold one offering or one person. */
const OFFERING_ROLES = new Set(['offering.image'])
const OFFERING_GROUPS = new Set(['menu_item', 'service', 'package'])
const PERSON_ROLES = new Set(['person.image'])
const PERSON_GROUPS = new Set(['person'])
/** A name shorter than this never binds a card: it matches too much (`picture-links.mjs` NAME_MIN). */
const NAME_MIN = 3

const text = (v, max) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null)

/** A picture's site file, without host or leading slash (`demo-qa.js` `fileOf`). */
function fileOf(src) {
  try {
    return decodeURIComponent(new URL(src, 'http://x.invalid/').pathname).replace(/^\/+/, '')
  } catch {
    return ''
  }
}
const sameFile = (a, b) => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`)

/**
 * The request's part of these checks, each field held to its shape; anything else is dropped.
 * @param {any} body
 */
export function slotPhotosBody(body) {
  const items = (list) =>
    (Array.isArray(list) ? list : [])
      .filter((i) => text(i?.id, 200) && text(i?.label, 200))
      .slice(0, 200)
      .map((i) => ({ id: text(i.id, 200), label: text(i.label, 200) }))
  const links = {}
  for (const [id, l] of Object.entries(
    body?.photoLinks && typeof body.photoLinks === 'object' ? body.photoLinks : {}
  ).slice(0, 500)) {
    if (id.length > 200 || !l || typeof l !== 'object') continue
    links[id] = {
      depicts: text(l.depicts, 200),
      portraitOf: text(l.portraitOf, 200),
      faces: Number.isInteger(l.faces) && l.faces > 0 ? Math.min(l.faces, 999) : 0,
      ownPhoto: typeof l.ownPhoto === 'boolean' ? l.ownPhoto : null
    }
  }
  const slots = {}
  for (const [path, s] of Object.entries(
    body?.placedSlots && typeof body.placedSlots === 'object' ? body.placedSlots : {}
  ).slice(0, 500)) {
    if (path.length > 400 || !s || typeof s !== 'object') continue
    slots[path] = {
      photo: text(s.photo, 200),
      slot: text(s.slot, 300),
      role: text(s.role, 80),
      group: text(s.group, 80),
      offering: text(s.offering, 200),
      person: text(s.person, 200)
    }
  }
  return {
    briefItems: { offerings: items(body?.briefItems?.offerings), people: items(body?.briefItems?.people) },
    photoLinks: links,
    placedSlots: slots
  }
}

const fold = (s) =>
  ` ${String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

/** The one item the words name in full, the longest name winning over a name inside it; null for none or two. */
function namedIn(words, items) {
  if (!words) return null
  const folded = fold(words)
  const hits = items.filter((i) => fold(i.label).trim().length >= NAME_MIN && folded.includes(fold(i.label)))
  const kept = hits.filter(
    (i) =>
      !hits.some((o) => o !== i && o.label.length > i.label.length && fold(o.label).includes(fold(i.label)))
  )
  return kept.length === 1 ? kept[0].id : null
}

/**
 * Whether a slot holds one person, one offering or neither: the recorded role or group kind decides; a slot with none
 * recorded is read from the item the build bound to it, else from the item its card's words name.
 */
function kindOf(meta, named) {
  if (PERSON_ROLES.has(meta.role) || PERSON_GROUPS.has(meta.group)) return 'person'
  if (OFFERING_ROLES.has(meta.role) || OFFERING_GROUPS.has(meta.group)) return 'offering'
  if (meta.role || meta.group) return 'general'
  if (meta.person ?? named.person) return 'person'
  if (meta.offering ?? named.offering) return 'offering'
  return 'general'
}

/**
 * Every placed photo a page shows, with its asset, its labels and its slot: `kind` offering, person or general, and the
 * offering or person the slot holds (null when not known).
 */
function placedShown(reads, asked) {
  const sources = Object.entries(asked.placedSources ?? {})
  const slots = Object.entries(asked.placedSlots ?? {})
  const offerings = asked.briefItems?.offerings ?? []
  const people = asked.briefItems?.people ?? []
  const out = []
  for (const r of reads) {
    if (r.error) continue
    const seen = new Set()
    for (const img of r.images ?? []) {
      if (img.broken || img.clone) continue
      const file = fileOf(img.src)
      const meta = slots.find(([path]) => sameFile(file, path))?.[1] ?? {}
      const photo = meta.photo ?? sources.find(([path]) => sameFile(file, path))?.[1]
      if (!photo || photo === '$logo') continue
      const key = `${file} ${img.selector ?? ''} ${img.card ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      const person = meta.person ?? namedIn(img.card, people)
      const offering = meta.offering ?? namedIn(img.card, offerings)
      const kind = kindOf(meta, { person, offering })
      out.push({
        page: r.path,
        slot: meta.slot ?? img.selector ?? null,
        selector: img.selector ?? null,
        photo,
        file,
        kind,
        holds: kind === 'person' ? person : kind === 'offering' ? offering : null,
        link: asked.photoLinks?.[photo] ?? null
      })
    }
  }
  return out
}

const labelOf = (items, id) => items.find((i) => i.id === id)?.label ?? id
const verdict = (id, findings, measured, expected) => ({
  id,
  pass: findings.length === 0,
  measured,
  expected,
  detail: findings.slice(0, DETAIL_MAX)
})
const where = (p) => ({ page: p.page, slot: p.slot, selector: p.selector, photo: p.photo, file: p.file })

/**
 * A photo in an offering slot is linked to that offering; a photo in a person slot portrays that person.
 * @param {any[]} reads @param {any} asked
 */
export function checkPhotosMatchSlots(reads, asked = {}) {
  const offerings = asked.briefItems?.offerings ?? []
  const people = asked.briefItems?.people ?? []
  const findings = []
  let judged = 0
  for (const p of placedShown(reads, asked)) {
    if (p.kind === 'general') continue
    judged += 1
    if (p.kind === 'offering') {
      const shows = p.link?.depicts && p.link.depicts !== 'general' ? p.link.depicts : null
      const card = p.holds ? `the card of ${labelOf(offerings, p.holds)}` : 'an offering slot'
      if (!shows)
        findings.push({
          ...where(p),
          ...(p.holds ? { expected: labelOf(offerings, p.holds) } : {}),
          problem: `a photo linked to no offering${p.link ? '' : ' (not labelled)'} in ${card}`
        })
      else if (p.holds && shows !== p.holds)
        findings.push({
          ...where(p),
          expected: labelOf(offerings, p.holds),
          shows: labelOf(offerings, shows),
          problem: `a photo of ${labelOf(offerings, shows)} in the card of ${labelOf(offerings, p.holds)}`
        })
      continue
    }
    const portrays = p.link?.portraitOf ?? null
    if (!portrays)
      findings.push({
        ...where(p),
        ...(p.holds ? { expected: labelOf(people, p.holds) } : {}),
        problem: `a photo that portrays no person the brief names, in a person slot${p.link ? '' : ' (not labelled)'}`
      })
    else if (p.holds && portrays !== p.holds)
      findings.push({
        ...where(p),
        expected: labelOf(people, p.holds),
        shows: labelOf(people, portrays),
        problem: `the portrait of ${labelOf(people, portrays)} in the slot of ${labelOf(people, p.holds)}`
      })
  }
  return verdict(
    'photos-match-slots',
    findings,
    `${findings.length} of ${judged} photos in offering or person slots show another offering or person`,
    'a photo in an offering slot shows that offering; a photo in a person slot portrays that person'
  )
}

/**
 * A visible face belongs to a person the brief names, or is the owner's own photo in a general slot.
 * @param {any[]} reads @param {any} asked
 */
export function checkFacesNamed(reads, asked = {}) {
  const findings = []
  let judged = 0
  for (const p of placedShown(reads, asked)) {
    if (!p.link || p.link.faces === 0) continue
    judged += 1
    if (p.link.portraitOf) continue
    if (p.kind === 'general' && p.link.ownPhoto === true) continue
    findings.push({
      ...where(p),
      faces: p.link.faces,
      problem:
        p.kind === 'general'
          ? 'a face of nobody the brief names, in a photo not the owner posted'
          : `a face of nobody the brief names, in ${p.kind === 'person' ? 'a person' : 'an offering'} slot`
    })
  }
  return verdict(
    'faces-named',
    findings,
    `${judged} placed photos with faces judged, ${findings.length} show a face of nobody the brief names`,
    "every face shown belongs to a person the brief names, or is in the owner's own photo in a general slot"
  )
}
