/**
 * `POST /api/build-draft/build/handoff` (#611): a done build's chat moves to the new site. The build chat asks once the
 * outcome is done, with the conversation as it was said; this opens a chat on the site ahead of time
 * (`openSiteChat`, over `lib/site-session-ahead.js`), queues ONE first message carrying that conversation and the
 * approved plan (`handoff.js`), and answers the address the screen moves to.
 *
 * 🔒 ONLY A DONE BUILD MOVES. A build still running, stopped or cancelled is refused (`BUILD_NOT_DONE`): the owner
 * stays in the build chat, which says what happened.
 *
 * 🔒 ONE CHAT, ONE FIRST MESSAGE. The chat made ahead is kept on the build before it is prompted, and the prompt's
 * request id is the build's own, so a retry after a lost answer prompts the same chat with the same id, and a hand off
 * already prompted is answered as it is. Two asks at once: the second waits for the first's claim
 * (`HANDOFF_OPENING`).
 */
import { heldTextsOfBuild, shownBuildNameOf, shownBuildPlanOf } from '../lib/draft-build.js'
import { claimHandoff, readBuild, saveHandoff } from './build-store.js'
import { conversationOf, conversationTooLong, handoffMessageOf, handoffNextOf } from './handoff.js'

/**
 * How long opening the site chat, and then prompting it, may each take (#611). Both together stay well inside the
 * claim (`HANDOFF_CLAIM_MS`), so a second ask is refused `HANDOFF_OPENING` for as long as the first one works.
 */
export const HANDOFF_CALL_MS = 60_000

/** `call(signal)`, or `late` once `ms` passed (and the signal aborted). */
async function withinTime(ms, late, call) {
  const ctl = new AbortController()
  let timer
  const out = new Promise((resolve) => {
    timer = setTimeout(() => {
      ctl.abort()
      resolve(late)
    }, ms)
  })
  try {
    return await Promise.race([call(ctl.signal), out])
  } finally {
    clearTimeout(timer)
  }
}

/** The address a build's hand off moved the screen to, or null before it was prompted. */
export const handoffNextOfBuild = (build) =>
  build?.handoff?.promptedAt && build.site?.siteKey && build.handoff.sessionId
    ? handoffNextOf(build.site.siteKey, build.handoff.sessionId)
    : null

/**
 * @param {{pool: import('pg').Pool, accountId: string | null, email: string, body: unknown,
 *   openSiteChat?: (input: {siteKey: string, email: string}) => Promise<string | null>,
 *   promptSiteChat?: (input: {siteKey: string, email: string, sessionId: string, requestId: string, text: string})
 *     => Promise<boolean>, now?: () => number}} input
 * @returns {Promise<{refusal: string} | {next: string}>}
 */
export async function handOffBuild({
  pool,
  accountId,
  email,
  body,
  openSiteChat,
  promptSiteChat,
  now = Date.now
}) {
  const conversation = conversationOf(/** @type {any} */ (body)?.conversation)
  if (conversation === null) return { refusal: 'INVALID_REQUEST' }
  if (conversationTooLong(conversation)) return { refusal: 'CONVERSATION_TOO_LONG' }
  const build = accountId ? await readBuild(pool, accountId) : null
  const siteKey = build?.site?.siteKey
  if (!build?.endedAt || build.result !== 'done' || !siteKey) return { refusal: 'BUILD_NOT_DONE' }
  if (!openSiteChat || !promptSiteChat) return { refusal: 'HANDOFF_UNAVAILABLE' }
  const claimed = await claimHandoff(pool, accountId, build.id, now)
  if (claimed.error)
    return { refusal: claimed.error === 'HANDOFF_OPENING' ? 'HANDOFF_OPENING' : 'BUILD_NOT_DONE' }
  if (claimed.done) return { next: handoffNextOf(siteKey, claimed.handoff.sessionId) }

  let sessionId = claimed.handoff.sessionId ?? null
  if (!sessionId) {
    sessionId = await withinTime(HANDOFF_CALL_MS, null, (signal) =>
      openSiteChat({ siteKey, email, signal })
    ).catch(() => null)
    if (typeof sessionId !== 'string' || sessionId === '') {
      await saveHandoff(pool, accountId, build.id, {}, { release: true })
      return { refusal: 'HANDOFF_SESSION_FAILED' }
    }
    // Kept before the prompt: a retry prompts this chat, never a second one.
    await saveHandoff(pool, accountId, build.id, { sessionId })
  }
  // What the site chat reads is the plan as the site may show it: never what the owner keeps off the site.
  const plan = shownBuildPlanOf(build.snapshot) ?? null
  // The conversation is the owner's own, carried as history; what they keep off the site is named to the agent.
  const text = handoffMessageOf({
    conversation,
    plan,
    siteKey,
    name: shownBuildNameOf(build.snapshot),
    keepOffSite: heldTextsOfBuild(build.snapshot)
  })
  const accepted = await withinTime(HANDOFF_CALL_MS, false, (signal) =>
    promptSiteChat({ siteKey, email, sessionId, requestId: `build-handoff:${build.id}`, text, signal })
  ).catch(() => false)
  if (accepted !== true) {
    await saveHandoff(pool, accountId, build.id, {}, { release: true })
    return { refusal: 'HANDOFF_PROMPT_FAILED' }
  }
  await saveHandoff(
    pool,
    accountId,
    build.id,
    { promptedAt: new Date(now()).toISOString() },
    { release: true }
  )
  return { next: handoffNextOf(siteKey, sessionId) }
}
