/**
 * REG-PR-924-help-pill-follows-column: the floating Need help? pill stays in the conversation
 * column's corner when opening or closing the left column moves that column.
 *
 * GAP = right edge of the pill's `scrollBody` column minus the right edge of `.tch-help-pill`;
 * it must be 16 (+/-2) before and after each toggle. The column's width is recorded as the
 * condition the bug needs (it moves, it does not resize); a width change is noted, not judged.
 */
import { expect, ORIGIN, seatContext, siteKey, test } from './stand.mjs'

const TOGGLE = 'button[aria-label="Collapse sidebar"], button[aria-label="Expand sidebar"]'

/**
 * Read GAP and the column's width.
 * @param {import('@playwright/test').Page} page - the workspace page.
 * @returns {Promise<{gap: number, width: number, rail: string}>} the measure.
 */
async function measure(page) {
  return page.evaluate((toggle) => {
    const pill = document.querySelector('.tch-help-dock .tch-help-pill')
    const column = document.querySelector('.tch-help')?.closest('[class*="scrollBody"]')
    if (!pill || !column) throw new Error(`pill ${String(!!pill)}, column ${String(!!column)}`)
    const box = column.getBoundingClientRect()
    return {
      gap: Math.round((box.right - pill.getBoundingClientRect().right) * 100) / 100,
      width: Math.round(box.width * 100) / 100,
      rail: document.querySelector(toggle)?.getAttribute('aria-label') ?? 'none'
    }
  }, TOGGLE)
}

test('REG-PR-924 help pill follows the moving column', async ({ browser }) => {
  // S1: a new context for any seat; a site workspace with the pill rendered.
  const context = await seatContext(browser, 'a')
  // The Need help? button is off by default (its `help-button` switch, catalogue.json), so the pill
  // would never render. This context reads the door's answer with that one id taken out, the way an
  // operator pressing the switch on would; the stand's own setting is not touched.
  await context.route('**/api/ui', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    await route.fulfill({
      response: res,
      json: { ...body, hidden: (body.hidden ?? []).filter((id) => id !== 'help-button') }
    })
  })
  const page = await context.newPage()
  await page.goto(`${ORIGIN}/${siteKey('wp')}`)
  await page.waitForURL(/\/s\/session-/, { timeout: 90_000 })
  const pill = page.locator('.tch-help-dock .tch-help-pill')
  try {
    await pill.waitFor({ timeout: 30_000 })
  } catch {
    await page.evaluate(() => localStorage.removeItem('tracy.help-button.hidden'))
    await page.reload()
    try {
      await pill.waitFor({ timeout: 60_000 })
    } catch {
      throw new Error(
        'no .tch-help-pill after clearing tracy.help-button.hidden and reloading: the pill came with ' +
          "PR #922, so a stand whose dsh image predates it cannot show this case's mechanism"
      )
    }
  }
  await page.bringToFront()

  // S2: the side card (right column) is open, so the conversation column sits between the two.
  const sideCard = await page.evaluate(
    () => document.querySelector('[class*="rightbarCol"]')?.getBoundingClientRect().width ?? 0
  )
  console.log(`S2 side card width = ${sideCard}`)
  expect(sideCard, 'the side card (right column) is open').toBeGreaterThan(0)

  // S3, then S4: toggle the left column, measure, toggle back, measure.
  const rows = [{ step: 'S3', ...(await measure(page)) }]
  for (const step of ['S4 toggle', 'S4 toggle back']) {
    await page.locator(TOGGLE).first().click()
    await page.waitForTimeout(1_000)
    rows.push({ step, ...(await measure(page)) })
  }
  for (const r of rows)
    console.log(`${r.step}: GAP = ${r.gap}, column width = ${r.width}, toggle now reads "${r.rail}"`)

  // Expect 1: the column moves, it does not resize. A change is noted; the case still checks GAP.
  const widths = new Set(rows.map((r) => r.width))
  if (widths.size !== 1) {
    const note = `column width changed across the toggles: ${rows.map((r) => r.width).join(' -> ')}`
    console.log(`NOTE: ${note}`)
    test.info().annotations.push({ type: 'note', description: note })
  }
  // The toggle really flipped the left column each time (else the case measured nothing).
  expect(rows[1].rail, 'first toggle flipped the left column').not.toBe(rows[0].rail)
  expect(rows[2].rail, 'second toggle flipped it back').toBe(rows[0].rail)

  // Expect 2: GAP is 16 (+/-2) in S3 and after both toggles.
  for (const r of rows)
    expect.soft(Math.abs(r.gap - 16), `${r.step}: GAP ${r.gap} within 16 +/- 2`).toBeLessThanOrEqual(2)
})
