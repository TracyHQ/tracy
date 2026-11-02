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
 *   BRAND-3 (live)      on a built site the brand accent reads on every kept band and no template accent is
 *                       left: only a run of `flow.mjs` with brand ids can tell, so it is `live-only`.
 *
 * Joomla only: brand mode exists on the Joomla slot (`joomlaSlot(…, { brand: true })`) for now.
 */
import { keptBandAccents } from '../readers/kept-band-accents.js'
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

/** @type {import('../index.js').Rule} */
export const brand3BrandReadsOnBands = {
  id: 'BRAND-3',
  title: 'On a built site the brand accent reads on every kept band and no template accent is left',
  platforms: PLATFORMS,
  owner: 'contract',
  async run(context) {
    const slot = await slotOf(context)
    if (!slot.contract) return { status: 'not-applicable', message: 'Waits for SLOT-1: no contract.' }
    const { tag, version } = context.release
    const bg = String(slot.palettes[0]?.bg ?? '').replace(/^#/, '')
    const ids = /^[0-9a-f]{6}$/i.test(bg) ? TEST_ACCENTS.map((a) => `brand:${bg.toLowerCase()}--${a}`) : []
    const ds = 'packages/design/tracy-ds-slot'
    const work = '/tmp/ds-brand'
    const command = [
      '# run from the root of a tch checkout (pnpm install done); Docker for the stand, Chrome for the probes',
      `node ${ds}/scripts/stand.mjs up ${tag ?? '<release tag>'} --version ${version} --port 52990 --name ds-brand --dir ${work}`,
      `node ${ds}/scripts/flow.mjs --cms joomla --template ${slot.name} --joomla-db ds-brand-db --joomla-prefix "$(node -p 'require("${work}/ds-brand/dl/manifest.json").prefix || "tr_"')" --joomla-login site --site http://127.0.0.1:52990 --out ${work}/flow ${ids.join(' ') || 'brand:<page hex>--<accent hex>'}`,
      `node ${ds}/scripts/stand.mjs down --name ds-brand --dir ${work}`,
      `# then read ${work}/flow/report.md: contrast of the accent words and fills in each kept band, and "Template colours left"`
    ].join('\n')
    return {
      status: 'live-only',
      message:
        'Whether the brand accent reads on each kept band, and how much of the template accent is left, is only known on a built site.',
      fix: `Measure brand mode with the tdsr skill:\n${command}`
    }
  }
}
