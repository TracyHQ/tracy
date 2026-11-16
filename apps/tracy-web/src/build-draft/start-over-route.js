/**
 * `POST /api/build-draft/start-over` (`fresh-start.js`): the owner's start over, for the build agent's tool
 * `tracy_build` (action `start-over`, acting for the person in their build session) and for a signed-in browser.
 * The body must say `{confirm: true}`: the tool sends it only after the owner confirmed in the chat.
 *
 * Answers `{started: true, open}` (`open`: where the new, empty conversation opens) or a refusal `{code, say}`:
 * `SITE_BUILT`, `BUILD_RUNNING`, `ENGINE_BUSY` (409), `NO_DRAFT` (404). The session the tool calls from must be the
 * account's current build session (`caller.js`), so an older conversation can never start the new one over.
 */
import { Hono } from 'hono'
import { json } from '../lib/http.js'
import { callerOf } from './caller.js'

const PATH = '/api/build-draft/start-over'
/** Where the new conversation opens (`workspace/build-chat-session.js` `BUILD_CHAT_PATH`). */
const OPEN = '/new/build'

/**
 * @param {object} deps
 * @param {{sessionSecret: string, actorSecret?: string}} deps.config
 * @param {import('pg').Pool} deps.pool
 * @param {(email: string) => Promise<string>} deps.buildSessionIdOf - the person's current build session id
 * @param {{startOver: (email: string) => Promise<{generation?: number, error?: string, say?: string}>,
 *   says: {done: string}}} deps.fresh - `fresh-start.js` `freshStart`
 */
export function startOverRoutes({ config, pool, buildSessionIdOf, fresh }) {
  const app = new Hono()
  app.post(PATH, async (c) => {
    c.header('cache-control', 'no-store')
    const caller = await callerOf(c, { config, buildSessionIdOf, pool })
    if (caller.refusal)
      return json(c, { code: caller.refusal }, caller.refusal === 'NOT_SIGNED_IN' ? 401 : 403)
    const body = await c.req.json().catch(() => null)
    if (body?.confirm !== true)
      return json(
        c,
        { code: 'INVALID_REQUEST', next: 'Send {"confirm": true} once the owner confirmed.' },
        400
      )
    const moved = await fresh.startOver(caller.email)
    if (moved.error)
      return json(c, { code: moved.error, say: moved.say }, moved.error === 'NO_DRAFT' ? 404 : 409)
    return json(c, { started: true, open: OPEN, say: fresh.says.done })
  })
  return app
}
