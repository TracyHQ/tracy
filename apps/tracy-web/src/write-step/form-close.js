// A contact page's form the plan hides (`site.forms`). The form has no slot: Joomla's contact view draws it from the setting
// `show_email_form`, and the setting of the menu item that opens the page wins over the contact's own. So that item's setting
// is what closes it, no CSS and no words touched. A form on a module goes with its block, which is the hide stage's. A form the
// last report says is closed is not closed again, and its line reads as it did.
import { createHash } from 'node:crypto'
import { NO_LAST } from './no-last-report.js'
import { menuRows } from '../lib/joomla-menu-rows.js'
import { paramsOf, rowsOpening } from './page-meta-write.js'
import { doorCall, readRow } from './settings-door.js'

const each = (value) => (Array.isArray(value) ? value : [])
const CONTACT = /^contact-\d+$/
const blocksOf = (page) => new Set(Object.values(page?.blocks ?? {}).flat())

/**
 * @param {{ door: { apply: Function }, siteKey: string, plan: object, kit: object, last?: object }} input
 * @returns {Promise<object[]>} one report line per hidden form of a contact page
 */
export async function closeForms({ door, siteKey, plan, kit, last = NO_LAST }) {
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
  const line = (slot, fields) => ({ slot, key: null, owner: 'plan', part: 'form', readBack: null, ...fields })
  const closed = wanted.filter((f) => last.hidden(f.block))
  const lines = closed.map((f) => {
    const { status, reason, ordered, readFrom } = last.line(f.block)
    return line(f.block, { status, reason, ordered, readFrom })
  })
  const open = wanted.filter((f) => !closed.includes(f))
  if (!open.length) return lines
  const call = doorCall(door, siteKey)
  let rows
  try {
    rows = await menuRows(call)
  } catch (error) {
    return [
      ...lines,
      ...open.map((f) =>
        line(f.block, { status: 'failed', reason: `the menu could not be read: ${error.message}` })
      )
    ]
  }
  for (const form of open) {
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
