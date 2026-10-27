/**
 * VARS-1: the quickstart declares every standard role variable, and no colour, radius or font literal
 * that plays a role is left unhandled.
 *
 * A design system only sets values; the template's frame, spacing and layout stay its own. That holds
 * only when the template reads each role from its `--ds-*` variable (`var(--ds-c-bg, <its own value>)`)
 * instead of a literal the emitter has to chase with patch rules. The one list of roles is
 * `@tracy/ds-slot` `role-variables.mjs`; what a release declares and still hardcodes is the packaging
 * scanner's report (`readers/role-scan.js`). No report for this version is "Not scanned yet", and
 * like an unmeasured preview it holds Publish: a release nobody scanned is not known to declare them.
 */
import { dsSlotModule } from '../../ds-slot.js'
import { ROLE_SCAN_FILE, roleScanOf } from '../readers/role-scan.js'

/** How many spots or names a message names before it says how many more. */
const SHOWN = 8

/** @param {string[]} items */
const listed = (items) =>
  `${items.slice(0, SHOWN).join(', ')}${items.length > SHOWN ? `, and ${items.length - SHOWN} more` : ''}`

/**
 * A component that sets no corner at all (scanner class `missing`) has no literal to quote: it is
 * named by the property it never sets.
 * @param {import('../readers/role-scan.js').HardcodedSpot} h
 */
const spotOf = (h) =>
  `${h.file}:${h.line} (${h.component}${h.property ? `, ${h.property}` : ''}${h.value ? ` ${h.value}` : h.class === 'missing' ? ' not set' : ''})`

/**
 * Scanner field `twin`: the Sass/LESS source this compiled stylesheet was built from.
 * @param {import('../readers/role-scan.js').HardcodedSpot} h
 */
const isTwin = (h) => typeof h.twin === 'string' && h.twin.trim() !== ''

/** @type {import('../index.js').Rule} */
export const vars1RoleVariables = {
  id: 'VARS-1',
  title: 'The quickstart declares every role variable',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: 'template',
  async run(context) {
    const read = await roleScanOf(context)
    if (read.scan === null)
      return {
        status: 'fail',
        message: `Not scanned yet: ${read.why}, so nothing says this release declares the role variables a design system sets.`,
        fix: `Package the quickstart with the role scanner so the release carries ${ROLE_SCAN_FILE} for version ${context.release.version}, then press Check again.`
      }
    const { scan } = read
    const { missingRoleVariables, roleVariable } = await dsSlotModule('role-variables')
    // roles the template declares it has no honest place for (`notUsed`, each with its reason); the
    // role list refuses the always-required ones (bg, fg, accent, accent-on, border, heading)
    const notUsed = Array.isArray(scan.notUsed)
      ? scan.notUsed.filter((n) => typeof n?.name === 'string' && String(n.reason ?? '').trim())
      : []
    const missing = /** @type {string[]} */ (missingRoleVariables(scan.declared, notUsed))
    // a compiled twin (CSS built from a Sass/LESS source the scan also read) is counted at its
    // source, so a Joomla template's literal is not counted twice
    const open = scan.hardcoded.filter(
      (h) => !isTwin(h) && (h.handled !== true || !String(h.reason ?? '').trim())
    )
    const stamp = `Scanned ${scan.scannedAt.slice(0, 10)}${scan.scanner ? ` by ${scan.scanner}` : ''}.`
    if (missing.length === 0 && open.length === 0)
      return {
        status: 'pass',
        message: `Every required role variable is declared and no role is hardcoded. ${stamp}`
      }
    const parts = []
    if (missing.length)
      parts.push(`${missing.length} required role variable(s) not declared: ${listed(missing)}`)
    if (open.length) parts.push(`${open.length} hardcoded value(s) left: ${listed(open.map(spotOf))}`)
    const fixes = []
    if (missing.length)
      fixes.push(
        `make the template read ${missing.length === 1 ? 'that role' : 'each missing role'} with its own value as the fallback (var(${missing[0]}, <the template's value>))`
      )
    if (open.length) {
      const role = open.find((h) => h.role && roleVariable(h.role))?.role
      fixes.push(
        `replace each hardcoded value with the role it plays${role ? ` (for example var(${role}, <the literal>))` : ''}, or mark it handled with a reason when it is part of a picture`
      )
      if (open.some((h) => h.class === 'missing'))
        fixes.push(
          "give each component that sets no corner one that reads its role (border-radius: var(--ds-btn-radius, <the template's corner>))"
        )
    }
    return {
      status: 'fail',
      message: `${parts.join('; ')}. ${stamp}`,
      fix: `In the template source, ${fixes.join(', and ')}; then package and release again.`,
      details: [
        ...missing.map((n) => `missing: ${n}`),
        ...open.map((h) => `hardcoded: ${spotOf(h)}${h.role ? ` -> ${h.role}` : ''}`)
      ]
    }
  }
}
