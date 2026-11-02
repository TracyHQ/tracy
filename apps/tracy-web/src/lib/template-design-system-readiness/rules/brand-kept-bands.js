/**
 * BRAND-1, BRAND-2, BRAND-3: the template is ready for the brand step (brand mode, ADR 0031 revision
 * 02/11/2026), which paints a new site in the customer's own colours through the Design system door
 * (`@tracy/ds-slot` `src/brand.mjs`). Outside the bands a contract keeps, brand mode is a system like any
 * other and the other rules grade it. Inside a kept band (a photo hero, a call-to-action band, a video card)
 * the picture, words and layout stay the template's, and only the ACCENT ROLE takes the brand accent:
 * through the slot's accent variables and the template variables the contract gives back. What the band's
 * own stylesheet paints in the template accent as a literal stays the template's red under every brand.
 *
 *   BRAND-1 (contract)  every literal accent paint inside a kept band that a role paint can reach is named
 *                       in the contract (`bands.<band>.paint`, or `vars` for a variable set on the band);
 *   BRAND-2 (template)  no kept band paints the accent where no role paint reaches (a gradient, a shadow,
 *                       an inline picture): only a release reading it through the slot fixes those;
 *   BRAND-3 (live)      on a built site the accent words read at 4.5:1 in the brand's own hue, accent fills stand
 *                       out at 3:1, and no template accent is left: scored from `brand-measurement.json`
 *                       (`scripts/brand-measure.mjs`), `live-only` with its command until one is here.
 *
 * Joomla only: brand mode exists on the Joomla slot (`joomlaSlot(…, { brand: true })`) for now.
 */
import { readFileSync } from 'node:fs'

import { dsSlotModule } from '../../ds-slot.js'
import { keptBandAccents } from '../readers/kept-band-accents.js'
import { BRAND_MEASUREMENT_FILE, treeMeasurementFiles } from '../readers/measurement.js'
import { slotOf } from '../readers/slot.js'

const PLATFORMS = ['joomla']

/** At most this many spots are named in a message; every one is in `details`. */
const SHOWN = 6

/** @param {import('../readers/kept-band-accents.js').KeptAccent} f */
const spot = (f) => `${f.selector} { ${f.property}: ${f.colour} } in ${f.file}`

/** @type {import('../index.js').Rule} */
export const brand1KeptAccentDeclared = {
  id: 'BRAND-1',
  title: 'Accent paints inside kept bands follow the brand accent',
  platforms: PLATFORMS,
  owner: 'contract',
  async run(context) {
    const r = await keptBandAccents(context)
    if (!r)
      return { status: 'not-applicable', message: 'Waits for SLOT-1: no contract, or no stylesheet to read.' }
    if (!r.bands.length)
      return {
        status: 'pass',
        message: 'The contract keeps no band: brand mode reaches every part of the page.'
      }
    const open = r.found.filter((f) => f.kind === 'paintable' && !f.covered)
    const named = r.found.filter((f) => f.kind === 'paintable' && f.covered).length
    if (!open.length)
      return {
        status: 'pass',
        message: `Every accent paint inside the ${r.bands.length} kept band${r.bands.length === 1 ? '' : 's'} reads the slot or is named in the contract (${named} named), so the brand accent reaches it.`
      }
    const slot = await slotOf(context)
    const bands = [...new Set(open.map((f) => f.band))]
    return {
      status: 'fail',
      message: `${open.length} accent paint${open.length === 1 ? '' : 's'} inside kept band${bands.length === 1 ? '' : 's'} ${bands.join(', ')} stay${open.length === 1 ? 's' : ''} the template's ${[...new Set(open.map((f) => f.colour))].join(', ')} under any brand: ${open
        .slice(0, SHOWN)
        .map(spot)
        .join('; ')}${open.length > SHOWN ? '; …' : ''}.`,
      fix: `In templates/${slot.name}.json, name each spot in "bands" of its band: "paint": { "<selector inside the band>": { "<property>": "accent" } } for words, "accent-fill" for a fill or a line, or "vars": { "<--variable>": "accent" } for a variable set on the band itself (a band with no "bands" entry needs one: its "ground" and "texts" read with scripts/bands.mjs). Then measure brand mode (BRAND-3).`,
      details: open.map(spot)
    }
  }
}

/** @type {import('../index.js').Rule} */
export const brand2KeptAccentReachable = {
  id: 'BRAND-2',
  title: 'No kept band paints the accent where no role paint reaches',
  platforms: PLATFORMS,
  owner: 'template',
  async run(context) {
    const r = await keptBandAccents(context)
    if (!r)
      return { status: 'not-applicable', message: 'Waits for SLOT-1: no contract, or no stylesheet to read.' }
    const locked = r.found.filter((f) => f.kind === 'locked')
    if (!locked.length)
      return {
        status: 'pass',
        message: r.bands.length
          ? 'No kept band paints the template accent inside a gradient, a shadow or an inline picture.'
          : 'The contract keeps no band.'
      }
    return {
      status: 'fail',
      message: `${locked.length} accent paint${locked.length === 1 ? '' : 's'} inside kept bands sit${locked.length === 1 ? 's' : ''} in a gradient, a shadow or an inline picture, which the slot cannot repaint: ${locked
        .slice(0, SHOWN)
        .map(spot)
        .join('; ')}${locked.length > SHOWN ? '; …' : ''}.`,
      fix: 'Release the template with each of these colours read through the slot, var(--ds-c-accent, <its value>) (for an inline SVG picture: a mask painted with background-color), the same work as CSS-2; then move maxVersion.',
      details: locked.map(spot)
    }
  }
}

/** One accent that reads on most grounds, one that reads on almost none, so the automatic shift is exercised. */
const TEST_ACCENTS = ['a78f45', '042515']

/** The brand-mode measurement of this version, judged, or null when none is here. */
async function brandMeasured(/** @type {import('../index.js').RuleContext} */ context) {
  const { tag, version } = context.release
  for (const file of treeMeasurementFiles({ tag, version }, BRAND_MEASUREMENT_FILE)) {
    let doc
    try {
      doc = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    if (doc?.version !== version) continue
    const { judgeBrandMeasurement } = await dsSlotModule('brand-check')
    return { doc, judged: judgeBrandMeasurement(doc) }
  }
  return null
}

/** @type {import('../index.js').Rule} */
export const brand3BrandReadsOnBands = {
  id: 'BRAND-3',
  title:
    'On a built site the brand accent reads in its own hue, its fills stand out, and no template accent is left',
  platforms: PLATFORMS,
  owner: 'contract',
  async run(context) {
    const slot = await slotOf(context)
    if (!slot.contract) return { status: 'not-applicable', message: 'Waits for SLOT-1: no contract.' }
    const { tag, version } = context.release
    const bg = String(slot.palettes[0]?.bg ?? '').replace(/^#/, '')
    const ids = /^[0-9a-f]{6}$/i.test(bg)
      ? [
          ...TEST_ACCENTS.map((a) => `brand:${bg.toLowerCase()}--${a}`),
          ...TEST_ACCENTS.map((a) => `brand:ffffff--${a}`)
        ]
      : []
    const ds = 'packages/design/tracy-ds-slot'
    const work = '/tmp/ds-brand'
    const folder = `the contract folder of ${version} (beside design-system-measurement.json)`
    const command = [
      '# run from the root of a tch checkout (pnpm install done); Docker for the stand, Chrome for the probes',
      `node ${ds}/scripts/stand.mjs up ${tag ?? '<release tag>'} --version ${version} --port 52990 --name ds-brand --dir ${work}`,
      `node ${ds}/scripts/brand-measure.mjs --template ${slot.name} --site http://127.0.0.1:52990 --joomla-db ds-brand-db --joomla-prefix "$(node -p 'require("${work}/ds-brand/dl/manifest.json").prefix || "tr_"')" --tag ${tag ?? '<release tag>'} --version ${version} --out ${work}/out ${ids.join(' ') || 'brand:<page hex>--<accent hex>'}`,
      `node ${ds}/scripts/stand.mjs down --name ds-brand --dir ${work}`,
      `# then commit ${work}/out/brand-measurement.json into ${folder}`
    ].join('\n')
    const measured = await brandMeasured(context)
    if (!measured)
      return {
        status: 'live-only',
        message:
          'Not measured on a built site yet: whether the brand accent reads in its own hue (4.5:1), its fills stand out (3:1) and no template accent is left is only known there.',
        fix: `Measure brand mode with the tdsr skill:\n${command}`
      }
    const { doc, judged } = measured
    const stamp = `Measured on ${version}, ${String(doc.measuredAt ?? '').slice(0, 10)}, ${doc.machine ?? 'a machine'}.`
    if (judged.problem)
      return {
        status: 'fail',
        message: `The brand measurement cannot be read: ${judged.problem}.`,
        fix: `Measure again:\n${command}`
      }
    if (judged.ok)
      return {
        status: 'pass',
        message: `${judged.runs} brand run${judged.runs === 1 ? '' : 's'}: accent words read in the brand hue, fills stand out, no template accent left. ${stamp}`
      }
    return {
      status: 'fail',
      message: `${judged.findings.length} finding${judged.findings.length === 1 ? '' : 's'} over ${judged.runs} brand runs: ${judged.findings.slice(0, SHOWN).join('; ')}${judged.findings.length > SHOWN ? '; …' : ''}. ${stamp}`,
      fix: `A template accent left: name it in the contract (BRAND-1) or release the template (BRAND-2). Words or fills that do not read: the door shifts the brand accent on the page's own ground, so a template that paints them on another ground names that ground in "bands" of the contract. Then measure again:\n${command}`,
      details: judged.findings
    }
  }
}
