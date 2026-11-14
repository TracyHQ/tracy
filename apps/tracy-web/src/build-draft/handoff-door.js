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
import { claimHandoff, readBuild, saveHandoff } from './build-store.js'
import { conversationOf, handoffMessageOf, handoffNextOf } from './handoff.js'

/** The address a build's hand off moved the screen to, or null before it was prompted. */
export const handoffNextOfBuild = (build) =>
  build?.handoff?.promptedAt && build.site?.siteKey && build.handoff.sessionId
    ? handoffNextOf(build.site.siteKey, build.handoff.sessionId)
    : null

const nameOf = (plan) => {
  const name = (plan?.facts ?? []).find((f) => f?.kind === 'business.name')?.value
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null
}

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
    sessionId = await openSiteChat({ siteKey, email }).catch(() => null)
    if (typeof sessionId !== 'string' || sessionId === '') {
      await saveHandoff(pool, accountId, build.id, {}, { release: true })
      return { refusal: 'HANDOFF_SESSION_FAILED' }
    }
    // Kept before the prompt: a retry prompts this chat, never a second one.
    await saveHandoff(pool, accountId, build.id, { sessionId })
  }
  const plan = build.snapshot?.plan ?? null
  const text = handoffMessageOf({ conversation, plan, siteKey, name: nameOf(plan) })
  const accepted = await promptSiteChat({
    siteKey,
    email,
    sessionId,
    requestId: `build-handoff:${build.id}`,
    text
  }).catch(() => false)
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
