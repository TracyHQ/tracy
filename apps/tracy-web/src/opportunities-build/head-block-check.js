/**
 * The final check of the Tracy head blocks (spec TracyHQ/tracy#189, item 28): a served page of a brief build carries every
 * head block the build owes it. A missing block used to pass silently: when the one module that carried both the leftover
 * rules and the brand colours was refused for its size, every page showed the template's colours, the demo videos and the
 * card rows left-aligned, and no check said so.
 *
 *   brand colours  owed when the site plan takes the logo's colours and the site's stylesheets show a brand colour for them
 *                  to take (the same reading the build makes, `brand-colour-css.mjs`)
 *   leftovers      owed when the site plan hides demo videos, or a served page has an empty frame or a card row that lost
 *                  demo cards (the same reading the build makes, `empty-frames.js`)
 *   centred rows   each card row that lost demo cards is named in the page's own Tracy CSS
 *
 * Each miss is a major finding, so the check does not pass. Framework-wide: read from the served HTML and the site plan.
 * Pure: pages, plan and stylesheets in, findings out.
 */
import { brandColourCss } from 'website-opportunities/domain/brand-colour-css.mjs'
import { emptyFramesOf } from '../sites/brief-engines/empty-frames.js'

/** The text of the page's Tracy style blocks. */
const tracyCss = (/** @type {string} */ html) =>
  [...String(html).matchAll(/<style\b[^>]*\bdata-tracy[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join('\n')

const has = (/** @type {string} */ html, /** @type {string} */ attr) =>
  new RegExp(`<style\\b[^>]*\\b${attr}\\b`, 'i').test(String(html ?? ''))

/** Whether the build owes the pages its brand colours block. */
function owesColours(/** @type {any} */ sitePlan, /** @type {any[]} */ styles, /** @type {any[]} */ pages) {
  const colours = sitePlan?.colours
  if (colours?.decision !== 'logo-colours' || !colours.palette?.primary) return false
  try {
    return brandColourCss({ styles, palette: colours.palette, pages }) !== ''
  } catch {
    return false
  }
}

/**
 * @param {{pages: Array<{path: string, status?: number, html: string}>, sitePlan?: any,
 *   styles?: Array<{css: string}>}} input
 * @returns {Array<{kind: 'head-block' | 'centred-row', severity: 'major', page: string, found: string, why: string}>}
 */
export function checkHeadBlocks({ pages, sitePlan = null, styles = [] }) {
  const out = []
  // Only a brief build has a site plan, and only it writes head blocks.
  if (!sitePlan) return out
  const served = (pages ?? []).filter((p) => p.status === undefined || p.status === 200)
  if (!served.length) return out
  const frames = served.map((p) => ({ page: p, ...emptyFramesOf(p.html) }))
  const colours = owesColours(sitePlan, styles, served)
  const videos = (sitePlan.outside?.videos ?? []).some((v) => v?.decision === 'still' && v?.demo)
  const leftovers = videos || frames.some((f) => f.hide.length || f.tiles.length || f.centre.length)
  for (const { page, centre } of frames) {
    if (colours && !has(page.html, 'data-tracy-brand-colours'))
      out.push({
        kind: /** @type {const} */ ('head-block'),
        severity: /** @type {const} */ ('major'),
        page: page.path,
        found: 'brand colours',
        why: `The brand colours block is missing on ${page.path}: the site plan takes the logo colours, so the page shows the template's own (the engine notes say why the block was not written)`
      })
    if (leftovers && !has(page.html, 'data-tracy-leftovers'))
      out.push({
        kind: /** @type {const} */ ('head-block'),
        severity: /** @type {const} */ ('major'),
        page: page.path,
        found: 'leftovers',
        why: `The leftovers block is missing on ${page.path}: the demo videos, empty frames and card rows it hides or centres show as the demo left them (the engine notes say why the block was not written)`
      })
    const css = tracyCss(page.html)
    for (const selector of centre)
      if (!css.includes(selector))
        out.push({
          kind: /** @type {const} */ ('centred-row'),
          severity: /** @type {const} */ ('major'),
          page: page.path,
          found: selector,
          why: `A card row that lost demo cards is not centred on ${page.path}: its rule never reached the page`
        })
  }
  return out
}
