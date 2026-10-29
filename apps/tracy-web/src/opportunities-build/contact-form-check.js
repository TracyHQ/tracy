// A contact form shows only when it has a real recipient (COO decision, spec TracyHQ/tracy#189 item 19). The engine's
// write is not proof: a Joomla record linked to a user account, a menu entry's own setting or a WordPress form block can
// keep a form on after its address was emptied. So the served pages are read, and with no email of the owner's every
// visible message form on them is a finding; the report says the form is off only when no page shows one.
// Shared by Joomla T3/T4, WordPress and EmDash pages: a form is judged by what a visitor can fill, not by its plugin.
import { parse } from 'parse5'
import { readContact } from 'website-opportunities/domain/contact-reading.mjs'

/** What the report says once the built pages were read and none shows a message form. */
export const CONTACT_FORM_OFF_NOTE =
  'No email was given, so no page shows a contact form: the built pages were checked. Add your email to turn the form on.'

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value
const hidden = (node) =>
  ['script', 'style', 'template', 'noscript'].includes(node.tagName) ||
  attr(node, 'hidden') !== undefined ||
  attr(node, 'aria-hidden') === 'true' ||
  /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(node, 'style') ?? '')
const visible = (node) => (node.childNodes ?? []).filter((n) => !hidden(n))
const walk = (node) => [node, ...visible(node).flatMap(walk)]

/** A field a visitor types a message or their address into (not a search box, not a hidden token). */
const messageField = (node) => node.tagName === 'textarea'
const addressField = (node) =>
  node.tagName === 'input' &&
  (attr(node, 'type') === 'email' || /(?:^|[\][_-])e-?mail(?:$|[\][_-])/i.test(attr(node, 'name') ?? ''))

/**
 * A form that sends a visitor's message: it has a message box, or it is a known contact form (Joomla com_contact,
 * Contact Form 7, WPForms, Gravity Forms, an EmDash form) with an address field. A search or sign-up form is neither.
 */
function sendsMessage(form) {
  const fields = walk(form)
  if (fields.some(messageField)) return true
  const marked =
    /(?:^|\s)(?:contact-form|com-contact__form|wpcf7-form|wpforms-form|gform_wrapper|emdash-form)(?:\s|$)/i
  return (
    (marked.test(attr(form, 'class') ?? '') || attr(form, 'id') === 'contact-form') &&
    fields.some(addressField)
  )
}

/**
 * @param {{ pages: Array<{ path: string, status?: number, html: string }>, brief: any }} input
 * @returns {{ recipient: boolean, findings: Array<{ kind: string, severity: string, path: string, why: string }>, note: string | null }}
 */
export function checkContactForms({ pages, brief }) {
  const email = String(readContact(brief ?? {})?.email?.value ?? '').trim()
  if (email !== '') return { recipient: true, findings: [], note: null }
  const findings = []
  for (const page of pages ?? []) {
    if ((page.status && page.status !== 200) || /tracy-leftover-check-missing/.test(page.path)) continue
    const forms = walk(parse(String(page.html ?? ''))).filter((n) => n.tagName === 'form' && sendsMessage(n))
    if (forms.length === 0) continue
    findings.push({
      kind: 'contact-form',
      severity: 'major',
      path: page.path,
      why: `A contact form shows on ${page.path} but the brief gives no email to send it to`
    })
  }
  return { recipient: false, findings, note: findings.length === 0 ? CONTACT_FORM_OFF_NOTE : null }
}
