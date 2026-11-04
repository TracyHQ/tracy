// A contact page's form the plan hides (`site.forms`). The form has no slot: Joomla's contact view draws it from the setting
// `show_email_form`, and the setting of the menu item that opens the page wins over the contact's own. So that item's setting
// is what closes it, no CSS and no words touched. A form on a module goes with its block, which is the hide stage's.
import { createHash } from 'node:crypto'
import { menuRows, paramsOf, rowsOpening } from './page-meta-write.js'
import { doorCall, readRow } from './settings-door.js'

const each = (value) => (Array.isArray(value) ? value : [])
const CONTACT = /^contact-\d+$/
const blocksOf = (page) => new Set(Object.values(page?.blocks ?? {}).flat())

/**
 * @param {{ door: { apply: Function }, siteKey: string, plan: object, kit: object }} input
 * @returns {Promise<object[]>} one report line per hidden form of a contact page
 */
export async function closeForms({ door, siteKey, plan, kit }) {
  const blocks = new Map(each(kit?.blocks).map((b) => [b?.id, b]))
  const keptPages = new Set(
    each(plan?.pages)
      .filter((p) => p?.decision === 'keep')
      .map((p) => p.id)
  )
  const forms = each(plan?.site?.forms).filter(
    (f) => f?.decision === 'hide' && CONTACT.test(String(blocks.get(f.block)?.source?.entity))
  )
  const pagesOf = (block) =>
    each(kit?.pages).filter((page) => keptPages.has(page?.id) && blocksOf(page).has(block))
  const wanted = forms.filter((f) => pagesOf(f.block).length)
  if (!wanted.length) return []
  const call = doorCall(door, siteKey)
  const line = (slot, fields) => ({ slot, key: null, owner: 'plan', part: 'form', readBack: null, ...fields })
  let rows
  try {
    rows = await menuRows(call)
  } catch (error) {
    return wanted.map((f) =>
      line(f.block, { status: 'failed', reason: `the menu could not be read: ${error.message}` })
    )
  }
  const lines = []
  for (const form of wanted) {
    const opening = pagesOf(form.block).flatMap((page) => rowsOpening(page, rows))
    if (!opening.length) {
      lines.push(
        line(form.block, { status: 'failed', reason: 'no published menu item opens this form’s page' })
      )
      continue
    }
    try {
      for (const row of opening)
        await call('content.update', {
          apply_id: `form-close-${createHash('sha256').update(`${form.block} ${row.id}`).digest('hex').slice(0, 32)}`,
          kind: 'menuItem',
          id: Number(row.id),
          fields: { params: JSON.stringify({ ...paramsOf(row.params), show_email_form: '0' }) }
        })
      lines.push(
        line(form.block, {
          status: 'hidden',
          reason: `the plan hides this form: ${form.why ?? 'no reason given'}`,
          ordered: '0',
          readFrom: readRow('menuItem', Number(opening[0].id), 'params', ['show_email_form'])
        })
      )
    } catch (error) {
      lines.push(line(form.block, { status: 'failed', reason: error.message }))
    }
  }
  return lines
}
