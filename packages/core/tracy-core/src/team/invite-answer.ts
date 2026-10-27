/**
 * What the invite door answered, read whole or not at all — the half of the invite wizard that
 * talks to `POST /api/team/invite { emails, role, siteKeys }`.
 *
 * Only an answer the wizard can read whole reaches the last step. A request that was dropped, a
 * server error or a reply that does not cover what was sent is reported as UNKNOWN: the seat book
 * may have written some of it, so the wizard neither draws it as sent nor says nothing changed.
 */
import { inviteRefusalKey } from './refusals'

export const OUTCOMES = ['invited', 'approved', 'already_granted', 'refused'] as const
export type Outcome = (typeof OUTCOMES)[number]
export interface SentResult {
  email: string
  notified: boolean
  sites: { siteKey: string; outcome: Outcome; code?: string }[]
  /**
   * The accept link of this person's invitation mail, given to the inviter only (spam hints D2):
   * a way through when the mail lands in Spam. Absent when no link was minted.
   */
  inviteUrl?: string
}

/** An http(s) address, else undefined: a link the Done step may copy, never anything else. */
function linkOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/**
 * Why a send did not reach the last step.
 * - `refused`: the door said no to the whole request before writing anything (a 4xx).
 * - `notSiteOwner` / `notAuthorized`: the same, with the reason the seat book names.
 * - `rateLimited` / `signedOut`: the same, and the reader can do something about it.
 * - `unknown`: no answer, a server error, or an answer that cannot be read whole. Some of the
 *   invitation may have been written.
 */
export type Failure = 'refused' | 'notSiteOwner' | 'notAuthorized' | 'rateLimited' | 'signedOut' | 'unknown'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Every code the door puts on a refused site: the `refusalFor` names (no seat, or a Viewer, who
 * invites nobody under ADR 0028), the approval a role may not give, and the request to join that
 * was gone by the time it was approved. A refusal always carries one; nothing else ever does.
 */
const REFUSAL_CODES = ['NOT_SITE_OWNER', 'NOT_SITE_EDITOR', 'SEAT_NOT_AUTHORIZED', 'GRANT_UNKNOWN'] as const

/**
 * The door's 200 answer, or null when it does not account for exactly what was sent: one result
 * per address, each naming every site once with an outcome the wizard knows, in the shape the
 * door writes it. A partial, unreadable or self-contradicting answer must never be drawn as a
 * list of invitations.
 * @param body - the parsed reply.
 * @param emails - the addresses sent.
 * @param siteKeys - the sites sent.
 */
export function readResults(
  body: unknown,
  emails: readonly string[],
  siteKeys: readonly string[]
): SentResult[] | null {
  if (!isRecord(body) || !Array.isArray(body.results)) return null
  const fold = (value: string): string => value.trim().toLowerCase()
  const wantedEmails = new Set(emails.map(fold))
  const wantedSites = new Set(siteKeys.map(fold))
  if (body.results.length !== wantedEmails.size) return null
  const seenEmails = new Set<string>()
  const results: SentResult[] = []
  for (const result of body.results) {
    if (!isRecord(result) || typeof result.email !== 'string' || typeof result.notified !== 'boolean')
      return null
    const email = fold(result.email)
    if (!wantedEmails.has(email) || seenEmails.has(email)) return null
    seenEmails.add(email)
    if (!Array.isArray(result.sites) || result.sites.length !== wantedSites.size) return null
    const seenSites = new Set<string>()
    const sites: SentResult['sites'] = []
    for (const site of result.sites) {
      if (!isRecord(site) || typeof site.siteKey !== 'string') return null
      const key = fold(site.siteKey)
      if (!wantedSites.has(key) || seenSites.has(key)) return null
      seenSites.add(key)
      const outcome = OUTCOMES.find((known) => known === site.outcome)
      if (outcome === undefined) return null
      // The outcome and the code are read as the pair the door writes: a row that says both
      // "invited" and "refused for this reason", or refuses without a reason, says nothing.
      if (outcome === 'refused') {
        const code = REFUSAL_CODES.find((known) => known === site.code)
        if (code === undefined) return null
        sites.push({ siteKey: site.siteKey, outcome, code })
      } else {
        if (site.code !== undefined) return null
        sites.push({ siteKey: site.siteKey, outcome })
      }
    }
    // The mail carries the seats this send recorded, so one that went out with none is no answer.
    const recorded = sites.some((s) => s.outcome === 'invited' || s.outcome === 'approved')
    if (result.notified && !recorded) return null
    // The link is an extra: one that is missing or not an address leaves the answer whole.
    const inviteUrl = linkOf(result.inviteUrl)
    results.push({
      email: result.email,
      notified: result.notified,
      sites,
      ...(inviteUrl ? { inviteUrl } : {})
    })
  }
  return results
}

/**
 * The sites a send wrote a seat on, each once, in the order sent: every site some address was
 * `invited` or `approved` on — never one refused, nor one where the seat was there already. An
 * answer the wizard could not read (`unknown`) may have written any of them, so it names them all;
 * a refusal of the whole request wrote none.
 * @param answer - the read answer, or why there is none.
 * @param siteKeys - the sites sent.
 */
export function writtenSites(answer: readonly SentResult[] | Failure, siteKeys: readonly string[]): string[] {
  if (answer === 'unknown') return [...new Set(siteKeys)]
  if (typeof answer === 'string') return []
  // Matched as `readResults` matches them: the door may echo a key in another case.
  const fold = (value: string): string => value.trim().toLowerCase()
  const written = new Set(
    answer.flatMap((r) =>
      r.sites.filter((s) => s.outcome === 'invited' || s.outcome === 'approved').map((s) => fold(s.siteKey))
    )
  )
  return siteKeys.filter((key, i) => written.has(fold(key)) && siteKeys.indexOf(key) === i)
}

/**
 * What a refusal of the whole request means. A code is read ONLY on the status its door sends it
 * with (#796): a 5xx is a door that failed, possibly after writing some seats, whatever its body
 * names, and `RATE_LIMITED` on a 400 is not the door's own answer.
 * @param res - a reply that is not 2xx.
 */
export async function failureOf(res: Response): Promise<Failure> {
  // Every 4xx of this door is answered before it writes. A 5xx may have stopped half-way.
  if (res.status < 400 || res.status >= 500) return 'unknown'
  if (res.status === 401) return 'signedOut'
  if (res.status === 429) return 'rateLimited'
  if (res.status !== 403) return 'refused'
  let code: unknown
  try {
    const body: unknown = await res.json()
    code = isRecord(body) ? body.code : undefined
  } catch {
    code = undefined
  }
  if (code === 'NOT_SITE_OWNER') return 'notSiteOwner'
  if (code === 'SEAT_NOT_AUTHORIZED') return 'notAuthorized'
  return 'refused'
}

export const FAILURE_KEY: Record<Failure, string> = {
  refused: 'wizard.failed',
  notSiteOwner: 'outcome.next.notSiteOwner',
  notAuthorized: 'outcome.next.notAuthorized',
  rateLimited: 'error.rateLimited',
  signedOut: 'state.signedOut',
  unknown: 'wizard.unknown'
}

/** What to do about a site's refusal, for the four codes the door puts on a refused site. */
export const nextStepKey = (code: string | undefined): string | null => inviteRefusalKey(code)
