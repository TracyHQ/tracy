/**
 * Starting a build from a process nobody has open.
 *
 * 🔒 WHY THIS EXISTS AT ALL. The Build form reports `creating`, then POLLS the provision, and only
 * when that poll says `done` does it call the plugin's `start` door — the one call that carries
 * the customer's answers into the site. That poll lives in a promise owned by the page, so a
 * reload, a navigation or a workspace switch loses it: the chat's to-do list freezes at the last
 * step it managed to report, and the build is never started. Nothing errors. Measured 22/09/2026
 * on three sites built through Design inspiration, one per CMS, all three left wearing the
 * template's demo content with `docs/agents/build/` absent.
 *
 * 🔒 AND WHY IT GOES THROUGH THE SEAT DOOR RATHER THAN A NEW SECRET. dsh's `start` route answers a
 * browser holding a seat session; `sessionMadeAhead` already showed this process can mint one of
 * those and speak to dsh as the owner. Inventing a second way in would be a second thing to get
 * right, and the one that is already there is the one the customer's own browser uses.
 *
 * ⚠ A BUILD IS OWNED BY A CHAT SESSION (`ownerSessionId` in the plugin's job), so this NAMES the
 * session the claim made ahead rather than making a second one. A build started under a session
 * nobody is looking at would run, finish, and report into a conversation the customer never opens.
 */
import { dshRpc } from './dsh-rpc.js'

/** The plugin that serves a platform's Build doors — the `name` its client spec declares. */
export function buildPluginFor(platform) {
  return platform === 'wordpress' || platform === 'joomla' || platform === 'emdash'
    ? `tracy-site-build-${platform}`
    : null
}

/**
 * Ask dsh to start the build for a site whose provision has finished.
 *
 * @param {object} input
 * @param {{dshOrigin: string, seatSecret: string}} input.host - the site's dsh and its seat door.
 * @param {string} input.siteKey
 * @param {string} input.label
 * @param {string} input.platform
 * @param {string} input.email - the owner the seat is minted for.
 * @param {string} input.sessionId - the chat session the build belongs to.
 * @param {{id: string, answers?: object, targetUrl?: string, designPlan?: object}} input.press
 * @param {string | null} [input.targetUrl] - the address the site row records. It WINS over the
 *   press's own, because the press is written before the fleet has answered with one.
 * @param {{mintSeatSession: Function}} input.seatDoor
 * @param {typeof fetch} [input.fetchImpl]
 * @returns {Promise<{ok: true} | {ok: false, reason: string}>}
 */
export async function startBuildAtDoor({
  host,
  siteKey,
  label,
  platform,
  email,
  sessionId,
  press,
  targetUrl,
  seatDoor,
  fetchImpl = fetch
}) {
  const plugin = buildPluginFor(platform)
  if (!plugin) return { ok: false, reason: `no Build plugin serves platform "${platform}"` }
  if (!host?.dshOrigin || !host?.seatSecret)
    return { ok: false, reason: 'this host has no seat door configured' }
  if (typeof sessionId !== 'string' || sessionId === '')
    return { ok: false, reason: 'the press recorded no chat session to build in' }
  if (typeof press?.id !== 'string' || press.id === '')
    return { ok: false, reason: 'the press recorded no inspiration' }

  let token
  try {
    token = await seatDoor.mintSeatSession({
      origin: host.dshOrigin,
      secret: host.seatSecret,
      grant: { email, role: 'owner', label, siteKey },
      fetchImpl
    })
  } catch (error) {
    return {
      ok: false,
      reason: `seat door did not answer: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  if (typeof token !== 'string' || token === '')
    return { ok: false, reason: 'the seat door minted no session' }

  const mount = `/${siteKey}`
  const at = (rest) =>
    `${host.dshOrigin}${mount}/api/${plugin}/${rest}${rest.includes('?') ? '&' : '?'}session=${encodeURIComponent(sessionId)}`
  const headers = {
    'content-type': 'application/json',
    cookie: `dsh_gateway_token=${token}`,
    'x-forwarded-prefix': mount
  }

  let res
  try {
    res = await fetchImpl(at('start'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: press.id,
        platform,
        ...(press.answers ? { answers: press.answers } : {}),
        // The questionnaire the form was served. Sent so the door judges these answers with the
        // same evaluator the form used, and writes the set's identity into `brief.json` — a build
        // finished without a browser must be able to say which questions it answers.
        ...(press.questionnaire ? { questionnaire: press.questionnaire } : {}),
        targetSiteKey: siteKey,
        // 🔒 THE SITE ROW'S ADDRESS FIRST, AND WITHOUT IT AN EMDASH BUILD CANNOT START. The press
        // is written the moment the customer submits — BEFORE the fleet has answered with an
        // address — so it carries none, and a sweep that forwarded only the press started builds
        // with no site named. EmDash's first stage refuses exactly that: "This build names no site
        // address. Start it from the Build tab, which makes one." Measured 23/09/2026 on
        // `site-g5dm6x`: `check` failed, `personalize` never ran, and the site stayed 100% demo
        // content — 21 mentions of the demo brand and not one word of the customer's.
        ...(targetUrl || press.targetUrl ? { targetUrl: targetUrl || press.targetUrl } : {}),
        ...(press.designPlan ? { designPlan: press.designPlan } : {})
      }),
      signal: AbortSignal.timeout(15_000)
    })
  } catch (error) {
    return {
      ok: false,
      reason: `build door did not answer: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, reason: `build door answered ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}` }
  }

  // 🔒 THE LIST THE CUSTOMER IS LOOKING AT IS STILL WRONG UNTIL SOMEBODY SAYS SO. The to-do list is
  // a session event, written once by whoever last reported a step — so a press that died mid-poll
  // leaves it reading `fetching webroot` for a site that finished minutes ago, and starting the
  // build does not touch it. One more call, best-effort: a repaint is not worth failing a build
  // that has already started.
  try {
    await fetchImpl(at('provision'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ step: 'complete' }),
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    // The build is running; a stale list is the smaller wrong.
  }
  return { ok: true }
}

export { dshRpc }
