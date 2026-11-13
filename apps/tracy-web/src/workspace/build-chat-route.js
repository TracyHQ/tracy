/**
 * `GET /new/build` — open the signed-in viewer's build chat (TracyHQ/tracy#602).
 *
 * Asks the seat door for the account's build session (`build-chat-session.js`) and sends the browser to it,
 * `/new/s/<id>`, in the viewer's own creation workspace. Every way in lands here: a signed-in
 * account with no site (the root landing, `workspace/route.js`) and Add site's "Build it in the
 * chat" for an account that already has sites. Those sites are never read or touched: the build
 * chat lives in the creation workspace, under the creation seat.
 *
 * Nothing breaks the old ways in: with the operator's switch off, or when the door cannot provide
 * the session, the viewer lands on `/new/`, the creation workspace exactly as before (its Help chat
 * and the Add site form).
 *
 * A GET because it is a navigation; it is safe to repeat: the same account always gets the same
 * session, and the door creates nothing new for an ID it already holds.
 */
import { Hono } from 'hono'

import { viewer } from '../lib/http.js'
import { onboardingGrant, ONBOARDING_MOUNT } from './scope.js'
import {
  BUILD_AGENT_PRESET,
  BUILD_CHAT_PATH,
  BUILD_CHAT_SWITCH,
  buildSessionIdFor
} from './build-chat-session.js'

/** Where a viewer goes when the build chat cannot open: the creation workspace as it always was. */
const AS_BEFORE = `${ONBOARDING_MOUNT}/`

/**
 * @param {object} deps
 * @param {{sessionSecret: string, onboardingHome: string}} deps.config
 * @param {() => Promise<readonly string[]>} deps.hiddenSwitches - the operator's switches that are off
 * @param {(payload: object) => Promise<{sessionId?: string, workspaceId?: string} | null>} deps.allocate -
 *   the signed seat door's `/gateway/seat/session`, answering its `nativeSession`
 * @param {{warn: (...args: unknown[]) => void}} [deps.log]
 */
export function buildChatRoutes({ config, hiddenSwitches, allocate, log = console }) {
  const app = new Hono()
  app.get(BUILD_CHAT_PATH, async (c) => {
    c.header('cache-control', 'no-store')
    const email = await viewer(c, config)
    if (!email) return c.redirect(`/login?next=${encodeURIComponent(BUILD_CHAT_PATH)}`, 302)
    let hidden = []
    try {
      hidden = await hiddenSwitches()
    } catch (error) {
      // An unreadable switch table keeps the old landing: the new chat opens only when it is known to be on.
      log.warn('[build-chat] switches unreadable', error instanceof Error ? error.message : error)
      return c.redirect(AS_BEFORE, 302)
    }
    if (hidden.includes(BUILD_CHAT_SWITCH)) return c.redirect(AS_BEFORE, 302)
    const sessionId = await buildSessionIdFor(email, config.sessionSecret)
    try {
      const made = await allocate({
        ...onboardingGrant(email, config),
        nativeSession: { sessionId, agentPreset: BUILD_AGENT_PRESET }
      })
      if (made?.sessionId !== sessionId || typeof made.workspaceId !== 'string' || !made.workspaceId)
        throw new Error('BUILD_CHAT_SESSION_UNAVAILABLE')
    } catch (error) {
      log.warn('[build-chat] session unavailable', error instanceof Error ? error.message : error)
      return c.redirect(AS_BEFORE, 302)
    }
    return c.redirect(`${ONBOARDING_MOUNT}/s/${sessionId}`, 302)
  })
  return app
}
