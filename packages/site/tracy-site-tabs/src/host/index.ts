/**
 * The Node half of `@tracy/dsh-site-tabs`: the moment the lane records when an agent turn ends.
 *
 * WHY IT EXISTS. The agent edits the webroot directly — the native lane mounts it read-write —
 * and the webroot's git lives on the fleet host, not in this container. What was missing was not
 * a way to write but a way to RECORD: one commit per turn, authored by the agent, titled with
 * what the person asked (04/09: "remember to wire up the agent's write door"). This plugin listens
 * for a root agent going idle, takes the last thing the person typed as the title, and asks
 * `cowork-web` to run the `webroot-moment` job. Nothing dirty on the webroot is a normal answer.
 *
 * 🔒 HOLDS NO SECRET OF THE FLEET. The container carries `MCP_TRACY_ACTOR_SECRET` for the seat
 * door, but a plugin that signs with it can impersonate anyone on any site (the secret is shared
 * across the fleet). Instead, like `tracy-add-site`, this half speaks to `cowork-web` AS THE
 * VIEWER: the client half pings `/api/tracy-site-tabs/hello` on every page load, the Worker in
 * front restates the viewer's session in `x-tracy-session`, and that is what the moment request
 * carries. No viewer seen yet (a lane just restarted, nobody has opened the page) → no moment,
 * one log line. The next look at Changes seals the edits as "outside Tracy", so nothing is lost,
 * only misattributed until then.
 *
 * ON THE HOST'S ONE dsh (ADR 0014) there is no site key and no viewer worth borrowing — that dsh
 * serves every site, so the last cookie it saw is anybody's. There the moment names the site folder
 * the session stands in and is signed as the person who typed the turn, by the password gate's
 * assertion service: the plugin still holds no secret (`moment.mjs`). And there it follows the CHAT
 * TURN, not the idle (since 02/10, plan `tasks/todo-site-changes.md` §6): the turn opens when the
 * person's message enters it and closes when it stops, each turn its own moment (`turn-record.mjs`).
 *
 * THE SECOND JOB, ADDED 16/09: answering `POST /api/tracy-site-tabs/turn`. The side card asks it
 * when a conversation goes idle, and the answer — did that turn change the site, and which site —
 * is what lets the Browser tab showing that site reload itself instead of waiting for the person to
 * press refresh (`turn.mjs` for the reading, `src/client/index.tsx` for what the page does with it).
 * The DECISION is here because only the session log can make it; the CHOICE OF TAB is in the page
 * because only the page knows its own layout.
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { whileWaiting } from '../../../../core/tracy-core/src/chat-wait/index.mjs'
import { BodyTooLarge, readJsonBody, writeJson } from './http.js'
import { hostDoorRequest, momentTitle } from './moment.mjs'
import { ratedTurn, ratingOf } from './rating.mjs'
import { createTurnBook, openMayNameUndone, withUndoneNotice } from './turn-record.mjs'
import { callMayWriteSite, sessionSiteKey, turnRefreshMode } from './turn.mjs'
import type { AgentLike, AssertionService, HostContext, SessionEventLike, WebRoute } from './types.js'

/** Stable cordis plugin name — must match the row in `cordis.patch.yml` (LAW #2). */
export const name = 'tracy-site-tabs'

/**
 * 🔒 Every `ctx.<name>` must be listed here. cordis throws the moment a property outside
 * `inject` is READ, so a missing name is not a warning but a dead plugin — dsh still boots, half
 * the interface is gone, no error, no log.
 */
export const inject = ['webServer', 'agents']

const PREFIX = '/api/tracy-site-tabs'

/** The viewer most recently seen at this lane, and where to call back. */
let viewer: { cookie: string; origin: string; at: number } | null = null

/**
 * One setting of the gateway, from `process.env` or else from the env file dsh was started with
 * (`DSH_PASSWORDS_ENV_FILE`): `dsh-passwords` loads the same file into `process.env` at import time,
 * but plugin load order is not ours to assume.
 */
function gatewaySetting(name: 'MCP_TRACY_SITE_KEY' | 'MCP_TRACY_ORIGIN'): string | null {
  const value = process.env[name]?.trim() || null
  if (value !== null) return value
  const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim()
  if (!file) return null
  try {
    const m = new RegExp(`^${name}=(.+)$`, 'm').exec(readFileSync(file, 'utf8'))
    return m ? m[1]!.trim().replace(/^["']|["']$/g, '') || null : null
  } catch {
    return null
  }
}

/** The site this lane serves (`MCP_TRACY_SITE_KEY`), read lazily and once; null on the host's dsh. */
let siteKey: string | null | undefined
function laneSiteKey(): string | null {
  return siteKey === undefined ? (siteKey = gatewaySetting('MCP_TRACY_SITE_KEY')) : siteKey
}

/** A lane's idle moment, sent as the lane's last viewer. */
async function recordLaneMoment(key: string, title: string): Promise<void> {
  if (viewer === null) {
    console.warn('[tracy-site-tabs] nobody has opened this lane yet; the moment is not recorded')
    return
  }
  const url = `${viewer.origin}/api/sites/${encodeURIComponent(key)}/moment`
  const headers = { 'content-type': 'application/json', accept: 'application/json', cookie: viewer.cookie }
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ title }) })
    if (!res.ok) console.warn(`[tracy-site-tabs] moment refused: ${res.status}`)
  } catch (error) {
    console.warn(
      `[tracy-site-tabs] moment not sent: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * One agent on a LANE (`MCP_TRACY_SITE_KEY` set): record a moment each time it goes idle after a new
 * prompt. The lane has no gate stamping who typed, so it keeps the idle moment it always had.
 */
function watchLane(key: string, agent: AgentLike): () => void {
  let recorded = -1
  return agent.ctx.on('agent/status', ({ status }) => {
    if (status !== 'idle') return
    const prompt = momentTitle(agent.session.snapshotEvents())
    if (prompt === null || prompt.index === recorded) return
    recorded = prompt.index
    void recordLaneMoment(key, prompt.title)
  })
}

/**
 * The chat-turn record of the host's one dsh (`turn-record.mjs`): a door call signed as the person
 * who typed, from the folder the session stands in. A session outside every site folder, or a dsh
 * that cannot sign, answers "nothing to record" without a call.
 */
function turnBookFor(ctx: HostContext): ReturnType<typeof createTurnBook> {
  return createTurnBook({
    send: async (door, body, who, signal) => {
      const request = await hostDoorRequest({
        door,
        cwd: who.cwd,
        email: who.email,
        origin: gatewaySetting('MCP_TRACY_ORIGIN'),
        signer: ctx.get?.('tracyAssertion') as AssertionService | undefined
      })
      if (!request.ok) {
        // Not a site's session (reason null): nothing to record, and nothing went wrong.
        if (request.reason === null) return { ok: true, status: 204 }
        throw new Error(request.reason)
      }
      const res = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(body),
        signal
      })
      // The open's answer names the turns undone since the last one (`undone`) and the earlier moments
      // still committing (`momentsPending`); the wait's says whether one has `ended`. Unreadable is none.
      const answer: unknown = res.ok ? await res.json().catch(() => null) : null
      return { ok: res.ok, status: res.status, body: answer }
    }
  })
}

/**
 * One root agent on the host's one dsh: open its turn when a person's message enters a step, close
 * it when the turn stops, sweep the ones that ended without stopping when it goes idle (plan
 * `tasks/todo-site-changes.md` §6). The close runs in `agent/turn-stopping`, which dsh runs serially
 * before the next turn begins — the turn's files are committed before the next turn's can mix in.
 * Both are bounded (`turn-record.mjs`).
 *
 * 🔒 THE SEAL WAITS FOR THE FIRST WRITE, NOT FOR THE FIRST STEP (09/10). The host seals what was dirty
 * before the turn, and that must land before the agent's first edit. Until 09/10 the step itself
 * waited for the open — up to 15 s before the model's first call on a WordPress or Joomla site
 * (harness profile, flow D: 15.7 s median from turn start to step 1, 3.1 s on EmDash). Now the open
 * starts and the step goes on; every call that may write the site (`callMayWriteSite`) waits in
 * `tools/pre-execute` until the open has been answered or its budget ran out (`writeReady`), and a
 * read runs beside the seal. The guarantee is the one the step gave: no write before the door's
 * answer or the 15 s budget, whichever comes first.
 *
 * The open's answer may name turns of this conversation the person undid from the chat since the
 * agent last spoke: one agent-only notice then goes right after the person's message, so the agent
 * does not read the reverted site as changed by nobody (`withUndoneNotice`). Any failure: no notice.
 * Only a later turn can have such turns (`openMayNameUndone`), so only a later turn's step still waits
 * for the list — read by `turn/undone` at once, not behind the seal (16/10/2026) — and the agent reads
 * exactly the messages it read before. A steer never names any.
 */
function watchHost(book: ReturnType<typeof createTurnBook>, agent: AgentLike): () => void {
  const sessionId = (): string => agent.session.id
  const stops = [
    agent.ctx.on('agent/pre-step', async (input, next) => {
      const decision = await next()
      if (decision.kind === 'reject') return decision
      const messages = decision.messages ?? input.messages
      try {
        const entered = book.enter({
          sessionId: sessionId(),
          turn: input.turn,
          messages,
          cwd: agent.session.header?.cwd
        })
        // Nothing this step could be told: the open runs on, and the first write waits for it.
        if (!entered.opens || !openMayNameUndone(input.turn)) return decision
        const undone = await entered.undone
        if (undone.length > 0 && Array.isArray(messages)) {
          const spliced = withUndoneNotice(messages, undone, randomUUID())
          if (spliced !== messages) return { ...decision, messages: spliced }
        }
      } catch (error) {
        console.warn(
          `[tracy-site-tabs] turn open failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      return decision
    }),
    agent.ctx.on('tools/pre-execute', async (exec, next) => {
      // Decided before `next()`, so every later listener (the path fence, a look's undo copy) and the
      // call itself come after the seal.
      // The wait for the previous request's changes to be saved is said under the chat (#1403 item 10).
      if (callMayWriteSite(exec))
        await whileWaiting(
          sessionId(),
          'previous',
          book.writeReady({ sessionId: sessionId(), signal: exec?.signal })
        )
      return next()
    }),
    agent.ctx.on('agent/turn-stopping', async ({ turn }) => {
      // The turn's last assistant message is already in the log: turn-stopping runs after its
      // final `step/end` (dsh `agent.ts`). Its text is the answer the close carries.
      await book.turnStopping({
        sessionId: sessionId(),
        turn,
        events: agent.session.snapshotEvents() as readonly { type?: string; data?: unknown }[]
      })
    }),
    agent.ctx.on('agent/status', ({ status }) => {
      if (status !== 'idle') return
      void book.idle({
        sessionId: sessionId(),
        events: agent.session.snapshotEvents() as readonly { type?: string; data?: unknown }[]
      })
    })
  ]
  return () => {
    for (const stop of stops) stop()
  }
}

/**
 * What the side card asks at the end of every turn: did the turn this session just finished change
 * the site, and which site is that.
 *
 * It names a session the asker already holds the id of — the page it is asked from is that session's
 * own — and says nothing about the change beyond that it happened. An unknown session, or one that
 * is not a root agent, answers "nothing changed": a subagent's turns end inside its parent's, and
 * the parent's idle is the moment the page reacts to.
 * @param ctx - the plugin context, for the live agent registry.
 * @param body - the request body; only `sessionId` is read.
 * @returns the answer sent back as JSON.
 */
async function turnAnswer(
  ctx: HostContext,
  body: Record<string, unknown>
): Promise<{ changed: boolean; siteKey: string | null; mode?: 'style' | 'full' }> {
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  const agent = sessionId === '' ? undefined : ctx.agents.roots().find((one) => one.session.id === sessionId)
  const mode = agent === undefined ? null : turnRefreshMode(agent.session.snapshotEvents())
  if (agent === undefined || mode === null) {
    return { changed: false, siteKey: null }
  }
  return {
    changed: true,
    // How cheaply the page may be brought up to date. An older side card ignores the field and
    // reloads, which is exactly what it did before — so this is additive in both directions.
    mode,
    siteKey: await sessionSiteKey({ cwd: agent.session.header?.cwd, laneSiteKey: laneSiteKey() })
  }
}

export function apply(ctx: HostContext): void {
  const route: WebRoute = {
    kind: 'prefix',
    path: PREFIX,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { code: 'METHOD_NOT_ALLOWED' })
        return
      }
      const path = (req.url ?? '').split('?')[0] ?? ''
      const step = path.slice(PREFIX.length).replace(/^\/+/, '')
      if (step !== 'hello' && step !== 'turn') {
        writeJson(res, 404, { code: 'UNKNOWN_STEP' })
        return
      }
      // Cookie and origin come FROM THE REQUEST, never from the body. Behind the lane's gateway
      // neither survives the hop, so the Worker in front restates both in headers it passes
      // through: `x-forwarded-host` / `x-forwarded-proto`, and `x-tracy-session` (measured
      // 2026-09-04 by tracy-add-site). The raw `Host` and cookie remain the answer for a local
      // profile, which no proxy stands in front of.
      const first = (header: string): string => {
        const value = req.headers[header]
        return (Array.isArray(value) ? value[0] : value) ?? ''
      }
      const forwardedSession = first('x-tracy-session')
      const cookie = forwardedSession ? `tracy_sess=${forwardedSession}` : (req.headers.cookie ?? '')
      const host = first('x-forwarded-host') || (req.headers.host ?? '')
      const proto = first('x-forwarded-proto') || 'http'
      readJsonBody(req)
        .then(async (body) => {
          if (step === 'turn') {
            writeJson(res, 200, await turnAnswer(ctx, body))
            return
          }
          if (cookie && host) viewer = { cookie, origin: `${proto}://${host}`, at: Date.now() }
          writeJson(res, 200, { ok: true, seen: viewer !== null })
        })
        .catch((error: unknown) => {
          writeJson(res, error instanceof BodyTooLarge ? 413 : 500, { code: 'REFUSED' })
        })
    }
  }

  // 🔒 In `ctx.effect`: without it HMR or a plugin toggle leaves the old registration, and the
  // next load throws "duplicate route".
  ctx.effect(() => {
    const dispose = ctx.webServer.register(route)
    return () => dispose()
  }, 'tracy-site-tabs: host routes')

  ctx.effect(() => {
    const watched = new WeakSet<AgentLike>()
    const stops: (() => void)[] = []
    // The lane keeps its idle moment; the host's one dsh records per turn. Decided per agent, when
    // it is installed, because the site key is read lazily from the gateway's env file.
    let book: ReturnType<typeof createTurnBook> | null = null
    const install = (agent: AgentLike): void => {
      if (watched.has(agent)) return
      watched.add(agent)
      const key = laneSiteKey()
      if (key !== null) {
        stops.push(watchLane(key, agent))
        return
      }
      book ??= turnBookFor(ctx)
      stops.push(watchHost(book, agent))
    }
    for (const agent of ctx.agents.roots()) install(agent)
    // Only root agents: a subagent's turns end inside its parent's, and the parent's idle is the
    // moment that matters.
    const stopCreated = ctx.on('agent/created', ({ agent }) => {
      if (ctx.agents.roots().includes(agent)) install(agent)
    })
    return () => {
      stopCreated()
      for (const stop of stops) stop()
    }
  }, 'tracy-site-tabs: moments')

  // A Good or Bad on Tracy's answer goes to the turn it answered (#1403 item 13, `rating.mjs`): signed as
  // the person who typed that turn, as `/moment` is. The host dsh only: a lane records no turns.
  ctx.effect(() => {
    if (laneSiteKey() !== null) return () => {}
    const rate = (
      sessionId: unknown,
      cwd: unknown,
      events: readonly SessionEventLike[],
      event: unknown
    ): void => {
      const said = ratingOf(event as SessionEventLike)
      if (said === null || typeof sessionId !== 'string') return
      const turn = ratedTurn(events as never, said.messageId)
      if (turn === null) return
      void (async () => {
        const request = await hostDoorRequest({
          door: 'turn/rating',
          cwd,
          email: turn.email,
          origin: gatewaySetting('MCP_TRACY_ORIGIN'),
          signer: ctx.get?.('tracyAssertion') as AssertionService | undefined
        })
        if (!request.ok) {
          if (request.reason !== null) console.warn(`[tracy-site-tabs] rating not sent: ${request.reason}`)
          return
        }
        const res = await fetch(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify({
            turnId: `${sessionId}:${turn.turn}`,
            rating: said.rating,
            categories: said.categories
          })
        })
        if (!res.ok)
          console.warn(`[tracy-site-tabs] rating of ${sessionId}:${turn.turn} refused: ${res.status}`)
      })().catch((error: unknown) =>
        console.warn(
          `[tracy-site-tabs] rating not sent: ${error instanceof Error ? error.message : String(error)}`
        )
      )
    }
    const stops = [
      ctx.on('session/event', (session, event) => {
        if (!event?.type?.startsWith('feedback/message-')) return
        rate(session?.id, session?.header?.cwd, session?.snapshotEvents?.() ?? [], event)
      }),
      ctx.on('feedback/committed', (inspection) => {
        const events = inspection?.events ?? []
        rate(inspection?.meta?.id, inspection?.meta?.cwd, events, events[events.length - 1])
      })
    ]
    return () => {
      for (const stop of stops) stop()
    }
  }, 'tracy-site-tabs: ratings')
}
