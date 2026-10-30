/**
 * What the CMS engines of "Apply" have in common: the site block the seeder's planners read, how a plan is
 * cut into the batches a model can answer in seconds, and how a model's call is made firm about facts.
 */
import { FACT_RULES, VOICE_RULES } from './guard.js'

/** Slots per model call. The seeder's own number (`plan-*-contract.mjs` `BATCH`), kept because its prompts are tuned to it. */
export const BATCH = 35

/**
 * Everything the customer said, as one text: the description, then the other answers as `Label: answer` lines. What the
 * models read the facts out of, and what the guard that refuses invented facts holds a value against.
 * @param {{about?: string, said?: string}} brief
 */
export function spokenOf(brief) {
  return [brief?.about, brief?.said]
    .filter((part) => typeof part === 'string' && part.trim() !== '')
    .join('\n')
}

/**
 * 🔒 ABOUT LEFT BLANK CHANGES THE NAME AND NOTHING ELSE (spec TCQR ABOUT-3, K6, K7, D9; dev 10/10/2026). Whether the customer
 * described the business in the About answer. Without it no model rewrites the template's copy, menu labels or form words,
 * and no picture is drawn: from a name alone they turned "@Grazia on instagram" into "Bakery gallery", drew bakery photographs
 * over the demo's and relabelled an industrial menu "Baked goods" over pages that stayed industrial. Only the demo company's
 * name changes (the D9 renames), beside what the customer typed (name, contact, languages, pages).
 * @param {{about?: string} | null | undefined} brief
 */
export const aboutGiven = (brief) => String(brief?.about ?? '').trim() !== ''

/**
 * 🔒 A NAME LEFT BLANK KEEPS THE TEMPLATE'S (spec TCQR, "any question left blank keeps that part as the template has it"; TCH #1013,
 * 13/10/2026). Measured on the local stand: About answered, Name left blank, and every template came out named after its
 * address ("Sqb1 03w P"), the EmDash monogram "S0P". The normaliser still makes a name of the address (`nameFrom: 'label'`)
 * for the code that needs one to compare against; nothing writes it as the site's identity, and the words a model writes
 * are told the template's own company instead (`withTemplateName`).
 * @param {{ nameFrom?: string } | null | undefined} normalized
 */
export const nameAnswered = (normalized) =>
  normalized?.nameFrom !== 'label' && normalized?.nameFrom !== 'template'

/** The name the customer gave, or nothing: a name made from the site address, or the template's standing in, names nothing. */
export const answeredName = (normalized) => (nameAnswered(normalized) ? String(normalized?.name ?? '') : '')

/**
 * The brief with the template's own company standing in for a name made from the site address: the first spelling the
 * template declares (`demoCompanyNames`, `<version>.copy.json`), so a line that named the demo company keeps naming it and
 * no line is given the address. A template that declares none keeps the address name (`nameFrom: 'label'`), as before.
 * @template {{ name?: string, nameFrom?: string }} N
 * @param {N} normalized
 * @param {string[]} demoNames
 * @returns {N}
 */
export function withTemplateName(normalized, demoNames) {
  if (normalized?.nameFrom !== 'label' || !demoNames[0]) return normalized
  return { ...normalized, name: demoNames[0], nameFrom: 'template' }
}

/** Letters only one language writes with, by the primary tag of that language (Vietnamese, Chinese, Japanese, Korean…). */
const OWN_LETTERS = Object.freeze({
  vi: /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i,
  zh: /[\u4e00-\u9fff]/,
  ja: /[\u3040-\u30ff]/,
  ko: /[\uac00-\ud7af]/,
  ru: /[\u0400-\u04ff]/
})

/**
 * Whether a description can stand as written on a site of `language`: false when it carries letters one other language
 * alone writes with (Vietnamese diacritics on an English site), or lacks the letters of a site language that has its own
 * (English typed for a Vietnamese site). Empty counts as true.
 * @param {string | undefined} text @param {string | undefined} language a BCP 47 tag (`vi-vn`, `en-us`)
 */
export function aboutInLanguage(text, language) {
  const said = String(text ?? '')
  if (said.trim() === '') return true
  const own = String(language ?? '')
    .toLowerCase()
    .split(/[-_]/)[0]
  // a site whose language has letters of its own takes a description written with them (English typed for a Vietnamese
  // site is translated by the model, never put up as typed)
  if (OWN_LETTERS[own] && !OWN_LETTERS[own].test(said)) return false
  for (const [lang, letters] of Object.entries(OWN_LETTERS))
    if (lang !== own && letters.test(said)) return false
  return true
}

/** What the report says when About was left blank and a model was there to write. */
export const ABOUT_BLANK_NOTE =
  'About was left blank, so the template keeps its own words and pictures; only the company name was changed'

/**
 * The longest brief a judge (which pages, menu entries and labels of the template stay) is shown: every answer of a full
 * questionnaire, where it was the first 300 characters and the answers after a long description never reached it (ledger L06).
 * ~300 tokens at most per judge call.
 */
export const JUDGE_BRIEF_MAX = 1200

/**
 * What a judge is told the business said: the description and the other answers, up to `JUDGE_BRIEF_MAX`.
 * @param {{about?: string, said?: string}} brief
 */
export const briefForJudges = (brief) => spokenOf(brief).slice(0, JUDGE_BRIEF_MAX)

/**
 * The `site` block of a design preview, as the seeder's planners and input writers read it. `details` are the customer's
 * other answers (`Label: answer` lines: the sector, a question an administrator added) beside the description, their own
 * field so a slot that takes `about` as it stands never carries them. The phone, email and address the normaliser read apart
 * ride beside `contact` (the line they were joined into) with the opening hours and the profiles the owner linked: a site
 * identity has a field for each and takes them as read (`chrome-slots.mjs` `contactOf`); parsed back out of the line, the
 * email ended up in the address and the hours nowhere (ledger L32).
 * @param {{name: string, about: string, tone: string, contact: string, phone?: string, email?: string, address?: string, details?: string, hours?: string, social?: Record<string, string>, languages: string[]}} normalized
 * @param {string[]} [languages] - overrides the languages (a pass plans one edition at a time)
 */
export function siteBlock(normalized, languages = normalized.languages) {
  const social = normalized.social && typeof normalized.social === 'object' ? normalized.social : {}
  return {
    // a name the customer did not give is no fact of the site: nothing writes it, no model is told it (`nameAnswered`)
    ...(nameAnswered(normalized) ? { name: normalized.name } : {}),
    about: normalized.about,
    ...(normalized.tone ? { tone: normalized.tone } : {}),
    ...(normalized.contact ? { contact: normalized.contact } : {}),
    ...(normalized.phone ? { phone: normalized.phone } : {}),
    ...(normalized.email ? { email: normalized.email } : {}),
    ...(normalized.address ? { address: normalized.address } : {}),
    ...(normalized.details ? { details: normalized.details } : {}),
    ...(normalized.hours ? { hours: normalized.hours } : {}),
    ...(Object.keys(social).length > 0 ? { social } : {}),
    languages
  }
}

/**
 * Apply ids a write names that are not one Apply's own: the seeder's demo trim files every trim under one fixed receipt, the
 * install's included, so reverting it would undo the install's trim too.
 */
export const SHARED_APPLY_IDS = Object.freeze(new Set(['dtrim-seed']))

/**
 * The Apply door as an engine writes through it, telling the run every apply id a call names (`params.apply_id`), so the
 * row keeps them all (`BriefContext.applied`, `site_brief.timings`) and the whole Apply can be undone with one `apply.revert`
 * per id it minted, newest first (ledger L08). An id it only reuses — a fixed receipt (`SHARED_APPLY_IDS`) or one the engine
 * names (`reused`: the install's language receipt a retire writes under again) — is told as `{reused: true}` and kept apart:
 * reverting it would undo the install's work too. The call itself goes through untouched; a run that records nothing gets the
 * door as it is.
 *
 * 🔒 NOTHING GOES THROUGH ONCE THE RUN HAS GIVEN UP ON IT (TCH #1367, 15/10/2026). `ctx.signal` is the run's (or, during
 * `apply`, the apply's own deadline): once it fires, every call is refused with its reason. Measured on the local stand,
 * Tracy Business Joomla 1.2.3, a Dutch brief: the apply was cut at 180 s and its row said `failed`, yet the engine went on
 * and wrote the language overrides, the authors' words and the address prefix 19–23 s later, after the brand step and after
 * the webroot hold had closed.
 * @template {(call: any) => Promise<any>} D
 * @param {{applied?: (applyId: string, how?: {reused: boolean}) => void, refused?: (call: any, answer: any) => void, signal?: AbortSignal}} ctx
 * @param {D} apply
 * @param {(applyId: string) => boolean} [reused]
 * @returns {D}
 */
export function recordedDoor(ctx, apply, reused = () => false) {
  const applied = ctx?.applied
  const refused = ctx?.refused
  const signal = ctx?.signal
  if (typeof applied !== 'function' && typeof refused !== 'function' && !signal) return apply
  return /** @type {D} */ (
    (/** @type {any} */ call) => {
      if (signal?.aborted)
        return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error('the run is over'))
      const id = call?.params?.apply_id
      if (typeof applied === 'function' && typeof id === 'string' && id !== '')
        applied(id, { reused: SHARED_APPLY_IDS.has(id) || reused(id) })
      if (typeof refused !== 'function') return apply(call)
      // A write the site refused (or that threw) is told to the run, with the reason, so a silent failure shows on the report.
      return Promise.resolve(apply(call)).then(
        (answer) => {
          if (answer?.ok === false) refused(call, answer)
          return answer
        },
        (error) => {
          refused(call, { ok: false, message: error instanceof Error ? error.message : String(error) })
          throw error
        }
      )
    }
  )
}

/**
 * Cut a list into runs of at most `size`, keeping the order.
 * @template T @param {T[]} list @param {number} size @returns {T[][]}
 */
export function chunk(list, size = BATCH) {
  /** @type {T[][]} */
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * The model as one stage of a build sees it, so its calls are counted under that stage (`seed-model.js` `stage`); a model
 * with no meter (a test's double) as it is.
 * @template T
 * @param {T} model
 * @param {string} name - `planner`, `judge`, `posts`…
 * @returns {T}
 */
export function staged(model, name) {
  return /** @type {any} */ (model)?.stage?.(name) ?? model
}

/**
 * What the build's words cost, on the row's timings: in, out and reasoning tokens and calls, in all (`textIn`, `textOut`,
 * `textReasoning`, `textCalls`) and per stage (`text.<stage>.in`…). Nothing for a model with no meter or no call.
 * @param {{time: (name: string, value: number) => void}} ctx
 * @param {{usage?: () => any} | null | undefined} model
 */
export function recordTextUsage(ctx, model) {
  const spent = model?.usage?.()
  if (!spent?.calls) return
  ctx.time('textCalls', spent.calls)
  ctx.time('textIn', spent.promptTokens ?? 0)
  ctx.time('textOut', spent.completionTokens ?? 0)
  ctx.time('textReasoning', spent.reasoningTokens ?? 0)
  for (const [stage, s] of Object.entries(spent.stages ?? {})) {
    ctx.time(`text.${stage}.calls`, s.calls)
    ctx.time(`text.${stage}.in`, s.promptTokens)
    ctx.time(`text.${stage}.out`, s.completionTokens)
    ctx.time(`text.${stage}.reasoning`, s.reasoningTokens)
  }
}

/**
 * The planners' `generate`, over a seed model, with the fact rules and the copy voice (`VOICE_RULES`) added to every
 * instruction and the
 * run's abort signal on every call. The reply cap is the model's own maximum output (`seed-model.js` `maxTokens: 'max'`):
 * the writer reasons from the brief before it answers, and at 4096 that reasoning cut five R13 batches mid-JSON.
 * @param {{ chat: Function }} model
 * @param {AbortSignal} [signal]
 * @returns {(call: {system: string, input: unknown}) => Promise<string>}
 */
export function firmGenerate(model, signal) {
  return ({ system, input }) =>
    model.chat({
      messages: [
        { role: 'system', content: `${system}${FACT_RULES}${VOICE_RULES}` },
        { role: 'user', content: JSON.stringify(input) }
      ],
      maxTokens: 'max',
      signal
    })
}

/**
 * The first complete JSON object in a model's answer, however it is wrapped (a code fence, a sentence before it, a note
 * after it), or null. Not the text from the first brace to the last: that reads two objects, or an object and a remark with
 * braces in it, as one thing that is not JSON.
 * @param {unknown} answer
 * @returns {Record<string, unknown> | null}
 */
export function jsonObjectIn(answer) {
  const text = String(answer ?? '')
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            const value = JSON.parse(text.slice(start, i + 1))
            if (value && typeof value === 'object' && !Array.isArray(value)) return value
          } catch {
            // not this one: the next brace may start the object
          }
          break
        }
      }
    }
  }
  return null
}

/**
 * A signal that fires when the run's own does, or when `deadlineAt` (epoch ms) passes.
 *
 * What a model call is given in `prepare`: at the deadline the calls still waiting stop, the planners
 * mark the slots they never got "pending" and keep the template's words for them, and what DID come back
 * is written — a slow model costs some of the words, never all of the site.
 * @param {AbortSignal | undefined} signal @param {number} deadlineAt
 * @returns {AbortSignal}
 */
export function budgetSignal(signal, deadlineAt) {
  const late = AbortSignal.timeout(Math.max(1, deadlineAt - Date.now()))
  return signal ? AbortSignal.any([signal, late]) : late
}

/** The keys a planner's call asks about, for the answer that leaves them all pending. */
const keysOf = (call) =>
  Array.isArray(call?.input?.slots) ? call.input.slots.map((slot) => slot?.key).filter(Boolean) : []

/**
 * An answer that writes nothing and leaves every slot of the call with the template's own words. A call that failed says
 * why (`failed`: "model-failed", "truncated" for one cut at the reply cap, or "deadline" for one the budget cut), so the
 * planner can retry it split, and the receipt
 * can list its keys by reason, never as lines the model chose to leave.
 * @param {{input?: any}} call @param {string} [reason]
 */
const leaveAll = (call, reason) =>
  JSON.stringify({ values: {}, pending: keysOf(call), invented: [], ...(reason ? { failed: reason } : {}) })

/** Concurrent rounds after the first at most: a send-back, then the split retries of a lost batch and their parts. */
const LATER_ROUNDS = 3

/**
 * Run a seeder planner with its model calls made ALL AT ONCE instead of one after another.
 *
 * The planners (`plan-wordpress-contract`, `plan-joomla-contract`, `plan-joomla-language`) walk their batches in a
 * loop and wait for each answer before asking the next, so a 267-slot plan is eight round trips in a row. Their
 * rules — which slots are theirs, the language check, the retries, what counts as pending — are exactly what keeps a
 * model off a sealed site, so they are not copied here. Instead the planner runs round the same code, in ROUNDS:
 *
 *   1. with a `generate` that only writes down what it is asked and answers `quiet` ("nothing, leave it") — the list of
 *      batches the planner would send, exact, at the cost of a few milliseconds;
 *   2. every one of those calls goes to the model at once (at most `inFlight` in flight);
 *   3. the planner runs again, answered from what came back; a call it makes that no round has answered yet (a send-back
 *      with a `fix`, the split retry of a lost batch) is written down and answered `quiet`, and all of those go to the
 *      model at once, as ONE concurrent round, never one live call after another (R12: every send-back was a serial
 *      live call, and the budget ran out on them);
 *   4. step 3 again until a run asks nothing new: that run is the result.
 *
 * 🔒 THE ROUNDS ARE BUDGETED. After the first round the measured p95 of one call says whether another round still fits
 * before `deadlineAt` (and `budgetOf`, the work-sized budget the caller is told through `onDue`); a round that does not
 * fit, or past `LATER_ROUNDS`, is not sent: its calls are answered `quiet(call, 'deadline')`, so the planner keeps the
 * answers it has (a retry that never came keeps the first answer) and says which keys the budget cut.
 *
 * A call that fails is answered `quiet(call, 'model-failed')` (`failure: 'leave'`, for the text planners: ONE bad batch
 * costs its own slots and never the whole plan) or fails the planner's own call (`failure: 'throw'`, for a translation: an
 * answer that is not one must never be taken for one and kept).
 * @template T
 * @param {(generate: (call: {system: string, input: any}) => Promise<string>) => Promise<T>} plan
 * @param {(call: {system: string, input: any}) => Promise<string>} generate - the real one
 * @param {{ quiet?: (call: {system: string, input: any}, reason?: string) => string, failure?: 'leave' | 'throw',
 *   deadlineAt?: number, stop?: AbortSignal, inFlight?: number, now?: () => number,
 *   budgetOf?: (work: {calls: number, p95Ms: number | null}) => number, onDue?: (at: number) => void,
 *   p95Ms?: number | null }} [options]
 * @returns {Promise<{result: T, calls: number, failed: number, cut: number, rounds: number, callMs: number[]}>}
 */
export async function planConcurrently(
  plan,
  generate,
  {
    quiet = leaveAll,
    failure = 'leave',
    deadlineAt = Number.POSITIVE_INFINITY,
    stop,
    inFlight = Number.POSITIVE_INFINITY,
    now = Date.now,
    budgetOf,
    onDue,
    p95Ms = null
  } = {}
) {
  const startedAt = now()
  /** @type {Array<{system: string, input: any}>} */
  const asked = []
  await plan(async (call) => {
    asked.push(call)
    return quiet(call)
  })
  const idOf = (call) => `${call.system}\u0000${JSON.stringify(call.input)}`
  /** @type {Map<string, string | {error: unknown}>} */
  const answers = new Map()
  /** How long each answered call took, in ms: the p95 of these sizes the next round and the next build's budget. */
  /** @type {number[]} */
  const callMs = []
  // Every call the model was asked, and every one of them that failed or the budget cut: counted the same way, so "all of
  // them failed" and "none of them failed" mean what they say.
  let calls = 0
  let failed = 0
  let cut = 0
  const p95 = () => {
    const sorted = [...callMs].sort((a, b) => a - b)
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : p95Ms
  }
  let due = deadlineAt
  if (typeof budgetOf === 'function') {
    due = Math.min(deadlineAt, startedAt + budgetOf({ calls: asked.length, p95Ms }))
    onDue?.(due)
  }
  const late = (error) =>
    now() >= due ||
    stop?.aborted === true ||
    /abort|timeout|deadline/i.test(String(error?.name ?? error?.message ?? error))
  /** Answer `list` from the model, at most `inFlight` at once; one that fails or is cut is answered `quiet` with its reason. */
  const send = (list) =>
    pool(
      list.map((call) => async () => {
        calls += 1
        const t = now()
        try {
          const said = await generate(call)
          callMs.push(now() - t)
          answers.set(idOf(call), said)
        } catch (error) {
          failed += 1
          // An answer cut at the reply cap (`TRUNCATED`) is its own reason: the planner splits it, and its half text is
          // never kept as the call's answer.
          const reason =
            /** @type {any} */ (error)?.code === 'TRUNCATED'
              ? 'truncated'
              : late(error)
                ? 'deadline'
                : 'model-failed'
          if (reason === 'deadline') cut += 1
          answers.set(idOf(call), failure === 'throw' ? { error } : quiet(call, reason))
        }
      }),
      Number.isFinite(inFlight) ? inFlight : Math.max(1, list.length)
    )
  /** Answer `list` without asking: the budget has no room for it. */
  const skip = (list) => {
    for (const call of list) {
      calls += 1
      failed += 1
      cut += 1
      answers.set(
        idOf(call),
        failure === 'throw' ? { error: new Error('the words budget ran out') } : quiet(call, 'deadline')
      )
    }
  }
  await send(asked)
  let rounds = 1
  for (;;) {
    /** @type {Map<string, {system: string, input: any}>} */
    const fresh = new Map()
    const result = await plan(async (call) => {
      const known = answers.get(idOf(call))
      if (known !== undefined) {
        if (typeof known === 'object') throw known.error
        return known
      }
      fresh.set(idOf(call), call)
      return quiet(call)
    })
    // A planner that keeps asking new calls past every round is answered by its last run: never a loop without end.
    if (fresh.size === 0 || rounds > LATER_ROUNDS + 3) return { result, calls, failed, cut, rounds, callMs }
    if (typeof budgetOf === 'function' && rounds === 1) {
      // The first round measured what one call costs here: the budget is sized again by it.
      due = Math.min(deadlineAt, startedAt + budgetOf({ calls: asked.length, p95Ms: p95() }))
      onDue?.(due)
    }
    const room = rounds <= LATER_ROUNDS && stop?.aborted !== true && now() + (p95() ?? 0) <= due
    if (room) await send([...fresh.values()])
    else skip([...fresh.values()])
    rounds += 1
  }
}

/**
 * Run `jobs` with at most `limit` in flight, keeping the order of the answers. A job that throws is an
 * answer too (`{error}`): one failed batch must not cost the others.
 * @template T @param {Array<() => Promise<T>>} jobs @param {number} limit
 * @returns {Promise<Array<{ok: true, value: T} | {ok: false, error: unknown}>>}
 */
export async function pool(jobs, limit) {
  const results = Array.from({ length: jobs.length })
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const at = next
      next += 1
      try {
        results[at] = { ok: true, value: await jobs[at]() }
      } catch (error) {
        results[at] = { ok: false, error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, jobs.length)) }, worker))
  return results
}

/**
 * A stopwatch for an engine's phases: `watch(name, fn)` runs `fn` and records how long it took under `name`;
 * `watch.add(name, ms)` records a span measured some other way.
 *
 * A phase that runs twice (Joomla hides the other languages before AND after it derives one) or once per language is
 * recorded as the SUM, so the report says what the phase cost altogether and not what its last turn did.
 * @param {{time: (phase: string, ms: number) => void}} ctx
 */
export function stopwatch(ctx) {
  /** @type {Map<string, number>} */
  const spent = new Map()
  const add = (/** @type {string} */ name, /** @type {number} */ ms) => {
    const total = (spent.get(name) ?? 0) + ms
    spent.set(name, total)
    ctx.time(name, total)
  }
  const watch = async (/** @type {string} */ name, /** @type {() => any} */ fn) => {
    const started = Date.now()
    try {
      return await fn()
    } finally {
      add(name, Date.now() - started)
    }
  }
  return Object.assign(watch, { add })
}

/**
 * What a site's refusal to inspect its content contract means, said so a person can act on it: the plugin's own
 * sentence — "name one with the contract parameter" — points at nothing a customer or an operator could do.
 *
 * The refusal says THAT the site is unbound, never why, so neither does this. The causes measured differ: a plugin
 * that did not carry the release's profile yet (03/10/2026, `tracy-base/wp7` 1.1.1 on plugin 0.17.1), and a bind that
 * came back empty from a plugin that did carry it (L29, 05/10/2026). The one place a cause is seen is the provision
 * that handed the site over unbound (`tracy_wp_bind_latest`), and its log line names it.
 * @param {string} words - the refusal as the door gave it
 */
export function sayUnbound(words) {
  return /no content contract is configured|contract_unbound/i.test(words)
    ? 'this site is not bound to its template’s content contract, so it keeps the template’s words'
    : words
}
