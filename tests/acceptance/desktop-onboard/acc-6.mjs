/**
 * ACC-6 — the CLI scan never lies. Two launches of the app from source on this Mac:
 *   A. `PATH=/usr/bin:/bin` (what a GUI app gets from Finder): step 1 still finds claude AND codex,
 *      because the login shell's PATH is read (`scanComplete: true`, found ⊇ {claude, codex}), and
 *      the screen shows them as found.
 *   B. `PATH=/usr/bin:/bin SHELL=/bin/nosuch`: the shell cannot be read, so the scan never completes:
 *      no vendor is ever `not-found` (only `found` from the fixed install folders, or `unknown`),
 *      `scanComplete` stays false, the screen stays on "Looking for AI tools…" (`data-mode="looking"`),
 *      and picking a vendor that was not found never shows "isn't on this computer yet" (`[data-warn]`).
 * Needs claude in ~/.local/bin and codex on the login shell's PATH (fnm), as on the Studio.
 */
import { api, launchApp, overlayShown, runCase, session, sleep, standalone, until } from './lib.mjs'

const BARE = '/usr/bin:/bin'

async function detectUntil(window, ids, done, ms) {
  let last = null
  const end = Date.now() + ms
  while (Date.now() < end) {
    last = await window.evaluate((list) => window.tracyDesktop.app.agents.detect(list), ids)
    if (done(last)) return last
    await sleep(1000)
  }
  return last
}

export async function run(opts) {
  return runCase('ACC-6', opts, async (c) => {
    const s = await session(opts)
    const config = (await api(opts, null, '/api/desktop/config')).json
    const ids = (config?.catalogue ?? []).map((v) => v.id)
    c.check('the catalogue lists claude and codex', ids.includes('claude') && ids.includes('codex'), ids)

    // A. Bare PATH, real login shell.
    {
      const { app, window } = await launchApp(opts, {
        s,
        env: { PATH: BARE, TRACY_DESKTOP_ONBOARDING: 'again' }
      })
      try {
        const env = await app.evaluate(() => ({ path: process.env.PATH, shell: process.env.SHELL }))
        c.log(`A. app env ${JSON.stringify(env)}`)
        c.eq('A. the app runs with the bare PATH', env.path, BARE)
        const first = await window.evaluate((list) => window.tracyDesktop.app.agents.detect(list), ids)
        const full = await detectUntil(window, ids, (d) => d.scanComplete, 20_000)
        c.save('A-detect.json', { first, full })
        const found = full.results.filter((r) => r.status === 'found').map((r) => r.id)
        c.eq('A. scanComplete', full.scanComplete, true)
        c.check(
          'A. claude and codex are found through the login shell',
          found.includes('claude') && found.includes('codex'),
          full.results
        )
        c.check(
          'A. the first answer never said not-found for what the full scan found',
          first.results.every((r) => r.status !== 'not-found' || !found.includes(r.id)),
          first
        )
        if (await overlayShown(window)) {
          const cards = await until(
            window,
            () => {
              const step = document.querySelector('[data-tracy-onboard] [data-step="account"]')
              if (step?.getAttribute('data-mode') !== 'found') return null
              return [
                ...document.querySelectorAll('[data-tracy-onboard] [data-agent][data-found="true"]')
              ].map((e) => e.getAttribute('data-agent'))
            },
            undefined,
            30_000
          )
          c.check(
            'A. the screen shows claude and codex as found',
            !!cards && cards.includes('claude') && cards.includes('codex'),
            cards
          )
          await c.shot(window, 'A-step-1.png')
        } else c.check('A. the screen showed', false, window.url())
      } finally {
        await app.close()
      }
    }

    // B. Bare PATH and a shell that does not exist.
    {
      const { app, window } = await launchApp(opts, {
        s,
        env: { PATH: BARE, SHELL: '/bin/nosuch', TRACY_DESKTOP_ONBOARDING: 'again' }
      })
      try {
        const answers = []
        for (let i = 0; i < 12; i++) {
          answers.push(await window.evaluate((list) => window.tracyDesktop.app.agents.detect(list), ids))
          await sleep(1000)
        }
        const refreshed = await window
          .evaluate((list) => window.tracyDesktop.app.agents.refresh(list), ids)
          .catch((e) => ({ error: String(e) }))
        answers.push(refreshed)
        c.save('B-detect.json', answers)
        const all = answers.filter((a) => a?.results)
        c.check(
          'B. no answer ever says not-found',
          all.every((a) => a.results.every((r) => r.status !== 'not-found')),
          all.at(-1)
        )
        c.check(
          'B. scanComplete stays false',
          all.every((a) => a.scanComplete === false),
          all.map((a) => a.scanComplete)
        )
        const last = all.at(-1)
        c.check(
          'B. what is not found is unknown',
          last.results.every((r) => ['found', 'unknown'].includes(r.status)),
          last.results
        )
        c.check(
          'B. codex (only on the login shell PATH) is unknown',
          last.results.find((r) => r.id === 'codex')?.status === 'unknown',
          last.results
        )
        c.note(
          `B. found from the fixed install folders: ${
            last.results
              .filter((r) => r.status === 'found')
              .map((r) => r.id)
              .join(',') || 'none'
          }`
        )
        if (await overlayShown(window)) {
          await sleep(6000) // past the screen's three re-asks (1.5 s apart)
          const mode = await window.evaluate(() =>
            document.querySelector('[data-tracy-onboard] [data-step="account"]')?.getAttribute('data-mode')
          )
          c.eq('B. the screen stays on "Looking for AI tools…"', mode, 'looking')
          const more = window.locator('[data-tracy-onboard] .tv-ob-disclosure[aria-expanded="false"]')
          if (await more.count()) await more.first().click()
          const notFound = await window.evaluate(() => {
            const cards = [...document.querySelectorAll('[data-tracy-onboard] [data-agent]')]
            return (
              cards.find((e) => e.getAttribute('data-found') !== 'true')?.getAttribute('data-agent') ?? null
            )
          })
          if (notFound) {
            await window.locator(`[data-tracy-onboard] [data-agent="${notFound}"]`).click()
            await sleep(800)
            const warn = await window.evaluate(
              () => document.querySelector('[data-tracy-onboard] [data-warn]')?.textContent ?? null
            )
            c.eq(`B. picking ${notFound} (not found, unknown) shows no "isn't on this computer"`, warn, null)
          } else c.note('B. every card was found; the pick check had nothing to pick')
          await c.shot(window, 'B-step-1.png')
        } else c.check('B. the screen showed', false, window.url())
      } finally {
        await app.close()
      }
    }
  })
}

await standalone(import.meta.url, 'ACC-6', run)
