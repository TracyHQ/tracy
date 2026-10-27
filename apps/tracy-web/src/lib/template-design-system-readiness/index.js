/**
 * The Template Design System Readiness check: does one release give Tracy what the Design system
 * button needs, so a customer who picks a system sees the site wear it, and one who picks none sees
 * the template exactly as released? (ADR 0031, spec `tasks/spec-template-design-system-readiness.md`.)
 * The design-system twin of the Template Customization Question Readiness check
 * (`../template-customization-question-readiness/`): the same report, the same statuses, the same
 * release sources, so /ops, the local command and the tests read both alike.
 *
 *   const report = await checkRelease(directoryReleaseSource(dir))
 *   // { template, cms, version, tag, results: [{ id, status, message, fix, owner, details? }] }
 *
 * `status` is `pass`, `fail`, `unmeasured` (a built-site rule with no measurement file for this
 * version: "Not measured yet", never a pass) or `not-applicable`. `owner`
 * says who fixes a failure: `template` (a new release of the template, repo `ja-products` or the
 * theme's home) or `contract` (the slot contract in `packages/design/tracy-ds-slot/templates/`, a
 * tch PR).
 *
 * No site is built here: the static rules read the release's own files and the slot contracts this
 * server carries; the built-site rules read the measurement file a run on a built site left
 * (`readers/measurement.js`).
 * A rule that throws is reported as a failure of that rule, never as a crash of the whole report.
 */

import { UnreadableContent } from '../template-customization-question-readiness/readers/release-content.js'
import { readText } from '../template-customization-question-readiness/release-source.js'
import { validateSetting } from '../tracy-setting.mjs'
import { band1BandsFollow } from './rules/band-1-bands-follow.js'
import {
  btn1ButtonsKeepShape,
  con1TextReads,
  con2PreviewTextReads,
  font1FontsLoad,
  ident1LogoShows,
  mode1PageMatchesSystem,
  mode2BothModesFollow,
  prev1PreviewIsThePage,
  ident2PreviewLogoShows,
  font2NoTemplateFontLeft,
  prev2NothingHiddenForReveal,
  role1RolesWearSystem,
  screen1FirstScreenChanges,
  tpl1NoTemplateColourLeft,
  undo1DefaultAndUndo,
  grad1GradientStopsFollow,
  shape1ShapesFollow,
  mock1NoHandWrittenColour,
  acc1AccentStaysSmall,
  clip1ButtonsKeepLabel,
  ground1BlocksOnSystemGround,
  empty1BlocksShowContent,
  form1FieldsWearSystem,
  ident3OneLogoShows,
  hier1HighlightsStandOut,
  hier2HeadingsReadStrongest,
  layout1BlocksKeepTheirPlace,
  layout2BlocksKeepTheirSize,
  layout3LayoutKept,
  ground2BandsStayQuiet,
  header1HeaderHasGround,
  icon1IconControlsShow,
  hover1StatesRead,
  hover2StatesChange,
  border1LinesStayFaint,
  foreign1NoStrayColour,
  probeNextRules
} from './rules/built-site.js'
import { css1SheetsReadSlot } from './rules/css-1-sheets-read-slot.js'
import { css2NoPaletteLiterals } from './rules/css-2-no-palette-literals.js'
import { def1DefaultLookKept } from './rules/def-1-default-look-kept.js'
import { mode3PopupOffersBoth } from './rules/mode-3-popup-offers-both.js'
import { pic1IconsFollow } from './rules/pic-1-icons-follow.js'
import { plat1SlotReader } from './rules/plat-1-slot-reader.js'
import { slot1HasContract } from './rules/slot-1-has-contract.js'
import { slot2VersionChecked } from './rules/slot-2-version-checked.js'
import { text1TextReadsTextRole } from './rules/text-1-text-reads-text-role.js'
import { vars1RoleVariables } from './rules/vars-1-role-variables.js'

/**
 * @typedef {'pass' | 'fail' | 'unmeasured' | 'not-applicable'} Status
 * @typedef {'template' | 'contract'} Owner
 * @typedef {{ id: string, status: Status, message: string, fix: string | null, owner: Owner, details?: string[], kinds?: any[] }} RuleResult
 * @typedef {{
 *   release: { template: string | null, platform: string, version: string, tag: string | null, name: string },
 *   setting: Record<string, any>,
 *   source: import('../template-customization-question-readiness/release-source.js').ReleaseSource
 * }} RuleContext
 * @typedef {{
 *   id: string, title: string, platforms: string[], owner: Owner,
 *   run: (context: RuleContext) => Promise<{ status: Status, message: string, fix?: string, details?: string[], kinds?: any[] }>
 * }} Rule
 */

/** Every rule of the check, in the order the spec lists them. */
export const RULES = /** @type {Rule[]} */ ([
  slot1HasContract,
  slot2VersionChecked,
  css1SheetsReadSlot,
  css2NoPaletteLiterals,
  def1DefaultLookKept,
  band1BandsFollow,
  plat1SlotReader,
  vars1RoleVariables,
  pic1IconsFollow,
  role1RolesWearSystem,
  screen1FirstScreenChanges,
  con1TextReads,
  undo1DefaultAndUndo,
  font1FontsLoad,
  ident1LogoShows,
  mode1PageMatchesSystem,
  mode2BothModesFollow,
  mode3PopupOffersBoth,
  tpl1NoTemplateColourLeft,
  con2PreviewTextReads,
  btn1ButtonsKeepShape,
  prev1PreviewIsThePage,
  ident2PreviewLogoShows,
  font2NoTemplateFontLeft,
  prev2NothingHiddenForReveal,
  grad1GradientStopsFollow,
  shape1ShapesFollow,
  mock1NoHandWrittenColour,
  acc1AccentStaysSmall,
  clip1ButtonsKeepLabel,
  ground1BlocksOnSystemGround,
  empty1BlocksShowContent,
  form1FieldsWearSystem,
  ident3OneLogoShows,
  hier1HighlightsStandOut,
  hier2HeadingsReadStrongest,
  layout1BlocksKeepTheirPlace,
  layout2BlocksKeepTheirSize,
  layout3LayoutKept,
  ground2BandsStayQuiet,
  header1HeaderHasGround,
  icon1IconControlsShow,
  hover1StatesRead,
  hover2StatesChange,
  border1LinesStayFaint,
  foreign1NoStrayColour,
  text1TextReadsTextRole,
  ...probeNextRules
])

const CMS_NAMES = /** @type {Record<string, string>} */ ({
  joomla: 'Joomla',
  wordpress: 'WordPress',
  emdash: 'EmDash'
})

/**
 * Check one release.
 * @param {import('../template-customization-question-readiness/release-source.js').ReleaseSource} release
 * @param {{ only?: string[], rules?: Rule[] }} [options] `only`: rule ids to run; `rules`: replaces the registered rules (tests)
 * @returns {Promise<{ template: string | null, cms: string, version: string, tag: string | null, results: RuleResult[] }>}
 */
export async function checkRelease(release, options = {}) {
  const raw = await readText(release, 'tracy_setting.json')
  if (raw === null)
    throw new Error(`${release.where}: no tracy_setting.json, so the release cannot be identified`)
  let setting
  try {
    setting = JSON.parse(raw)
  } catch (e) {
    throw new Error(`${release.where}: tracy_setting.json is not JSON: ${e instanceof Error ? e.message : e}`)
  }
  const problems = validateSetting(setting)
  if (problems.length) throw new Error(`${release.where}: tracy_setting.json: ${problems.join('; ')}`)

  const platform = setting.platform
  /** @type {RuleContext} */
  const context = {
    release: {
      template: setting.template ?? null,
      platform,
      version: setting.version,
      tag: release.tag,
      name: `${setting.label} ${CMS_NAMES[platform] ?? platform} ${setting.version}`
    },
    setting,
    source: release
  }
  const rules = (options.rules ?? RULES).filter((r) => !options.only || options.only.includes(r.id))
  /** @type {RuleResult[]} */
  const results = []
  for (const rule of rules) {
    if (!rule.platforms.includes(platform)) {
      results.push({
        id: rule.id,
        status: 'not-applicable',
        message: `${rule.title}: not a ${platform} rule.`,
        fix: null,
        owner: rule.owner
      })
      continue
    }
    try {
      // eslint-disable-next-line no-await-in-loop -- rules share the memoized reads of the release.
      const outcome = await rule.run(context)
      results.push({ id: rule.id, owner: rule.owner, fix: null, ...outcome })
    } catch (e) {
      // What the release does not carry in a readable form says so in its own status.
      if (e instanceof UnreadableContent) {
        results.push({
          id: rule.id,
          status: e.status,
          message: `${rule.title}: ${e.message}.`,
          fix: null,
          owner: rule.owner
        })
        continue
      }
      results.push({
        id: rule.id,
        status: 'fail',
        message: `${rule.id} could not run: ${e instanceof Error ? e.message : String(e)}`,
        fix: null,
        owner: rule.owner
      })
    }
  }
  return {
    template: context.release.template,
    cms: platform,
    version: setting.version,
    tag: release.tag,
    results
  }
}
