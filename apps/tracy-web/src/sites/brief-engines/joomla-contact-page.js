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

/**
 * 🔒 THE COMPONENT'S HEADING OVER THE CHANNEL LIST IS TAKEN OFF, NOT REWORDED (#189, round 10). com_contact prints
 * `COM_CONTACT_OTHER_INFORMATION` ("Miscellaneous Information", in the site language) over the extra information; the
 * channel list sits under the record's own "Contact" heading and needs no second one. The site refuses a language override
 * in en-GB by design ("locale required: a Joomla language tag other than en-GB"), so the leftover head block hides the
 * heading wherever the extra information holds the channel list (`contactPageHtml` `.contact-channels`): the sibling before
 * the block in Joomla's core layout (`com-contact__miscinfo`), the block's own heading in a template override. Joomla-wide, never per template.
 */
export const CONTACT_LIST_HEADINGS = Object.freeze([
  // Core: the sibling before a block that holds no heading of its own (an override's "Contact" before its block stays).
  // (`:has` never nests inside `:has`: a browser drops the whole selector list for it.)
  'h3:has(+ .com-contact__miscinfo .contact-channels):not(:has(+ .com-contact__miscinfo > h3))',
  '.contact-miscinfo:has(.contact-channels) > h3'
])
