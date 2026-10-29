// Sign-up and form blocks of the template's demo (spec TracyHQ/tracy#189, COO rule 29/10/2026): a newsletter box, a booking
// widget, a login box. Measured on a local brief build (a coaching club on a Joomla T4 template): the footer kept "Join our
// coaching newsletter" with an Email field and a SUBSCRIBE button, and the copy writer rewrote its words for the customer, so
// the site promised something false and swallowed visitors' emails into a list nobody reads.
//
// 🔒 A FORM STAYS ONLY WHEN IT HAS A REAL DESTINATION FOR THIS BUSINESS. A newsletter or sign-up block needs an email-marketing
// account or list the brief names (an integration of kind `newsletter`, verified); a booking widget needs a verified booking
// link; a login or register box has no destination a Tracy site can give. The site's ordinary contact form (the contact
// record, which Tracy wires to the owner's mailbox) is not a block of this file: it is never judged here.
// 🔒 NO DESTINATION: THE WHOLE BLOCK GOES (heading, text, field, button), as one module taken off, and its slot texts are not
// written. Rules by module type and by the words a block says, never by template or trade. Pure and deterministic.

/** Module types of mailing-list extensions: the block is a sign-up form whatever its words say. */
const MAIL_MODULE =
  /^mod_(?:acym(?:ailing)?|jnews|jmailing|mailchimp\w*|\w*newsletter\w*|bwpostman\w*|mailster\w*|phplist\w*)$/i
/** Module types of booking and reservation widgets. */
const BOOKING_MODULE =
  /^mod_(?:vik\w+|\w*booking\w*|\w*appointment\w*|\w*reservation\w*|\w*checkavailability\w*)$/i
/** Module types of a login or register box. */
const LOGIN_MODULE = /^mod_(?:login|jalogin|\w*register\w*)$/i

/** A title that names a sign-up block ("Newsletter - Signup", "Subscription"). */
const SIGNUP_TITLE = /newsletter|subscri(?:be|ption|ber)|mailing[\s-]*list/i
/** Words that say a block collects email addresses. */
const SIGNUP_WORDS =
  /newsletter|mailing[\s-]*list|\bsubscribe (?:to|for)\b|\bin your inbox\b|\byour (?:e-?mail|inbox)\b|\bsign[\s-]*up (?:for|to) (?:our|the|my)\b/i
/** A short text that is the label of an email field. */
const EMAIL_FIELD = /^\s*(?:your |work |business )?e-?mail(?: address)?\s*\*?\s*$/i
/** A block of more text slots than this is a section of the page, not a sign-up box. */
const MAX_BLOCK_SLOTS = 8

/** The kinds a block can be, with the destination each needs. */
export const FORM_BLOCK_KINDS = Object.freeze({
  newsletter: 'a verified email-marketing integration in the brief',
  booking: 'a verified booking link in the brief',
  login: 'none: a Tracy site has no member area'
})

const isText = (v) => typeof v === 'string' && v.trim() !== ''

/**
 * Which destinations the brief really holds. An integration counts only when it is verified and carries an address.
 * @param {any} brief
 * @returns {{newsletter: boolean, booking: boolean, login: boolean}}
 */
export function formDestinationsOf(brief) {
  const list = Array.isArray(brief?.integrations) ? brief.integrations : []
  const real = (kind) => list.some((x) => x?.kind === kind && x.verified === true && isText(x.url))
  return { newsletter: real('newsletter'), booking: real('booking'), login: false }
}

/**
 * The form blocks of a content map: the modules that are a sign-up box, a booking widget or a login box.
 * @param {{entities?: any[], slots?: any[]} | null | undefined} contentMap
 * @returns {Array<{entity: string, kind: 'newsletter' | 'booking' | 'login', module: string, title: string, slots: string[]}>}
 */
export function formBlocksOf(contentMap) {
  const out = []
  const slots = contentMap?.slots ?? []
  for (const entity of contentMap?.entities ?? []) {
    if (entity?.kind !== 'module') continue
    const module = String(entity.identity?.module ?? '')
    const title = String(entity.identity?.title ?? '')
    const own = slots.filter((s) => s?.entity === entity.key)
    const texts = own.filter((s) => s.type === 'text' && isText(s.sample))
    const keys = own.map((s) => s.key)
    /** @type {'newsletter' | 'booking' | 'login' | null} */
    let kind = null
    if (MAIL_MODULE.test(module)) kind = 'newsletter'
    else if (BOOKING_MODULE.test(module)) kind = 'booking'
    else if (LOGIN_MODULE.test(module)) kind = 'login'
    else if (texts.length > 0 && texts.length <= MAX_BLOCK_SLOTS) {
      // Any other module (a custom block, a JA ACM section) is a sign-up box when its title or its words say so, and its
      // words speak of an address or a list: a pricing section titled "Subscription plans" says neither.
      const speaks = texts.some(
        (s) => SIGNUP_WORDS.test(String(s.sample)) || EMAIL_FIELD.test(String(s.sample))
      )
      const named = SIGNUP_TITLE.test(title)
      const lists = texts.some((s) => /newsletter|mailing[\s-]*list/i.test(String(s.sample)))
      if ((named && speaks) || lists) kind = 'newsletter'
    }
    if (kind) out.push({ entity: entity.key, kind, module, title, slots: keys })
  }
  return out
}

/**
 * The blocks to take off: every form block whose kind has no destination in the brief.
 * @param {any} brief
 * @param {{entities?: any[], slots?: any[]} | null | undefined} contentMap
 */
export function planFormBlocks(brief, contentMap) {
  const destinations = formDestinationsOf(brief)
  const blocks = formBlocksOf(contentMap)
  const off = blocks.filter((b) => !destinations[b.kind])
  return {
    blocks,
    off,
    /** The slot keys of the blocks taken off: their texts are never written. */
    unwritten: new Set(off.flatMap((b) => b.slots))
  }
}
