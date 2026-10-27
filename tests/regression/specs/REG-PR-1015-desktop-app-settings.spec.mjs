/**
 * REG-PR-1015-desktop-app-settings: `/ops/ui` opens on a Desktop App area at the top of its rail,
 * and pressing its switches changes what the desktop app reads at `GET /api/desktop/config` — while
 * `GET /api/ui` keeps its one-column answer (`{ hidden }`, no surface) and does not move.
 *
 * The ops seat is `REG_OPS_SEAT` (a letter or an address; default `a`): it must be an owner or admin
 * of the `tracy_admin` workspace. Whatever the spec presses is put back in `finally`.
 */
import { api, expect, ORIGIN, seatContext, test } from './stand.mjs'

const SEAT = process.env.REG_OPS_SEAT ?? 'a'
const CONNECT = 'Let customers connect their own model plan'
const CODEX = 'ChatGPT Codex'

/** The app's own read: no cookie, no origin. */
async function desktopConfig() {
  const r = await fetch(`${ORIGIN}/api/desktop/config`, { signal: AbortSignal.timeout(30_000) })
  return { status: r.status, cache: r.headers.get('cache-control'), json: await r.json() }
}

async function uiAnswer() {
  const r = await fetch(`${ORIGIN}/api/ui`, { signal: AbortSignal.timeout(30_000) })
  return r.json()
}

test('REG-PR-1015 Desktop App area drives /api/desktop/config, /api/ui untouched', async ({ browser }) => {
  // S1: what the stand says before anything is pressed.
  const before = await desktopConfig()
  console.log(`desktop config before: ${before.status} ${before.cache} ${JSON.stringify(before.json)}`)
  expect(before.status).toBe(200)
  expect(before.cache).toBe('no-store')
  expect(Object.keys(before.json).sort()).toEqual(['llm', 'tracyModel'])
  const uiBefore = await uiAnswer()
  console.log(`/api/ui keys: ${JSON.stringify(Object.keys(uiBefore))}, hidden ${uiBefore.hidden.length}`)
  expect(Object.keys(uiBefore)).toEqual(['hidden'])
  // `?surface=desktop` was the per-switch Desktop column this PR removed: it must change nothing now.
  const surface = await (await fetch(`${ORIGIN}/api/ui?surface=desktop`)).json()
  console.log(`/api/ui?surface=desktop hidden ${surface.hidden.length}`)
  expect([...surface.hidden].sort()).toEqual([...uiBefore.hidden].sort())

  const original = before.json.llm
  try {
    // S2: start from connecting off and Claude alone, so both presses below change something.
    const reset = await api(SEAT, 'PUT', '/api/ops/desktop', {
      llm: { connect: false, providers: ['claude'] }
    })
    expect(reset.status).toBe(200)

    // S3: the screen — Desktop App is the first rail entry and the page it opens on.
    const context = await seatContext(browser, SEAT)
    const page = await context.newPage()
    await page.goto(`${ORIGIN}/ops/ui`)
    const rail = page.locator('nav a[href^="?area="]')
    await expect(rail.first()).toHaveText('Desktop App', { timeout: 60_000 })
    await expect(rail.first()).toHaveAttribute('aria-current', 'page')
    const railText = await rail.allInnerTexts()
    console.log(`rail: ${JSON.stringify(railText)}`)

    const connect = page.getByRole('switch', { name: CONNECT })
    const codex = page.getByRole('switch', { name: CODEX })
    await expect(connect).toHaveAttribute('aria-checked', 'false')
    await expect(codex).toBeDisabled()

    // S4: connecting on → the app's answer follows; the vendor switches come alive.
    await connect.click()
    await expect(connect).toHaveAttribute('aria-checked', 'true')
    await expect(codex).toBeEnabled()
    const afterConnect = (await desktopConfig()).json.llm
    console.log(`after connect: ${JSON.stringify(afterConnect)}`)
    expect(afterConnect).toEqual({ connect: true, providers: ['claude'] })

    // S5: one vendor more → the app's list follows, in the screen's order.
    await codex.click()
    await expect(codex).toHaveAttribute('aria-checked', 'true')
    const afterCodex = (await desktopConfig()).json.llm
    console.log(`after codex: ${JSON.stringify(afterCodex)}`)
    expect(afterCodex).toEqual({ connect: true, providers: ['claude', 'codex'] })

    // S6: the switches of every other area did not move.
    const uiAfter = await uiAnswer()
    console.log(
      `/api/ui after: keys ${JSON.stringify(Object.keys(uiAfter))}, hidden ${uiAfter.hidden.length}`
    )
    expect(Object.keys(uiAfter)).toEqual(['hidden'])
    expect([...uiAfter.hidden].sort()).toEqual([...uiBefore.hidden].sort())
  } finally {
    const back = await api(SEAT, 'PUT', '/api/ops/desktop', { llm: original })
    console.log(`restored: ${back.status} ${JSON.stringify(back.json?.llm)}`)
  }
})
