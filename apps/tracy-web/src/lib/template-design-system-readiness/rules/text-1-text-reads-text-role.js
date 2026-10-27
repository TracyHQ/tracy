/**
 * TEXT-1: no text colour of the template's stylesheets reads a ground role of the slot.
 *
 * A fill role is held to contrast only as a ground (role-values.mjs): the accent fill may be a pale
 * colour that dark words read on, and the page colour as words reads only on the band it was meant
 * for. Words have their own roles: `--ds-c-accent-text` for the accent, `--ds-c-on-ink` and
 * `--ds-c-accent-on` for the words on a band or a fill, `--ds-c-<status>-text` for a status. A code
 * review of JA Restaurant (20/10/2026) found a text `color` reading `var(--ds-c-accent)` in the
 * ja-products sources: under a system with a light accent the words fade into the page. The scan is
 * `@tracy/ds-slot` `text-roles.mjs` (`groundRolesAsText`); static, so it runs on Check again with no
 * measurement.
 */
import { dsSlotModule } from '../../ds-slot.js'
import { releaseFiles, stylesheetsOf } from '../readers/release-files.js'

/** How many spots a message names before it says how many more. */
const SHOWN = 6

/** @type {import('../index.js').Rule} */
export const text1TextReadsTextRole = {
  id: 'TEXT-1',
  title: 'Every text colour reads a text role',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: 'template',
  async run(context) {
    const { groundRolesAsText } = await dsSlotModule('text-roles')
    const found =
      /** @type {{ file: string, line: number, selector: string, property: string, role: string, use: string }[]} */ (
        groundRolesAsText(stylesheetsOf(await releaseFiles(context)))
      )
    if (found.length === 0)
      return { status: 'pass', message: 'No text colour of the stylesheets reads a ground role of the slot.' }
    const spots = found.map(
      (f) => `${f.file}:${f.line} ${f.selector} { ${f.property}: --ds-c-${f.role} } → --ds-c-${f.use}`
    )
    const roles = /** @type {Record<string, number>} */ ({})
    for (const f of found) roles[f.role] = (roles[f.role] ?? 0) + 1
    const top = Object.entries(roles)
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => `--ds-c-${r} ×${n}`)
    return {
      status: 'fail',
      message: `${found.length} text colour${found.length === 1 ? ' reads' : 's read'} a ground role of the slot (${top.join(', ')}), so under a system the words take a colour chosen as a fill: ${spots.slice(0, SHOWN).join('; ')}${found.length > SHOWN ? `, and ${found.length - SHOWN} more` : ''}.`,
      fix: 'Paint the words with the text role of that ground: --ds-c-accent-text (and -hover) for accent words, --ds-c-accent-on or --ds-c-on-ink for words on a fill or a band, --ds-c-accent-on-ink for accent words on an ink band, --ds-c-<status>-text for a status; then release the template.',
      details: spots
    }
  }
}
