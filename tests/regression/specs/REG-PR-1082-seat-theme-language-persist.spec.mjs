/**
 * REG-PR-1082-seat-theme-language-persist: a seat's Appearance and Language survive a reload, and no
 * `settings/mutate` is sent for them (before the fix: 403 on every pick, gone after a reload).
 *
 * Steps S1–S6 of the case. Seat `a` on the stand's WordPress site (`REG_SITE` when the stand's name is
 * too short to make a label). The owner half: on a Tracy stand every browser behind the gate is a seat
 * (the password doors answer 404 once the seat door is configured), so the owner's `host` mode is
 * judged by dsh-passwords' own gateway test, run here as S6.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, ORIGIN, seatContext, siteKey, test } from './stand.mjs'

const SITE = process.env.REG_SITE ?? siteKey('wp')
const TRIGGER = '[data-tracy-account-trigger]'
const DIALOG = '[role=dialog][data-shortcut-modal=settings]'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
/** Tracy's own Settings sections (tracy-settings, tracy-my-sites, tracy-model-plan, notifications). */
const TRACY_SECTIONS = ['General', 'Account', 'AI accounts', 'Notifications']

/** Body background as sRGB luminance 0..1 (dsh paints in oklch; a 1px canvas converts it). */
const bodyLuminance = (page) =>
  page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  })

async function ready(page) {
  await page.locator('.tsb-root').first().waitFor({ timeout: 90_000 })
  await page.locator(TRIGGER).waitFor({ timeout: 60_000 })
  await page.waitForTimeout(2_000)
}

async function openSettings(page) {
  await page.locator(TRIGGER).click()
  await page.locator('[data-menu-item=settings]').click()
  await page.locator(DIALOG).waitFor({ timeout: 10_000 })
  await page.waitForTimeout(500)
  return page.locator(DIALOG)
}

async function pickTheme(page, id) {
  await page.locator(TRIGGER).click()
  await page.locator('[data-menu-item=appearance]').hover()
  await page.waitForTimeout(400)
  await page.locator(`[data-menu-item=theme-${id}]`).click()
  await page.waitForTimeout(800)
}

/** Settings › General › Language: pick a row by its visible name, or the first row (Follow device). */
async function pickLanguage(page, name) {
  const d = await openSettings(page)
  await d.locator('button.ts-select').first().click()
  if (name) await page.getByRole('menuitemradio', { name }).click()
  else await page.getByRole('menuitemradio').first().click()
  await page.waitForTimeout(1_500)
  await page.keyboard.press('Escape')
  await page.locator(DIALOG).waitFor({ state: 'detached', timeout: 10_000 })
}

test('REG-PR-1082 seat theme and language persist', async ({ browser }) => {
  // S1
  const context = await seatContext(browser, 'a', {
    colorScheme: 'light',
    viewport: { width: 1280, height: 800 }
  })
  const page = await context.newPage()
  const mutate = []
  const forbidden = []
  page.on('request', (r) => {
    if (r.url().includes('settings/mutate')) mutate.push({ url: r.url(), body: r.postData()?.slice(0, 200) })
  })
  page.on('response', (r) => {
    if (r.status() === 403) forbidden.push(new URL(r.url()).pathname)
  })
  await page.goto(`${ORIGIN}/${SITE}`)
  await page.waitForURL(/\/s\/session-/, { timeout: 90_000 })
  await ready(page)
  const flag = await page.evaluate(() => globalThis.__TRACY_SETTINGS_PERSISTENCE__ ?? null)
  console.log(`S1 seat page flag = ${flag}`)
  expect.soft(flag, 'the gateway marks a seat page memory').toBe('memory')

  try {
    // S2: Dark from the account menu, then reload.
    await pickTheme(page, 'dark')
    const darkNow = await bodyLuminance(page)
    await page.reload()
    await ready(page)
    const darkAfterReload = await bodyLuminance(page)
    const stored = await page.evaluate(() =>
      Object.fromEntries(
        Object.keys(localStorage)
          .filter((k) => /theme/i.test(k))
          .map((k) => [k, localStorage.getItem(k)])
      )
    )
    console.log(
      `S2 luminance now ${darkNow.toFixed(2)}, after reload ${darkAfterReload.toFixed(2)}, localStorage ${JSON.stringify(stored)}, mutate ${mutate.length}, 403 ${JSON.stringify(forbidden)}`
    )
    expect.soft(darkNow, 'dark at once').toBeLessThan(0.3)
    expect.soft(darkAfterReload, 'still dark after reload').toBeLessThan(0.3)

    // S3: Vietnamese from Settings › General › Language, then reload.
    await pickLanguage(page, 'Tiếng Việt')
    await page.reload()
    await ready(page)
    const d = await openSettings(page)
    const navVi = await d.locator('.ts-nav').allInnerTexts()
    await page.keyboard.press('Escape')
    await page.locator(DIALOG).waitFor({ state: 'detached', timeout: 10_000 })
    console.log(
      `S3 nav after reload ${JSON.stringify(navVi)}, mutate ${mutate.length}, 403 ${JSON.stringify(forbidden)}`
    )
    expect.soft(navVi, 'Vietnamese after reload').toContain('Tài khoản AI')

    // S4: no settings/mutate and no 403 in the whole window (S2–S3).
    console.log(`S4 mutate ${JSON.stringify(mutate)} 403 ${JSON.stringify(forbidden)}`)
    expect.soft(mutate, 'no settings/mutate request').toEqual([])
    expect.soft(forbidden, 'no 403').toEqual([])
  } finally {
    // S5 (restore, then read what Settings shows a seat): Follow device, System.
    await pickLanguage(page, null).catch((e) => console.log(`restore language: ${e.message}`))
    await pickTheme(page, 'system').catch((e) => console.log(`restore theme: ${e.message}`))
  }
  await page.reload()
  await ready(page)
  const d = await openSettings(page)
  const nav = await d.locator('.ts-nav').allInnerTexts()
  // General mixes Tracy rows (`.ts-row-title`) and dsh's own cards (other markup), so read its text.
  const general = (await d.locator('.ts-content').innerText()).replace(/\s+/g, ' ').trim()
  await page.keyboard.press('Escape')
  console.log(
    `S5 sections ${JSON.stringify(nav)} General text ${JSON.stringify(general)} luminance ${(await bodyLuminance(page)).toFixed(2)}`
  )
  for (const s of TRACY_SECTIONS) expect.soft(nav, `Tracy section ${s} still there`).toContain(s)
  for (const c of ['Language', 'Appearance']) expect.soft(general, `General shows ${c}`).toContain(c)

  // S6: the owner keeps `host` — dsh-passwords' gateway test (master page has no flag, bundle decides host).
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test', '--test-reporter=tap', 'test/tracy/seat-settings-persistence.test.ts'],
    { cwd: join(ROOT, 'vendor', 'tracy', 'dsh-passwords'), encoding: 'utf8', timeout: 180_000 }
  )
  const oks = (r.stdout ?? '').split('\n').filter((l) => /^(not )?ok \d+ - /.test(l.trim()))
  console.log(`S6 exit ${r.status}\n${oks.join('\n')}`)
  expect.soft(r.status, 'seat-settings-persistence.test.ts passes').toBe(0)
})
