// Chat with the site's agent the way a person does: typed into the dsh workspace in the suite's
// own browser (the road S0 measured on WordPress: chat box ready ~6.5 s, a turn ~15 s, its first
// Activity V2 row ~23 s after sending). Every prompt is counted against the run's chat budget
// (plan §2 D4: 6 prompts per run, retries included, and 24 minutes of chat), kept in a file of the
// run folder because each journey runs in its own process.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ENV } from './env.mjs'
import { Blocked } from './journey.mjs'

export const CHAT_BUDGET = Object.freeze({ prompts: 6, ms: 24 * 60_000 })

/**
 * @typedef {{ journey: string, text: string, at: string, ms: number | null }} PromptRecord
 * @typedef {{ prompts: PromptRecord[] }} ChatLedger
 */

function ledgerFile(runDir) {
  return join(runDir, 'chat-budget.json')
}

/** @returns {ChatLedger} */
export function readChatLedger(runDir) {
  const file = ledgerFile(runDir)
  if (!existsSync(file)) return { prompts: [] }
  return JSON.parse(readFileSync(file, 'utf8'))
}

function writeLedger(runDir, body) {
  const file = ledgerFile(runDir)
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`)
  renameSync(tmp, file)
}

/** Chat time spent so far: finished prompts by their measured time, open ones until now. */
function spentMs(ledger) {
  return ledger.prompts.reduce((sum, p) => sum + (p.ms ?? Date.now() - Date.parse(p.at)), 0)
}

/**
 * Take one prompt from the run's budget, or BLOCK the step: the budget is a ceiling of the plan,
 * not a failure of the mechanism under test.
 * @param {string} runDir
 * @param {string} journey
 * @param {string} text
 * @returns {number} the prompt's index in the ledger
 */
export function reservePrompt(runDir, journey, text) {
  const ledger = readChatLedger(runDir)
  if (ledger.prompts.length >= CHAT_BUDGET.prompts)
    throw new Blocked(
      `chat budget spent: ${ledger.prompts.length}/${CHAT_BUDGET.prompts} prompts`,
      'chat-budget'
    )
  const spent = spentMs(ledger)
  if (spent >= CHAT_BUDGET.ms)
    throw new Blocked(
      `chat time budget spent: ${Math.round(spent / 1000)} s of ${CHAT_BUDGET.ms / 1000} s`,
      'chat-budget'
    )
  ledger.prompts.push({ journey, text, at: new Date().toISOString(), ms: null })
  writeLedger(runDir, ledger)
  return ledger.prompts.length - 1
}

/** Record how long a reserved prompt took (until its turn closed, or the wait gave up). */
export function settlePrompt(runDir, index, ms) {
  const ledger = readChatLedger(runDir)
  if (ledger.prompts[index]) ledger.prompts[index].ms = ms
  writeLedger(runDir, ledger)
}

/** What is left of the chat time budget, for a wait that must not outlive it. */
export function chatTimeLeftMs(runDir) {
  return Math.max(0, CHAT_BUDGET.ms - spentMs(readChatLedger(runDir)))
}

/**
 * Open a site's workspace and wait until the chat box takes input (the boot cover is gone).
 * @param {import('playwright').Page} page
 * @param {string} siteKey
 * @returns {Promise<{ status: number | null, bootMs: number }>}
 */
export async function openWorkspace(page, siteKey) {
  const t0 = Date.now()
  const res = await page.goto(`${ENV.origin}/${siteKey}/`, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForFunction(
    () => {
      const ready = document.querySelector('[contenteditable="true"]')
      const cover = document.querySelector('.tracy-boot-cover')
      return !!ready && (!cover || getComputedStyle(cover).pointerEvents === 'none')
    },
    null,
    { timeout: 120_000 }
  )
  return { status: res?.status() ?? null, bootMs: Date.now() - t0 }
}

/**
 * The site's Activity V2 rows as the owner reads them (`GET …/activity?version=2`).
 * @param {import('./api.mjs').Client} client
 * @param {string} siteKey
 */
export async function activityV2(client, siteKey) {
  const res = await client.get(`/api/sites/${encodeURIComponent(siteKey)}/activity?version=2`)
  if (res.status !== 200) throw new Error(`activity v2 answered ${res.status} ${res.json?.code ?? ''}`)
  return /** @type {any[]} */ (res.json?.items ?? [])
}

/**
 * Type one prompt into the open workspace and wait for the turn it starts to close in Activity V2.
 * The turn is found by its request text (it carries the run id), so rows of other turns never
 * count. Throws `Blocked('model')` when no turn closes in time: the agent did not do the work, and
 * whatever depends on it cannot be judged.
 * @param {{ runDir: string, journey: string, page: import('playwright').Page,
 *   client: import('./api.mjs').Client, siteKey: string, text: string, match?: string, waitMs?: number }} opts
 * @returns {Promise<{ row: any, sentAt: number, firstRowMs: number | null, closedMs: number }>}
 */
export async function chatTurn({ runDir, journey, page, client, siteKey, text, match, waitMs = 6 * 60_000 }) {
  const index = reservePrompt(runDir, journey, text)
  // The row is found by a piece of the prompt that only this prompt carries (the run id and step);
  // the stored request text may be trimmed or reflowed.
  const needle = match ?? text.trim().slice(0, 120)
  const sentAt = Date.now()
  let firstRowMs = null
  try {
    const box = page.locator('[contenteditable="true"]').first()
    await box.click({ timeout: 30_000 })
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
    const limit = Math.min(waitMs, chatTimeLeftMs(runDir) + 60_000)
    while (Date.now() - sentAt < limit) {
      await page.waitForTimeout(5_000)
      const rows = await activityV2(client, siteKey).catch(() => [])
      const row = rows.find((r) => r?.kind === 'turn' && String(r?.request?.text ?? '').includes(needle))
      if (row && firstRowMs === null) firstRowMs = Date.now() - sentAt
      if (row && row.state === 'closed') return { row, sentAt, firstRowMs, closedMs: Date.now() - sentAt }
    }
    throw new Blocked(
      `no closed turn for the prompt within ${Math.round(limit / 1000)} s (first row ${firstRowMs ?? 'never'} ms)`,
      'model'
    )
  } finally {
    settlePrompt(runDir, index, Date.now() - sentAt)
  }
}
