/**
 * PLAT-1: the template carries the part of the slot its CMS wears a system through.
 *
 * - WordPress: the theme applies the style variation the button writes (`tracy_apply_inspiration`
 *   in its PHP); without it the variation file lands in uploads and nothing reads it.
 * - EmDash: the theme reads the slot file on every request (`src/lib/ds-slot.ts`, imported by a
 *   layout); without it the button writes `data/ds-slot.css` and the page never loads it.
 * - Joomla: the slot is one site module the plugin writes in the contract's `module.position`, so
 *   the template must still render that position (named in `templateDetails.xml`, a T4 block or
 *   layout, a T3 block); a position the template dropped renders nothing, so nothing changes.
 */
import { releaseFiles } from '../readers/release-files.js'
import { slotOf } from '../readers/slot.js'

/** @type {import('../index.js').Rule} */
export const plat1SlotReader = {
  id: 'PLAT-1',
  title: 'The template carries the part of the slot its CMS needs',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: 'template',
  async run(context) {
    const { files } = await releaseFiles(context)
    const { platform } = context.release
    if (platform === 'wordpress') {
      const php = [...files].filter(([n, t]) => n.endsWith('.php') && t.includes('tracy_apply_inspiration'))
      return php.length > 0
        ? {
            status: 'pass',
            message: `The theme applies the style variation the button writes (${php[0][0]}).`
          }
        : {
            status: 'fail',
            message:
              'The theme never calls tracy_apply_inspiration, so the style variation the Design system button writes is not applied.',
            fix: 'Release the theme from packages/cms/tracy-wordpress-theme/src (its functions.php hooks tracy_apply_inspiration).'
          }
    }
    if (platform === 'emdash') {
      const reader = files.has('src/lib/ds-slot.ts')
      const used = [...files].some(
        ([n, t]) => /^src\/(layouts|components|pages)\//.test(n) && /ds-slot/.test(t)
      )
      if (reader && used)
        return { status: 'pass', message: 'src/lib/ds-slot.ts is there and a layout reads it.' }
      return {
        status: 'fail',
        message: reader
          ? 'src/lib/ds-slot.ts is there but no layout reads it, so the slot file is never loaded.'
          : 'The theme has no src/lib/ds-slot.ts, so the slot file the button writes is never loaded.',
        fix: 'Copy the slot reader of the base theme (vendor/emdash/emdash-theme-bravada src/lib/ds-slot.ts and its Base layout import) and release the theme.'
      }
    }
    const slot = await slotOf(context)
    const position = slot.contract?.module?.position
    if (typeof position !== 'string' || position === '')
      return {
        status: 'not-applicable',
        message: 'Waits for SLOT-1: no contract names the slot module position.'
      }
    const named = new RegExp(`(["'>\\s])${position.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'<\\s])`)
    const where = [...files]
      .filter(([n]) => /\.(xml|php|html|json)$/i.test(n))
      .filter(([, t]) => named.test(t))
      .map(([n]) => n)
    return where.length > 0
      ? {
          status: 'pass',
          message: `The template still has the slot's position "${position}" (${where.slice(0, 3).join(', ')}).`
        }
      : {
          status: 'fail',
          message: `The slot module goes in position "${position}", which no file of the template names any more, so the module may render nowhere.`,
          fix: `Measure the earliest position this release renders again (pass-joomla.mjs) and set module.position in templates/${slot.name}.json.`
        }
  }
}
