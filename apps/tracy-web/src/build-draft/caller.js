/**
 * Who calls a build draft door (#603, #609): a signed-in browser (`tracy_sess`), or the dsh tool `tracy_build` acting
 * for the person who typed (`x-tracy-actor`, dsh's short-lived signed assertion, `lib/actor.js`) in that person's
 * build session (`x-tracy-session`). A session header that is not the caller's own build session is refused, so an
 * assertion minted for one conversation cannot act on the draft from another.
 */
import { verifyActor } from '../lib/actor.js'
import { viewer } from '../lib/http.js'
import { matchLanguage } from '../lib/i18n/index.js'

/**
 * The header that tells the tool the interface language of the person it acts for (#609): the language Tracy's
 * interface speaks to them (`account.language`, written at sign in and from the Settings pick, ADR 0026 §5), one of
 * the eight interface languages. Absent when the account has none stored: the tool then knows no language.
 */
export const INTERFACE_LANGUAGE_HEADER = 'x-tracy-interface-language'

/** The stored interface language of an account, as one of the eight ids, or null. */
export async function interfaceLanguageOf(pool, email) {
  const { rows } = await pool.query(
    'select language from account where lower(email) = lower($1) order by (email = $1) desc, created_at limit 1',
    [email]
  )
  return matchLanguage(rows[0]?.language ?? null)
}

/**
 * @param {import('hono').Context} c
 * @param {{config: {sessionSecret: string, actorSecret?: string}, buildSessionIdOf: (email: string) => Promise<string>,
 *   pool?: import('pg').Pool}} deps `pool`: when given, an answer to the tool (an actor call) carries the caller's
 *   interface language (`INTERFACE_LANGUAGE_HEADER`)
 * @returns {Promise<{email: string} | {refusal: 'NOT_SIGNED_IN' | 'NOT_BUILD_SESSION'}>}
 */
export async function callerOf(c, { config, buildSessionIdOf, pool }) {
  const actor = config.actorSecret
    ? await verifyActor(c.req.header('x-tracy-actor'), config.actorSecret)
    : null
  const email = (actor ?? (await viewer(c, config)))?.toLowerCase()
  if (!email) return { refusal: 'NOT_SIGNED_IN' }
  const session = c.req.header('x-tracy-session')
  if ((actor || session) && session !== (await buildSessionIdOf(email)))
    return { refusal: 'NOT_BUILD_SESSION' }
  // The tool speaks for the owner and cannot see their screen: it reads the interface language from here.
  if (actor && pool) {
    const language = await interfaceLanguageOf(pool, email).catch(() => null)
    if (language) c.header(INTERFACE_LANGUAGE_HEADER, language)
  }
  return { email }
}
