/**
 * The Template Customization Question Readiness check: does one release give Tracy what the seven
 * Customize your site questions need? (ADR 0029, spec
 * `tasks/spec-template-customization-question-readiness.md`, #1013.)
 *
 *   const report = await checkRelease(directoryReleaseSource(dir))
 *   // { template, cms, version, tag, results: [{ id, status, message, fix, owner, details? }] }
 *
 * `status` is `pass`, `fail`, `live-only` (only a built site can tell), `not-applicable` (the rule
 * does not concern this CMS) or `not-checked` (the rule needs evidence from outside the release, such
 * as the bytes of the Claude Cowork plugin a new site gets, and it could not be read: never a pass). `owner` says who fixes a failure: `template` (whoever makes the
 * template, repo `joomlart-products`), `contract`, `plugin` or `tracy`.
 *
 * Static only: every rule reads the release's own files (setting, page list, demo database, source
 * zip) through a release source, which is passed in. No network client is created here, so a test
 * passes a fake source and the same rules run on a stand, on a download cache or on /ops later.
 * Rules are registered in `RULES`; a rule that throws is reported as a failure of that rule, never
 * as a crash of the whole report.
 */
import { validateSetting } from '../tracy-setting.mjs'
import { readText } from './release-source.js'
import { releaseContent } from './readers/release-content.js'
import { MissingPictureLibraryError } from './readers/picture-facts.js'
import { rel2PageList } from './rules/rel-2-page-list.js'
import { rel3LogoLayout } from './rules/rel-3-logo-layout.js'
import { name1HomeTitle } from './rules/name-1-home-title.js'
import { name2PageTitles } from './rules/name-2-page-titles.js'
import { fav1OneFavicon } from './rules/fav-1-one-favicon.js'
import { logo1CustomerLogo } from './rules/logo-1-customer-logo.js'
import { logo2DarkLogo } from './rules/logo-2-dark-logo.js'
import { logo3LogoSize } from './rules/logo-3-logo-size.js'
import { name3CopyrightLine } from './rules/name-3-copyright-line.js'
import { name4NameCharacters } from './rules/name-4-name-characters.js'
import { about1HomeHeading } from './rules/about-1-home-heading.js'
import { about2DemoParagraphs } from './rules/about-2-demo-paragraphs.js'
import { about3DemoCompanyName } from './rules/about-3-demo-company-name.js'
import { hidden1SystemPages } from './rules/hidden-1-system-pages.js'
import { share1LinkPreview } from './rules/share-1-link-preview.js'
import { stab1OneBuild } from './rules/stab-1-one-build.js'
import { stab2TechnicalErrors } from './rules/stab-2-technical-errors.js'
import { stab6LockMatchesRelease } from './rules/stab-6-lock-matches-release.js'
import { stab7MachineText } from './rules/stab-7-machine-text.js'
import { page1UntickedPageGone } from './rules/page-1-unticked-page-gone.js'
import { page2TickedPageOpens } from './rules/page-2-ticked-page-opens.js'
import { page4NoDeadLinks } from './rules/page-4-no-dead-links.js'
import { page5ButtonsLeadSomewhere } from './rules/page-5-buttons-lead-somewhere.js'
import { page7ChildrenOfUntickedPage } from './rules/page-7-children-of-unticked-page.js'
import { page8SearchEnginesSeePublicPages } from './rules/page-8-search-engines-see-public-pages.js'
import { lang1PageLanguage } from './rules/lang-1-page-language.js'
import { lang2OneLanguageEverywhere } from './rules/lang-2-one-language-everywhere.js'
import { lang3NoForeignScript } from './rules/lang-3-no-foreign-script.js'
import { lang5OneLanguage } from './rules/lang-5-one-language.js'
import { lang6DatesInLanguage } from './rules/lang-6-dates-in-language.js'

/**
 * @typedef {'pass' | 'fail' | 'live-only' | 'not-applicable' | 'not-checked'} Status
 * @typedef {'template' | 'contract' | 'plugin' | 'tracy'} Owner
 * @typedef {{ id: string, status: Status, message: string, fix: string | null, owner: Owner, details?: string[] }} RuleResult
 * @typedef {{
 *   release: { template: string | null, platform: string, version: string, tag: string | null, name: string },
 *   setting: Record<string, any>,
 *   source: import('./release-source.js').ReleaseSource,
 *   contracts?: unknown,
 *   content: ReturnType<typeof releaseContent>,
 *   fetchText?: (url: string, headers?: Record<string, string>) => Promise<string>,
 *   coworkEvidence?: import('../cowork-contract-evidence.js').CoworkEvidence | null
 * }} RuleContext
 * @typedef {{
 *   id: string, title: string, platforms: string[], owner: Owner,
 *   run: (context: RuleContext) => Promise<{ status: Status, message: string, fix?: string, details?: string[] }>
 * }} Rule
 */

/** Every rule of the check, in the order the spec lists them. */
export const RULES = /** @type {Rule[]} */ ([
  rel2PageList,
  rel3LogoLayout,
  name1HomeTitle,
  name2PageTitles,
  fav1OneFavicon,
  logo1CustomerLogo,
  logo2DarkLogo,
  logo3LogoSize,
  name3CopyrightLine,
  name4NameCharacters,
  about1HomeHeading,
  about2DemoParagraphs,
  about3DemoCompanyName,
  hidden1SystemPages,
  share1LinkPreview,
  stab1OneBuild,
  stab2TechnicalErrors,
  stab6LockMatchesRelease,
  stab7MachineText,
  page1UntickedPageGone,
  page2TickedPageOpens,
  page4NoDeadLinks,
  page5ButtonsLeadSomewhere,
  page7ChildrenOfUntickedPage,
  page8SearchEnginesSeePublicPages,
  lang1PageLanguage,
  lang2OneLanguageEverywhere,
  lang3NoForeignScript,
  lang5OneLanguage,
  lang6DatesInLanguage
])

const CMS_NAMES = /** @type {Record<string, string>} */ ({
  joomla: 'Joomla',
  wordpress: 'WordPress',
  emdash: 'EmDash'
})

/**
 * Check one release.
 * @param {import('./release-source.js').ReleaseSource} release where its files are read from
 * @param {{ only?: string[], rules?: Rule[], fetchText?: (url: string, headers?: Record<string, string>) => Promise<string>, coworkEvidence?: import('../cowork-contract-evidence.js').CoworkEvidence | null }} [options]
 *   `only`: rule ids to run; `rules`: replaces the registered rules (tests); `fetchText`: reads a public address
 *   (Google Fonts), for the rules that may ask one; without it they say what they could not check;
 *   `coworkEvidence`: what the Claude Cowork plugin a new site gets carries (`collectCoworkEvidence`),
 *   read by the caller; without it STAB-1 says `not-checked`
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
  // No asset list: a download cache may hold only the assets the rules read.
  const problems = validateSetting(setting)
  if (problems.length) throw new Error(`${release.where}: tracy_setting.json: ${problems.join('; ')}`)

  const platform = setting.platform
  const context = {
    release: {
      template: setting.template ?? null,
      platform,
      version: setting.version,
      tag: release.tag,
      name: `${setting.label} ${CMS_NAMES[platform] ?? platform} ${setting.version}`
    },
    setting,
    source: release,
    content: releaseContent(release, setting),
    // The one door to the network a rule may use, passed in by the caller (the LANG-2 fonts part asks Google Fonts).
    ...(options.fetchText ? { fetchText: options.fetchText } : {}),
    ...(options.coworkEvidence ? { coworkEvidence: options.coworkEvidence } : {})
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
      // eslint-disable-next-line no-await-in-loop -- rules share the memoized content reads.
      const outcome = await rule.run(context)
      results.push({ id: rule.id, owner: rule.owner, fix: null, ...outcome })
    } catch (e) {
      // A missing library is the machine's fault, not the release's: stop the whole check loudly.
      if (e instanceof MissingPictureLibraryError) throw e
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
