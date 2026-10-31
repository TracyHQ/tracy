/**
 * `tracy_site content.replace` — the host side of the replace job (PLAN v2.1 IX2, action form, D21).
 *
 * The four engines (`replace-joomla.mjs` for a sealed Joomla site, `replace-joomla-open.mjs` for an
 * open one, `replace-wordpress.mjs`, `replace-emdash.mjs`) take their I/O injected; this file is the one
 * place that decides which engine a site gets and hands each the doors it may use, so `index.ts` only
 * builds those doors from its own relay and exec.
 *
 * 🔒 EVERY WRITE LEAVES THROUGH A DOOR THE REST OF THE TOOL ALREADY GUARDS. A Joomla apply, every
 * record write on WordPress and open Joomla, and their `content.get` go through `siteCall`
 * (`runSiteCall`: normalisation, the body guard, the site's flight, the lock retry, the write memory);
 * an EmDash write goes through the EmDash road's own write script. Nothing here opens a shell, and the
 * only page read is `fetchPageHtml`'s pinned GET.
 *
 * 🔒 THE ENGINE IS CHOSEN BY THE SAME KEY THE DESCRIPTION WAS WRITTEN FROM (`replaceKey`), and only
 * where `REPLACE_PLATFORMS` has it: a site that was never told about `content.replace` is refused by
 * name, never routed to an engine built for another door.
 */

import { customerMessages, latestCustomerWords } from './prompter.mjs'
import { confirmQuestion } from './call-memory.mjs'
import { consequenceOf } from './consequence.mjs'
import { confirmKey, planReplace, REPLACE_CALL } from './replace.mjs'
import { EMDASH_REPLACE_NEXT, replaceOnEmdash } from './replace-emdash.mjs'
import { replaceOnJoomla } from './replace-joomla.mjs'
import { replaceOnJoomlaOpen } from './replace-joomla-open.mjs'
import { replaceOnWordPress } from './replace-wordpress.mjs'
import { REPLACE_PLATFORMS, replaceKey, replaceWroteSome } from './site-context.mjs'
import { readThroughLock } from './site-call.mjs'
import { withNext } from './site.mjs'

/**
 * The names a model predictably gives the replace job's parameters, mapped to the job's own (plan
 * IX2 item 2). 🔒 FOR THE REPLACE JOB ONLY: `text` or `value` mean something else on other actions,
 * and `apply_id` is never mapped — the job mints its own id.
 */
export const REPLACE_ALIASES = Object.freeze({
  from: 'find',
  old: 'find',
  search: 'find',
  text: 'find',
  to: 'replace',
  new: 'replace',
  with: 'replace',
  value: 'replace',
  page: 'path',
  url: 'path',
  region: 'where',
  position: 'where',
  place: 'where',
  everywhere: 'all',
  global: 'all',
  pairs: 'changes',
  edits: 'changes',
  dry_run: 'dryRun'
})

/**
 * The call with its aliases mapped, and one note per mapping (the answer's `normalized`). A name
 * given twice (`find` and `from`) is left as it is, so `planReplace` refuses the unknown one by name
 * instead of Tracy choosing between two values.
 * @param {unknown} params
 * @returns {{ params: unknown, notes: string[] }}
 */
export function replaceAliases(params) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return { params, notes: [] }
  /** @type {Record<string, unknown>} */
  const out = {}
  /** @type {string[]} */
  const notes = []
  const given = /** @type {Record<string, unknown>} */ (params)
  for (const [key, value] of Object.entries(given)) {
    const to = Object.hasOwn(REPLACE_ALIASES, key)
      ? REPLACE_ALIASES[/** @type {keyof typeof REPLACE_ALIASES} */ (key)]
      : null
    if (to !== null && !Object.hasOwn(given, to) && !Object.hasOwn(out, to)) {
      out[to] = value
      notes.push(`${key} → ${to}`)
    } else out[key] = value
  }
  return { params: out, notes }
}

export { MAY_HAVE_WRITTEN } from './site-context.mjs'

/**
 * The key a replace answer's phase timings ride under, from `runReplace` to the tool's
 * `output.presentationMeta` (S5). 🔒 NEVER MODEL-VISIBLE: `answerContent` drops it from the JSON text
 * the model reads, so the answer the model sees is byte for byte what it was before S5; dsh persists
 * it on `tool/result.meta`, which no model request carries (`@deepseek-ai/dsh-tools`, `ToolResult`).
 * Not `runNotes`: the model reads those.
 */
export const TIMING_KEY = '_timing'

/** Door calls kept per answer; a replace sends a handful, and meta is a presentation payload. */
const TIMED_CALLS_KEPT = 40

/**
 * The phases of one replace job, timed at the doors the engines are handed — no engine changes, so
 * no engine can time itself wrong (S5). WHY: EmDash's replace took 118.7 s and Joomla's 40.5 s on the
 * 25/09 bench and nothing said which phase; whether the Joomla re-read after a write
 * (`replace-joomla.mjs`, `verifyOn`) is worth its time is decided from these numbers.
 * - `fetch`: page reads (`pageHtml`) before any write · `snapshot`: the site's own reads before any
 *   write (Joomla inspect, WordPress list/get, building the EmDash road) · `index`: EmDash's index
 *   script · `write`: every write door · `verify`: ANY read that starts after the first write started
 *   · `locate`: wall time no door was open — the engine's own matching and planning.
 * Concurrent door calls (Joomla reads the inspect and the page side by side) are merged as intervals,
 * so `locate` is never negative.
 * @param {() => number} now - milliseconds; `performance.now` unless a test's clock is given.
 */
function phaseClock(now) {
  const started = now()
  /** @type {Record<string, number>} */
  const phases = { fetch: 0, snapshot: 0, index: 0, write: 0, verify: 0 }
  /** @type {{ action: string, phase: string, ms: number }[]} */
  const calls = []
  /** @type {[number, number][]} */
  const spans = []
  let wrote = false
  return {
    /**
     * @template {(...args: any[]) => Promise<any>} F
     * @param {'fetch' | 'snapshot' | 'index' | 'write'} phase
     * @param {(args: any[]) => string} name - what the call is, for the per-call list.
     * @param {F} door
     * @returns {F}
     */
    wrap(phase, name, door) {
      return /** @type {F} */ (
        async (/** @type {any[]} */ ...args) => {
          const at = phase === 'write' ? 'write' : wrote ? 'verify' : phase
          if (phase === 'write') wrote = true
          const t0 = now()
          try {
            return await door(...args)
          } finally {
            const t1 = now()
            phases[at] += t1 - t0
            spans.push([t0, t1])
            if (calls.length < TIMED_CALLS_KEPT)
              calls.push({ action: name(args), phase: at, ms: Math.round(t1 - t0) })
          }
        }
      )
    },
    /** @param {string} platform */
    done(platform) {
      const totalMs = now() - started
      let covered = 0
      let reach = -Infinity
      for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
        const from = Math.max(a, reach)
        if (b > from) covered += b - from
        reach = Math.max(reach, b)
      }
      /** @type {Record<string, number>} */
      const rounded = {}
      for (const [k, v] of Object.entries(phases)) rounded[k] = Math.round(v)
      rounded.locate = Math.max(0, Math.round(totalMs - covered))
      return { platform, totalMs: Math.round(totalMs), phases: rounded, calls }
    }
  }
}

/**
 * The phase timings a tool value carries, for `output.presentationMeta`: the replace job's, or null
 * for every other answer (a projector must return JSON; null is the one that says "nothing").
 * @param {unknown} value
 * @returns {{ replace: Record<string, unknown> } | null}
 */
export function timingMeta(value) {
  const t =
    value && typeof value === 'object' && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)[TIMING_KEY]
      : undefined
  return t && typeof t === 'object' && !Array.isArray(t) ? { replace: /** @type {any} */ (t) } : null
}

/** How many dryRun keys one conversation keeps (a dryRun is the confirmation of a wide `all`). */
const DRY_RUNS_KEPT = 50

/**
 * The dryRuns this process answered, per conversation — what `confirmed` reads: a wide `all` (more
 * than `REPLACE_CONFIRM_OVER` places) is written only after the same call was previewed.
 * @returns {{ seen: (sessionId: unknown, key: string) => boolean, remember: (sessionId: unknown, key: string) => void }}
 */
export function createDryRunMemory() {
  /** @type {Map<string, string[]>} */
  const bySession = new Map()
  return {
    seen(sessionId, key) {
      return typeof sessionId === 'string' && (bySession.get(sessionId) ?? []).includes(key)
    },
    remember(sessionId, key) {
      if (typeof sessionId !== 'string') return
      const keys = (bySession.get(sessionId) ?? []).filter((k) => k !== key)
      keys.push(key)
      bySession.set(sessionId, keys.slice(-DRY_RUNS_KEPT))
    }
  }
}

/**
 * 🔒 THE SECOND READ FAILURE OF ONE EMDASH SITE SAYS ONLY THE ROAD THAT WORKED. The first names both
 * (`readFailedNext`: once more if the site was just started, else `tracy_emdash`); when the same read
 * fails again within ten minutes, that retry has been paid for and lost — a failing read takes about a
 * minute — so the answer drops it, and the `page.text` probe that took a third minute on the stand
 * (`readFailedAgainNext`). Only the index read's refusal is rewritten: it is recognised by its own
 * sentence, so the menu pre-read's refusal (another next) and every other answer pass untouched. An
 * answer that wrote or planned something proves the read works and ends the run.
 * @param {Record<string, unknown>} answer
 * @param {import('./call-memory.mjs').CallMemory} memory
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function afterReadFailure(answer, memory, label) {
  if (answer.ok === true) {
    memory.readServed(label)
    return answer
  }
  if (answer.code !== 'SITE_UNREACHABLE' || answer.next !== EMDASH_REPLACE_NEXT.readFailedNext) return answer
  return memory.readFailed(label) >= 2 ? { ...answer, next: EMDASH_REPLACE_NEXT.readFailedAgainNext } : answer
}

/**
 * @typedef {(action: string, params: Record<string, unknown>) => Promise<unknown>} Door
 * @typedef {{
 *   params: unknown,
 *   platform: string | null | undefined,
 *   contractDoor?: boolean | null,
 *   contractBound?: boolean,
 *   sessionId: string | null,
 *   label: string,
 *   actorKey?: string | null,
 *   events?: readonly unknown[],
 *   memory: import('./call-memory.mjs').CallMemory,
 *   dryRuns: ReturnType<typeof createDryRunMemory>,
 *   send: Door,
 *   siteCall: Door,
 *   pageHtml: (path: string) => Promise<unknown>,
 *   emdash?: () => Promise<{ index: any, write: any, artifact?: unknown, onRevFormula?: (ok: boolean) => void }>,
 *   env?: Record<string, string | undefined>,
 *   clock?: Partial<import('./site-call.mjs').Clock>,
 *   confirm?: boolean,
 *   planAgreed?: () => Promise<boolean>
 * }} ReplaceRoadInput
 *   `confirm`: the agent sent `confirm:true` (lifted off the call) — the customer's yes to this call's own
 *   question is still what opens it (`call-memory.mjs` `confirmed`).
 *   `planAgreed`: a demo or own-site build whose saved plan agreed to consequence writes (`index.ts`
 *   `demoPlanAgreed`) — that plan is the customer's yes to the count, so the build is not asked mid-way.
 *   `send`: the raw relay (no guard) — used for the Joomla inspect snapshot and the WordPress and open
 *   Joomla lists, the reads an engine needs WHOLE. `siteCall`: `runSiteCall` for this call's site —
 *   every write.
 *   `emdash`: builds the EmDash road for this site on demand (the exec and its artifact). `clock`:
 *   the snapshot's waits (tests); the real clock when absent.
 */

/**
 * Run one `content.replace` call on this conversation's site.
 * @param {ReplaceRoadInput} input
 * @returns {Promise<Record<string, unknown>>}
 */
export async function runReplace(input) {
  const { platform, sessionId, label, memory, dryRuns } = input
  const key = replaceKey(String(platform ?? ''), input.contractDoor === true)
  if (!REPLACE_PLATFORMS.has(key))
    return {
      ok: false,
      code: 'NOT_ON_THIS_PLATFORM',
      error: `${REPLACE_CALL} is not built for this site's door.`,
      next: 'Find the words with page.text {match}, then change them through the write this site describes.'
    }
  const aliased = replaceAliases(input.params)
  const plan = /** @type {any} */ (planReplace(aliased.params))
  // The engine's own `normalized` (what the plan corrected) and the aliases, one list.
  const noted = (/** @type {Record<string, unknown>} */ answer) =>
    aliased.notes.length > 0 && answer && typeof answer === 'object'
      ? {
          ...answer,
          normalized: [
            ...new Set([...(Array.isArray(answer.normalized) ? answer.normalized : []), ...aliased.notes])
          ]
        }
      : answer
  if (!plan || plan.ok !== true) return noted(plan)
  // A whole link target is written only where a theme prints it at render time (WordPress's
  // rendered-words road); every other engine changes a link through its own record.
  if (
    key !== 'wordpress' &&
    key !== 'wordpress-contract' &&
    Array.isArray(plan.changes) &&
    plan.changes.some((/** @type {any} */ c) => c.href === true)
  )
    return noted({
      ok: false,
      code: 'BAD_PARAMS',
      error: `${REPLACE_CALL} {href:true} is built for WordPress only.`,
      next: "Change the link's words with find/replace; content.replace follows a phone or email link with its words."
    })
  const restore = Array.isArray(plan.restore)
  const planKey = restore ? null : confirmKey(plan)
  // Read before the count below: that dryRun is the door's own, not the agent's look at the places.
  const agentSaw = planKey !== null && dryRuns.seen(sessionId, planKey)
  let customerAgreed = false
  /**
   * 🔒 MANY PLACES AT ONCE ARE THE CUSTOMER'S TO ALLOW, NOT THE AGENT'S (council 19/10/2026,
   * `consequence.mjs`). `all` writing more than five places used to pass on the agent's own `expect` or
   * dryRun. Now such a call is counted first, writing nothing, and from MANY_PLACES on it asks the
   * customer the door's own question; their yes opens this one call (`confirmed`). Fewer places go on as
   * before, with the count the dryRun already read.
   */
  if (
    // `at` naming several places writes them all as `all` does, so it is counted the same way.
    (plan.all || (Array.isArray(plan.at) && plan.at.length > 1)) &&
    plan.dryRun !== true &&
    planKey !== null &&
    typeof sessionId === 'string' &&
    sessionId !== ''
  ) {
    const askKey = `tracy_site:content.replace:${planKey}`
    const agreed =
      (input.confirm === true && memory.confirmed(sessionId, askKey)) ||
      (typeof input.planAgreed === 'function' && (await input.planAgreed()) === true)
    customerAgreed = agreed
    if (!agreed) {
      const params = /** @type {Record<string, unknown>} */ (aliased.params)
      const preview = await runReplace({ ...input, confirm: false, params: { ...params, dryRun: true } })
      const count = typeof preview.count === 'number' ? preview.count : 0
      const many = consequenceOf(String(platform ?? ''), 'content.replace', {}, { places: count })
      if (preview.ok === true && many !== null) {
        memory.confirmAsked(sessionId, askKey, true, many.facts)
        return noted(
          withNext({
            ok: false,
            code: 'CONFIRM_FIRST',
            action: 'content.replace',
            tier: 'mutating',
            consequence: many.reason,
            count,
            would: preview.would,
            error: many.error,
            ask: confirmQuestion(askKey, many.sentence)
          })
        )
      }
      if (preview.ok !== true) return preview
    }
  }
  // The customer's yes to the count is a confirmation of it; the agent's own dryRun still is too.
  const confirmed = customerAgreed || agentSaw
  const events = /** @type {any} */ (input.events ?? [])
  const clock = phaseClock(input.clock?.now ?? (() => performance.now()))
  const pageHtml = clock.wrap(
    'fetch',
    () => 'page',
    (/** @type {string} */ path) => input.pageHtml(path)
  )

  /** @type {Record<string, unknown>} */
  let answer
  if (key === 'joomla-contract') {
    const inspectKey = { sessionId, label, actor: input.actorKey ?? null }
    answer = await replaceOnJoomla({
      plan,
      // The whole inspect, from this turn's snapshot unless the site said it changed (`fresh`); one
      // relay otherwise, in the site's flight, kept only if nothing wrote while it was on the wire.
      // 🔒 #316 H4: that relay waits out a lock miss and asks a lost answer once more, as every
      // inspect `runSiteCall` sends does (`readThroughLock`); a lock held by another writer used to
      // end the whole replace job at its first read.
      snapshot: clock.wrap(
        'snapshot',
        () => 'content.contract inspect',
        (fresh = false) =>
          memory.flight(label, async () => {
            if (!fresh) {
              const hit = memory.inspectCached(inspectKey)
              if (hit) return hit.answer
            }
            const generation = memory.generationOf(label)
            const full = await readThroughLock(
              input.send,
              'content.contract',
              { operation: 'inspect' },
              input.clock
            )
            memory.rememberInspect(inspectKey, full, generation)
            const f = /** @type {any} */ (full)
            if (f && f.ok === true && typeof f.revision === 'string')
              memory.rememberRevision(sessionId, label, f.revision)
            // The engine answers a refused inspect as it is: it carries its next from here, as every
            // other door answer does (review, 25/09) — never a bare code.
            if (!f || f.ok !== true)
              return withNext(full, { platform: 'joomla', sealed: true, action: 'content.contract' })
            return full
          })
      ),
      apply: clock.wrap(
        'write',
        () => 'content.contract apply',
        (/** @type {Record<string, unknown>} */ params) => input.siteCall('content.contract', params)
      ),
      pageHtml: (path) => /** @type {any} */ (pageHtml(path)),
      mint: (prefix) => memory.mint(prefix),
      // Every message the customer typed, latest first: the words a slot needs as evidence may have
      // come a message before the one asking for the change (the engine reads an array, P9).
      evidenceText: customerMessages(events),
      confirmed,
      ...(input.env ? { env: input.env } : {})
    })
  } else if (key === 'wordpress' || key === 'wordpress-contract') {
    // 🔒 THE LIST IS READ WHOLE. Through `runSiteCall` a list with bodies is cut at its budget, and
    // the engine refuses a cut read (READ_FAILED) rather than write a body built from part of it; the
    // bodies it listed are remembered, as `runSiteCall` does, so the body guard judges the writes.
    const door = async (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) => {
      if (action !== 'content.list') return input.siteCall(action, params)
      const got = /** @type {any} */ (await input.send(action, params))
      if (got && got.ok === true && Array.isArray(got.items))
        for (const row of got.items)
          if (row && typeof row === 'object' && typeof row.content === 'string')
            memory.rememberRead(sessionId, {
              kind: 'post',
              id: row.id,
              title: row.title,
              chars: row.content.length
            })
      return got
    }
    const called = (/** @type {any[]} */ args) => String(args[0])
    answer = await replaceOnWordPress({
      plan,
      read: clock.wrap('snapshot', called, door),
      write: clock.wrap('write', called, door),
      pageHtml: (path) => pageHtml(path),
      mintApplyId: () => memory.mint('replace'),
      confirmed,
      removes: latestCustomerWords(events),
      bound: input.contractBound === true || memory.learned(label).contractBound,
      // The front page the read found: its writes are named as the home page's (#257).
      onFront: (/** @type {number} */ id) => memory.rememberFront?.(sessionId, id),
      // The identity a token prints is set through the contract where the surface has that door.
      contractDoor: key === 'wordpress-contract'
    })
  } else if (key === 'joomla') {
    // An open Joomla site: its records through the same two doors as WordPress's — a list through the
    // raw relay, because `runSiteCall` cuts a list to its arrival budget and shapes an article row to
    // six fields (`shapeListRows`), and the engine needs every row whole; a get and every write
    // through `runSiteCall`, which orders a Joomla write in the site's flight and waits out its lock.
    const door = async (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) =>
      action === 'content.list' ? input.send(action, params) : input.siteCall(action, params)
    const called = (/** @type {any[]} */ args) => String(args[0])
    answer = await replaceOnJoomlaOpen({
      plan,
      read: clock.wrap('snapshot', called, door),
      write: clock.wrap('write', called, door),
      pageHtml: (path) => pageHtml(path),
      mintApplyId: () => memory.mint('replace'),
      confirmed
    })
  } else {
    if (!input.emdash)
      return { ok: false, code: 'SITE_UNREACHABLE', error: 'The EmDash road is not available here.' }
    const emdashRoad = input.emdash
    const road = await clock.wrap(
      'snapshot',
      () => 'road',
      () => emdashRoad()
    )()
    answer = afterReadFailure(
      await replaceOnEmdash({
        plan,
        index: clock.wrap('index', () => 'index', road.index),
        write: clock.wrap('write', () => 'write', road.write),
        pageHtml: (path) => pageHtml(path),
        artifact: road.artifact,
        label,
        confirmed,
        ...(road.onRevFormula ? { onRevFormula: road.onRevFormula } : {})
      }),
      memory,
      label
    )
  }

  const a = /** @type {any} */ (answer)
  if (plan.dryRun === true) {
    if (a && a.ok === true && planKey !== null) dryRuns.remember(sessionId, planKey)
  } else if (a && (a.ok === true || replaceWroteSome(a))) {
    // E3.2 / D8: a change the job may have made ends this turn's snapshot and refusal memo for the
    // site (`runSiteCall` does it for the writes it sent; the EmDash road sends none through it).
    memory.invalidateSite(label)
  }
  const out = noted(answer)
  // S5: the phases ride the answer to `presentationMeta` and are dropped from the model's text there.
  return out && typeof out === 'object' && !Array.isArray(out)
    ? { ...out, [TIMING_KEY]: clock.done(key) }
    : out
}
