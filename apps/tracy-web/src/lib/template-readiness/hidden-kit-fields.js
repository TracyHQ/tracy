/**
 * The hidden kit fields check of the template readiness verdict (ticket #435, piece `template-kit`): the five fields of
 * a template kit the write step hides by CSS on the customer's site must each name what the template prints, or say
 * none with a reason. A person reads the template's layouts for them when packaging (`cli.mjs video-buttons`,
 * `self-link-buttons`, `hidden-page-links`, `created-page-hide`, `legal-layout`); a field left out means nobody looked,
 * and the write step then leaves a demo control on the customer's page with nothing to say why.
 *
 *   emptyVideoButtons         a play button printed with an empty video address (lib/empty-video-buttons.js)
 *   selfLinkButtons           the container of a "more" button that may lead to its own page (lib/self-link-buttons.js)
 *   hiddenPageLinks           the container of list row links that may lead to a hidden page (lib/hidden-page-links.js)
 *   createdPageHide           a block every article page prints that a created page must not show, such as a share bar
 *                             (lib/created-page-hide.js)
 *   createdPageLayouts.legal  the article layout a created legal page prints through
 *
 * A list field is declared when the write step's own reader keeps at least one entry and leaves none out; it says none
 * when it is an empty list and `site.noneWhy.<field>` holds a reason (what `--none --why` writes). The legal layout is
 * declared by a `<template>:<file>` name, and says none by `articleLayout: null` with a reason.
 *
 *   done   every field declared or none with a reason (`kit-hidden-fields-declared`)
 *   todo   a field missing, an empty list without a reason, or an entry the write step would leave out
 *          (`kit-hidden-field-missing`, `fields` names each, `problems` the reader's words)
 *
 * Joomla only, and only on a kit that reads: the kit step itself says when there is none. The same on T3 and T4: the
 * fields name what the template prints, and the readers scope their rules by framework (lib/kit-framework.js).
 */
import { emptyVideoButtonsOf } from '../empty-video-buttons.js'
import { createdPageHideOf } from '../created-page-hide.js'
import { hiddenPageLinksOf } from '../hidden-page-links.js'
import { selfLinkButtonsOf } from '../self-link-buttons.js'
import { kitOfRelease } from '../template-kit/road-step.js'

export const HIDDEN_FIELDS_STEP = 'kit-hidden-fields'

/** A Joomla layout as `article_layout` holds it: `<template or _>:<file>` (the kit tool's legal-layout.mjs rule). */
const LAYOUT = /^(?:_|[a-z0-9_-]+):[a-z0-9_-]+$/i

const said = (value) => typeof value === 'string' && value.trim() !== ''

/** A list field: its kit key, the write step's reader (`{ kept, problems }`) and the tool command that writes it. */
const listField = (field, command, read) => ({
  field,
  command,
  /** @param {any} site */
  judge(site) {
    const value = site?.[field]
    if (!Array.isArray(value)) return { state: 'missing', problems: [] }
    if (value.length === 0)
      return said(site?.noneWhy?.[field])
        ? { state: 'none', problems: [] }
        : { state: 'missing', problems: [] }
    const { kept, problems } = read({ site })
    return kept.length > 0 && problems.length === 0
      ? { state: 'declared', problems }
      : { state: 'missing', problems }
  }
})

/** The five fields, in the order the kit tool's README names them. */
export const HIDDEN_KIT_FIELDS = Object.freeze([
  listField('emptyVideoButtons', 'video-buttons', (kit) => {
    const { selectors, problems } = emptyVideoButtonsOf(kit)
    return { kept: selectors, problems }
  }),
  listField('selfLinkButtons', 'self-link-buttons', (kit) => {
    const { containers, problems } = selfLinkButtonsOf(kit)
    return { kept: containers, problems }
  }),
  listField('hiddenPageLinks', 'hidden-page-links', (kit) => {
    const { containers, problems } = hiddenPageLinksOf(kit)
    return { kept: containers, problems }
  }),
  listField('createdPageHide', 'created-page-hide', (kit) => {
    const { selectors, problems } = createdPageHideOf(kit)
    return { kept: selectors, problems }
  }),
  {
    field: 'createdPageLayouts.legal',
    command: 'legal-layout',
    /** @param {any} site */
    judge(site) {
      const legal = site?.createdPageLayouts?.legal
      if (!legal || typeof legal !== 'object') return { state: 'missing', problems: [] }
      if (legal.articleLayout === null)
        return said(legal.why) ? { state: 'none', problems: [] } : { state: 'missing', problems: [] }
      return typeof legal.articleLayout === 'string' && LAYOUT.test(legal.articleLayout.trim())
        ? { state: 'declared', problems: [] }
        : {
            state: 'missing',
            problems: [
              `the kit's legal layout ${JSON.stringify(legal.articleLayout)} is not <template>:<file>`
            ]
          }
    }
  }
])

/**
 * Which of the five fields a kit declares, says none with a reason, or lacks.
 * @param {any} doc the template kit document
 * @returns {{ declared: string[], none: string[], missing: string[], problems: string[] }}
 */
export function hiddenKitFieldsOf(doc) {
  const out = { declared: [], none: [], missing: [], problems: [] }
  for (const f of HIDDEN_KIT_FIELDS) {
    const { state, problems } = f.judge(doc?.site)
    out[state].push(f.field)
    out.problems.push(...problems)
  }
  return out
}

/** The check, as the verdict's `CHECKS` lists one: `{ piece, step, judge(release, world) }`. */
export const HIDDEN_KIT_FIELDS_CHECK = Object.freeze({
  piece: 'template-kit',
  step: HIDDEN_FIELDS_STEP,
  judge(release, world) {
    if (release?.platform !== 'joomla') return null
    const kit = world?.templateKit ?? kitOfRelease(release, world?.contracts ?? new Map())
    if (kit?.state !== 'read') return null
    const { declared, none, missing, problems } = hiddenKitFieldsOf(kit.doc)
    if (missing.length)
      return {
        state: 'todo',
        code: 'kit-hidden-field-missing',
        params: { fields: missing, declared, none, problems }
      }
    return { state: 'done', code: 'kit-hidden-fields-declared', params: { declared, none } }
  }
})
