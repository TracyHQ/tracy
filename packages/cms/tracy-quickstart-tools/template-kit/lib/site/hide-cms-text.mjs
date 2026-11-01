// Whether a CMS-printed sentence can be taken off the site, measured: the sentence's language constant is set to an
// empty override, the block is shot before and after, and the override file is put back as it was (removed when it
// did not exist), whatever happens. Each fixed text gets `canHide` (true: the words left the page and the block
// changed on screen; false: the words still show; null: nothing changed on screen), `hiddenBy` and `evidence`.
import { join } from 'node:path'

import { openFrozen, openKitContext } from '../capture.mjs'
import { INVALID } from '../empty-frame.mjs'
import { urlOfPath } from '../kit-paths.mjs'
import { assignedAt } from '../map-index.mjs'
import { changedShare, MIN_CHANGED } from '../pixel-diff.mjs'

const WIDTH = 1440
const norm = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** The override file's text with `constant` set to an empty string (a later line wins over an earlier one). */
export const withEmptyOverride = (original, constant) =>
  `${original ? `${original.replace(/\n*$/, '')}\n` : ''}${constant}=""\n`

/** The verdict of one measurement. */
export function judgeHide({ textBefore, textAfter, text, change }) {
  if (!norm(textBefore).includes(norm(text)))
    return { canHide: null, reason: 'the sentence was not on the page before the change' }
  if (norm(textAfter).includes(norm(text)))
    return { canHide: false, reason: 'the sentence still shows with the override set' }
  if (change < MIN_CHANGED) return { canHide: null, reason: INVALID }
  return { canHide: true, reason: 'the sentence left the page and the block changed on screen' }
}

async function shootBlock(ctx, { siteUrl, idx, at, file }) {
  const opened = await openFrozen(ctx, urlOfPath(at.path, siteUrl), assignedAt(idx, at.path))
  if (!opened.page) return { error: opened.error }
  try {
    const el = opened.page.locator(`[data-kit-block="${at.raw}"]`).first()
    const text = await el.innerText({ timeout: 5000 })
    const png = await el.screenshot({ type: 'png', timeout: 15000 })
    await el.screenshot({ path: file, type: 'jpeg', quality: 82, timeout: 15000 })
    return { text, png }
  } catch (e) {
    return { error: String(e.message ?? e).split('\n')[0] }
  } finally {
    await opened.page.close().catch(() => {})
  }
}

/**
 * @param {{browser: object, siteUrl: string, hostHeader?: string, idx: object, fixedTexts: object[], override: {file: string, setting: string}, readFile: Function, writer: object, dir: string, log?: Function}} o
 *   `dir`: the folder the shots go in (named `images/<file>` in the evidence)
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
  dir,
  log = () => {}
}) {
  const errors = []
  const ctx = await openKitContext(browser, { width: WIDTH, siteUrl, hostHeader })
  const cmp = await ctx.newPage()
  try {
    for (const [i, f] of fixedTexts.entries()) {
      const field = `site.fixedTexts[${i}].canHide`
      if (!f.at) {
        errors.push({ kind: 'missing', field, reason: 'no page where the sentence shows' })
        continue
      }
      const name = `fixed-${f.block}-${f.source.constant.toLowerCase()}`
      const before = await shootBlock(ctx, { siteUrl, idx, at: f.at, file: join(dir, `${name}-before.jpg`) })
      if (before.error) {
        errors.push({ kind: 'missing', field, reason: `the block could not be shot: ${before.error}` })
        continue
      }
      const original = readFile(override.file)
      let after
      try {
        writer.writeFile(override.file, withEmptyOverride(original, f.source.constant))
        after = await shootBlock(ctx, { siteUrl, idx, at: f.at, file: join(dir, `${name}-after.jpg`) })
      } finally {
        if (original === null) writer.removeFile(override.file)
        else writer.writeFile(override.file, original)
      }
      if (after.error) {
        errors.push({
          kind: 'missing',
          field,
          reason: `the block could not be shot after the change: ${after.error}`
        })
        continue
      }
      const change = await changedShare(cmp, before.png, after.png)
      const verdict = judgeHide({ textBefore: before.text, textAfter: after.text, text: f.text, change })
      f.canHide = verdict.canHide
      f.hiddenBy = { setting: override.setting, file: override.file, constant: f.source.constant, value: '' }
      f.evidence = {
        before: `images/${name}-before.jpg`,
        after: `images/${name}-after.jpg`,
        change: Math.round(change * 1000) / 1000,
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
