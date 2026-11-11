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
import { cmsFormatPattern, shortPattern } from './cms-strings.mjs'
import { readPage } from './read-page.js'

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

/** Current whole-line occurrences of a source-bound format; literal words keep their existing boundaries. */
function sentenceCount(within, text, source) {
  if (source?.formats === undefined) return wholeWordCount(within, text)
  const pattern = cmsFormatPattern(source)
  if (!pattern || typeof within !== 'string') return null
  return within.split(/\r?\n/).filter((line) => pattern.test(norm(line))).length
}

/** Literal words must leave; a dynamic language format must have no occurrence left at any current value. */
export function judgeHide({ textBefore, textAfter, text, changed, source }) {
  const before = sentenceCount(textBefore, text, source)
  const after = sentenceCount(textAfter, text, source)
  if (before === null || after === null)
    return {
      canHide: null,
      reason: 'the matched language formats are invalid, ambiguous or their text unreadable'
    }
  if (!before) return { canHide: null, reason: 'the sentence was not on the page before the change' }
  if (source?.formats !== undefined ? after > 0 : after >= before)
    return { canHide: false, reason: 'the sentence still shows with the override set' }
  // Losing a line boundary does not prove removal; embedded matches can only withhold a verdict.
  if (
    source?.formats !== undefined &&
    new RegExp(cmsFormatPattern(source).source.slice(1, -1)).test(norm(textAfter))
  )
    return { canHide: null, reason: 'the language format may still show in joined or reflowed text' }
  if (!changed) return { canHide: null, reason: 'nothing in the block changed: measurement invalid' }
  return { canHide: true, reason: 'the sentence left the page and the block changed with it' }
}

/** Whether a reading of the block shows the sentence (an unreadable block counts as showing: its error is kept). */
const showsSentence = (read, f) => !!read?.error || sentenceCount(read?.text, f.text, f.source) > 0

async function readBlock(ctx, { siteUrl, idx, at, physical = false }) {
  const opened = await openFrozen(ctx, urlOfPath(at.path, siteUrl), assignedAt(idx, at.path), null, {
    wake: 'quick'
  })
  if (!opened.page) return { error: opened.error }
  try {
    const el = opened.page.locator(`[data-kit-block="${at.raw}"]`)
    if ((await el.count()) !== 1) return { error: 'the block is missing or not unique' }
    const text = await el.innerText({ timeout: 5000 })
    const layout = await opened.page.evaluate(layoutOf, { block: at.raw })
    const facts = physical ? await opened.page.evaluate(readPage, { cmsBlock: at.raw }) : {}
    return { text, layout, ...facts }
  } catch (e) {
    return { error: String(e.message ?? e).split('\n')[0] }
  } finally {
    await opened.page.close().catch(() => {})
  }
}

/** A structural receiver must remain unique; an ordinal that now points at a different shape is not its identity. */
function receiverLine(read, at) {
  const want = at.receiver
  if (
    !want?.unique ||
    !want.pure ||
    !want.complete ||
    !want.path?.length ||
    read?.error ||
    !read?.cmsLinesComplete
  )
    return null
  const lines = (read.textLines ?? []).filter(
    (l) => l.block === at.raw && JSON.stringify(l.receiver?.path) === JSON.stringify(want.path)
  )
  return lines.length === 1 && JSON.stringify(lines[0].receiver) === JSON.stringify(want) ? lines[0] : null
}

/** Prove constant causality at one receiver, not an inferred PHP call or a priority between matching formats. */
async function physicalSource(ctx, { siteUrl, idx, f, override, readFile, writer }) {
  const alternatives = f.source.formats
  const binding = {
    alternatives,
    controls: [],
    method: 'individual language overrides at one structural receiver'
  }
  const refused = (reason) => ({ binding, reason })
  if (!Array.isArray(alternatives)) return refused('the matching language formats are malformed')
  const formats = alternatives.map((format) => ({
    ...format,
    pattern:
      typeof format?.file === 'string' &&
      format.file.length &&
      /^[A-Z0-9_.-]+$/.test(format?.constant ?? '') &&
      typeof format?.value === 'string'
        ? shortPattern(format.value)
        : null
  }))
  // An override proves a constant, not which of two files defining that constant won the language load.
  if (
    !formats.length ||
    formats.some((f) => !f.pattern) ||
    new Set(formats.map((f) => f.constant)).size !== formats.length
  )
    return refused('the candidate language files or constants are not independently identifiable')
  const options = { siteUrl, idx, at: f.at, physical: true }
  const before = await readBlock(ctx, options)
  const originalLine = receiverLine(before, f.at)
  const count = (read) =>
    (read.textLines ?? []).filter((l) => l.shown && formats.some((f) => f.pattern.test(norm(l.text)))).length
  if (
    !originalLine?.shown ||
    count(before) !== 1 ||
    !formats.every((f) => f.pattern.test(norm(originalLine.text)))
  )
    return refused('no unique complete receiver for the competing language formats')
  binding.receiverBefore = originalLine
  const original = readFile(override.file)
  const responders = []
  for (const format of formats) {
    let after
    try {
      writer.writeFile(override.file, withEmptyOverride(original, format.constant))
      after = await readBlock(ctx, options)
    } finally {
      if (original === null) writer.removeFile(override.file)
      else writer.writeFile(override.file, original)
    }
    const restored = await readBlock(ctx, options)
    const returned = receiverLine(restored, f.at)
    const restoredExactly =
      returned?.shown &&
      returned.text === originalLine.text &&
      count(restored) === 1 &&
      JSON.stringify(restored.layout?.block) === JSON.stringify(before.layout?.block)
    const line = receiverLine(after, f.at)
    const outcome = !line
      ? 'unbound'
      : !line.text && count(after) === 0
        ? 'removed'
        : line.shown &&
            line.text === originalLine.text &&
            count(after) === 1 &&
            formats.every((f) => f.pattern.test(norm(line.text)))
          ? 'unchanged'
          : 'mixed-or-reflowed'
    binding.controls.push({
      constant: format.constant,
      outcome,
      receiverAfter: line,
      restoration: {
        original:
          original === null ? 'absence restored by stock writer' : 'original bytes restored by stock writer',
        receiverReturned: Boolean(restoredExactly),
        receiver: returned,
        block: restored.layout?.block ?? null
      }
    })
    if (!restoredExactly || outcome === 'unbound' || outcome === 'mixed-or-reflowed')
      return refused('the receiver or its restoration was missing, shifted, mixed or unreadable')
    if (outcome === 'removed') responders.push({ format, after })
  }
  if (responders.length !== 1) return refused('no single constant independently removed the receiver')
  const {
    format: { pattern: _pattern, ...format },
    after
  } = responders[0]
  return {
    before,
    after,
    binding,
    source: {
      ...f.source,
      file: format.file,
      constant: format.constant,
      constants: [format.constant],
      formats: [format]
    }
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
      const ambiguous = f.source.formats !== undefined && !cmsFormatPattern(f.source)
      let before, after, binding
      if (ambiguous) {
        f.canHide = null
        f.hiddenBy = null
        const proof = await physicalSource(ctx, { siteUrl, idx, f, override, readFile, writer })
        f.evidence = { sourceBinding: proof.binding }
        if (!proof.source) {
          errors.push({ kind: 'missing', field, reason: proof.reason })
          continue
        }
        f.source = proof.source
        ;({ before, after, binding } = proof)
      } else {
        // One reading of a block before any change serves every sentence it shows.
        const beforeKey = `${f.at.path}|${f.at.raw}`
        if (!befores.has(beforeKey)) befores.set(beforeKey, await readBlock(ctx, { siteUrl, idx, at: f.at }))
        // A page whose script settles late (a pager a script shows after load) may lack the words on one reading:
        // the block is read once more before the sentence is called absent.
        if (!showsSentence(befores.get(beforeKey), f))
          befores.set(beforeKey, await readBlock(ctx, { siteUrl, idx, at: f.at }))
        before = befores.get(beforeKey)
        if (before.error) {
          errors.push({ kind: 'missing', field, reason: `the block could not be read: ${before.error}` })
          continue
        }
        const constants = f.source.constants ?? [f.source.constant]
        const original = readFile(override.file)
        try {
          writer.writeFile(override.file, withEmptyOverride(original, constants))
          after = await readBlock(ctx, { siteUrl, idx, at: f.at })
        } finally {
          if (original === null) writer.removeFile(override.file)
          else writer.writeFile(override.file, original)
        }
      }
      const constants = f.source.constants ?? [f.source.constant]
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
      let verdict = judgeHide({
        textBefore: before.text,
        textAfter: after.text,
        text: f.text,
        changed,
        source: f.source
      })
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
        reason: verdict.reason,
        ...(binding ? { sourceBinding: binding } : {})
      }
      if (verdict.canHide === null) errors.push({ kind: 'missing', field, reason: verdict.reason })
      log('fixed text', f.block, f.source.constant, 'canHide', verdict.canHide)
    }
  } finally {
    await ctx.close()
  }
  return errors
}
