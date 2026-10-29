/**
 * The module writes of a brief build's contact facts (#191): the site plan the build carries (`woContent.sitePlanFor`),
 * read once, and the custom modules' contact lines pointed at it (`joomla-contact-links.js`). A site no brief build made
 * has no site plan and writes nothing here; a module list the site cannot give is a note, never a failed build.
 */
import { moduleContactSteps } from './joomla-contact-links.js'
import { readModules } from './joomla-tidy.js'

/**
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {{ siteKey: string, email: string, note: (line: string) => void, time?: (key: string, n: number) => void }} input.ctx
 * @param {{ sitePlanFor?: Function } | null} input.woContent
 * @param {Set<string>} input.visible
 * @returns {Promise<{ steps: Array<{ kind: 'module', id: number, fields: { content: string } }> }>}
 */
export async function planContactSteps({ apply, siteKey, ctx, woContent, visible }) {
  const plan = await woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
  const contact = plan?.contact
  if (!contact || Object.keys(contact).length === 0) return { steps: [] }
  try {
    const made = moduleContactSteps({ modules: await readModules(apply, siteKey), contact, visible })
    if (made.moved + made.added > 0) ctx.time?.('contactLinksWritten', made.moved + made.added)
    if (made.removed > 0)
      ctx.note(`${made.removed} contact line(s) of the template you gave no detail for were taken off`)
    return { steps: made.steps }
  } catch (error) {
    ctx.note(
      `the modules' contact lines could not be read: ${error instanceof Error ? error.message : error}`
    )
    return { steps: [] }
  }
}
