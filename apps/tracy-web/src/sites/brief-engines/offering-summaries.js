/** The last summary decision, after all copy pins: only a kept offering's own material can refill its card. */
import { isDemoLeft } from 'website-opportunities/domain/demo-left-text.mjs'
import { wordsOf } from 'website-opportunities/domain/honest-written.mjs'
import { offeringCrossTalk } from 'website-opportunities/domain/offering-cross-talk.mjs'
import { translateKit } from './joomla-kit.js'
import { parseFragment } from 'parse5'

const textOf = (node) =>
  node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(textOf).join(' ')
const visibleWords = (value) => wordsOf(textOf(parseFragment(String(value ?? ''))))

/** @param {{slots: any[], honesty: any, written: Record<string, string>, locale?: string,
 * model?: any, signal?: AbortSignal, note?: (line: string) => void}} input */
export async function offeringSummaryValues({
  slots,
  honesty,
  written,
  locale = 'en',
  model = null,
  signal,
  note = () => {}
}) {
  const values = {}
  const translate = []
  const hidden = new Set((honesty?.records ?? []).filter((r) => r.decision === 'hide').map((r) => r.group))
  const cardNames = {
    ...Object.fromEntries((honesty?.offerings ?? []).map((o) => [`brief:${o.id}`, o.label])),
    ...honesty?.cardNames
  }
  const crossed = new Set(offeringCrossTalk({ slots, written, cardNames }).map((s) => s.key))
  for (const slot of slots) {
    if (
      slot.role !== 'offering.summary' ||
      hidden.has(slot.group?.id) ||
      !honesty?.cardNames?.[slot.group?.id]
    )
      continue
    const fallback = honesty.fallbacks?.[slot.key]?.value
    const current = written[slot.key]
    const ownWords = new Set(wordsOf(`${fallback ?? ''} ${honesty.cardNames[slot.group.id]}`))
    const echoed =
      wordsOf(current).join(' ') === wordsOf(slot.sample).join(' ') &&
      wordsOf(current).join(' ') !== wordsOf(fallback).join(' ')
    const fits = (v) =>
      typeof v === 'string' &&
      visibleWords(v).length > 0 &&
      (!Number.isInteger(slot.maxCharacters) || [...v].length <= slot.maxCharacters)
    if (
      fits(current) &&
      !echoed &&
      !crossed.has(slot.key) &&
      !isDemoLeft(slot, current, ownWords, new Set(), { cardNames: honesty.cardNames })
    ) {
      values[slot.key] = current
      continue
    }
    if (!fits(fallback))
      throw Object.assign(new Error(`A kept offering has no sourced summary that fits: ${slot.key}`), {
        code: 'OFFERING_SUMMARY_REQUIRED'
      })
    values[slot.key] = fallback
    if (!/^en(?:-|$)/i.test(locale)) translate.push({ ...slot, sample: fallback })
  }
  if (translate.length) {
    const said = await translateKit({
      slots: translate,
      locale,
      source: 'en',
      model,
      shipped: new Map(),
      signal,
      note,
      what: 'the offering summaries'
    })
    for (const slot of translate) {
      if (!said[slot.key]?.trim())
        throw Object.assign(new Error(`An offering summary could not be translated: ${slot.key}`), {
          code: 'OFFERING_SUMMARY_TRANSLATION_REQUIRED'
        })
      values[slot.key] = said[slot.key]
    }
  }
  return values
}
