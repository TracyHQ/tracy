/**
 * The shipped `tracy_emdash` (`lib/index.js`) driven through the host's own seams, for the suites that
 * must prove a rule survives the wiring — the fence, `withNext`, the customer-answer listener — and not
 * only `runEmdashTool` (`emdash-door-fixture.mjs`). The site is an EmDash MCP door behind `config.exec`:
 * every JSON-RPC request is recorded and answered by `on(name, args)`. The same seams `handler.test.mjs`
 * uses, in the little of them these suites need.
 */
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { apply } from '../lib/index.js'

/** A sites root with one empty label folder; the tools read `TRACY_SITES_ROOT`, the caller clears it. */
export function siteWorkspace(label = 'emd-host') {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-emdash-host-'))
  mkdirSync(path.join(root, label), { recursive: true })
  process.env.TRACY_SITES_ROOT = root
  return { root, label, cwd: path.join(root, label) }
}

/**
 * A host with `tracy_emdash` registered on an EmDash site whose door answers `on(name, args)` — the data
 * EmDash would put in its text part, or `{isError:true, text}` for its own refusal. The served-locale
 * read answers `served`. Returns the tool (`run`), `tracy_site` of the same conversation (`site`), the
 * `ctx.on` listeners by event name (`listeners`: fire `tools/result` to be the customer answering a card,
 * or a tool that finished; `agent/pre-step` to be a step of the conversation), every request the site
 * received and the site's folder (`cwd`).
 * @param {{ served?: string[], on?: (name: string, args: any) => any }} [opts]
 */
export function emdashHost({ served = ['en'], on = () => ({ ok: true }) } = {}) {
  const { cwd } = siteWorkspace()
  /** @type {Array<{ name: string, args: any }>} */
  const calls = []
  const exec = async (/** @type {any} */ input) => {
    // The MCP call is the only exec these suites make: `curl -i` into the site's own container.
    const request = JSON.parse(String(input.stdin))
    const name = request.method === 'tools/list' ? '{list}' : request.params.name
    const args = request.params?.arguments ?? {}
    calls.push({ name, args })
    const data =
      name === 'content_list' && args.collection === 'site' && args.status === 'published'
        ? {
            items: served.map((locale, i) => ({
              id: `01M36TA5254KTX8AKZQMK4BZ${String(i).padStart(2, '0')}`,
              locale,
              status: 'published'
            }))
          }
        : on(name, args)
    const result =
      data && data.isError === true
        ? { isError: true, content: [{ type: 'text', text: data.text }] }
        : { content: [{ type: 'text', text: JSON.stringify(data) }] }
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, result })
    return { code: 0, stdout: `TRACY_MCP 200\n${body}`, stderr: '', timedOut: false }
  }
  const tools = new Map()
  const listeners = new Map()
  const ctx = {
    webServer: { register: () => () => {} },
    tools: { register: (/** @type {any} */ t) => (tools.set(t.name, t), () => {}) },
    effect: (/** @type {() => void} */ setup) => {
      setup()
    },
    on: (/** @type {string} */ name, /** @type {Function} */ fn) =>
      listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: () => undefined
  }
  apply(ctx, {
    origin: 'http://door.test',
    now: () => new Date('2026-09-30T12:00:00Z'),
    emdash: { cms: async () => 'emdash' },
    exec
  })
  const emdash = tools.get('tracy_emdash')
  const run = (/** @type {unknown} */ args) =>
    emdash.execute(args, { agent: { session: { id: 'session-x', header: { cwd } } } })
  // `tracy_site` of the same conversation (same session, same site): its EmDash media doors run through the
  // same `tracy_emdash` road and the same state, which is what a suite about that wiring needs to drive.
  const site = (/** @type {unknown} */ args) =>
    tools.get('tracy_site').execute(args, { agent: { session: { id: 'session-x', header: { cwd } } } })
  /**
   * The customer answering the card a refusal handed the agent: the option at `option` (0 = the go-ahead).
   * @param {{ ask: { questions: Array<{ id: string, options: Array<{ label: string }> }> } }} refusal
   */
  const answerAsk = (refusal, option = 0) => {
    const [q] = refusal.ask.questions
    for (const fn of listeners.get('tools/result') ?? [])
      fn(
        {
          name: 'ask_user_question',
          arguments: refusal.ask,
          agent: { session: { id: 'session-x', header: { cwd } } }
        },
        { isError: false, value: { answers: [{ id: q.id, selected: [q.options[option].label] }] } }
      )
  }
  return { run, site, answerAsk, calls, cwd, listeners }
}
