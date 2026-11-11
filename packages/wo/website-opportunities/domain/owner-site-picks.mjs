/**
 * What the owner sets for the site itself on the Profile card (#537), beside the research (pure, no I/O). Each is kept
 * on the opportunity's candidate, where Research again never reaches, and read by the place view and the brief:
 *
 * - `siteSocials`: `{[network]: {url, label?, at}}`, the social links the owner typed for the site (R15). They are
 *   links the site shows, NEVER research sources: research reads `candidate.socials`, which they never join.
 * - `teamEdits`: `{added: [{id, label, role, photoMediaId}], changed: {[id]: {label?, role?, photoMediaId?}}}`, the
 *   people the owner added to the team and their changes to the people research read (R14). Hide and show stay the
 *   reading picks' (`readingPicks`).
 * - `mediaPicks: {hidden: [mediaId]}` and `reviewPicks: {hidden: [reviewKey]}`: a photo, video or review the owner keeps
 *   off the site (R16).
 * - `factOverrides.band_<band>`: a whole band of the Profile switched off (`BANDS`), through the facts door.
 */

/** The social networks an owner can add a link for, in the order the card lists them. `other` takes a label. */
export const SOCIAL_NETWORKS = Object.freeze([
  { id: 'facebook', label: 'Facebook', placeholder: 'https://www.facebook.com/yourpage' },
  { id: 'instagram', label: 'Instagram', placeholder: '@yourhandle' },
  { id: 'tiktok', label: 'TikTok', placeholder: '@yourhandle' },
  { id: 'youtube', label: 'YouTube', placeholder: '@yourchannel' },
  { id: 'x', label: 'X', placeholder: '@yourhandle' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://www.linkedin.com/company/yourcompany' },
  { id: 'telegram', label: 'Telegram', placeholder: '@yourchannel' },
  { id: 'whatsapp', label: 'WhatsApp', placeholder: '+971 50 123 4567' },
  { id: 'pinterest', label: 'Pinterest', placeholder: '@yourprofile' },
  { id: 'snapchat', label: 'Snapchat', placeholder: '@yourhandle' },
  { id: 'threads', label: 'Threads', placeholder: '@yourhandle' },
  { id: 'other', label: 'Other', placeholder: 'https://' }
])

/** Per network: the hosts its links live on, and the link a bare handle makes (none: a link is required). */
const NETWORK_RULES = {
  facebook: { hosts: ['facebook.com', 'fb.com', 'fb.me'], handle: (h) => `https://www.facebook.com/${h}` },
  instagram: { hosts: ['instagram.com', 'instagr.am'], handle: (h) => `https://www.instagram.com/${h}` },
  tiktok: { hosts: ['tiktok.com'], handle: (h) => `https://www.tiktok.com/@${h}` },
  youtube: { hosts: ['youtube.com', 'youtu.be'], handle: (h) => `https://www.youtube.com/@${h}` },
  x: { hosts: ['x.com', 'twitter.com'], handle: (h) => `https://x.com/${h}` },
  linkedin: { hosts: ['linkedin.com', 'lnkd.in'], handle: null },
  telegram: { hosts: ['t.me', 'telegram.me', 'telegram.org'], handle: (h) => `https://t.me/${h}` },
  whatsapp: { hosts: ['wa.me', 'whatsapp.com'], handle: null },
  pinterest: { hosts: ['pinterest.com', 'pin.it'], handle: (h) => `https://www.pinterest.com/${h}` },
  snapchat: { hosts: ['snapchat.com'], handle: (h) => `https://www.snapchat.com/add/${h}` },
  threads: { hosts: ['threads.net', 'threads.com'], handle: (h) => `https://www.threads.net/@${h}` },
  other: { hosts: null, handle: null }
}
const NETWORK_IDS = new Set(SOCIAL_NETWORKS.map((n) => n.id))
const URL_MAX = 2000
const HANDLE = /^@?([A-Za-z0-9._-]{1,100})$/
/** The longest label of an `other` link. */
export const SOCIAL_LABEL_MAX = 40

const fold = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function httpUrl(text) {
  if (!text || text.length > URL_MAX || /\s/.test(text)) return null
  try {
    const u = new URL(text)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

const onHost = (u, hosts) =>
  !hosts || hosts.some((h) => u.hostname.toLowerCase() === h || u.hostname.toLowerCase().endsWith(`.${h}`))

/** A WhatsApp number in E.164 (8 to 15 digits, an optional leading +) as its `wa.me` link; null otherwise. */
export function whatsappLinkOf(number) {
  const text = fold(number)
  if (!/^\+?[\d\s().-]+$/.test(text)) return null
  const digits = text.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15 && digits[0] !== '0' ? `https://wa.me/${digits}` : null
}

/**
 * One social link from a body `{network, action, url?, handle?, number?, label?}`: `{network, remove: true}`,
 * `{network, url, label?}`, or `{error}` (`INVALID_NETWORK`, `INVALID_ACTION`, `INVALID_LABEL`, `INVALID_URL`,
 * `INVALID_PHONE`). Never judged by the research link rules (`link-kinds.mjs`): this link is shown, never read.
 */
export function readSocialLink(body) {
  const network = body?.network
  if (typeof network !== 'string' || !NETWORK_IDS.has(network)) return { error: 'INVALID_NETWORK' }
  if (body?.action !== 'set' && body?.action !== 'remove') return { error: 'INVALID_ACTION' }
  if (body.action === 'remove') return { network, remove: true }
  const rule = NETWORK_RULES[network]
  if (network === 'whatsapp') {
    const typed = fold(body.number ?? body.url ?? body.handle)
    const u = httpUrl(typed)
    if (u && onHost(u, rule.hosts)) {
      const linked = whatsappLinkOf(u.pathname.replace(/^\/+/, '') || u.searchParams.get('phone') || '')
      return linked ? { network, url: linked } : { error: 'INVALID_PHONE' }
    }
    const url = whatsappLinkOf(typed)
    return url ? { network, url } : { error: 'INVALID_PHONE' }
  }
  let label = null
  if (network === 'other') {
    label = fold(body.label)
    if (!label || label.length > SOCIAL_LABEL_MAX) return { error: 'INVALID_LABEL' }
  }
  const typed = fold(body.url ?? body.handle)
  const u = httpUrl(typed)
  if (u)
    return onHost(u, rule.hosts)
      ? { network, url: u.toString(), ...(label ? { label } : {}) }
      : { error: 'INVALID_URL' }
  const handle = rule.handle && HANDLE.exec(typed)
  if (handle) return { network, url: rule.handle(handle[1]) }
  return { error: 'INVALID_URL' }
}

/** The stored map after one read link (pure). */
export function nextSiteSocials(held, link, at = new Date().toISOString()) {
  const out = isObj(held) ? { ...held } : {}
  if (link.remove) delete out[link.network]
  else out[link.network] = { url: link.url, ...(link.label ? { label: link.label } : {}), at }
  return out
}

/** `{[network]: url}` of the owner's links, as the brief merges them over the researched ones. */
export function siteSocialsOf(held) {
  const out = {}
  for (const [network, v] of Object.entries(isObj(held) ? held : {}))
    if (NETWORK_IDS.has(network) && typeof v?.url === 'string' && httpUrl(v.url)) out[network] = v.url
  return out
}

/** The label the site shows for an `other` link, or null. */
export const otherSocialLabelOf = (held) => (typeof held?.other?.label === 'string' ? held.other.label : null)

// ---------- team (R14) ----------

export const TEAM_LABEL_MAX = 80
export const TEAM_ROLE_MAX = 60
/** The most people an owner can add; a team page names far fewer. */
export const TEAM_ADDED_MAX = 30
const MEMBER_ID = /^[a-z]{2}_[a-z0-9]{1,40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One team edit from a body `{action, id?, label?, role?, photoMediaId?}`, or `{error}` (`INVALID_ACTION`,
 * `INVALID_MEMBER`, `INVALID_LABEL`, `INVALID_ROLE`, `INVALID_PHOTO`). `role` "" or null and `photoMediaId` null clear.
 */
export function readTeamEdit(body) {
  const action = body?.action
  if (!['add', 'update', 'remove'].includes(action)) return { error: 'INVALID_ACTION' }
  const out = { action }
  if (action !== 'add') {
    if (typeof body.id !== 'string' || !MEMBER_ID.test(body.id)) return { error: 'INVALID_MEMBER' }
    out.id = body.id
  }
  if (action === 'remove') return out
  if (body.label !== undefined || action === 'add') {
    const label = fold(body.label)
    if (!label || label.length > TEAM_LABEL_MAX) return { error: 'INVALID_LABEL' }
    out.label = label
  }
  if (body.role !== undefined) {
    if (body.role !== null && typeof body.role !== 'string') return { error: 'INVALID_ROLE' }
    const role = fold(body.role)
    if (role.length > TEAM_ROLE_MAX) return { error: 'INVALID_ROLE' }
    out.role = role || null
  }
  if (body.photoMediaId !== undefined) {
    if (
      body.photoMediaId !== null &&
      !(typeof body.photoMediaId === 'string' && UUID.test(body.photoMediaId))
    )
      return { error: 'INVALID_PHOTO' }
    out.photoMediaId = body.photoMediaId
  }
  if (action === 'update' && !['label', 'role', 'photoMediaId'].some((k) => k in out))
    return { error: 'INVALID_ACTION' }
  return out
}

const editsOf = (held) => ({
  added: Array.isArray(held?.added) ? held.added.filter((m) => isObj(m) && MEMBER_ID.test(m.id ?? '')) : [],
  changed: isObj(held?.changed) ? held.changed : {}
})

/**
 * The stored edits after one (pure): `{teamEdits, member}`, or `{error}`: `TOO_MANY_MEMBERS`, `MEMBER_NOT_FOUND` (an
 * id neither added by the owner nor in `researchIds`). `newId` names an added member. `remove` of a researched member
 * clears its changes and answers `removeFromReading: true`: the reading picks take it off (`readingPicks.removed`).
 */
export function nextTeamEdits(held, edit, { researchIds = [], newId = null } = {}) {
  const { added, changed } = editsOf(held)
  if (edit.action === 'add') {
    if (added.length >= TEAM_ADDED_MAX) return { error: 'TOO_MANY_MEMBERS' }
    const member = {
      id: newId,
      label: edit.label,
      role: edit.role ?? null,
      photoMediaId: edit.photoMediaId ?? null
    }
    return { teamEdits: { added: [...added, member], changed }, member }
  }
  const at = added.findIndex((m) => m.id === edit.id)
  const researched = at < 0 && researchIds.includes(edit.id)
  if (at < 0 && !researched) return { error: 'MEMBER_NOT_FOUND' }
  if (edit.action === 'remove') {
    if (at >= 0) return { teamEdits: { added: added.filter((_, n) => n !== at), changed }, member: null }
    const { [edit.id]: _gone, ...rest } = changed
    return { teamEdits: { added, changed: rest }, member: null, removeFromReading: true }
  }
  const patch = Object.fromEntries(
    ['label', 'role', 'photoMediaId'].filter((k) => k in edit).map((k) => [k, edit[k]])
  )
  if (at >= 0) {
    const member = { ...added[at], ...patch }
    return { teamEdits: { added: added.map((m, n) => (n === at ? member : m)), changed }, member }
  }
  const next = { ...changed[edit.id], ...patch }
  for (const k of Object.keys(next)) if (next[k] === null && k !== 'role') delete next[k]
  return { teamEdits: { added, changed: { ...changed, [edit.id]: next } }, member: { id: edit.id, ...next } }
}

/** Every media id the owner gave a team member as their photo. */
export function teamPhotoIdsOf(held) {
  const { added, changed } = editsOf(held)
  return new Set(
    [...added.map((m) => m.photoMediaId), ...Object.values(changed).map((c) => c?.photoMediaId)].filter(
      (id) => typeof id === 'string'
    )
  )
}

export const EMPTY_READING = {
  method: 'owner',
  services: [],
  audience: [],
  team: [],
  story: [],
  serviceAreas: [],
  facts: [],
  keyMessages: []
}

/**
 * A reading with the owner's team edits laid on (pure): a researched person keeps their id, takes the owner's label,
 * role and photo (`researchLabel` keeps the read label their fact is matched on), and the people the owner added follow,
 * each `{id, label, role?, source: {kind: 'owner'}, owner: true, reviewsOnly: false, photoMediaId?}`. A reading of
 * `method: 'owner'` stands for none, when research read no reading but the owner added people. Null stays null without
 * added people.
 */
export function withTeamEdits(reading, held) {
  const { added, changed } = editsOf(held)
  if (!reading && !added.length) return reading ?? null
  const base = reading ?? EMPTY_READING
  const team = (Array.isArray(base.team) ? base.team : []).map((p) => {
    const c = changed[p.id]
    if (!isObj(c)) return p
    const out = { ...p, researchLabel: p.label }
    if (typeof c.label === 'string' && c.label) out.label = c.label
    if ('role' in c) {
      if (c.role) out.role = c.role
      else delete out.role
    }
    if (typeof c.photoMediaId === 'string') out.photoMediaId = c.photoMediaId
    return out
  })
  for (const m of added)
    team.push({
      id: m.id,
      label: m.label,
      ...(m.role ? { role: m.role } : {}),
      source: { kind: 'owner' },
      owner: true,
      reviewsOnly: false,
      ...(typeof m.photoMediaId === 'string' ? { photoMediaId: m.photoMediaId } : {})
    })
  return { ...base, team }
}

// ---------- hides and band switches (R16) ----------

/** The bands of the Profile an owner can switch off, as fact ids `band_<band>` of `factOverrides`. */
export const BANDS = Object.freeze(['brand', 'keyMessages', 'reviews', 'media', 'socials'])
export const bandFactId = (band) => `band_${band}`

/** `{brand, keyMessages, reviews, media, socials}`: false only for a band the owner switched off. */
export function bandsOf(factOverrides) {
  const held = isObj(factOverrides) ? factOverrides : {}
  return Object.fromEntries(BANDS.map((b) => [b, held[bandFactId(b)]?.onSite !== false]))
}

const REVIEW_KEY = /^[A-Za-z0-9_.:-]{1,200}$/
/** Whether a string can be a review key (`reviewKeyOf`). */
export const isReviewKey = (key) => typeof key === 'string' && REVIEW_KEY.test(key)

/**
 * A review's stable key (pure): its own `id` when the source gave a usable one (Tripadvisor, Google Maps), else
 * `rv_<hash>` of its author, time and text (Google Places gives no id). The Details answer carries it as `key`.
 */
export function reviewKeyOf(review) {
  if (isReviewKey(review?.id)) return review.id
  const text = `${review?.author ?? ''}\n${review?.publishTime ?? review?.publishedAt ?? ''}\n${review?.text ?? ''}`
  let h = 2166136261
  for (const c of text) {
    h ^= c.codePointAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  return `rv_${h.toString(36)}`
}

/** A hidden list after one switch (pure): `hidden` true adds the key, false takes it out. */
export function nextHidden(held, key, hidden) {
  const list = new Set(Array.isArray(held?.hidden) ? held.hidden.filter((k) => typeof k === 'string') : [])
  if (hidden) list.add(key)
  else list.delete(key)
  return { hidden: [...list] }
}

export const hiddenSetOf = (picks) =>
  new Set(Array.isArray(picks?.hidden) ? picks.hidden.filter((k) => typeof k === 'string') : [])

/**
 * A profile whose review sites (`profile.reviewSources`) hold only the reviews the site may quote (pure): none with the
 * Reviews band off, and none the owner hid (`reviewPicks`). The brief's review sites are made from it.
 */
export function profileWithReviewPicks(profile, candidate) {
  const groups = profile?.reviewSources
  if (!isObj(groups)) return profile
  const on = bandsOf(candidate?.factOverrides).reviews
  const hidden = hiddenSetOf(candidate?.reviewPicks)
  if (on && !hidden.size) return profile
  const keep = (r) => on && !hidden.has(reviewKeyOf(r))
  return {
    ...profile,
    reviewSources: Object.fromEntries(
      Object.entries(groups).map(([k, g]) => [
        k,
        isObj(g) && Array.isArray(g.reviews) ? { ...g, reviews: g.reviews.filter(keep) } : g
      ])
    )
  }
}

/**
 * A profile as the Details answer shows it (pure): each review of Google (`googlePlace.reviews`) and of the review sites
 * (`reviewSources.*.reviews`) with its `key` (`reviewKeyOf`) and `ownerHidden` (the owner kept it off the site).
 */
export function withReviewKeys(profile, candidate) {
  if (!isObj(profile)) return profile
  const hidden = hiddenSetOf(candidate?.reviewPicks)
  const mark = (list) =>
    Array.isArray(list)
      ? list.map((r) =>
          isObj(r) ? { ...r, key: reviewKeyOf(r), ownerHidden: hidden.has(reviewKeyOf(r)) } : r
        )
      : list
  const out = { ...profile }
  if (isObj(profile.googlePlace) && Array.isArray(profile.googlePlace.reviews))
    out.googlePlace = { ...profile.googlePlace, reviews: mark(profile.googlePlace.reviews) }
  if (isObj(profile.reviewSources))
    out.reviewSources = Object.fromEntries(
      Object.entries(profile.reviewSources).map(([k, g]) => [
        k,
        isObj(g) && Array.isArray(g.reviews) ? { ...g, reviews: mark(g.reviews) } : g
      ])
    )
  return out
}
