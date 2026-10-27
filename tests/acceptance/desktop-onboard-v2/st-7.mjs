/**
 * ST-7 — the language follows the computer's, a saved pick wins, an unoffered one falls back.
 *
 * The OS language list is set per launch with Cocoa's argument domain (`-AppleLanguages (…)`), read
 * back from the main process (`app.getPreferredSystemLanguages()`) as a control.
 *   a. `de-AT`, nothing picked → the Language row on "Appearance & language" says "follow device
 *      (Deutsch)" (in German), the page is German, no line under the row.
 *   b. `de-AT`, `fr` picked before (the `tracy_lang` cookie Settings › Language writes) → the row
 *      says `Français`, the page is French.
 *   c. `ja-JP`, nothing picked → English, and the line under the row names `日本語` and English.
 */
import { closeApp, jumpTo, launchSignedIn, runCase, standalone, targetKind, until } from './lib.mjs'

/** The Language row and the line under it. */
const languageRow = () => ({
  lang: document.documentElement.lang,
  row: document.querySelector('[data-tracy-onboard] .tv-ob-lang .ts-select')?.textContent.trim() ?? null,
  note:
    document.querySelector('[data-tracy-onboard] [data-language-note]')?.getAttribute('data-language-note') ??
    null,
  noteText: document.querySelector('[data-tracy-onboard] [data-language-note]')?.textContent.trim() ?? null
})

async function variant(c, opts, tag, { languages, cookies }) {
  const errors = []
  const stand = targetKind(opts.base) === 'stand'
  const launched = await launchSignedIn(opts, c, {
    email: stand ? `ob2-${opts.runId}-st7${tag}@example.test` : null,
    languages,
    cookies,
    errors
  })
  try {
    const { app, window } = launched
    const system = await app.evaluate(({ app: a }) => a.getPreferredSystemLanguages())
    c.check(
      `${tag}: control — the OS languages the app reads start with ${languages[0]}`,
      system[0] === languages[0],
      system
    )
    await jumpTo(window, 2)
    await until(
      window,
      () => !!document.querySelector('[data-tracy-onboard] .tv-ob-lang .ts-select'),
      undefined,
      15_000
    )
    const row = await window.evaluate(languageRow)
    c.save(`${tag}.json`, { system, ...row, errors })
    await c.shot(window, `${tag}.png`)
    return row
  } finally {
    await closeApp(launched)
  }
}

export async function run(opts) {
  return runCase('ST-7', opts, async (c) => {
    const a = await variant(c, opts, 'a-de', { languages: ['de-AT'] })
    c.check('a: the page is German', /^de\b/.test(a.lang ?? ''), a.lang)
    c.check(
      'a: the row follows the device and names Deutsch',
      !!a.row && a.row.includes('Deutsch') && a.row !== 'Deutsch',
      a.row
    )
    c.eq('a: no line under the row', a.note, null)

    const b = await variant(c, opts, 'b-fr', { languages: ['de-AT'], cookies: { tracy_lang: 'fr' } })
    c.check('b: the page is French', /^fr\b/.test(b.lang ?? ''), b.lang)
    c.eq('b: the row shows the saved pick', b.row, 'Français')
    c.eq('b: no line under the row', b.note, null)

    const j = await variant(c, opts, 'c-ja', { languages: ['ja-JP'] })
    c.check('c: the page is English', /^en\b/.test(j.lang ?? ''), j.lang)
    c.check(
      'c: the row follows the device and names English',
      !!j.row && j.row.includes('English') && j.row !== 'English',
      j.row
    )
    c.eq('c: the line under the row says unsupported', j.note, 'unsupported')
    c.check(
      'c: the line names 日本語 and English',
      !!j.noteText && j.noteText.includes('日本語') && j.noteText.includes('English'),
      j.noteText
    )
  })
}

await standalone(import.meta.url, run)
