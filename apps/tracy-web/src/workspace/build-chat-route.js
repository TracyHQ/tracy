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
 * A GET because it is a navigation; it is safe to repeat: the same account gets the same session
 * while its build is in progress, and the door creates nothing new for an ID it already holds. A
 * build that stopped for good gives way first (`freshIfStopped`, `build-draft/fresh-start.js`): the
 * account moves to its next build generation and lands in a new, empty conversation.
 *
 * `GET /new/build/start-over` asks the owner in plain words before a fresh start; its form posts to
 * `POST /new/build/start-over`, which starts over (`startOver`) and sends the browser to `/new/build`
 * (a new conversation), or shows why it cannot (a site built, a build running, a step working).
 */
import { Hono } from 'hono'

import { viewer } from '../lib/http.js'
import { requestLanguage, translator } from '../lib/i18n/index.js'
import { onboardingGrant, ONBOARDING_MOUNT } from './scope.js'
import { startOverConfirmPage, startOverRefusedPage } from './start-over-page.js'
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
 * @param {(email: string) => Promise<number>} [deps.generationOf] - the account's build generation (server side)
 * @param {(email: string) => Promise<unknown>} [deps.freshIfStopped] - moves a build stopped for good to the next
 *   generation before the session is derived
 * @param {{startOver: (email: string) => Promise<{generation?: number, error?: string, say?: string}>,
 *   confirmSay: string}} [deps.fresh] - the owner's start over; absent, the start over doors answer 404
 * @param {{warn: (...args: unknown[]) => void}} [deps.log]
 */
export function buildChatRoutes({
  config,
  hiddenSwitches,
  allocate,
  generationOf = async () => 0,
  freshIfStopped = async () => false,
  fresh = null,
  log = console
}) {
  const app = new Hono()
  const START_OVER = `${BUILD_CHAT_PATH}/start-over`
  if (fresh) {
    app.get(START_OVER, async (c) => {
      c.header('cache-control', 'no-store')
      const email = await viewer(c, config)
      if (!email) return c.redirect(`/login?next=${encodeURIComponent(START_OVER)}`, 302)
      return c.html(
        startOverConfirmPage({ action: START_OVER, back: BUILD_CHAT_PATH, t: translator(requestLanguage(c)) })
      )
    })
    app.post(START_OVER, async (c) => {
      c.header('cache-control', 'no-store')
      const email = await viewer(c, config)
      if (!email) return c.redirect(`/login?next=${encodeURIComponent(START_OVER)}`, 303)
      const moved = await fresh.startOver(email)
      if (moved.error)
        return c.html(
          startOverRefusedPage({
            error: moved.error,
            say: moved.say ?? '',
            back: BUILD_CHAT_PATH,
            t: translator(requestLanguage(c))
          }),
          409
        )
      return c.redirect(BUILD_CHAT_PATH, 303)
    })
  }
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
    let generation = 0
    try {
      await freshIfStopped(email)
      generation = await generationOf(email)
    } catch (error) {
      // An unreadable generation keeps the old landing: never a guess at which conversation is the current one.
      log.warn('[build-chat] generation unreadable', error instanceof Error ? error.message : error)
      return c.redirect(AS_BEFORE, 302)
    }
    const sessionId = await buildSessionIdFor(email, config.sessionSecret, generation)
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
