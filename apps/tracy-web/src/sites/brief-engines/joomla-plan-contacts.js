/**
 * The module writes of a brief build's contact facts (#191): the site plan the build carries (`woContent.sitePlanFor`),
 * read once, and the custom modules' contact lines pointed at it (`joomla-contact-links.js`). A site no brief build made
 * has no site plan and writes nothing here; a module list the site cannot give is a note, never a failed build.
 */
import { moduleContactSteps } from './joomla-contact-links.js'
import { heroSecondButtonSteps } from './joomla-hero-second-button.js'
import { readModules } from './joomla-tidy.js'

/** A block with a contact line in words: a call, a mail or a chat link. */
const CONTACT_LINE =
  /<a\b[^>]*\shref\s*=\s*["'](?:tel:|mailto:|https?:\/\/(?:wa\.me|api\.whatsapp\.com|zalo\.me)\/)/i

/**
 * The modules holding contact lines that are SUMMARY blocks: shown on every page, or on every page but some (Joomla's
 * `menuids` `[0]`, or the negative ids of "on all pages except"). A summary block shows one channel; a block shown on chosen
 * pages only (the contact page's) keeps every channel. Framework-wide (Joomla's module assignment), never per template: no
 * template declares it. A module whose assignment cannot be read is no summary block (its lines stay as they are).
 * @param {(call: any) => Promise<any>} apply
 * @param {string} siteKey
 * @param {Array<{ id: number | string, published?: number | string, content?: unknown }>} modules
 * @returns {Promise<Set<number>>}
 */
export async function summaryModuleIds(apply, siteKey, modules) {
  const out = new Set()
  for (const row of modules) {
    if (Number(row.published) !== 1 || typeof row.content !== 'string' || !CONTACT_LINE.test(row.content))
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
 * @returns {Promise<{ steps: Array<{ kind: 'module', id: number, fields: { content: string } }> }>}
 */
export async function planContactSteps({ apply, siteKey, ctx, woContent, visible, slots = [] }) {
  const plan = await woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
  const contact = plan?.contact
  const channels = Array.isArray(plan?.channels) ? plan.channels : null
  if ((!contact || Object.keys(contact).length === 0) && !channels?.length) return { steps: [] }
  try {
    const modules = await readModules(apply, siteKey)
    // Every channel of the brief in a page's own contact block, each phone its own line (COO rule 29/10/2026); one channel in
    // a summary block shown on every page (COO decision 30/10/2026).
    const summaries = await summaryModuleIds(apply, siteKey, modules)
    const made = moduleContactSteps({ modules, contact: contact ?? {}, visible, channels, slots, summaries })
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
