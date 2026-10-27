/** Read-only outreach drafts. Tracy never sends a message or records a sent state. */
import { whatsappLinkOf } from '../domain/business-phones.mjs'
import { placeViewOf } from './place-view.js'
import { messageLanguage } from './message-language.js'
import { DEMO_TEMPLATES as TEMPLATES } from './plugins/outreach.js'
import { requireHost } from './host.js'
const fill = (text, values) => text.replace(/\{(place|url|expires)\}/g, (_, key) => values[key] ?? '')

export function outreachMessage({ place, url, expiresAt, signature, language }) {
  const render = (lang) => {
    const t = TEMPLATES[lang] ?? TEMPLATES.en
    const expires =
      expiresAt && Number.isFinite(Date.parse(expiresAt))
        ? new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(expiresAt))
        : null
    return [t.greeting, t.body, expires ? t.expiry : t.kept]
      .map((s) => fill(s, { place, url, expires }))
      .join('\n\n')
  }
  const local = language !== 'en' && TEMPLATES[language] ? render(language) : null
  const english = render('en')
  const signed = (text) => (signature ? `${text}\n\n${signature}` : text)
  return {
    auto: signed(local ? `${local}\n\n${english}` : english),
    local: local ? signed(local) : null,
    english: signed(english),
    subject: fill((TEMPLATES[language] ?? TEMPLATES.en).subject, { place })
  }
}

const CHAT_HOSTS = {
  whatsapp: ['wa.me', 'api.whatsapp.com', 'whatsapp.com'],
  zalo: ['zalo.me'],
  messenger: ['m.me', 'messenger.com', 'facebook.com'],
  instagram: ['instagram.com', 'ig.me'],
  line: ['line.me']
}

export function outreachContacts(candidate = {}, siteCheck = {}) {
  const contacts = []
  const phone = String(candidate.phone ?? '').trim()
  if (phone) contacts.push({ channel: 'phone', value: phone, url: `tel:${phone.replace(/[^\d+]/g, '')}` })
  const emails = [candidate.email, ...(Array.isArray(siteCheck?.emails) ? siteCheck.emails : [])].filter(
    (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  )
  for (const email of new Set(emails))
    contacts.push({ channel: 'email', value: email, url: `mailto:${email}` })
  for (const [channel, hosts] of Object.entries(CHAT_HOSTS)) {
    let value =
      candidate.contacts?.[channel] ?? (channel === 'instagram' ? candidate.socials?.instagram : null)
    if (typeof value !== 'string' || !value.trim()) continue
    value = value.trim()
    if (['zalo', 'whatsapp'].includes(channel) && /^\+?[\d\s()-]+$/.test(value))
      value = channel === 'zalo' ? `https://zalo.me/${value.replace(/\D/g, '')}` : whatsappLinkOf(value)
    let u
    try {
      u = new URL(value)
    } catch {
      continue
    }
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      !hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
    )
      continue
    const shown = ['zalo', 'whatsapp'].includes(channel)
      ? u.searchParams.get('phone')?.replace(/[^\d+]/g, '') || u.pathname.slice(1)
      : `@${u.pathname.split('/').filter(Boolean).at(-1) ?? u.hostname}`
    contacts.push({ channel, value: shown, url: u.href })
  }
  return contacts
}

/**
 * Ready demos read the same shared snapshot + private overlay as Details and revision; no provider call.
 * The signature is `host.displayNameOf` of the principal.
 */
export async function withOutreach(pool, accountId, rows, host) {
  const { displayNameOf } = requireHost(host, ['displayNameOf'])
  const ready = rows.filter(
    (r) => r.demo?.qa === 'passed' && r.demo.url && !r.demo.deletedAt && !r.demo.frozenAt
  )
  if (!ready.length) return rows.map((r) => ({ ...r, outreach: null }))
  const ids = ready.map((r) => r.id)
  const [displayName, profiles, sources, opportunities] = await Promise.all([
    displayNameOf(pool, accountId),
    pool.query(
      'select p.opportunity_id, p.profile from wo_profile p join wo_opportunity o on o.id=p.opportunity_id where o.account_id=$1 and p.opportunity_id=any($2::uuid[])',
      [accountId, ids]
    ),
    pool.query(
      "select s.opportunity_id,s.collected->'posts' as posts from wo_source s join wo_opportunity o on o.id=s.opportunity_id where o.account_id=$1 and s.opportunity_id=any($2::uuid[]) and s.status in ('complete','partial')",
      [accountId, ids]
    ),
    pool.query('select * from wo_opportunity where account_id=$1 and id=any($2::uuid[])', [accountId, ids])
  ])
  const profileById = new Map(profiles.rows.map((r) => [r.opportunity_id, r.profile]))
  const postsById = new Map()
  for (const s of sources.rows)
    postsById.set(s.opportunity_id, [
      ...(postsById.get(s.opportunity_id) ?? []),
      ...(Array.isArray(s.posts) ? s.posts : [])
    ])
  await Promise.all(
    opportunities.rows.map(async (opportunity) => {
      const view = await placeViewOf(pool, opportunity)
      if (!view) return
      profileById.set(opportunity.id, view.profile)
      postsById.set(
        opportunity.id,
        view.sources
          .filter((source) => ['complete', 'partial'].includes(source.status))
          .flatMap((source) => (Array.isArray(source.collected?.posts) ? source.collected.posts : []))
      )
    })
  )
  const signature = displayName?.trim() ?? ''
  const owned = new Set(opportunities.rows.map((r) => r.id))
  const drafts = new Map(
    ready
      .filter((r) => owned.has(r.id))
      .map((row) => {
        const language = messageLanguage({
          posts: postsById.get(row.id) ?? [],
          candidate: row.candidate ?? {},
          profile: profileById.get(row.id) ?? {}
        })
        return [
          row.id,
          {
            contacts: outreachContacts(
              {
                ...profileById.get(row.id),
                ...row.candidate,
                phone: row.candidate?.phone || profileById.get(row.id)?.phone,
                socials: { ...profileById.get(row.id)?.socials, ...row.candidate?.socials }
              },
              row.siteCheck
            ),
            messageLanguage: language,
            url: row.demo.url,
            expiresAt: row.demo.expiresAt ?? null,
            message: outreachMessage({
              place: row.name,
              url: row.demo.url,
              expiresAt: row.demo.expiresAt,
              signature,
              language: language.language
            })
          }
        ]
      })
  )
  return rows.map((r) => ({ ...r, outreach: drafts.get(r.id) ?? null }))
}
