/**
 * What the assistant may know about the person asking, read fresh on every turn.
 *
 * 🔒 THE MODEL GETS NO TOOLS. The server reads the asker's own rows here, keeps an allowlist of
 * fields, and hands the result to the model as text. Nothing the model writes can widen that: it
 * never names an account, a site key or a query, so a prompt that talks it into "list every site"
 * finds nothing more to list. Prompt rules are a courtesy; this file is the boundary.
 *
 * 🔒 ACCEPTED SEATS ONLY. `sitesOfAccount` also returns invitations nobody answered and join
 * requests nobody approved (it computes a `status` for My Sites to draw them). Neither is a seat:
 * an invitation names a site the asker cannot open yet, and saying "your site X" about it would be
 * a claim the next click disproves. Pending items are counted, never described.
 *
 * ⚠ BRIEF FIELDS ARE WHAT THE CUSTOMER TYPED AT CREATION, not the state of their business, and they
 * are untrusted text: they reach the model inside a block the prompt marks as data. Contact fields
 * (phone, email, street address, hours) are left out: the assistant does not need them to explain
 * a site, and a model that has them can repeat them somewhere they do not belong.
 */

import { buildProgress, domainState, pendingWork, recentActivity, siteOrigin, teamOf } from './readers.js'

/** More than this and the context outgrows a cheap model's budget; the rest are counted. */
export const MAX_SITES = 30
/** One brief field, cut: a pasted essay must not crowd out the rest of the context. */
const FIELD_MAX = 400

/** @param {unknown} value */
function text(value) {
  if (typeof value !== 'string') return null
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean === '') return null
  return clean.length > FIELD_MAX ? `${clean.slice(0, FIELD_MAX)}…` : clean
}

/**
 * The allowlisted slice of one brief: what the site is about, never how to reach its owner.
 * @param {{normalized?: object | null, state?: string} | null} brief
 */
export function briefFacts(brief) {
  const n = brief?.normalized
  if (!n || typeof n !== 'object') return null
  const facts = {
    name: text(n.name),
    about: text(n.about),
    sector: text(n.sector),
    tone: text(n.tone),
    languages: Array.isArray(n.languages) ? n.languages.filter((l) => typeof l === 'string').slice(0, 10) : []
  }
  return Object.values(facts).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null)) ? facts : null
}

/**
 * @typedef {object} AskerSite
 * @property {string} siteKey - the immutable key; used for links, never shown as the name.
 * @property {string} name - what the asker sees the site called.
 * @property {string | null} platform - joomla | wordpress | emdash
 * @property {string} role - owner | editor | viewer
 * @property {string} publish - draft | published
 * @property {string | null} siteUrl
 * @property {string} workspaceUrl
 * @property {string | null} createdAt
 * @property {ReturnType<typeof briefFacts>} [brief] - only for the site on screen.
 */

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   accountByEmail: (pool: any, email: string) => Promise<{id: string, email: string, display_name: string | null} | null>,
 *   sitesOfAccount: (pool: any, accountId: string) => Promise<Array<{site_key: string, role: string, status: string}>>,
 *   siteByKey: (pool: any, siteKey: string) => Promise<object | null>,
 *   briefOf: (pool: any, siteKey: string) => Promise<object | null>,
 *   publicSiteFields: (site: object) => {displayName: string, siteUrl: string | null, workspaceUrl: string},
 *   canonicalSiteKey: (pool: any, name: string) => Promise<string>
 * }} readers
 * @param {{ email: string, currentSite?: string | null }} ask - `currentSite` is the site named by
 *   the page the asker is on: a HINT from the browser, honoured only when it is one of their seats.
 * @returns {Promise<{ account: {id: string, name: string | null, email: string}, sites: AskerSite[],
 *   moreSites: number, pending: number, current: AskerSite | null } | null>} null when the email has
 *   no account (a session for a person the book does not know).
 */
export async function readAskerContext(pool, readers, { email, currentSite = null }) {
  const account = await readers.accountByEmail(pool, email)
  if (!account) return null
  const seats = await readers.sitesOfAccount(pool, account.id)
  const accepted = seats.filter((s) => s.status === 'accepted')
  const pending = seats.length - accepted.length

  const sites = []
  for (const seat of accepted.slice(0, MAX_SITES)) {
    const row = await readers.siteByKey(pool, seat.site_key)
    if (!row) continue
    const pub = readers.publicSiteFields(row)
    sites.push({
      siteKey: row.site_key,
      name: pub.displayName,
      platform: typeof row.platform === 'string' ? row.platform : null,
      role: seat.role,
      publish: row.publish === 'published' ? 'published' : 'draft',
      siteUrl: pub.siteUrl ?? null,
      workspaceUrl: pub.workspaceUrl,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString().slice(0, 10) : null
    })
  }

  let current = null
  if (typeof currentSite === 'string' && currentSite !== '') {
    const key = await readers.canonicalSiteKey(pool, currentSite.toLowerCase())
    const mine = sites.find((s) => s.siteKey === key)
    if (mine) current = { ...mine, brief: briefFacts(await readers.briefOf(pool, mine.siteKey)) }
  }

  // The extra facts (plan 4b). Per-site readers run for the site on screen only, never in a loop
  // over every site, and a reader that fails leaves `{unavailable:true}` in its field.
  const facts = {
    builds: await buildProgress(pool, account.id),
    pending: await pendingWork(pool, account.id, current?.siteKey ?? null)
  }
  if (current) {
    const [activity, domain, origin, team] = await Promise.all([
      recentActivity(pool, current.siteKey),
      domainState(pool, current.siteKey),
      siteOrigin(pool, current.siteKey),
      teamOf(pool, current.siteKey, current.role)
    ])
    current.facts = { activity, domain, origin, team }
  }

  return {
    account: { id: account.id, name: text(account.display_name), email: account.email },
    sites,
    moreSites: Math.max(0, accepted.length - MAX_SITES),
    pending,
    current,
    facts
  }
}
