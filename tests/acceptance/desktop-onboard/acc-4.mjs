/**
 * ACC-4 — a failed sign-in stays in its own row. Connect Grok: the Grok row is outlined, holds the
 * callback field and its own Cancel; every other row is dimmed and disabled. Then two ways out:
 *   A. Cancel inside the row → no row active, none dimmed, no error anywhere.
 *   B. The person cancels on xAI's page and pastes the address it lands on: the script pastes the
 *      address such a cancel produces (`<redirect_uri>?error=access_denied&state=<state>`) → the error
 *      shows in the Grok row (`role="alert"`), its button reads "Try again", the section has no
 *      top-level error, and the other rows are no longer dimmed.
 * The real cancel on xAI's page is MANUAL: with `--manual-wait <min>` the script starts an attempt,
 * prints the xAI address, and waits for an error to land in the Grok row.
 */
import { openAiAccounts, rowsState, runCase, sleep, standalone, until } from './lib.mjs'

const VENDOR = 'grok'

async function start(c, page, label) {
  await page.locator(`[data-vendor="${VENDOR}"] > button`).click()
  const link = await until(
    page,
    (id) =>
      document.querySelector(`[data-vendor="${id}"][data-active="true"] a[href]`)?.getAttribute('href') ??
      null,
    VENDOR,
    30_000
  )
  const rows = await rowsState(page)
  c.save(`rows-${label}.json`, rows)
  return { link, rows }
}

export async function run(opts) {
  return runCase('ACC-4', opts, async (c) => {
    const { page } = await openAiAccounts(c, opts, VENDOR)
    const pagesBefore = page.context().pages().length
    // Each attempt opens xAI's page in a new tab; the scripted ones are closed again, the manual one
    // is left for the person.
    const xai = []
    const onPage = (p) => xai.push(p)
    page.context().on('page', onPage)

    // The attempt.
    const { link, rows } = await start(c, page, 'attempt')
    await c.shot(page, 'attempt.png')
    const mine = rows.find((r) => r.id === VENDOR)
    c.check('Connect Grok opens an xAI sign-in address', (link ?? '').startsWith('https://'), link)
    c.eq('the Grok row is the active one (outlined)', mine?.active, true)
    c.eq('the callback field sits inside the Grok row', mine?.input, true)
    const others = rows.filter((r) => r.id !== VENDOR)
    c.check(
      'every other row is dimmed and disabled',
      others.length > 0 && others.every((r) => r.dimmed && r.disabled),
      others
    )
    // The xAI page the attempt opened is the person's external page; it stays open in chrome-watch.
    c.log(`tabs: ${pagesBefore} → ${page.context().pages().length} (the xAI page opens in a new tab)`)

    // A. Cancel inside the row.
    await page.locator(`[data-vendor="${VENDOR}"] form button[type="button"]`).click()
    await sleep(500)
    const rowsA = await rowsState(page)
    c.save('rows-after-row-cancel.json', rowsA)
    c.check(
      'A. after Cancel: no row active, none dimmed or disabled',
      rowsA.every((r) => !r.active && !r.dimmed && !r.disabled),
      rowsA
    )
    c.check(
      'A. after Cancel: no error anywhere',
      rowsA.every((r) => !r.alert),
      rowsA.map((r) => r.alert)
    )
    await c.shot(page, 'after-row-cancel.png')

    // B. The address an xAI cancel lands on, pasted.
    const second = await start(c, page, 'attempt-2')
    const auth = new URL(second.link)
    const state = auth.searchParams.get('state')
    const redirect = auth.searchParams.get('redirect_uri')
    c.check('the xAI address carries state and redirect_uri', !!state && !!redirect, second.link)
    const cancelled = `${redirect}?error=access_denied&error_description=The+user+denied+the+request&state=${encodeURIComponent(state ?? '')}`
    c.log(`pasting ${cancelled.replace(/state=[^&]+/, 'state=<state>')}`)
    await page.locator(`[data-vendor="${VENDOR}"] form input`).fill(cancelled)
    await page.locator(`[data-vendor="${VENDOR}"] form button[type="submit"]`).click()
    const alert = await until(
      page,
      (id) => document.querySelector(`[data-vendor="${id}"] [role="alert"]`)?.textContent?.trim() || null,
      VENDOR,
      30_000
    )
    await sleep(300)
    const rowsB = await rowsState(page)
    c.save('rows-after-cancel-callback.json', rowsB)
    await c.shot(page, 'after-cancel-callback.png')
    const grok = rowsB.find((r) => r.id === VENDOR)
    const other = rowsB.find((r) => r.id !== VENDOR)
    c.check('B. the error shows inside the Grok row', !!alert, grok)
    c.check(
      'B. the Grok button now reads differently from the others ("Try again")',
      !!grok?.button && grok.button !== other?.button,
      { grok: grok?.button, other: other?.button }
    )
    c.check(
      'B. no other row holds an error',
      rowsB.filter((r) => r.id !== VENDOR).every((r) => !r.alert),
      rowsB
    )
    c.check(
      'B. the other rows are no longer dimmed or disabled',
      rowsB.filter((r) => r.id !== VENDOR).every((r) => !r.dimmed && !r.disabled),
      rowsB
    )
    const topError = await page.evaluate(
      () => document.querySelector('.tracy-model-plan > [role="alert"]')?.textContent ?? null
    )
    c.eq('B. no section-level error above the rows', topError, null)

    page.context().off('page', onPage)
    for (const p of xai) await p.close().catch(() => {})
    c.log(`closed ${xai.length} scripted xAI tab(s)`)

    // The real cancel on xAI's page.
    if (opts.manualWait > 0) {
      const third = await start(c, page, 'attempt-manual')
      process.stderr.write(
        `\nACC-4 MANUAL: open ${third.link}\n  press Cancel/Deny on xAI's page, paste the address you land on into the Grok row, Submit\n`
      )
      const got = await until(
        page,
        (id) => document.querySelector(`[data-vendor="${id}"] [role="alert"]`)?.textContent?.trim() || null,
        VENDOR,
        opts.manualWait * 60_000
      )
      const rowsM = await rowsState(page)
      c.save('rows-after-manual.json', rowsM)
      c.check(
        'MANUAL. the real xAI cancel ends in an error inside the Grok row',
        !!got,
        rowsM.find((r) => r.id === VENDOR)
      )
      c.check(
        'MANUAL. the other rows are not dimmed',
        rowsM.filter((r) => r.id !== VENDOR).every((r) => !r.dimmed),
        rowsM
      )
    } else {
      c.needsPerson("cancel on xAI's real page and paste where it lands (rerun with --manual-wait 5)")
    }
  })
}

await standalone(import.meta.url, 'ACC-4', run)
