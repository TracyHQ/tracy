/**
 * REG-PR-1085-new-assistant-401: a fresh seat (a signed session whose email has no account yet,
 * so no site either) opens the creation page `/new/`; Help's restore of the session's conversation
 * (`GET /api/assistant/conversation?session=…`) answers 200 with an empty conversation, never 401.
 *
 * Writes: nothing of its own. The page itself creates the onboarding session in dsh for the fresh
 * address, as any first visit does.
 */
import { api, expect, ORIGIN, seatContext, test } from './stand.mjs'

const DOOR = '/api/assistant/conversation'

test('REG-PR-1085 fresh seat on /new/ restores Help without a 401', async ({ browser }) => {
  const FRESH = `reg1085-${Date.now()}@example.test`

  // The door itself, as the fresh seat.
  const direct = await api(FRESH, 'GET', `${DOOR}?session=reg1085`)
  console.log(
    `DIRECT = HTTP ${direct.status}; conversationId = ${String(direct.json?.conversationId)}; turns = ${JSON.stringify(direct.json?.turns)}`
  )
  expect.soft(direct.status, 'direct GET status').toBe(200)
  expect.soft(direct.json?.conversationId, 'direct conversationId').toBe(null)
  expect.soft(direct.json?.turns, 'direct turns').toEqual([])

  // The page, as the fresh seat.
  const context = await seatContext(browser, FRESH)
  const page = await context.newPage()
  const seen = []
  page.on('response', (r) => {
    if (new URL(r.url()).pathname === DOOR) seen.push(r.status())
  })
  const first = page.waitForResponse((r) => new URL(r.url()).pathname === DOOR, { timeout: 120_000 })
  await page.goto(`${ORIGIN}/new/`)
  await first
  // A second restore (another session id mounting) would land within a few seconds.
  await page.waitForTimeout(5_000)
  console.log(`PAGE ${DOOR} statuses = ${JSON.stringify(seen)}`)
  expect.soft(seen.length, 'the page restored Help at least once').toBeGreaterThan(0)
  expect
    .soft(
      seen.filter((s) => s >= 400),
      'no 4xx/5xx on the restore'
    )
    .toEqual([])
})
