/**
 * The design-system slot contract of a release (`packages/design/tracy-ds-slot/templates/*.json`), read
 * through the same functions the Design system door uses (`../../ds-slot.js`), so the check and the
 * door cannot disagree on which contract a template has or which releases it is offered for.
 *
 *   templateKey  what the contracts' `template` field calls the release's template (`templateKeyOf`)
 *   versionKey   what `minVersion` / `maxVersion` are keyed by: the quickstart tag (Joomla, EmDash),
 *                the theme's stylesheet (WordPress), with the version the door would compare
 *   name         the contract's file name, or null when the template has none
 *   contract     the contract with its `extends` chain merged (`library.loadContract`), or null
 *   door         what the door answers for a site built from this release (`contractFor`)
 *   palettes     the template's own colour sets the tokenizer reads (light, dark, extra), as
 *                `scripts/tokenize.mjs` builds them
 */
import { contractFor, DS_ROOT, dsSlotModule, slotContracts, templateKeyOf } from '../../ds-slot.js'
import { publishedTagOf } from '../../local-releases.js'
import { releaseFiles } from './release-files.js'

/**
 * @typedef {{
 *   templateKey: string | null,
 *   versionKey: { key: string | null, version: string | null },
 *   name: string | null,
 *   contract: Record<string, any> | null,
 *   door: ReturnType<typeof contractFor>,
 *   palettes: Record<string, string>[]
 * }} Slot
 */

/** @type {WeakMap<object, Promise<Slot>>} */
const memo = new WeakMap()

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<Slot>}
 */
export function slotOf(context) {
  if (!memo.has(context)) memo.set(context, read(context))
  return /** @type {Promise<Slot>} */ (memo.get(context))
}

/** @param {import('../index.js').RuleContext} context @returns {Promise<Slot>} */
async function read(context) {
  const { platform, version } = context.release
  const tag = context.release.tag ? publishedTagOf(context.release.tag) : null
  // WordPress names its template by the theme's stylesheet, which only the theme files tell.
  const files = platform === 'wordpress' ? await releaseFiles(context) : null
  const templateKey = templateKeyOf({
    platform,
    stylesheet: files?.stylesheet ?? null,
    template: context.setting.template ?? null,
    quickstartTag: tag
  })
  const versionKey =
    platform === 'wordpress'
      ? { key: files?.stylesheet ?? null, version: files?.themeVersion ?? null }
      : { key: tag, version: version ?? null }
  const door = contractFor(templateKey, versionKey)
  // the contract the door would make the bytes with for this release (a line may hold one per range of
  // releases), else the line's first
  const found = templateKey
    ? ('contract' in door && slotContracts().find((c) => c.name === door.contract)) ||
      slotContracts().find((c) => c.template === templateKey)
    : undefined
  if (!found) return { templateKey, versionKey, name: null, contract: null, door, palettes: [] }

  const { loadContract, contractBase } = await dsSlotModule('library')
  const { COLOUR_TOKENS } = await dsSlotModule('tokens56')
  const contract = loadContract(found.name)
  const base = contractBase(DS_ROOT, contract)
  const light = Object.fromEntries(COLOUR_TOKENS.map((n) => [n, base[`--${n}`]]))
  const dark = Object.fromEntries(
    Object.entries(contract.darkTokens ?? {})
      .filter(([k]) => COLOUR_TOKENS.includes(k.replace(/^--/, '')))
      .map(([k, v]) => [k.replace(/^--/, ''), String(v)])
  )
  const palettes = [light, ...(Object.keys(dark).length ? [dark] : []), ...(contract.extraPalettes ?? [])]
  return { templateKey, versionKey, name: found.name, contract, door, palettes }
}

/**
 * Whether the template paints with a palette the tokenizer rewrites (its stylesheets must read the
 * slot), or reads the slot's variables natively (Tracy Base on WordPress through a style variation,
 * on Joomla through T4's runtime variables, every EmDash theme through `ds-slot.ts`): the JA and
 * GavickPro ports and the Tracy Business WordPress / Joomla themes are tokenized releases, which the
 * contract says by naming the template's own colours (`extraPalettes`, `baseTokensFile`, `t4Placeholders`).
 * @param {Record<string, any> | null} contract
 */
export const paintsOwnPalette = (contract) =>
  !!contract &&
  (Array.isArray(contract.extraPalettes) ||
    typeof contract.baseTokensFile === 'string' ||
    !!contract.t4Placeholders)
