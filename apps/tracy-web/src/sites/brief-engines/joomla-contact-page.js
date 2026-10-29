/**
 * The Joomla contact record as a Contact page (spec TracyHQ/tracy#189 item 19, round 9, class D): which of the record's view
 * settings a brief build sets, and where Joomla reads them.
 *
 * 🔒 A VIEW SETTING IS WRITTEN ON THE RECORD AND ON EVERY MENU ENTRY OF THE RECORD, EMPTY ENTRIES INCLUDED. Joomla 5's
 * contact view merges the component's global options with the menu entry's (an empty entry value falls back to the global
 * option) and, on the entry's own page, lays that merge OVER the record's settings. Measured 30/10/2026 on a brief build:
 * the record said `show_email_form` 0, its entry left the setting empty, the global option said 1, and the form showed. A
 * setting written on the record alone holds only where no entry of the record is the page.
 *
 * 🔒 THE CONTACT PAGE LISTS EVERY CHANNEL AS A LINK (`contact-page.mjs`). The record's telephone, mobile and fax lines print
 * as plain text in every com_contact layout, so the channel list is written into the record's extra information (`misc`,
 * which takes markup) and those plain lines are switched off; their values stay on the record for the vCard.
 */
import { contactPageHtml, contactPageLines } from 'website-opportunities/domain/contact-page.mjs'

/** The record setting that shows the form (Joomla 5: `show_email_form && (email_to || user_id)`). */
export const FORM_SWITCH = 'show_email_form'
/** The plain-text number lines a channel list replaces. */
const NUMBER_LINES = ['show_telephone', 'show_mobile', 'show_fax']

/**
 * The settings a brief build wants on a contact record and its menu entries.
 * @param {{ email: string, listed: boolean }} input - `listed` when the record carries the channel list
 * @returns {Record<string, string>}
 */
export function wantedSettings({ email, listed }) {
  /** @type {Record<string, string>} */
  const out = {}
  if (email === '') out[FORM_SWITCH] = '0'
  if (listed) {
    for (const key of NUMBER_LINES) out[key] = '0'
    out.show_misc = '1'
  }
  return out
}

/** A row's `params` as an object: a JSON string, an object, or empty; null when unreadable. */
const paramsOf = (/** @type {unknown} */ params) => {
  if (params === undefined || params === null || params === '') return {}
  try {
    const read = typeof params === 'string' ? JSON.parse(params) : params
    return read && typeof read === 'object' && !Array.isArray(read) ? read : null
  } catch {
    return null
  }
}

/** Whether a menu entry opens this contact record's own page. */
export const opensRecord = (/** @type {any} */ entry, /** @type {number} */ id) =>
  /option=com_contact/.test(String(entry?.link ?? '')) &&
  new RegExp(`[?&]view=contact&(?:[^&]*&)*id=${Number(id)}(?:&|$)`).test(String(entry?.link ?? ''))

/**
 * The writes that give a record and its entries the wanted settings: the record's new `params` (null when already as
 * wanted) and one menu step per entry of the record that does not say each wanted value itself.
 * @param {{ id: number, params: Record<string, unknown>, entries: any[], wanted: Record<string, string> }} input
 * @returns {{ record: string | null, menu: Array<{ kind: 'menuItem', id: number, fields: { params: string } }> }}
 */
export function settingWrites({ id, params, entries, wanted }) {
  const differs = (/** @type {Record<string, unknown>} */ set) =>
    Object.entries(wanted).some(([key, value]) => String(set[key] ?? '') !== value)
  const record = differs(params) ? JSON.stringify({ ...params, ...wanted }) : null
  /** @type {Array<{ kind: 'menuItem', id: number, fields: { params: string } }>} */
  const menu = []
  for (const entry of entries) {
    if (!opensRecord(entry, id)) continue
    const set = paramsOf(entry.params)
    if (!set || !differs(set)) continue
    menu.push({
      kind: 'menuItem',
      id: Number(entry.id),
      fields: { params: JSON.stringify({ ...set, ...wanted }) }
    })
  }
  return { record, menu }
}

/**
 * The record's extra information as the Contact page's channel list, from the site plan; '' when the plan has no channel.
 * @param {any} plan - the site plan (`contact`, `channels`)
 */
export function channelListOf(plan) {
  const lines = plan ? contactPageLines(plan) : []
  // Areas alone are no channel list: the record keeps its own lines then (the areas beside its address).
  return lines.some((line) => line.href || line.kind === 'booking') ? contactPageHtml(lines) : ''
}

/** The component's default heading above the extra information, and what it says on a brief build: the list's role. */
export const MISC_HEADING_KEY = 'COM_CONTACT_OTHER_INFORMATION'
export const MISC_HEADING_WORDS = 'How to reach us'

/**
 * Replace the component's "Miscellaneous Information" heading by the channel list's role, in each English language of the
 * site, as a language override (`template.languageOverrides`). Never throws: what did not happen is the answer's note.
 * A language other than English keeps the site-strings translation of the default heading (said in the note).
 * @param {{ apply: (call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>,
 *   siteKey: string, template: string | null, locales: string[] }} input
 * @returns {Promise<{ written: string[], note: string | null }>}
 */
export async function writeMiscHeading({ apply, siteKey, template, locales }) {
  const english = locales.filter((tag) => /^en-/i.test(tag))
  const others = locales.filter((tag) => !/^en-/i.test(tag))
  /** @type {string[]} */
  const written = []
  /** @type {string[]} */
  const said = []
  if (!template)
    return { written, note: 'the contact list heading keeps its default: the site template is unknown' }
  for (const locale of english) {
    try {
      const answer = await apply({
        siteKey,
        action: 'template.languageOverrides',
        params: {
          template,
          locale,
          operation: 'set',
          strings: { [MISC_HEADING_KEY]: MISC_HEADING_WORDS },
          apply_id: `contact-heading-${locale}-${Date.now().toString(36)}`
        }
      })
      const refused = Array.isArray(answer?.refused) && answer.refused.length > 0
      if (answer?.ok && !refused) written.push(locale)
      else said.push(`${locale} refused (${answer?.code ?? answer?.refused?.[0]?.reason ?? 'no answer'})`)
    } catch (error) {
      said.push(`${locale}: ${error instanceof Error ? error.message : error}`)
    }
  }
  if (others.length) said.push(`${others.join(', ')} keep the translated default heading`)
  return {
    written,
    note: said.length ? `the contact list heading "${MISC_HEADING_WORDS}": ${said.join('; ')}` : null
  }
}
