/**
 * ACC-5 — the first-run screen speaks the interface language. In the app from source: Settings ›
 * General › Language = `Tiếng Việt` (picked through the real menu), then Help › "Getting started"
 * reopens the screen: the three step titles, the Done / Not done chip and the Continue / Skip buttons
 * are the Vietnamese catalogue's words; the same in Deutsch. "No English left": every visible text
 * node of `[data-tracy-onboard]`, on each of the three steps, is compared with the English baseline
 * (`packages/ui/tracy-onboard/src/client/strings.ts`, `{placeholders}` matching anything); a node
 * that IS an English string whose translation differs is a leftover. Vendor and product names, and
 * strings the catalogue keeps verbatim (translation === English), are not leftovers by construction.
 *
 * The account's stored language (tracy-web remembers a pick at `/auth/me`) is put back to English
 * and the row to "Follow device" at the end.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  clickMenu,
  launchApp,
  overlayShown,
  ROOT,
  runCase,
  session,
  sleep,
  standalone,
  until
} from './lib.mjs'

const LANGS = [
  { id: 'vi', label: /^Tiếng Việt/i, file: 'packages/locale/tracy-locale-vi/vi/tracy-onboard.json' },
  { id: 'de', label: /^Deutsch/i, file: 'packages/locale/tracy-locales/de/tracy-onboard.json' }
]

/** Open Settings › General and pick the language whose menu label matches `label`. */
async function pickLanguage(window, label) {
  await window.goto(new URL('/new/?settings=notifications', window.url()).href)
  await booted(window)
  const nav = await until(
    window,
    () => document.querySelectorAll('.ts-nav').length || null,
    undefined,
    45_000
  )
  if (!nav) return 'no settings nav'
  for (let i = 0; i < nav; i++) {
    await window.locator('.ts-nav').nth(i).click()
    await sleep(300)
    if (await window.locator('.ts-general').count()) break
  }
  const selects = window.locator('.ts-general .ts-select')
  const n = await selects.count()
  for (let i = 0; i < n; i++) {
    await selects.nth(i).click()
    await sleep(300)
    const items = window.locator('[role="menuitemradio"], [role="menuitem"]')
    const texts = await items.allTextContents()
    const at = texts.findIndex((t) => label.test(t.trim()))
    if (at >= 0) {
      await items.nth(at).click()
      await sleep(800)
      return null
    }
    await window.keyboard.press('Escape')
  }
  return `no menu item matching ${label} in Settings › General`
}

/** Visible text nodes of the overlay on the step now shown. */
const overlayTexts = (window) =>
  window.evaluate(() => {
    const root = document.querySelector('[data-tracy-onboard]')
    if (!root) return null
    const out = []
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.textContent.trim()
      const el = n.parentElement
      if (!text || !el || el.closest('.tv-ob-kbd, [aria-hidden="true"]')) continue
      if (el.checkVisibility && !el.checkVisibility()) continue
      out.push(text)
    }
    return out
  })

/** Whether the middle of the dialog is the dialog itself, not something drawn over it. */
const inFront = (window) =>
  window.evaluate(() => {
    const d = document.querySelector('[data-tracy-onboard]')
    if (!d) return { inOverlay: false, top: null }
    const r = d.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(60, r.height / 2))
    return {
      inOverlay: !!top?.closest('[data-tracy-onboard]'),
      top: String(top?.className ?? top?.tagName).slice(0, 80)
    }
  })

/** The workspace finished booting (the boot cover lets clicks through). */
const booted = (window) =>
  until(
    window,
    () => {
      const cover = document.querySelector('.tracy-boot-cover')
      return !cover || getComputedStyle(cover).pointerEvents === 'none'
    },
    undefined,
    60_000
  )

const asPattern = (english) =>
  new RegExp(`^${english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.+')}$`, 's')

export async function run(opts) {
  return runCase('ACC-5', opts, async (c) => {
    const { en } = await import(
      pathToFileURL(join(ROOT, 'packages/ui/tracy-onboard/src/client/strings.ts')).href
    )
    const s = await session(opts)
    const errors = []
    const { app, window } = await launchApp(opts, { s, path: '/new/', errors })
    try {
      // A fresh profile is a first run: close the screen before going to Settings.
      if (await overlayShown(window))
        await window.locator('[data-tracy-onboard] [data-action="skip"]').click()
      for (const lang of LANGS) {
        const tr = JSON.parse(readFileSync(join(ROOT, lang.file), 'utf8'))
        const failed = await pickLanguage(window, lang.label)
        c.check(`${lang.id}: picked in Settings › General › Language`, failed === null, failed)
        if (failed) continue
        await c.shot(window, `${lang.id}-settings.png`)
        // The person's next move: Help › Getting started while Settings is still open.
        c.check(
          `${lang.id}: Help › Getting started menu item clicked`,
          await clickMenu(app, 'tracy-getting-started'),
          null
        )
        const overSettings = await overlayShown(window, 15_000)
        await sleep(600)
        const front = await inFront(window)
        await c.shot(window, `${lang.id}-help-over-settings.png`)
        c.check(
          `${lang.id}: reopened over an open Settings, the screen is in front (not under Settings)`,
          overSettings === true && front.inOverlay,
          front
        )
        // Close both (a DOM click reaches the screen even when it sits under Settings), then reopen
        // from the workspace, where nothing covers it.
        await window.evaluate(() =>
          document.querySelector('[data-tracy-onboard] [data-action="skip"]')?.click()
        )
        await window.goto(new URL('/new/', window.url()).href)
        await booted(window)
        await clickMenu(app, 'tracy-getting-started')
        const shown = await overlayShown(window, 15_000)
        c.check(
          `${lang.id}: the screen reopened from the workspace`,
          shown === true && (await inFront(window)).inOverlay,
          window.url()
        )
        if (!shown) continue
        const seen = {}
        const leftovers = []
        for (let step = 0; step < 3; step++) {
          await window.locator(`[data-tracy-onboard] [data-rail-step="${step}"]`).click()
          await until(
            window,
            (i) =>
              document.querySelector('[data-tracy-onboard]')?.getAttribute('data-step-index') === String(i),
            step,
            5000
          )
          await sleep(400)
          const texts = (await overlayTexts(window)) ?? []
          seen[step] = texts
          await c.shot(window, `${lang.id}-step-${step + 1}.png`)
          for (const text of texts) {
            for (const [key, english] of Object.entries(en)) {
              if (typeof tr[key] === 'string' && tr[key] !== english && asPattern(english).test(text))
                leftovers.push({ step: step + 1, key, text })
            }
          }
        }
        const all = Object.values(seen).flat()
        const ui = await window.evaluate(() => ({
          rail: [...document.querySelectorAll('[data-tracy-onboard] .tv-ob-rail-name')].map((e) =>
            e.textContent.trim()
          ),
          chip: document.querySelector('[data-tracy-onboard] .tv-ob-chip')?.textContent.trim() ?? null,
          skip:
            document.querySelector('[data-tracy-onboard] [data-action="skip"]')?.textContent.trim() ?? null,
          next:
            document.querySelector('[data-tracy-onboard] [data-action="next"] span')?.textContent.trim() ??
            null
        }))
        c.save(`${lang.id}-texts.json`, { ui, seen, leftovers })
        c.check(
          `${lang.id}: the three step titles are the catalogue's`,
          JSON.stringify(ui.rail) ===
            JSON.stringify([tr['account.title'], tr['appearance.title'], tr['notify.title']]),
          ui.rail
        )
        c.check(
          `${lang.id}: the chip is Done/Not done in ${lang.id}`,
          [tr['step.done'], tr['step.notDone']].includes(ui.chip),
          ui.chip
        )
        c.eq(`${lang.id}: Skip`, ui.skip, tr['action.skip'])
        c.check(
          `${lang.id}: Continue/Done`,
          [tr['action.continue'], tr['action.done']].includes(ui.next),
          ui.next
        )
        c.check(
          `${lang.id}: Continue (on step 1) is translated`,
          all.includes(tr['action.continue']) || ui.next === tr['action.done'],
          null
        )
        c.check(`${lang.id}: no English string left on the three steps`, leftovers.length === 0, leftovers)
        await window.locator('[data-tracy-onboard] [data-action="skip"]').click()
        await until(window, () => !document.querySelector('[data-tracy-onboard]'), undefined, 5000)
      }
    } finally {
      // Put the account's stored language back to English, then follow the device again.
      const back = await pickLanguage(window, /^English/i).catch((e) => String(e))
      c.log(`restore English: ${back ?? 'ok'}`)
      await window.evaluate(() => fetch('/auth/me')).catch(() => {})
      const follow = await pickLanguage(window, /./).catch((e) => String(e)) // first item = Follow device
      c.log(`restore Follow device: ${follow ?? 'ok'}`)
      c.save('console-errors.json', errors)
      await app.close()
    }
  })
}

await standalone(import.meta.url, 'ACC-5', run)
