/**
 * The module writes of a brief build's contact facts (#191): the site plan the build carries (`woContent.sitePlanFor`),
 * read once, and the custom modules' contact lines pointed at it (`joomla-contact-links.js`). A site no brief build made
 * has no site plan and writes nothing here; a module list the site cannot give is a note, never a failed build.
 */
import { moduleContactSteps } from './joomla-contact-links.js'
import { heroSecondButtonSteps } from './joomla-hero-second-button.js'
import { readModules } from './joomla-tidy.js'
import {
  CONTACT_ENTRY_ROLES,
  contactBlocksOf,
  SUMMARY_PLACEMENTS
} from 'website-opportunities/domain/footer-contact-shape.mjs'

/** A block with a contact line in words: a call, a mail or a chat link. */
const CONTACT_LINE =
  /<a\b[^>]*\shref\s*=\s*["'](?:tel:|mailto:|https?:\/\/(?:wa\.me|api\.whatsapp\.com|zalo\.me)\/)/i
/** A demo contact line behind an empty link (`#`): it shows a mailbox or a phone number but calls nothing yet. */
const EMPTY_CONTACT_LINE =
  /<a\b[^>]*\shref\s*=\s*["']#?["'][^>]*>(?:(?!<\/a)[\s\S])*?(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}|\+?\(?\d[\d\s().-]{5,}\d)/i

/**
 * The modules holding contact lines that are SUMMARY blocks: shown on every page, or on every page but some (Joomla's
 * `menuids` `[0]`, or the negative ids of "on all pages except"). A summary block shows one channel; a block shown on chosen
 * pages only (the contact page's) keeps every channel. Framework-wide (Joomla's module assignment), never per template. A
 * module whose assignment cannot be read is no summary block (its lines stay as they are).
 *
 * 🔒 A DEMO FOOTER CALLS NOTHING YET (measured 30/10/2026 on a brief build of a Joomla T4 template): its phone and mailbox
 * lines lead to `#`, so a block was recognised only by `tel:`/`mailto:` links and the footer was treated as a full contact
 * block, every channel of the brief added to it. A block is a contact block also when its content map gives it contact role
 * slots or it shows a number or a mailbox behind an empty link; a block the content map declares (`contactBlocks`) is a
 * summary block by its placement (`footer`, `header`), whatever its assignment.
 * @param {(call: any) => Promise<any>} apply
 * @param {string} siteKey
 * @param {Array<{ id: number | string, published?: number | string, content?: unknown }>} modules
 * @param {{ contentMap?: any }} [options] - the release's content map (`contactBlocks`, slot roles)
 * @returns {Promise<Set<number>>}
 */
export async function summaryModuleIds(apply, siteKey, modules, { contentMap = null } = {}) {
  const out = new Set()
  const declared = new Map(
    contactBlocksOf(contentMap)
      .filter((b) => !b.inferred)
      .map((b) => [b.container, SUMMARY_PLACEMENTS.includes(b.placement)])
  )
  const withRoles = new Set(
    (contentMap?.slots ?? []).filter((s) => CONTACT_ENTRY_ROLES[s?.role]).map((s) => s.entity)
  )
  for (const row of modules) {
    if (Number(row.published) !== 1 || typeof row.content !== 'string') continue
    const key = `module-${row.id}`
    if (declared.has(key)) {
      if (declared.get(key)) out.add(Number(row.id))
      continue
    }
    if (!CONTACT_LINE.test(row.content) && !EMPTY_CONTACT_LINE.test(row.content) && !withRoles.has(key))
      continue
    try {
      const got = await apply({
        siteKey,
        action: 'content.get',
        params: { kind: 'moduleAssignment', id: Number(row.id) }
      })
      if (got?.ok === false) continue
      const ids = JSON.parse(String(got?.item?.menuids ?? 'null'))
      if (Array.isArray(ids) && ids.map(Number).some((id) => id <= 0)) out.add(Number(row.id))
    } catch {
      // An assignment that cannot be read: the block keeps its lines.
    }
  }
  return out
}

/**
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {{ siteKey: string, email: string, note: (line: string) => void, time?: (key: string, n: number) => void }} input.ctx
 * @param {{ sitePlanFor?: Function } | null} input.woContent
 * @param {Set<string>} input.visible
 * @param {any[]} [input.slots] - the content map's slots, bound and declared
 * @param {any} [input.contentMap] - the release's content map: its declared contact blocks and their demo entries
 * @returns {Promise<{ steps: Array<{ kind: 'module', id: number, fields: { content: string } }> }>}
 */
export async function planContactSteps({
  apply,
  siteKey,
  ctx,
  woContent,
  visible,
  slots = [],
  contentMap = null
}) {
  const plan = await woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
  const contact = plan?.contact
  const channels = Array.isArray(plan?.channels) ? plan.channels : null
  if ((!contact || Object.keys(contact).length === 0) && !channels?.length) return { steps: [] }
  try {
    const modules = await readModules(apply, siteKey)
    // Every channel of the brief in a page's own contact block, each phone its own line (COO rule 29/10/2026); one channel in
    // a summary block shown on every page keeps the demo's lines kind by kind (COO decisions 30/10/2026).
    const summaries = await summaryModuleIds(apply, siteKey, modules, { contentMap })
    const made = moduleContactSteps({
      modules,
      contact: contact ?? {},
      visible,
      channels,
      slots,
      summaries,
      contentMap
    })
    if (made.moved + made.added > 0) ctx.time?.('contactLinksWritten', made.moved + made.added)
    if (made.removed > 0)
      ctx.note(`${made.removed} contact line(s) of the template you gave no detail for were taken off`)
    // The hero's second button the template ships empty (`joomla-hero-second-button.js`).
    const second = heroSecondButtonSteps({ second: plan?.hero?.second, slots, modules })
    if (second.length > 0) ctx.time?.('heroSecondButton', second.length)
    return { steps: [...made.steps, ...second] }
  } catch (error) {
    ctx.note(
      `the modules' contact lines could not be read: ${error instanceof Error ? error.message : error}`
    )
    return { steps: [] }
  }
}
