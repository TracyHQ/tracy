/**
 * The stages of a build as the session's STANDING PLAN — the task list dsh draws above the
 * composer — and the one line the agent hears when a stage settles.
 *
 * The build is host code (`build.mjs`): the route `start` runs it, no model in the loop. The
 * chat's own card (`BuildCard`) folds under "1 tool call" the moment the tool answers, and the
 * Build tab shows a bar, so the six steps had no standing place on the screen (Lee, 09/09). dsh
 * already has one: the `todos` projection of `@deepseek-ai/dsh-tool-todo`, fed by `todo/write`
 * events on the session log. This module writes those events from the engine's `onChange`, for
 * every session standing in the site folder, so the list belongs to the session the customer has
 * open and not to a model call.
 *
 * 🔒 Two rules of the fork this leans on (`vendor/tracy/deepseek-harness`, tool-todo, 09/09): a
 * `todo/write` may stand BETWEEN turns — the build runs outside any turn until the agent joins it
 * with `start` — and a plan with an item still `in_progress` survives the next `turn/start`, so the
 * customer talking mid-build does not blank the list. Upstream dsh has neither; on an upstream
 * dsh the append throws and the list vanishes on the next message.
 *
 * The agent is told, not asked: when a stage settles (done, skipped, waiting, failed) one line is
 * INJECTED into the session's agent — context for its next step, no wake-up. Blocked in `start`,
 * the agent reads it beside the tool's answer; idle, it reads it with the customer's next message
 * and can answer "what happened to my build" without calling `status`.
 */
import { randomUUID } from 'node:crypto'

import { AUTH_REFUSALS } from './stages-shared.mjs'
import { detailIn, fill, spokenLang, wordsFor } from './words.mjs'

/**
 * The job and its stages are `build.mjs`'s shapes, imported rather than re-typed: this module reads
 * a job it never makes, and a second spelling of that shape drifts from the first without a word.
 * @typedef {import('./build.mjs').Job} Job
 * @typedef {import('./build.mjs').Stage} Stage
 * @typedef {{ content: string, status: 'pending' | 'in_progress' | 'completed' }} TodoItem
 * @typedef {{ id: string, header?: { cwd?: string }, append: (type: string, data: unknown) => unknown }} SessionLike
 * @typedef {{ inject: (message: unknown) => void }} AgentLike
 */

/**
 * The task line of each stage — imperative, the way `todo_write` phrases a plan, and in the
 * customer's language: this list is drawn above their composer, so it is their surface too.
 * @param {string} name @param {string} [lang]
 */
function wordsOf(name, lang = 'en') {
  const stages = /** @type {Record<string, string | undefined>} */ (wordsFor(lang).stages)
  return stages[name] ?? name
}

/** What a stage says of itself once done — the same words the chat card and the Build tab use. */
const DONE_WORDS = Object.freeze({
  check: 'Site checked',
  theme: 'Theme installed',
  template: 'Template installed',
  style: 'Look applied',
  copy: 'Words written',
  seed: 'Pages laid out',
  shot: 'Picture taken'
})

const SETTLED = new Set(['done', 'skipped', 'waiting', 'failed'])

/**
 * One line of the seeder's own narration, read as a fact the list can show.
 *
 * The seeder has always said what it is doing — `blog: 6 posts`, `cover 3 of 6 (slug)`, `sections:
 * 13 sections written` — straight to stderr, and the seed stage threw all of it away, keeping only
 * the first line if the run failed. So the longest and most fragile of the six steps was the one
 * that said the least: two minutes of "Lay out the pages" with no way to tell slow from stuck.
 *
 * 🔒 THE LINE IS PARSED, NOT SHOWN. The seeder speaks English to a log; the customer may not. What
 * travels is `{kind, done, total}`, and `words/<lang>.json` says how to phrase it — so a Vietnamese
 * customer reads "3 trên 6 tấm ảnh", not the seeder's own words.
 * @param {string} line
 * @returns {{ kind: 'covers' | 'words' | 'entries' | 'pictures', done: number, total: number } | { kind: 'posts' | 'sections' } | null}
 */
export function progressOf(line) {
  if (typeof line !== 'string') return null
  const cover = /^cover (\d+) of (\d+)\b/.exec(line.trim())
  if (cover) return { kind: 'covers', done: Number(cover[1]), total: Number(cover[2]) }
  // EmDash's personalize narrates the same way (`tools/personalize.mjs` in the template): the
  // words per page, the demo entries per collection, the pictures — each `<kind> N of M`.
  const counted = /^(words|entries|pictures) (\d+) of (\d+)\b/.exec(line.trim())
  if (counted) {
    const kind = /** @type {'words' | 'entries' | 'pictures'} */ (counted[1])
    return { kind, done: Number(counted[2]), total: Number(counted[3]) }
  }
  if (/^blog: \d+ posts?\b/.test(line.trim())) return { kind: 'posts' }
  if (/^sections: \d+ sections?\b/.test(line.trim())) return { kind: 'sections' }
  return null
}

/**
 * A reader that turns a byte stream into whole lines.
 *
 * 🔒 A CHUNK IS NOT A LINE. `child.stderr` hands over whatever arrived, which cuts mid-word as
 * often as not: `cover 3 o` then `f 6 (slug)\n`. Splitting each chunk on its own would lose every
 * line that straddles two of them, and the longer the run the more of them there are. The tail is
 * held back until its newline arrives.
 *
 * The `seed:` prefix the seeder writes is stripped here rather than in the parser, so a caller
 * reading another command's output gets its lines untouched.
 * @param {(line: string) => void} onLine
 * @returns {(chunk: unknown) => void}
 */
export function lineReader(onLine) {
  let rest = ''
  return (chunk) => {
    const lines = (rest + String(chunk)).split(/\r?\n/)
    rest = lines.pop() ?? ''
    for (const line of lines) {
      const said = line.replace(/^seed:\s*/, '').trim()
      if (said !== '') onLine(said)
    }
  }
}

/** The three statuses a durable todo list has, from the six a stage can be in. */
/** @param {Stage} stage */
function statusOf(stage) {
  if (stage.status === 'done' || stage.status === 'skipped') return 'completed'
  if (stage.status === 'running' || stage.status === 'waiting') return 'in_progress'
  // A failed stage goes back to pending: the build stopped there, the chat card says why, and once
  // nothing is in progress the next turn clears the plan as dsh always did.
  return 'pending'
}

/**
 * The languages a build was asked for, from the answers the customer gave.
 *
 * 🔒 ONE PER NAME, because the list they become must read differently line by line: two tags with
 * the same primary subtag (`zh-CN`, `zh-TW`) carry one name between them, and `todo/write` refuses
 * a repeated `content` — which loses the WHOLE list, not the second line. The form offers plain
 * ISO-639-1 codes and cannot produce that pair; an answer from anywhere else can.
 */
/** @param {Job} job */
function languagesOf(job) {
  const asked = job.answers?.languages
  const seen = new Set()
  const out = []
  for (const one of Array.isArray(asked) ? asked : []) {
    if (typeof one !== 'string' || one === '') continue
    const primary = one.toLowerCase().split(/[-_]/)[0]
    if (seen.has(primary)) continue
    seen.add(primary)
    out.push(one)
  }
  return out
}

/**
 * The whole list the plan replaces itself with — SHAPED BY THE ANSWERS, not a fixed six.
 *
 * A build does different work for different customers, and a list that reads the same either way
 * describes a build that is not theirs (Lee, 09/09). What changes, and why it is worth a line:
 *
 * - **A second language adds two kinds of work.** The theme stage installs Polylang
 *   (`stages.mjs`, `polylangIfNeeded`) and the copy stage takes one model turn per language, each
 *   up to three minutes. One line each, named, so a customer watching knows which one is running.
 * - **A page list says how many pages the seeder lays out**, because "Lay out the pages" says
 *   nothing about whether that is three or nine.
 * - **Joomla on this lane does not apply the look at all** — the stage waits for the agent
 *   (`waiting: agent:templateStyle`). Saying "Apply the look" there promises work nobody is doing.
 *
 * Added lines borrow the status of the stage they belong to, because that stage is what actually
 * runs them. The one exception is the plugin line: `withPolylang` never fails the theme stage, it
 * appends to its detail — so a plugin that did not go on is read out of that detail and marked
 * skipped rather than claimed as done.
 *
 * 🔒 EVERY LINE MUST READ DIFFERENTLY. `todo/write` refuses a repeated `content`
 * (`tool-todo/src/invariant.ts`), so a build in one language keeps the plain "Write your words"
 * and only a multi-language one splits it per language.
 * @param {Job} job @param {string} [lang]
 * @returns {TodoItem[]}
 */
export function todosOf(job, lang = 'en') {
  const w = wordsFor(lang)
  // The stage table is the PLUGIN's: which keys it has depends on the CMS (`plugin` is WordPress's
  // Polylang line and nothing else's), so it is read as a plain map here.
  const said = /** @type {Record<string, string>} */ (w.stages)
  const langs = languagesOf(job)
  const pages = Array.isArray(job.answers?.pages) ? job.answers.pages : []
  /** @type {TodoItem[]} */
  const out = []
  const add = (/** @type {string} */ content, /** @type {TodoItem['status']} */ status) =>
    out.push({ content, status })
  const skipped = (/** @type {string} */ content) => fill(said.skipped, { task: content })

  for (const stage of job.stages) {
    const status = statusOf(stage)
    // A stage still running may say how far it has got (`progressOf`), and while it does its line
    // carries that instead of standing mute. It goes back to the plain words the moment the stage
    // settles: a finished step saying "3 of 6" would be a lie the list keeps telling.
    const note = stage.status === 'running' ? sayProgress(stage.note, w) : null
    /**
     * What one line reads as, whatever words name its task.
     *
     * 🔒 EVERY LINE IS PHRASED HERE, and that is the point. The note used to be added at the plain
     * line only, so the moment the answers renamed a step the note stopped travelling with it —
     * and `BuildForm` starts with every page ON, so the answers rename the seed step in EVERY real
     * build. The longest step stayed mute for exactly the customers who had one (measured 09/09).
     * @param {string} task
     */
    const line = (task) => (stage.status === 'skipped' ? skipped(task) : note ? `${task} — ${note}` : task)

    if (stage.name === 'style' && (stage.detail ?? '').startsWith('agent:')) {
      add(line(said.styleWaiting), status)
      continue
    }

    if (stage.name === 'copy' && langs.length > 1) {
      for (const one of langs) add(line(fill(said.copyLang, { lang: languageName(one, lang, w) })), status)
      continue
    }

    if (stage.name === 'seed' && pages.length > 0) {
      add(line(fill(said.seedPages, { n: pages.length })), status)
      continue
    }

    add(line(wordsOf(stage.name, lang)), status)

    // The translation plugin rides on the theme stage, and stands right after it.
    //
    // 🔒 ONE SHAPE MEANS IT WENT ON, EVERY OTHER MEANS IT DID NOT. `withPolylang` never fails the
    // theme stage — it appends its own word to that stage's detail — and `polylangIfNeeded` has
    // half a dozen ways to say no. Naming two of them left the wp-CLI road ("polylang did not
    // install", or the tool's own first line) reading as done, which is the list claiming a
    // translation plugin the site has not got. So the line is claimed only for `polylang on`, and
    // only once the stage has settled: before that there is nothing yet to read either way.
    if (stage.name === 'theme' && langs.length > 1) {
      const on = /polylang on\b/.test(stage.detail ?? '')
      add(SETTLED.has(stage.status) && !on ? skipped(said.plugin) : said.plugin, status)
    }
  }
  return out
}

/**
 * What a stage's progress reads as, in the reader's language, or null when there is nothing to say.
 * @param {{ kind?: string, done?: number, total?: number } | undefined} note @param {any} w
 */
function sayProgress(note, w) {
  const kind = note?.kind
  const said = kind ? w.progress?.[kind] : undefined
  if (typeof said !== 'string' || said === '') return null
  return typeof note?.done === 'number' ? fill(said, { done: note.done, total: note.total ?? 0 }) : said
}

/**
 * A language's name in the reader's own language.
 *
 * 🔒 FROM `Intl`, NOT FROM A TABLE TYPED HERE. The picker offers seventy site languages
 * (`LanguageBox.tsx`) while Tracy's own words file speaks three, so a hand-written table read the
 * raw tag out to the customer — "Write your words in fr" (measured 09/09). `Intl` carries the
 * whole list in each of the three, and a runtime without the data falls back to the tag.
 *
 * `langNameLower` because CASING IS LANGUAGE DATA TOO: `Intl` answers with a standalone name, and
 * Vietnamese writes "tiếng Pháp" inside a sentence where that name is "Tiếng Pháp".
 * @param {string} tag - a site language the customer asked for.
 * @param {string | undefined} lang - the reader's language.
 * @param {any} w
 */
function languageName(tag, lang, w) {
  const primary = tag.toLowerCase().split(/[-_]/)[0]
  let name = primary
  try {
    name = new Intl.DisplayNames([spokenLang(lang)], { type: 'language' }).of(primary) ?? primary
  } catch {
    // A runtime without the display data for this pair: the tag itself is the honest fallback.
  }
  return w.langNameLower === true ? name.charAt(0).toLowerCase() + name.slice(1) : name
}

/**
 * A stage's detail put inside a sentence. Details come from the site, the model, or a shell — some
 * end in a full stop and some do not, and "…without a JSON object.. The customer sees…" is what
 * happens when the caller assumes either way.
 * @param {string} detail
 */
function closed(detail) {
  return /[.!?]$/.test(detail) ? detail : `${detail}.`
}

/**
 * The one line the agent hears when `stage` settles, or null while it runs. Plain statements: the
 * agent's tool description already says what to do on each outcome, this only says what happened.
 * @param {Job} job @param {Stage} stage @param {string} site
 * @returns {string | null}
 */
export function settledLine(job, stage, site) {
  const n = job.stages.findIndex((s) => s.name === stage.name) + 1
  const total = job.stages.length
  const task = wordsOf(stage.name)
  const done = /** @type {Record<string, string>} */ (DONE_WORDS)[stage.name] ?? `${task}: done`
  switch (stage.status) {
    case 'done':
      return `Build on ${site}: ${done} (${n} of ${total}).`
    case 'skipped':
      return `Build on ${site}: "${task}" skipped${stage.detail ? ` (${stage.detail})` : ''} (${n} of ${total}).`
    case 'failed':
      return `Build on ${site}: "${task}" failed${stage.detail ? `: ${closed(stage.detail)}` : '.'} The customer sees Retry in the Build tab.`
    case 'waiting': {
      const detail = stage.detail ?? ''
      if (detail.startsWith('form:'))
        return `Build on ${site} waits for the customer's answers in the Build tab (${detail.slice('form:'.length)}).`
      if (detail.startsWith('agent:'))
        return `Build on ${site} waits for you: ${detail.slice('agent:'.length)}. Call tracy_site_build status for the next step.`
      return `Build on ${site} is waiting${detail ? `: ${detail}` : ''}.`
    }
    default:
      return null
  }
}

/**
 * The source kind of every line a Build plugin injects; which plugin said it travels as `producer`.
 *
 * 🔒 NOT THE RETIRED `plugin` KIND. Session format V4 (dsh 0.1.7) has no shared catch-all kind — each
 * producer owns its own (`MessageSourceMap`, `@deepseek-ai/dsh-llm` `src/message.ts:103-115`) — and
 * the V4 codec refuses a `plugin` kind when the event is WRITTEN (`session-format-v3-to-v4`
 * `src/codec.ts:51,68` → `src/message-sources.ts:9`), so `agent.inject` would throw on every
 * settled stage. Any other nonempty kind is admitted, with no registry (dsh-session
 * `src/index.ts:354-359`), and extra source fields are kept. Not added to `MessageSourceMap` by
 * module augmentation: this plugin declares no `@deepseek-ai/dsh-*` dependency (see `types.ts`).
 * A line injected under dsh 0.1.6 reads back, after the V3→V4 migration, as
 * `{kind:'plugin:<producer>'}` (`src/sources.ts:64`); nothing here reads it back.
 */
export const BUILD_LINE_KIND = 'tracy-build'

/**
 * The message shape `Agent.inject` takes, built here rather than with dsh's `createUserMessage`:
 * this plugin declares no dependency on `@deepseek-ai/dsh-llm` (see `types.ts`), and the shape is
 * the documented one — an identified user-role message whose source is this producer's own kind.
 * @param {string} text @param {string} producer - the Build plugin's name, `tracy-site-build-wordpress`.
 */
export function injectedMessage(text, producer) {
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: BUILD_LINE_KIND, producer }
  })
}

/**
 * The question a failed stage puts in front of the customer, in dsh's own question vocabulary
 * (`ctx.userQuestions.ask`). The client renders it WHERE THE COMPOSER IS, so it cannot scroll away
 * the way a sentence in the chat does, and the answer comes back as a label rather than as typed
 * prose somebody has to interpret.
 *
 * One question, two options, and the failure's own detail as `detail`: the panel shows that text
 * without turning it into a choice. Every word comes from `words.mjs` in the customer's own
 * language, and the retry label is handed back with the request because {@link wantsRetry} reads
 * the answer BY LABEL — in Vietnamese the yes is "Thử lại bước này", not the English string.
 * @param {Job} job @param {Stage} stage @param {string} site @param {string} [lang]
 * @returns {{ retryLabel: string, questions: [{ id: string, question: string, detail?: string, header: string, options: { label: string, description: string }[] }] }}
 */
export function retryQuestion(job, stage, site, lang = 'en') {
  const w = wordsFor(lang)
  const n = job.stages.findIndex((s) => s.name === stage.name) + 1
  const task = wordsOf(stage.name, lang)
  /**
   * ⚠ "RUN IT AGAIN FROM WHERE IT STOPPED" IS A PROMISE, AND ON AN IDENTITY REFUSAL IT IS ONE
   * NOBODY CAN KEEP. The same call, made the same way, by the same nobody, is refused the same
   * way — so the button offers the step that has to come FIRST. Measured 17/09 on the dev
   * machine: a build stopped at step 2 of 7 with `NOT_SIGNED_IN` and the panel's only suggestion
   * was to try it again, which is how a person spends an evening pressing a button.
   *
   * The action is still a retry — `wantsRetry` reads whichever label was OFFERED — so choosing it
   * runs the step, once the person has done the thing the label names.
   */
  const identity = typeof stage.code === 'string' && AUTH_REFUSALS.has(stage.code)
  const go = identity
    ? { label: w.signIn, description: w.signInWhy }
    : { label: w.retry, description: w.retryWhy }
  return {
    retryLabel: go.label,
    questions: [
      {
        id: `retry:${stage.name}`,
        question: fill(w.question, { task, n, total: job.stages.length }),
        header: fill(w.header, { site }),
        ...(stage.detail ? { detail: detailIn(stage, lang) ?? stage.detail } : {}),
        options: [go, { label: w.leave, description: w.leaveWhy }]
      }
    ]
  }
}

/**
 * Whether an answer to {@link retryQuestion} asked for the retry. Read by LABEL: a UI that
 * presents the question its own way still answers with the labels the asker offered, and a
 * customer who typed something instead of choosing lands in `custom`, which is not a yes.
 *
 * The label to match is the one the request carried, so this works in every language the question
 * can be asked in.
 * @param {{ answers?: { id?: string, selected?: string[] }[] } | null | undefined} answer
 * @param {string} retryLabel - the label {@link retryQuestion} offered as the retry.
 * @returns {boolean}
 */
export function wantsRetry(answer, retryLabel) {
  const answers = answer?.answers
  if (!Array.isArray(answers) || typeof retryLabel !== 'string' || retryLabel === '') return false
  return answers.some((one) => Array.isArray(one?.selected) && one.selected.includes(retryLabel))
}

/**
 * The `onChange` a build runs with: every change rewrites the plan into each session standing in
 * the site folder, and every stage that has just settled is told to that session's agent once.
 * Nothing here may stop the build — a session that refuses the append, or an agent already
 * disposed, is warned about once and skipped.
 *
 * `onFailed` is called once per failure, with the same once-only rule as the injected line: it is
 * where the host puts the question to the customer. It is deliberately NOT awaited — the question
 * outlives this call, and a build must never wait on a person from inside its own change handler.
 * @param {{
 *   sessionsFor: (job: Job) => SessionLike[],
 *   agentFor: (sessionId: string) => AgentLike | undefined,
 *   site: string,
 *   plugin?: string,
 *   warn?: (line: string) => void,
 *   onFailed?: (job: Job, stage: Stage) => void,
 *   langOf?: (job: Job) => string
 * }} doors
 * @returns {(job: Job) => void}
 */
export function planReporter({
  sessionsFor,
  agentFor,
  site,
  plugin = 'tracy-site-build',
  warn = () => {},
  onFailed,
  langOf = () => 'en'
}) {
  /** @type {Map<string, string>} last settled status told per stage, so a stage is told once */
  const told = new Map()
  const warned = new Set()
  /** @param {string} key @param {unknown} error */
  const once = (key, error) => {
    if (warned.has(key)) return
    warned.add(key)
    warn(`${plugin}: ${key}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return (job) => {
    const sessions = sessionsFor(job)
    const todos = todosOf(job, langOf(job))
    for (const session of sessions) {
      try {
        session.append('todo/write', { todos })
      } catch (error) {
        once(`todo/write refused by session ${session.id}`, error)
      }
    }
    for (const stage of job.stages) {
      if (!SETTLED.has(stage.status)) continue
      // `job.job` is the id — the field `build.mjs` writes. This read said `job.id`, which no job
      // has, so every key was `undefined:<stage>` and two builds in one folder shared one row:
      // a rerun's stage would be read as already told and its line never injected. Found by `tsc`
      // once this module stopped re-typing the shape it reads (09/09).
      const key = `${job.job}:${stage.name}`
      const mark = `${stage.status}:${stage.detail ?? ''}`
      if (told.get(key) === mark) continue
      told.set(key, mark)
      const line = settledLine(job, stage, site)
      if (line === null) continue
      for (const session of sessions) {
        const agent = agentFor(session.id)
        if (!agent) continue
        try {
          agent.inject(injectedMessage(line, plugin))
        } catch (error) {
          once(`inject refused by agent ${session.id}`, error)
        }
      }
      if (stage.status === 'failed' && onFailed) {
        try {
          onFailed(job, stage)
        } catch (error) {
          once(`asking about ${stage.name} failed`, error)
        }
      }
    }
  }
}
