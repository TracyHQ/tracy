// Whether a CMS-printed sentence can be taken off the site, measured in the DOM (no screenshot): the sentence's
// language constant is set to an empty override, the block's text and layout (its box, its text and buttons) are
// read before and after, and the override file is put back as it was (removed when it did not exist), whatever
// happens. Each fixed text gets `canHide` (true: the words left the page and the block's layout changed with them;
// false: the words still show; null: nothing in the block changed), `hiddenBy` and `evidence` (the numbers).

import { openFrozen, openKitContext } from '../capture.mjs'
import { textShift } from '../empty-frame.mjs'
import { urlOfPath } from '../kit-paths.mjs'
import { assignedAt } from '../map-index.mjs'
import { layoutOf } from '../read-frames.js'

const WIDTH = 1440
const norm = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** The override file's text with `constant` set to an empty string (a later line wins over an earlier one). */
export const withEmptyOverride = (original, constant) =>
  `${original ? `${original.replace(/\n*$/, '')}\n` : ''}${[constant]
    .flat()
    .map((c) => `${c}=""\n`)
    .join('')}`

/**
 * How many times `text` shows as whole words in `within` ("Prev" is not inside "Previous"). A side of the text that
 * ends in punctuation is its own boundary: "MANUFACTURER:" counts in "MANUFACTURER:SELECT", where the page sets a
 * label against the control it names.
 */
export function wholeWordCount(within, text) {
  const t = norm(text)
  const want = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!want) return 0
  const word = /[\p{L}\p{N}]/u
  const before = word.test(t[0]) ? '(?<![\\p{L}\\p{N}])' : ''
  const after = word.test(t.at(-1)) ? '(?![\\p{L}\\p{N}])' : ''
  return [...norm(within).matchAll(new RegExp(`${before}${want}${after}`, 'gu'))].length
}

/** The verdict of one measurement: the words left when they show fewer times, as whole words, than before. */
export function judgeHide({ textBefore, textAfter, text, changed }) {
  const before = wholeWordCount(textBefore, text)
  if (!before) return { canHide: null, reason: 'the sentence was not on the page before the change' }
  if (wholeWordCount(textAfter, text) >= before)
    return { canHide: false, reason: 'the sentence still shows with the override set' }
  if (!changed) return { canHide: null, reason: 'nothing in the block changed: measurement invalid' }
  return { canHide: true, reason: 'the sentence left the page and the block changed with it' }
}

/** Whether a reading of the block shows the sentence (an unreadable block counts as showing: its error is kept). */
const showsSentence = (read, text) => !!read?.error || wholeWordCount(read?.text, text) > 0

async function readBlock(ctx, { siteUrl, idx, at }) {
  const opened = await openFrozen(ctx, urlOfPath(at.path, siteUrl), assignedAt(idx, at.path), null, {
    wake: 'quick'
  })
  if (!opened.page) return { error: opened.error }
  try {
    const el = opened.page.locator(`[data-kit-block="${at.raw}"]`).first()
    const text = await el.innerText({ timeout: 5000 })
    const layout = await opened.page.evaluate(layoutOf, { block: at.raw })
    return { text, layout }
  } catch (e) {
    return { error: String(e.message ?? e).split('\n')[0] }
  } finally {
    await opened.page.close().catch(() => {})
  }
}

/**
 * @param {{browser: object, siteUrl: string, hostHeader?: string, idx: object, fixedTexts: object[], override: {file: string, setting: string}, readFile: Function, writer: object, log?: Function}} o
 * @returns {Promise<object[]>} errors for the texts that could not be measured
 */
export async function measureFixedTexts({
  browser,
  siteUrl,
  hostHeader,
  idx,
  fixedTexts,
  override,
  readFile,
  writer,
  log = () => {}
}) {
  const errors = []
  const befores = new Map()
  const ctx = await openKitContext(browser, { width: WIDTH, siteUrl, hostHeader })
  try {
    for (const [i, f] of fixedTexts.entries()) {
      const field = `site.fixedTexts[${i}].canHide`
      if (!f.at) {
        errors.push({ kind: 'missing', field, reason: 'no page where the sentence shows' })
        continue
      }
      // One reading of a block before any change serves every sentence it shows.
      const beforeKey = `${f.at.path}|${f.at.raw}`
      if (!befores.has(beforeKey)) befores.set(beforeKey, await readBlock(ctx, { siteUrl, idx, at: f.at }))
      // A page whose script settles late (a pager a script shows after load) may lack the words on one reading:
      // the block is read once more before the sentence is called absent.
      if (!showsSentence(befores.get(beforeKey), f.text))
        befores.set(beforeKey, await readBlock(ctx, { siteUrl, idx, at: f.at }))
      const before = befores.get(beforeKey)
      if (before.error) {
        errors.push({ kind: 'missing', field, reason: `the block could not be read: ${before.error}` })
        continue
      }
      const constants = f.source.constants ?? [f.source.constant]
      const original = readFile(override.file)
      let after
      try {
        writer.writeFile(override.file, withEmptyOverride(original, constants))
        after = await readBlock(ctx, { siteUrl, idx, at: f.at })
      } finally {
        if (original === null) writer.removeFile(override.file)
        else writer.writeFile(override.file, original)
      }
      if (after.error) {
        errors.push({
          kind: 'missing',
          field,
          reason: `the block could not be read after the change: ${after.error}`
        })
        continue
      }
      const shift = textShift(before.layout, after.layout)
      const heightChange = (after.layout?.block?.height ?? 0) - (before.layout?.block?.height ?? 0)
      const changed = shift.gone > 0 || shift.moved > 0 || heightChange !== 0
      let verdict = judgeHide({ textBefore: before.text, textAfter: after.text, text: f.text, changed })
      // A short value was a guess: the words still showing with every candidate emptied means the CMS does not
      // print them from these strings (the template does), so they are measured as template words instead.
      if (verdict.canHide === false && f.source.short) {
        f.notPrintedByCms = true
        log('fixed text', f.block, 'not printed by', constants.join(','))
        continue
      }
      if (verdict.canHide && shift.overlaps)
        verdict = { canHide: false, reason: `${shift.overlaps} pairs of text or buttons now overlap` }
      f.canHide = verdict.canHide
      f.hiddenBy = {
        setting: override.setting,
        file: override.file,
        constant: constants.length > 1 ? constants : constants[0],
        value: ''
      }
      f.evidence = {
        blockBefore: before.layout?.block ?? null,
        blockAfter: after.layout?.block ?? null,
        heightChange,
        textGone: shift.gone,
        textMoved: shift.moved,
        textOverlaps: shift.overlaps,
        reason: verdict.reason
      }
      if (verdict.canHide === null) errors.push({ kind: 'missing', field, reason: verdict.reason })
      log('fixed text', f.block, f.source.constant, 'canHide', verdict.canHide)
    }
  } finally {
    await ctx.close()
  }
  return errors
}
