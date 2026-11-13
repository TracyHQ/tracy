/**
 * Who calls a build draft door (#603, #609): a signed-in browser (`tracy_sess`), or the dsh tool `tracy_build` acting
 * for the person who typed (`x-tracy-actor`, dsh's short-lived signed assertion, `lib/actor.js`) in that person's
 * build session (`x-tracy-session`). A session header that is not the caller's own build session is refused, so an
 * assertion minted for one conversation cannot act on the draft from another.
 */
import { verifyActor } from '../lib/actor.js'
import { viewer } from '../lib/http.js'

/**
 * @param {import('hono').Context} c
 * @param {{config: {sessionSecret: string, actorSecret?: string}, buildSessionIdOf: (email: string) => Promise<string>}} deps
 * @returns {Promise<{email: string} | {refusal: 'NOT_SIGNED_IN' | 'NOT_BUILD_SESSION'}>}
 */
export async function callerOf(c, { config, buildSessionIdOf }) {
  const actor = config.actorSecret
    ? await verifyActor(c.req.header('x-tracy-actor'), config.actorSecret)
    : null
  const email = (actor ?? (await viewer(c, config)))?.toLowerCase()
  if (!email) return { refusal: 'NOT_SIGNED_IN' }
  const session = c.req.header('x-tracy-session')
  if ((actor || session) && session !== (await buildSessionIdOf(email)))
    return { refusal: 'NOT_BUILD_SESSION' }
  return { email }
}
