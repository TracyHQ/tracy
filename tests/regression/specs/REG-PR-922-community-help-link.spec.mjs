/**
 * REG-PR-922-community-help-link: Discord is one press away — the Community row of the account
 * menu (it left the rail in PR #1082) and the floating Need help? pill in the conversation.
 *
 * Steps S1–S6 of the case. The pill is off by default (its `help-button` switch), so, as in
 * REG-PR-924, this context reads `/api/ui` with that one id taken out; the stand's own setting is
 * not touched, and HIDDEN (S2) is the stand's real answer.
 */
import { expect, ORIGIN, seatContext, siteKey, test } from './stand.mjs'

const URL_ = 'https://discord.gg/BM9TMRcEBb'
const TRIGGER = '[data-tracy-account-trigger]'
const KEY = 'tracy.help-button.hidden'

/**
 * The composer's box. The slot `conversation.composer` is display:contents and its first child with
 * a box is the whole conversation column (measured 09/10/2026 on the acm stand: 42→900 px tall),
 * which every pill "overlaps". So walk up from the input (`[data-composer-input]`) and keep the
 * largest ancestor still shorter than half the viewport: the composer bar itself.
 */
const composerBox = (page) =>
  page.evaluate(() => {
    let el = document.querySelector("[data-composer-input='true']")
    if (!el) return null
    let best = el.getBoundingClientRect()
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const b = p.getBoundingClientRect()
      if (b.height === 0) continue
      if (b.height >= window.innerHeight / 2) break
      best = b
      el = p
    }
    return { top: best.top, bottom: best.bottom, left: best.left, right: best.right }
  })

test('REG-PR-922 community row and help pill', async ({ browser }) => {
  const context = await seatContext(browser, 'a')
  let hidden = []
  await context.route('**/api/ui', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    hidden = body.hidden ?? []
    await route.fulfill({
      response: res,
      json: { ...body, hidden: hidden.filter((id) => id !== 'help-button') }
    })
  })
  const page = await context.newPage()
  // S1: a workspace page (the pill lives in the conversation column).
  // `REG_SITE` names the site when the stand's name is too short to make a label of (`acm` + `wp`).
  await page.goto(`${ORIGIN}/${process.env.REG_SITE ?? siteKey('wp')}`)
  await page.waitForURL(/\/s\/session-/, { timeout: 90_000 })
  await page.evaluate((k) => localStorage.removeItem(k), KEY)
  await page.reload()
  await page.locator('.tsb-root').first().waitFor({ timeout: 90_000 })
  await page.locator(TRIGGER).waitFor({ timeout: 30_000 })

  // S2
  console.log(`S2 HIDDEN ${JSON.stringify(hidden)}`)
  const rowShown = !hidden.includes('community-link')

  // S3
  const railRow = await page.locator('.tsb-community').count()
  await page.evaluate(() => {
    window.__opened = []
    window.open = (...args) => {
      window.__opened.push(args)
      return null
    }
  })
  await page.locator(TRIGGER).click()
  await page.locator('[role=menu]').first().waitFor()
  const rows = await page.evaluate(() => {
    const panel = document.querySelector('[role=menu]')
    return [...panel.querySelectorAll('[data-menu-item]')]
      .filter((el) => el.closest('[role=menu]') === panel)
      .map((el) => el.getAttribute('data-menu-item'))
  })
  if (rows.includes('community')) await page.locator('[data-menu-item=community]').click()
  const opened = await page.evaluate(() => window.__opened)
  if (await page.locator('[role=menu]').count()) await page.keyboard.press('Escape')
  console.log(
    `S3 rail .tsb-community=${railRow} rows=${JSON.stringify(rows)} window.open=${JSON.stringify(opened)}`
  )
  expect.soft(railRow).toBe(0)
  if (rowShown) {
    expect.soft(rows.at(-1)).toBe('community')
    expect.soft(opened[0]?.[0]).toBe(URL_)
    expect.soft(opened[0]?.[1]).toBe('_blank')
  } else expect.soft(rows).not.toContain('community')

  // S4
  const pill = page.locator('.tch-help-pill')
  await pill.waitFor({ timeout: 60_000 })
  const pillBox = await pill.boundingBox()
  const comp = await composerBox(page)
  await pill.click()
  await page.locator('.tch-help-panel').waitFor()
  const go = await page.evaluate(() => {
    const a = document.querySelector('.tch-help-go')
    return a
      ? { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }
      : null
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const panelGone = (await page.locator('.tch-help-panel').count()) === 0
  console.log(
    `S4 pill=${JSON.stringify(pillBox)} composer=${JSON.stringify(comp)} go=${JSON.stringify(go)} panelGone=${panelGone}`
  )
  const pillBottom = (pillBox?.y ?? 0) + (pillBox?.height ?? 0)
  const overlaps =
    comp !== null &&
    pillBox !== null &&
    !(
      pillBottom <= comp.top ||
      pillBox.y >= comp.bottom ||
      pillBox.x + pillBox.width <= comp.left ||
      pillBox.x >= comp.right
    )
  expect.soft(overlaps, 'pill does not overlap the composer').toBe(false)
  expect.soft(go?.href).toBe(URL_)
  expect.soft(go?.target).toBe('_blank')
  expect.soft(go?.rel ?? '').toContain('noopener')
  expect.soft(panelGone).toBe(true)

  // S5
  await pill.click()
  await page.locator('.tch-help-hide').click()
  const afterHide = await page.evaluate(
    ([k, t]) => ({
      stored: localStorage.getItem(k),
      note: !!document.querySelector('.tch-help-note'),
      flash: document.querySelector(t)?.classList.contains('tsb-community-flash') ?? false
    }),
    [KEY, TRIGGER]
  )
  await page.waitForTimeout(4_000)
  const pillAfter4s = await page.locator('.tch-help-pill').count()
  await page.reload()
  await page.locator('.tsb-root').first().waitFor({ timeout: 90_000 })
  await page.locator(TRIGGER).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(2_000)
  const pillAfterReload = await page.locator('.tch-help-pill').count()
  await page.locator(TRIGGER).click()
  await page.locator('[role=menu]').first().waitFor()
  const rowAfterReload = await page.locator('[data-menu-item=community]').count()
  await page.keyboard.press('Escape')
  console.log(
    `S5 ${JSON.stringify(afterHide)} pillAfter4s=${pillAfter4s} pillAfterReload=${pillAfterReload} communityRowAfterReload=${rowAfterReload}`
  )
  expect.soft(afterHide.stored).toBe('1')
  expect.soft(afterHide.note).toBe(true)
  if (rowShown) expect.soft(afterHide.flash).toBe(true)
  expect.soft(pillAfter4s).toBe(0)
  expect.soft(pillAfterReload).toBe(0)
  expect.soft(rowAfterReload).toBe(rowShown ? 1 : 0)

  // S6
  await page.evaluate((k) => localStorage.removeItem(k), KEY)
})
