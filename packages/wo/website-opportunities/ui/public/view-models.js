// Pure view models: server answers in, what the screen shows out. No DOM, no fetch, no clock read.
import { t } from './strings.js'

const GRADES = new Set(['A', 'B', 'C'])
const TONE_OF_GRADE = { A: 'high', B: 'medium', C: 'low' }

const points = (p) => (p === null || p === undefined ? t('score.unknownPoints') : p > 0 ? `+${p}` : String(p))

function scoreReasonText([key, , params = {}]) {
  if (key === 'marketing.lastPost')
    return t('score.marketing.lastPost', { days: Math.floor(params.days ?? 0) })
  const text = t(`score.${key}`, params)
  return text === `score.${key}` ? t('score.other') : text
}

/** The opportunity score (`domain/opportunity-score.mjs`) as a badge and its reasons. */
export function scoreView(score) {
  if (!score || typeof score !== 'object' || !GRADES.has(score.grade) || !Number.isFinite(score.score))
    return { label: t('score.notScored'), tone: 'unknown', pending: false, reasons: [] }
  const reasons = (Array.isArray(score.reasons) ? score.reasons : [])
    .filter((r) => Array.isArray(r) && typeof r[0] === 'string')
    .map((r) => ({ text: scoreReasonText(r), points: points(r[1]) }))
  if (score.pending === true) return { label: t('score.checking'), tone: 'pending', pending: true, reasons }
  return {
    label: `${score.grade} · ${score.score}`,
    tone: TONE_OF_GRADE[score.grade],
    pending: false,
    reasons
  }
}

const PLACE_STATUSES = new Set(['new', 'seen', 'researched', 'demo'])

/** Where a found place stands for this person: new, saved, researched or with a demo. */
export function placeStatus(status) {
  const key = PLACE_STATUSES.has(status) ? status : 'new'
  return { key, label: t(`status.${key}`) }
}

const JOB_STATES = new Set(['queued', 'running', 'paused', 'blocked', 'failed', 'cancelled', 'completed'])
const MOVING = new Set(['queued', 'running'])
const STOPPED = new Set(['paused', 'blocked', 'failed'])
// The executor's steps in order (`src/executor.js`); `done` is the last one finishing.
const RESEARCH_STEPS = ['discovery', 'collection', 'media', 'profile', 'brand']
const KNOWN_REASONS = new Set([
  'credential_missing',
  'login_required',
  'rate_limited',
  'not_found',
  'timeout',
  'quota',
  'url_blocked',
  'feature_off',
  'store_unavailable'
])

/** A reason code (`QUOTA`, `not_found`…) in words; null when there is none, "Not available" when it is new. */
export function reasonText(code) {
  if (typeof code !== 'string' || code === '') return null
  const lower = code.toLowerCase()
  return t(KNOWN_REASONS.has(lower) ? `reason.${lower}` : 'reason.other')
}

/**
 * A research job as the place profile shows it: a label, a detail line, a tone, whether to poll,
 * and the actions that make sense now (`start`, `cancel`, `again`).
 */
export function jobView(job) {
  if (!job || typeof job !== 'object')
    return { label: t('research.none'), detail: null, tone: 'neutral', moving: false, actions: ['start'] }
  const state = JOB_STATES.has(job.state) ? job.state : 'queued'
  const label = t(`job.state.${state}`)
  if (MOVING.has(state)) {
    let detail = null
    if (state === 'running') {
      const index = RESEARCH_STEPS.indexOf(job.stage)
      const step = job.stage === 'done' ? RESEARCH_STEPS.length : Math.max(0, index) + 1
      detail = t('research.step', {
        step,
        steps: RESEARCH_STEPS.length,
        stage: t(`job.stage.${RESEARCH_STEPS[step - 1]}`)
      })
    }
    return { label, detail, tone: 'busy', moving: true, actions: job.id ? ['cancel'] : [] }
  }
  if (STOPPED.has(state)) {
    const error = job.lastError ?? job.last_error
    return {
      label,
      detail: reasonText(error?.reason) ?? reasonText(error?.code),
      tone: state === 'paused' ? 'warn' : 'bad',
      moving: false,
      actions: ['again']
    }
  }
  return {
    label,
    detail: null,
    tone: state === 'completed' ? 'ok' : 'neutral',
    moving: false,
    actions: ['again']
  }
}

const SOURCE_TONE = { complete: 'ok', partial: 'warn', blocked: 'bad', failed: 'bad', skipped: 'neutral' }

/** One row of a place's Sources table. Partial, blocked and failed never read as complete. */
export function sourceRow(input) {
  const status = Object.hasOwn(SOURCE_TONE, input?.status ?? '') ? input.status : 'waiting'
  const nameKey = `source.${input?.source}`
  const name = t(nameKey)
  const fetched = input?.coverage?.fetched
  const total = input?.coverage?.total
  return {
    name: name === nameKey ? String(input?.source ?? '') : name,
    status: t(`source.status.${status}`),
    tone: SOURCE_TONE[status] ?? 'neutral',
    reason: reasonText(input?.reason),
    coverage: Number.isFinite(fetched)
      ? Number.isFinite(total)
        ? t('source.coverage', { fetched, total })
        : t('source.coverageOpen', { fetched })
      : null
  }
}

// From `src/outreach.js` (CHAT_HOSTS): the hosts a chat link may point at.
const CHAT_HOSTS = {
  whatsapp: ['wa.me', 'api.whatsapp.com', 'whatsapp.com'],
  zalo: ['zalo.me'],
  messenger: ['m.me', 'messenger.com', 'facebook.com'],
  instagram: ['instagram.com', 'ig.me'],
  line: ['line.me']
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const onHost = (u, hosts) => hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))

function httpsUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && !u.username && !u.password ? u : null
  } catch {
    return null
  }
}

/** Copied from `src/outreach.js` outreachContacts: phone, emails and chat links a place publishes. */
function contactsOf(candidate = {}, siteCheck = {}) {
  const contacts = []
  const phone = String(candidate.phone ?? '').trim()
  if (phone) contacts.push({ channel: 'phone', value: phone, url: `tel:${phone.replace(/[^\d+]/g, '')}` })
  const emails = [candidate.email, ...(Array.isArray(siteCheck?.emails) ? siteCheck.emails : [])].filter(
    (e) => typeof e === 'string' && EMAIL.test(e)
  )
  for (const email of new Set(emails))
    contacts.push({ channel: 'email', value: email, url: `mailto:${email}` })
  for (const [channel, hosts] of Object.entries(CHAT_HOSTS)) {
    let value =
      candidate.contacts?.[channel] ?? (channel === 'instagram' ? candidate.socials?.instagram : null)
    if (typeof value !== 'string' || !value.trim()) continue
    value = value.trim()
    if (['zalo', 'whatsapp'].includes(channel) && /^\+?[\d\s()-]+$/.test(value))
      value = `https://${channel === 'zalo' ? 'zalo.me' : 'wa.me'}/${value.replace(/\D/g, '')}`
    const u = httpsUrl(value)
    if (!u || !onHost(u, hosts)) continue
    const shown = ['zalo', 'whatsapp'].includes(channel)
      ? u.searchParams.get('phone')?.replace(/[^\d+]/g, '') || u.pathname.slice(1)
      : `@${u.pathname.split('/').filter(Boolean).at(-1) ?? u.hostname}`
    contacts.push({ channel, value: shown, url: u.href })
  }
  return contacts
}

/** A link that opens a filled-in draft for the channel; null when the contact is not safe to open. Nothing is sent. */
function draftHref(contact, subject, message) {
  if (contact.channel === 'phone') return contact.url?.startsWith('tel:') ? contact.url : null
  if (contact.channel === 'email')
    return EMAIL.test(contact.value)
      ? `mailto:${encodeURIComponent(contact.value)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
      : null
  const u = httpsUrl(contact.url)
  if (!u || !CHAT_HOSTS[contact.channel] || !onHost(u, CHAT_HOSTS[contact.channel])) return null
  if (contact.channel === 'whatsapp') {
    const phone = u.pathname.replace(/\D/g, '') || u.searchParams.get('phone')?.replace(/\D/g, '') || ''
    return phone ? `https://wa.me/${phone}?${new URLSearchParams({ text: message })}` : null
  }
  return u.href
}

/**
 * The outreach preview: contact channels and an English draft carrying `demoUrl` (or a visible
 * placeholder). A draft the server already wrote (`GET …/:id/outreach`, a built demo) wins.
 */
export function outreachPreview({
  name,
  candidate = {},
  siteCheck = null,
  profile = null,
  demoUrl = '',
  server = null
}) {
  const place = String(name ?? '')
  let subject
  let message
  let contacts
  if (server?.message && typeof server.message === 'object') {
    subject = String(server.message.subject ?? '')
    message = String(server.message.auto ?? server.message.english ?? '')
    contacts = Array.isArray(server.contacts) ? server.contacts : []
  } else {
    const url = httpsUrl(String(demoUrl ?? '').trim())?.href ?? t('outreach.urlMissing')
    subject = t('outreach.subjectLine', { place })
    message = [
      t('outreach.greeting', { place }),
      t('outreach.body', { place, url }),
      t('outreach.closing')
    ].join('\n\n')
    contacts = contactsOf(
      {
        ...profile,
        ...candidate,
        phone: candidate?.phone || profile?.phone,
        socials: { ...profile?.socials, ...candidate?.socials }
      },
      siteCheck ?? {}
    )
  }
  return {
    subject,
    message,
    contacts: contacts
      .map((c) => ({
        channel: t(`outreach.channel.${c.channel}`),
        value: String(c.value ?? ''),
        draftHref: draftHref(c, subject, message)
      }))
      .filter((c) => c.draftHref)
  }
}

const NETWORKS = ['facebook', 'instagram', 'tiktok', 'youtube']
const DAY_MS = 86_400_000
const numberText = (n) => new Intl.NumberFormat('en').format(n)

/** "4 days ago" style, in whole days; "today" under a day. */
function daysAgo(iso, now) {
  const at = typeof iso === 'string' ? Date.parse(iso) : Number.NaN
  if (!Number.isFinite(at)) return null
  const days = Math.max(0, Math.floor((now - at) / DAY_MS))
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-days, 'day')
}

/** A place's social page numbers (`social` of a listed row), one row per network in a fixed order. */
export function socialView(social, now) {
  if (!social || typeof social !== 'object') return []
  return NETWORKS.filter((n) => social[n] && typeof social[n] === 'object').map((n) => {
    const s = social[n]
    const facts = []
    if (Number.isFinite(s.followers)) facts.push(t('social.followers', { count: numberText(s.followers) }))
    const when = daysAgo(s.lastPostAt, now)
    facts.push(when ? t('social.lastPost', { when }) : t('social.noPosts'))
    if (Number.isFinite(s.postsPerMonth))
      facts.push(t('social.perMonth', { count: numberText(s.postsPerMonth) }))
    return { network: t(`social.network.${n}`), url: httpsUrl(s.url)?.href ?? null, facts }
  })
}

const partName = (part) => (part === 'logo' ? 'Logo' : sourceRow({ source: part }).name)
const money = (cents) =>
  new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(cents / 100)

/** `GET …/:id/research-again` as a confirm dialog: what runs and why, what is kept, the most it costs. */
export function againView(answer) {
  const plan = answer?.plan ?? {}
  const run = (plan.run ?? []).map((r) => ({ name: partName(r.part), why: t(`again.run.${r.reason}`) }))
  const kept = (plan.kept ?? []).map((k) => ({ name: partName(k.part), why: t(`again.kept.${k.reason}`) }))
  const perDay = answer?.limit?.perDay
  const left = Number.isFinite(perDay) ? Math.max(0, perDay - (answer.limit.usedToday ?? 0)) : null
  return {
    run,
    kept,
    ceiling: run.length
      ? t('research.again.ceiling', { total: money(plan.ceilingCents ?? 0) })
      : t('research.again.nothing'),
    left: left === null ? null : t('research.again.left', { count: left }),
    canRun: run.length > 0 && left !== 0
  }
}

/** A profile field as text: a plain string, or the `{value, sources}` shape research stores. */
const text = (v) =>
  typeof v === 'string' && v.trim()
    ? v.trim()
    : v && typeof v === 'object' && typeof v.value === 'string' && v.value.trim()
      ? v.value.trim()
      : null
const texts = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean) : [])

/**
 * The brief the manual builder hands over: the builder's own text when the server sent one, else a
 * Markdown summary of what research found. Research data is untrusted, so the brief says so.
 */
export function briefText({ opportunity = {}, profile = null, sources = [], brief = null }) {
  if (typeof brief?.text === 'string' && brief.text.trim()) return brief.text
  const c = opportunity.candidate ?? {}
  const p = profile ?? {}
  const lines = [`# ${text(opportunity.name) ?? text(c.name) ?? ''}`, '', `## ${t('build.heading.business')}`]
  const add = (key, value) => value && lines.push(`- ${t(key, { value })}`)
  add('build.line.name', text(opportunity.name) ?? text(c.name))
  add('build.line.category', text(c.category) ?? text(p.category))
  add('build.line.address', text(c.address) ?? text(p.address))
  if (Number.isFinite(c.rating) && Number.isFinite(c.reviews))
    lines.push(`- ${t('build.line.rating', { rating: c.rating, reviews: c.reviews })}`)
  lines.push('', `## ${t('build.heading.contact')}`)
  add('build.line.phone', text(c.phone) ?? text(p.phone))
  add('build.line.email', text(c.email) ?? text(p.email))
  lines.push('', `## ${t('build.heading.presence')}`)
  const website = text(c.website) ?? text(p.website)
  lines.push(`- ${website ? t('build.line.website', { value: website }) : t('build.line.noWebsite')}`)
  const socials = { ...p.socials, ...c.socials }
  for (const n of NETWORKS)
    if (text(socials[n]))
      lines.push(
        `- ${t('build.line.social', { network: t(`social.network.${n}`), value: socials[n].trim() })}`
      )
  const cuisine = texts(p.cuisine)
  if (cuisine.length) lines.push(`- ${t('build.line.cuisine', { value: cuisine.join(', ') })}`)
  const hours = texts(p.hours)
  if (hours.length) lines.push(`- ${t('build.line.hours', { value: hours.join('; ') })}`)
  const about = text(p.bio)
  if (about) lines.push('', `## ${t('build.heading.about')}`, about)
  const read = sources.filter((s) => ['complete', 'partial'].includes(s?.status) && text(s.ref))
  if (read.length) {
    lines.push('', `## ${t('build.heading.sources')}`)
    for (const s of read) lines.push(`- ${sourceRow(s).name}: ${s.ref}`)
  }
  lines.push('', `> ${t('build.untrusted')}`)
  return `${lines.join('\n')}\n`
}

/** The stored photographs worth showing, in the server's order, at most `max`. */
export function photoList(media, max = 12) {
  return (Array.isArray(media) ? media : [])
    .filter((m) => m && m.kind === 'image' && m.status === 'stored' && !m.hidden && typeof m.id === 'string')
    .slice(0, max)
    .map((m) => ({ id: m.id, width: m.width ?? null, height: m.height ?? null }))
}

/** The site-checks door takes at most this many addresses a call (`SITE_CHECK_URLS_MAX` in `src/route.js`). */
export const SITE_CHECK_BATCH = 60

/** Websites whose score still waits for a site check, each once: what a page asks `POST …/site-checks` for. */
export function websitesToCheck(rows, batch = SITE_CHECK_BATCH) {
  const urls = new Set()
  for (const row of rows)
    if (row?.score?.pending === true && typeof row.website === 'string' && row.website) urls.add(row.website)
  return [...urls].slice(0, batch)
}

/** The Find "Kind of business" choices: Any first, then each kind the server can search (`capabilities.trades`). */
export function findKindChoices(capabilities) {
  const trades = Array.isArray(capabilities?.trades)
    ? capabilities.trades.filter((k) => typeof k === 'string')
    : []
  if (trades.length === 0) return []
  return [
    { value: 'any', label: t('find.kind.any') },
    ...trades.map((value) => ({ value, label: t(`find.kind.${value}`) }))
  ]
}

/** The POST /search body of the Find form: a kind narrows an area search only. */
export function findSearchBody({ mode, query, lat, lon, radiusKm, kind = 'any' }) {
  const radiusM = radiusKm * 1000
  if (mode === 'name') return { query, intent: 'place', radiusM }
  const where = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : { query }
  return { ...where, radiusM, ...(kind && kind !== 'any' ? { trade: kind } : {}) }
}
