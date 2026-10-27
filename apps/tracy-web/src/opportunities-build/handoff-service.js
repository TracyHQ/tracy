/**
 * One hand-off for the manual door and the durable demo worker: prepare, hold a chat, baseline, prompt.
 * 🔒 Every caller holds the build's hand-off lock (`withHandoffLock`): the door's press (`route.js`), the
 * durable worker (`demo-runner.js`) and the QA sweep's baseline read (`demo-qa.js`) never run it twice at once.
 */
import { HANDOFF_JUDGED, handOff, promptHandoff } from './handoff.js'
import { qaShape, startDemoQa } from './demo-qa.js'
import { saveHandoff, siteRowOf } from './build-store.js'
import { QUALITY_PROTOCOL } from './quality-protocol.js'

export async function handOffToAgent({
  pool,
  request,
  objects,
  domain,
  origin,
  cookie,
  build,
  revision,
  email,
  sessionAhead,
  sessionId: requestedSession,
  demoQa,
  prompt,
  prepareDemoContact,
  readNativeInventory,
  now = Date.now
}) {
  if (revision.brief?.editorial?.protocol === QUALITY_PROTOCOL)
    return {
      status: 409,
      body: {
        code: 'QUALITY_FINITE_WORK_ONLY',
        next: 'Continue this demo through its editorial action and review.'
      }
    }
  // The row as it is now, under the lock: an earlier press may have just recorded its chat and its prompt.
  build = (await pool.query('select * from wo_build where id = $1', [build.id])).rows[0] ?? build
  if (build.content?.agentDemo?.clientChat?.chatMode === 'client-send/1')
    return {
      status: 409,
      body: { code: 'DEMO_CLIENT_SEND_ONLY', next: 'Continue through the user message in this demo chat.' }
    }
  if (build.qa?.state === 'failed')
    return {
      status: 409,
      body: {
        code: 'QA_NEEDS_REVIEW',
        next: 'Use Retry in My opportunities to accept a new QA action on this same site.'
      }
    }
  if (build.qa?.state === 'passed' && build.handoff?.promptSent)
    return {
      status: 200,
      body: {
        handoff: build.handoff,
        qa: qaShape(build.qa),
        site: { key: build.site_key },
        next: `/${encodeURIComponent(build.site_key)}/s/${encodeURIComponent(build.qa.sessionId)}`
      }
    }
  const result = await handOff({
    pool,
    request,
    objects,
    domain,
    origin,
    cookie,
    build,
    revision,
    readNativeInventory,
    email,
    prepareContact: prepareDemoContact
      ? async () => prepareDemoContact({ site: await siteRowOf(pool, build.site_key), build, revision })
      : null
  })
  if (result.status >= 300 || !result.body.site?.key) return result
  // The QA gate already judged this demo (`handOff` answered its verdict): its chat, nothing sent again.
  if (HANDOFF_JUDGED.includes(result.body.handoff?.state)) {
    const judged = build.qa?.sessionId ?? build.handoff?.sessionId ?? null
    result.body.qa = qaShape(build.qa)
    if (judged) result.body.next = `/${encodeURIComponent(build.site_key)}/s/${encodeURIComponent(judged)}`
    return result
  }
  const site = await siteRowOf(pool, result.body.site.key)
  const held = build.qa?.sessionId ?? build.handoff?.sessionId ?? requestedSession ?? `wo-demo-${build.id}`
  // Reconcile even a receipted ID: after a native restart an unused chat must be loaded back
  // into its workspace before the seat-filtered baseline can authorize its first prompt.
  let sessionId = site && sessionAhead ? await sessionAhead(site, email, held).catch(() => null) : null
  if (!sessionId) return refusal('HANDOFF_SESSION_FAILED', 'Try again: the site’s chat could not be created.')
  const handoff = result.body.handoff
  // Persist the chosen session before any further external effect. Session creation itself is
  // idempotent on `held`; a process dying before this receipt adopts the same chat.
  handoff.sessionId = sessionId
  await saveHandoff(pool, build.id, handoff)
  if (!site || !demoQa)
    return refusal('HANDOFF_QA_UNAVAILABLE', 'Try again when the site check is available.')
  const qa = await startDemoQa({ pool, build, revision, site, sessionId, email, demoQa, now })
  result.body.qa = qaShape(qa)
  // The QA's chat is THE chat: the prompt and the page both go there.
  if (typeof qa?.sessionId === 'string' && qa.sessionId !== sessionId) {
    sessionId = qa.sessionId
    handoff.sessionId = sessionId
    await pool.query(
      `update wo_build set handoff = jsonb_set(handoff, '{sessionId}', to_jsonb($2::text)) where id = $1`,
      [build.id, sessionId]
    )
  }
  // A site that could never be read is the gate's verdict already: a person looks, nothing is sent.
  if (qa?.state === 'failed')
    return {
      status: 409,
      body: {
        code: 'QA_NEEDS_REVIEW',
        next: 'Use Retry in My opportunities to accept a new QA action on this same site.',
        qa: qaShape(qa)
      }
    }
  // No trustworthy baseline yet: the prompt is held. The QA sweep reads again (`takeDueBaselines`) and sends
  // it once one holds; a later press reads it again too.
  if (!qa?.baseline)
    return {
      status: 503,
      body: {
        code: 'HANDOFF_BASELINE_FAILED',
        next: 'Try again: the site check could not read the initial site. It is read again in the background, and the prompt goes out once it can be.',
        qa: qaShape(qa)
      }
    }
  if (handoff.promptSent?.sessionId !== sessionId) {
    const sent = await promptHandoff({
      pool,
      prompt,
      site,
      email,
      buildId: build.id,
      sessionId,
      text: handoff.prompt,
      now
    })
    if (!sent)
      return refusal(
        'HANDOFF_PROMPT_FAILED',
        'Try again: the prompt has not been accepted by the site’s chat.'
      )
    handoff.promptSent = sent
  }
  result.body.next = `/${encodeURIComponent(site.site_key)}/s/${encodeURIComponent(sessionId)}`
  return result
}

function refusal(code, next) {
  return { status: 503, body: { code, next } }
}
