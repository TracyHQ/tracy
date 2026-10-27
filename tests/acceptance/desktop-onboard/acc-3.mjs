/**
 * ACC-3 — GitHub Copilot with a real GitHub account. Settings › AI accounts › Connect on the Copilot
 * row shows the device code and a Copy button IN that row (row outlined `data-active`, the other rows'
 * buttons dimmed and disabled); the person types the code at github.com/login/device (MANUAL — the
 * script prints it); the row turns into a "Connected · <account>" connection without a reload; a chat
 * on `--site` shows the chip `GitHub Copilot · …`; Disconnect brings the row back to "Connect account".
 *
 * `--manual-wait <min>` waits that long for the person's step; 0 (default) checks everything up to
 * the external page, cancels the attempt, and leaves the rest MANUAL. A connection that existed
 * before the run is never disconnected by it.
 */
import { openAiAccounts, planStatus, rowsState, runCase, sleep, standalone, until } from './lib.mjs'

const VENDOR = 'copilot'

export async function run(opts) {
  return runCase('ACC-3', opts, async (c) => {
    const { page } = await openAiAccounts(c, opts, VENDOR)
    const before = await planStatus(page)
    c.save('status-before.json', before)
    const had = (before.connections ?? []).filter((x) => x.provider === VENDOR && x.connected)
    c.log(`copilot connections before: ${JSON.stringify(had.map((x) => x.account))}`)
    c.check(
      'status: copilot is a vendor one may connect',
      (before.providers ?? []).some((p) => p.id === VENDOR),
      before.providers
    )

    // 1. Connect → the device code in the row.
    await page.locator(`[data-vendor="${VENDOR}"] > button`).click()
    const code = await until(
      page,
      (id) =>
        document.querySelector(`[data-vendor="${id}"][data-active="true"] code`)?.textContent?.trim() || null,
      VENDOR,
      30_000
    )
    const rows = await rowsState(page)
    c.save('rows-during-attempt.json', rows)
    await c.shot(page, 'device-code.png')
    const mine = rows.find((r) => r.id === VENDOR)
    c.check(
      'the Copilot row shows a device code (XXXX-XXXX)',
      /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code ?? ''),
      code
    )
    c.eq('the Copilot row is the active one (outlined)', mine?.active, true)
    c.check(
      'a Copy button and a button to GitHub sit inside the Copilot row',
      (mine?.buttons.length ?? 0) >= 4,
      mine?.buttons
    )
    const others = rows.filter((r) => r.id !== VENDOR)
    c.check(
      'every other row is dimmed and disabled',
      others.length > 0 && others.every((r) => r.dimmed && r.disabled),
      others
    )
    c.check(
      'no error shown anywhere',
      rows.every((r) => !r.alert),
      rows.map((r) => r.alert)
    )
    // Copy: the button's words change for 2 s when the clipboard took the code (headless may refuse).
    const copyWords = mine?.buttons[1]
    await page.locator(`[data-vendor="${VENDOR}"] code + div button`).first().click()
    await sleep(400)
    const afterCopy = (await rowsState(page)).find((r) => r.id === VENDOR)?.buttons[1]
    c.check(
      `Copy puts the code on the clipboard (button "${copyWords}" → "${afterCopy}")`,
      !!afterCopy && afterCopy !== copyWords,
      afterCopy
    )
    if (code) {
      process.stderr.write(
        `\nACC-3 MANUAL: open https://github.com/login/device in your Chrome and enter ${code}\n`
      )
      c.log(`device code ${code} (enter at https://github.com/login/device)`)
    }

    // 2. The person's step.
    let connected = null
    if (opts.manualWait > 0 && code) {
      c.log(`waiting up to ${opts.manualWait} min for the code to be entered`)
      const done = await until(
        page,
        (id) => !document.querySelector(`[data-vendor="${id}"][data-active="true"]`),
        VENDOR,
        opts.manualWait * 60_000
      )
      const after = await planStatus(page)
      c.save('status-after.json', after)
      connected =
        (after.connections ?? []).find(
          (x) =>
            x.provider === VENDOR &&
            x.connected &&
            !had.some((h) => h.connectionId === x.connectionId && h.account === x.account)
        ) ?? (after.connections ?? []).find((x) => x.provider === VENDOR && x.connected)
      const rowsAfter = await rowsState(page)
      c.check(
        'the attempt ended without an error in the row',
        done === true && !rowsAfter.find((r) => r.id === VENDOR)?.alert,
        rowsAfter.find((r) => r.id === VENDOR)
      )
      c.check('status: a connected Copilot connection', !!connected, after.connections)
      const shown = await page.evaluate(
        (account) => !!account && document.querySelector('.tracy-model-plan')?.innerText.includes(account),
        connected?.account ?? null
      )
      c.check(
        `the page shows "Connected · ${connected?.account}" without a reload`,
        shown === true,
        connected
      )
      await c.shot(page, 'connected.png')
    } else {
      // Leave nothing waiting: Cancel, and the other rows come back.
      await page.locator(`[data-vendor="${VENDOR}"] code + div button`).last().click()
      await sleep(500)
      const rowsCancel = await rowsState(page)
      c.save('rows-after-cancel.json', rowsCancel)
      c.check(
        'after Cancel: no row active, none dimmed or disabled',
        rowsCancel.every((r) => !r.active && !r.dimmed && !r.disabled),
        rowsCancel
      )
      c.needsPerson(
        `enter the device code at github.com/login/device, then expect "Connected · leeknowsai" (rerun with --manual-wait 5)`
      )
    }

    // 3. The chip on a real site (the chat itself is the person's).
    if (connected && opts.site) {
      await page.goto(`${opts.base}/${opts.site}/`, { waitUntil: 'domcontentloaded' })
      const chip = await until(
        page,
        () => {
          const t = document.querySelector('[data-model-chip]')?.textContent?.trim()
          return t && /Copilot/.test(t) ? t : null
        },
        undefined,
        60_000
      )
      c.check('the chat chip names GitHub Copilot', !!chip, chip)
      await c.shot(page, 'chip.png')
      c.needsPerson(
        'send one short chat on the site and see it answered under the "GitHub Copilot · gpt-4.1" chip'
      )
    } else if (connected)
      c.needsPerson('pass --site <siteKey> to read the chat chip; send one chat and see the Copilot chip')
    else c.needsPerson('chat with the chip "GitHub Copilot · gpt-4.1" (after the connection)')

    // 4. Disconnect — only what this run connected.
    if (connected && !had.some((h) => h.connectionId === connected.connectionId)) {
      await page.goto(`${opts.base}/new/?settings=ai-accounts&vendor=${VENDOR}`, {
        waitUntil: 'domcontentloaded'
      })
      await until(page, (id) => !!document.querySelector(`[data-vendor="${id}"]`), VENDOR, 45_000)
      const clicked = await page.evaluate((account) => {
        const rows = [...document.querySelectorAll('.tracy-model-plan .divide-y > div:not([data-vendor])')]
        const row = rows.find((r) => r.textContent.includes(account))
        const b = row?.querySelector('button')
        b?.click()
        return !!b
      }, connected.account)
      c.check('a Disconnect button on the new Copilot connection', clicked, connected.account)
      await sleep(1500)
      const final = await planStatus(page)
      c.save('status-final.json', final)
      c.check(
        'after Disconnect: that connection is no longer connected',
        !(final.connections ?? []).some((x) => x.connectionId === connected.connectionId && x.connected),
        final.connections
      )
      const rowsEnd = await rowsState(page)
      c.check(
        'after Disconnect: the Copilot row offers to connect again',
        rowsEnd.some((r) => r.id === VENDOR && !r.disabled && !r.alert),
        rowsEnd
      )
      await c.shot(page, 'disconnected.png')
    } else if (connected) c.note('the Copilot connection existed before this run: not disconnected')
  })
}

await standalone(import.meta.url, 'ACC-3', run)
