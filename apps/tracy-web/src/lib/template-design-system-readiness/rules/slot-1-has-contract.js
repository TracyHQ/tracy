/**
 * SLOT-1: the template has a design-system slot contract, marked ready.
 *
 * The Design system button finds a running site's contract by the template it runs
 * (`ds-slot.js` `contractFor`): without one it refuses every site built from this release
 * (`TEMPLATE_HAS_NO_SLOT`), with one marked not ready it refuses too (`TEMPLATE_NOT_READY`).
 */
import { slotOf } from '../readers/slot.js'

/** @type {import('../index.js').Rule} */
export const slot1HasContract = {
  id: 'SLOT-1',
  title: 'The template has a design-system slot contract',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: 'contract',
  async run(context) {
    const slot = await slotOf(context)
    if (!slot.templateKey)
      return {
        status: 'fail',
        message: 'The release names no template the Design system button can look up.',
        fix: 'Name the template in tracy_setting.json (`template`), and for WordPress attach the theme zip.'
      }
    if (!slot.name)
      return {
        status: 'fail',
        message: `No slot contract names ${slot.templateKey}, so the Design system button refuses every site built from this release.`,
        fix: `Measure the template and write packages/design/tracy-ds-slot/templates/<cms>-<slug>.json with "template": "${slot.templateKey}" (scripts pass-joomla.mjs / pass-wordpress.mjs, the tdsr skill).`
      }
    if (slot.contract?.ready === false)
      return {
        status: 'fail',
        message: `templates/${slot.name}.json is marked not ready: ${String(slot.contract.readyNote ?? 'no note')}`,
        fix: 'Measure it again with flow.mjs and set "ready": true once every system passes.'
      }
    return { status: 'pass', message: `templates/${slot.name}.json fits ${slot.templateKey}.` }
  }
}
