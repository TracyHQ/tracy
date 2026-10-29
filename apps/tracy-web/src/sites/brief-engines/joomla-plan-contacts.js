/**
 * The module writes of a brief build's contact facts (#191): the site plan the build carries (`woContent.sitePlanFor`),
 * read once, and the custom modules' contact lines pointed at it (`joomla-contact-links.js`). A site no brief build made
 * has no site plan and writes nothing here; a module list the site cannot give is a note, never a failed build.
 */
import { moduleContactSteps } from './joomla-contact-links.js'
import { heroSecondButtonSteps } from './joomla-hero-second-button.js'
import { readModules } from './joomla-tidy.js'

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
    // Every channel of the brief in each contact block, each phone its own line (COO rule 29/10/2026).
    const made = moduleContactSteps({ modules, contact: contact ?? {}, visible, channels, slots })
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
