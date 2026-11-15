// The site reset hook of the release gate (ticket #586): write safety and the minimum structure variant each need a
// fresh blank site, many times in one run. The gate does not know how a machine makes one (a database snapshot put
// back, a restore): the caller gives a command (`--reset-site "<cmd>"`), the gate runs it and then checks the site is
// what it must be before anything is written (waiting, bounded, while it does not answer yet): the pinned plugin, bound to its blank site contract, every contract slot
// at its blank value and none of the build's records left. No command: no reset, and those measurements are `not_run`.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Run a reset command in a shell; its output is the caller's to keep. */
export async function runCommand(command) {
  const { stdout, stderr } = await run('/bin/sh', ['-c', command], { maxBuffer: 16 * 1024 * 1024 })
  return { stdout, stderr }
}

/**
 * What is wrong with a site that should be fresh and blank: `[{code, ...}]`, empty when it is fresh.
 * @param {{send: (operation: string, payload: object) => Promise<object>, pin?: string | null, contract?: string | null,
 *   contentMap?: {slots?: object[]}, find?: (mark: string) => Promise<number | null>, marks?: string[]}} input
 *   `contract`: the blank site contract the site must bind; `marks`: the marks of the records the build makes, each
 *   looked for; `snapshot`: each slot's raw value read on the site before its first write (`slotSnapshot`): with it, a
 *   slot that holds anything else, white space included, is not blank
 */
export async function freshProblems({
  send,
  pin = null,
  contract = null,
  contentMap = null,
  find = null,
  marks = [],
  snapshot = null
}) {
  const problems = []
  const version = (await send('info', {})).info?.component ?? null
  if (pin && version !== pin) problems.push({ code: 'plugin_not_pinned', expected: pin, found: version })
  const bound = await send('content.contract', { operation: 'bind' })
  if (contract && bound.contract !== contract)
    problems.push({ code: 'contract_not_bound', expected: contract, found: bound.contract ?? null })
  // Compared without the white space around it: a blank site keeps some emptied texts as a line break or a space where
  // the contract samples nothing, while any value the build writes holds text.
  const text = (v) => String(v ?? '').trim()
  const blank = new Map((contentMap?.slots ?? []).map((s) => [s.key, text(s.sample)]))
  if (blank.size) {
    const state = await send('content.contract', { operation: 'inspect' })
    // Against the site's own first read when there is one: a leftover of white space alone is a leftover too.
    const differs = (s) =>
      snapshot?.has(s.key)
        ? String(s.current ?? '') !== snapshot.get(s.key)
        : text(s.current) !== blank.get(s.key)
    const written = (state.slots ?? []).filter((s) => blank.has(s.key) && differs(s))
    if (written.length)
      problems.push({
        code: 'slot_not_blank',
        count: written.length,
        first: written.slice(0, 5).map((s) => s.key)
      })
  }
  if (find) {
    const left = []
    for (const mark of marks) if ((await find(mark)) != null) left.push(mark)
    if (left.length) problems.push({ code: 'record_left', mark: left[0], marks: left })
  }
  return problems
}

/** Each contract slot's raw value as the site holds it now: the snapshot a later reset is held to. */
export async function slotSnapshot(send) {
  const state = await send('content.contract', { operation: 'inspect' })
  return new Map((state.slots ?? []).map((s) => [s.key, String(s.current ?? '')]))
}

/** The answers of a site still coming back after its reset (a 502 page is not JSON): wait for these, nothing else. */
const NOT_UP = new Set(['not_json', 'no_answer'])
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The reset hook: null without a command; else a function that runs the command, waits while the site does not answer
 * yet (a database snapshot put back answers 502 for a moment; at most `waitSeconds`, then `reset_site_unreachable`),
 * and refuses a site that is not fresh.
 * @param {{command?: string | null, check: () => Promise<object[]>, exec?: (command: string) => Promise<object>,
 *   log?: (line: string) => void, waitSeconds?: number, sleep?: (ms: number) => Promise<void>, now?: () => number}}
 *   input
 * @returns {(() => Promise<void>) | null}
 */
export function siteReset({
  command = null,
  check,
  exec = runCommand,
  log = () => {},
  waitSeconds = 90,
  sleep = pause,
  now = Date.now
}) {
  if (!command) return null
  const checked = async () => {
    const until = now() + waitSeconds * 1000
    for (;;) {
      try {
        return await check()
      } catch (error) {
        if (!NOT_UP.has(error?.code)) throw error
        if (now() >= until)
          throw Object.assign(
            new Error('the site did not answer within ' + waitSeconds + ' s of its reset'),
            {
              code: 'reset_site_unreachable',
              cause: error.code
            }
          )
        await sleep(2000)
      }
    }
  }
  return async () => {
    const began = now()
    await exec(command)
    const problems = await checked()
    log('site reset in ' + Math.round((now() - began) / 100) / 10 + ' s')
    if (problems.length)
      throw Object.assign(new Error('the site is not fresh after its reset: ' + JSON.stringify(problems)), {
        code: 'reset_not_fresh',
        problems
      })
  }
}
