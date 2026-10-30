/**
 * The guide table of the Road to live panel: for every step code the server's `road` sends
 * (`apps/tracy-web/src/lib/road-to-live.js`), a title, why it matters, at most one short fact line,
 * and how to fix it: either here on /ops (a place on the page, the control to press, at most three
 * short steps) or outside /ops (ONE text to paste, and one doc).
 *
 * 🔒 ONE TABLE, KEYED BY CODE. No sentence is matched: the server sends `code` + `params`, and this
 * file words them. A code it does not know keeps the step's own name as its title and gets no steps,
 * never invented ones. What to do about a failed demo comes from `demo-failure-guides.ts` (the one
 * table of failure reasons); this table only frames it.
 *
 * 🔒 SHORT COPY (Akemi, 11/10/2026: "why is everything so complicated, keep the words short"). A why
 * line is one sentence of about twelve words; a fact line is one line, only what the admin needs to
 * act; /ops steps are at most three of about eight words. Everything else an outside fix needs
 * (where, the commands, the stops, what you see after) lives INSIDE the prompt, so the block shows
 * only the prompt, its copy button and a doc. The one extra line is the production hand off, or,
 * for the pages file, why it matters.
 * `test/problem-guides.test.mjs` measures all of it.
 *
 * 🔒 OUTSIDE /OPS IS SAID FROM THE DOCS AND THE TOOLS, NEVER GUESSED (review of 11/10/2026). Every
 * command here was checked against the script it names: `scripts/tracy-setting.mjs` (write needs
 * `--label` and `--cms`, prints the upload line, never uploads), `batch-contracts.mjs capture`
 * (needs `--project-prefix`, `--cowork-source` and `--artifacts`, absolute paths), and the
 * tracy-template-dev generator `plugins/tracy-dev/lib/site-pages.mjs --release <tag>` (one command
 * for Joomla, WordPress and EmDash; on 11/10/2026 it lives only on that repo's branch
 * `feat/site-pages-file`, draft PR #1, not merged, no release, so the prompt says plainly that the
 * tool is on a draft branch instead of naming a `tracy-dev site-pages` subcommand the installed
 * 0.7.1 does not have). The contract chain follows
 * `.agents/skills/quickstart-contract/SKILL.md` §2 and `references/ship-and-release.md` §8 to §9.
 * A block names no owner (Akemi, 11/10/2026): the admin does the work with Claude Code. The one
 * hand off is production: admins cannot merge main, so that line says to ask Vincent.
 *
 * Copy rules: plain words, no dashes, no internal words ("profile", "bind", "hidden mark", "full
 * path"); "listing" for one CMS release's entry and "card" only for the tile customers see
 * (`docs/references/vocabulary.md`).
 *
 * Pure: no React, no fetch.
 */

import { tr } from '../i18n'
import { failedInstallGuide } from './demo-failure-guides'
import { ruleRows } from './rule-rows'

export type StepName =
  | 'release'
  | 'install-file'
  | 'contract'
  | 'content-coverage'
  | 'customize'
  | 'design-system'
  | 'demo'
  | 'listing'
  | 'published'
  | 'polish'
/** `checking`: the Customize your site or Design system check of the release is still running (those steps only). */
export type StepState = 'done' | 'blocked' | 'todo' | 'warn' | 'checking'

/** One step of a release's road, exactly as the server sends it. */
export interface RoadStep {
  step: StepName
  state: StepState
  code: string
  params: Record<string, unknown>
  blockedBy?: StepName
}

/**
 * The fixed order of the road, the order steps FINISH in (several start side by side); a step's
 * number on the page is its place here, from 1.
 */
export const ROAD_ORDER: readonly StepName[] = [
  'release',
  'install-file',
  'contract',
  'content-coverage',
  'customize',
  'design-system',
  'demo',
  'listing',
  'published',
  'polish'
]

export const stepNumber = (step: StepName) => ROAD_ORDER.indexOf(step) + 1

/** Each step's own name, the row title when the code adds nothing. */
export const STEP_TITLE: Readonly<Record<StepName, string>> = {
  get release() {
    return tr('cms-readiness.step.release.title')
  },
  get 'install-file'() {
    return tr('cms-readiness.step.installFile.title')
  },
  get demo() {
    return tr('cms-readiness.step.demo.title')
  },
  get listing() {
    return tr('cms-readiness.step.listing.title')
  },
  get contract() {
    return tr('cms-readiness.step.contract.title')
  },
  get 'content-coverage'() {
    return tr('cms-readiness.step.contentCoverage.title')
  },
  get customize() {
    return tr('cms-readiness.step.customize.title')
  },
  get 'design-system'() {
    return tr('cms-readiness.step.designSystem.title')
  },
  get published() {
    return tr('cms-readiness.step.published.title')
  },
  get polish() {
    return tr('cms-readiness.step.polish.title')
  }
}

/** One short sentence per step: why it matters. */
export const STEP_WHY: Readonly<Record<StepName, string>> = {
  get release() {
    return tr('cms-readiness.step.release.why')
  },
  get 'install-file'() {
    return tr('cms-readiness.step.installFile.why')
  },
  get demo() {
    return tr('cms-readiness.step.demo.why')
  },
  get listing() {
    return tr('cms-readiness.step.listing.why')
  },
  get contract() {
    return tr('cms-readiness.step.contract.why')
  },
  get 'content-coverage'() {
    return tr('cms-readiness.step.contentCoverage.why')
  },
  get customize() {
    return tr('cms-readiness.step.customize.why')
  },
  get 'design-system'() {
    return tr('cms-readiness.step.designSystem.why')
  },
  get published() {
    return tr('cms-readiness.step.published.why')
  },
  get polish() {
    return tr('cms-readiness.step.polish.why')
  }
}

/** The detail page tab a step is fixed on: its dot and count go there. */
export const STEP_TAB: Record<StepName, 'card' | 'settings'> = {
  release: 'settings',
  'install-file': 'settings',
  demo: 'card',
  listing: 'card',
  contract: 'settings',
  'content-coverage': 'settings',
  customize: 'settings',
  'design-system': 'settings',
  published: 'card',
  polish: 'card'
}

/** A place on the detail page: the tab, the section the page scrolls to, and the control to focus. */
export interface ProblemTarget {
  view: 'card' | 'settings'
  section: 'demo-site' | 'demo-card' | 'contract' | 'install-file' | 'install-files' | 'github'
  /** How the place reads to a person, e.g. "Design Inspiration › Listing". */
  label: string
  /** `data-road-control` of the control Go there focuses; the first enabled one inside it. */
  control?: string
}

/**
 * Fixing a step outside /ops: ONE text to paste, as is (Akemi, 11/10/2026). A prompt for Claude
 * Code carries where, the commands, the stops and what the admin sees after, so the block shows
 * nothing else but a doc and, when it applies, the production line.
 */
export interface OutsideFix {
  /** What the text is for: "Paste into Claude Code", or who to send it to. */
  label: string
  text: string
  /** The one extra line allowed: the production hand off, or why the pages file matters. */
  note?: string
  doc: { label: string; href: string }
}

export interface StepGuide {
  title: string
  why: string
  /** One short line of fact (a reason, two versions), when the code carries one. */
  detail?: string
  ops?: { target: ProblemTarget; steps: string[] }
  outside?: OutsideFix
  /**
   * Customize your site and Design system only: the failing rules in their two groups, one plain line
   * each; Design system also lists the built-site rules with no measurement file ("Not measured yet").
   */
  rules?: {
    mustFix: CustomizeRule[]
    worthFixing: CustomizeRule[]
    unmeasured?: CustomizeRule[]
    /** Design system only: the built-site rules that passed on the measured run. */
    passed?: CustomizeRule[]
  }
  /** Design system only: the screenshots of the measured run, when the measurement file names them. */
  evidence?: { label: string; href: string }
  /** Customize your site and Design system only: the row offers Check again (owners and admins). */
  checkAgain?: boolean
  /**
   * Content coverage only: what holds Publish, in groups of one plain line each (holes by cause,
   * then page problems a customer must never see: raw language constants, PHP errors, placeholders).
   */
  lists?: { heading: string; count: number; lines: string[] }[]
}

/** One failing rule of the Customize your site check, as the road sends it. */
export interface CustomizeRule {
  rule: string
  /** The plain line: which question breaks and how (`rule-severity.json`). */
  text: string
  question: string
  /** Who fixes it: template, contract, plugin or tracy. */
  owner: string
  /** The check's own words, for the prompt. */
  message: string
  fix: string | null
  /** Design system only: "<version>, <date>, <machine>" of the run a built-site rule was scored on. */
  measuredOn?: string | null
  /** Design system only: a preview rule held as must-fix because the preview is not measured yet. */
  unmeasured?: boolean
  /** Design system only: what each preview detector saw, on which system/scheme, where, and the fix. */
  findings?: RuleFinding[]
}

/** One preview detector's finding under a failing rule (`judgePreview` kinds, PR 2 of 14/10/2026). */
export interface RuleFinding {
  kind: string
  /** What /ops says it saw. */
  what: string
  /** "<system>/<scheme> <count>" per row of the run that saw it. */
  on: string[]
  /** "<page> <count>" per page of the template it fired on, most first (every declared page is measured). */
  pages: string[]
  /** Elements shared by several pages (a header, a footer), told once: "<element> on every page" / "on N of M pages". */
  sitewide?: string[]
  /** Element hints (selector-like labels) of what it saw. */
  where: string[]
  fix: string | null
}

/** What the guide needs to know about the release beside the step itself. */
export interface GuideContext {
  tag: string
  /** The release's chip name ("Joomla", "Joomla · tracy-base/j6"). */
  cms: string
  platform: 'joomla' | 'wordpress' | 'emdash' | null
  version: string | null
  label?: string | null
  /** The CMS version tracy_setting.json names ("6.0.0"), when the release has one. */
  cmsVersion?: string | null
  /** The template tracy_setting.json names, when the release has one. */
  template?: string | null
}

const DOCS = 'https://github.com/TracyHQ/tch/blob/develop/'
/** The label above a prompt to paste; read during a render, so it follows the language. */
const claudeCode = () => tr('cms-readiness.outside.claudeCode')
const production = () => tr('cms-readiness.outside.production')

/** The places Go there leads to, built when a guide is made so their labels follow the language. */
const demoSite = (): ProblemTarget => ({
  view: 'card',
  section: 'demo-site',
  label: tr('cms-readiness.target.demoSite'),
  control: 'demo-install'
})
const createListing = (): ProblemTarget => ({
  view: 'card',
  section: 'demo-card',
  label: tr('cms-readiness.target.listing'),
  control: 'create-listing'
})
const editListing = (): ProblemTarget => ({
  view: 'card',
  section: 'demo-card',
  label: tr('cms-readiness.target.editListing'),
  control: 'listing-edit'
})
const publishListing = (): ProblemTarget => ({
  view: 'card',
  section: 'demo-card',
  label: tr('cms-readiness.target.listing'),
  control: 'listing-publish'
})
const createFile = (): ProblemTarget => ({
  view: 'settings',
  section: 'github',
  label: tr('cms-readiness.target.createFile'),
  control: 'create-setting'
})

const RELEASE_DOC = {
  label: 'docs/references/quickstart-release.md',
  href: `${DOCS}docs/references/quickstart-release.md`
}
const REPO = 'JoomlArt-Products/joomlart-products'
/** How a prompt ends when /ops must read the releases again before the admin sees the result. */
const SYNC = (after: string) =>
  `Then tell me to press Sync GitHub (the round arrow) on the /ops Templates Management list, or to wait 10 minutes: ${after}`

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
/** `quickstart/ja-nova/j6` → `ja-nova`: the folder a contract lives under. */
const slugOfTag = (tag: string) => tag.split('/').at(-2) ?? tag
/** `quickstart/ja-nova/j6` → `j6`: the CMS major folder under it. */
const majorOfTag = (tag: string) => tag.split('/').at(-1) ?? ''
const platformOfTag = (tag: string): GuideContext['platform'] =>
  /\/j\d+$/.test(tag) ? 'joomla' : /\/wp\d+$/.test(tag) ? 'wordpress' : /emdash/.test(tag) ? 'emdash' : null

/** The write command for tracy_setting.json, with every word the release already says filled in. */
const writeCommand = (ctx: GuideContext) =>
  `node scripts/tracy-setting.mjs write '${ctx.tag}' --label '${ctx.label ?? '<label>'}' --cms '${ctx.cmsVersion ?? '<CMS version, like 6.0.0>'}' --template '${ctx.template ?? '<template folder, like ja_restaurant>'}'`

/** Writing tracy_setting.json from the release itself, the way the docs give it, as one prompt. */
function installFileOutside(ctx: GuideContext, problem?: string | null): OutsideFix {
  return {
    label: claudeCode(),
    text: [
      `In a tch checkout with gh signed in to GitHub, write tracy_setting.json for the release ${ctx.tag} on ${REPO}.`,
      ...(problem ? [`The file it has now is refused: ${problem}`] : []),
      `Run: ${writeCommand(ctx)}`,
      'It prints the file and a gh release upload command, and uploads nothing itself: show me both, and wait for my go before you run the upload.',
      `After the upload, run node scripts/tracy-setting.mjs check '${ctx.tag}' and confirm it prints "tracy_setting.json: valid".`,
      SYNC('Install file on Quickstart settings then reads Ready.')
    ].join(' '),
    doc: RELEASE_DOC
  }
}

/** The release a contract is made for: this one, or a sibling the server named. */
interface ContractFor {
  tag: string
  platform: GuideContext['platform']
  version: string
}

/** The contract work, by CMS, from the skill and its references (see the 🔒 at the top). */
function contractOutside(p: Record<string, unknown>, c: ContractFor): OutsideFix {
  const slug = str(p.slug) ?? slugOfTag(c.tag)
  const major = majorOfTag(c.tag)
  // The skill decides the version (it may cut a new one), so the prompt never pins it.
  const id = `${slug}/${major}/<version>`
  const newVersion = 'If the skill makes a new version, tell me its number.'
  const older = str(p.profile)
    ? [`It now borrows the contract made for ${String(p.profile)}, which is not tested on ${c.version}.`]
    : []
  // A release with no card yet is captured only when named with --without-card (a contract comes before the card).
  const withoutCard = p.batchWithoutCard === true ? ` --without-card ${c.tag}` : ''
  const batch =
    p.batchInScope === true
      ? [
          `This release is in the batch tool's scope, so you may make the contract files with: node packages/cms/tracy-quickstart-tools/batch-contracts.mjs capture --only ${slug} --platform ${c.platform ?? 'joomla'}${withoutCard} --project-prefix qc-batch --cowork-source <absolute path of a claude-cowork checkout> --artifacts <absolute path of an empty folder outside the repo>`
        ]
      : []
  // What the admin waits for once the work is merged: each server reads contracts from its own image.
  const shows = `When it is merged, tell me the contract shows on /ops once CI has deployed this server (each server reads contracts from its own image): Content contract on Quickstart settings then shows ${id} instead of None.`
  if (c.platform === 'wordpress')
    return {
      label: claudeCode(),
      text: [
        `Make the WordPress content contract for the release ${c.tag} (currently ${c.version}), in packages/cms/tracy-wordpress-quickstart/contracts/${id}/.`,
        newVersion,
        ...older,
        "Follow that package's README and use its capture scripts in scripts/.",
        'First check this machine has what the README needs and tell me what is missing before you start.',
        'No skill covers WordPress yet, so write manifest.json, content-map.json and presentation-lock.json there and show me each one.',
        ...batch,
        'When they are done, open a tch PR with them and merge it to develop.',
        shows,
        'Stop before every commit, push, PR and merge, and wait for my go.'
      ].join(' '),
      note: production(),
      doc: {
        label: 'packages/cms/tracy-wordpress-quickstart/README.md',
        href: `${DOCS}packages/cms/tracy-wordpress-quickstart/README.md`
      }
    }
  const full = p.path === 'full'
  return {
    label: claudeCode(),
    text: [
      `Use the quickstart-contract skill to make the content contract for the Joomla release ${c.tag} (currently ${c.version}).`,
      'First check this machine has what the skill needs (DDEV, Docker, gh signed in on the machine that runs DDEV, tracy-dev 0.7.1, checkouts of claude-cowork and joomlart-products, and a local Tracy) and tell me what is missing before you start.',
      ...older,
      'If the skill does not cover this template (WordPress, Gavick, content in several languages), stop and tell me to ask the dev team.',
      newVersion,
      ...batch,
      'When the contract passes its tests: open a tch PR with the contract files,',
      full
        ? 'release a new Claude Cowork plugin version carrying it (a joomla-v release of the claude-cowork repository), upload the new package files to the release (every file except tracy_setting.json),'
        : 'release a new Claude Cowork plugin version carrying it (a joomla-v release of the claude-cowork repository),',
      'pin that plugin release in tch (quickstarts.json and design-templates.json, in apps/tracy-web/src/ and in packages/fleet/tracy-fleet-operation/scripts/provision/), and merge the PR to develop.',
      ...(full
        ? [
            'After the merge, upload the new tracy_setting.json to the release: customers get the new version from then on.'
          ]
        : []),
      shows,
      'Stop before every commit, push, PR, release and upload, and wait for my go.'
    ].join(' '),
    note: production(),
    doc: {
      label: '.agents/skills/quickstart-contract/SKILL.md',
      href: `${DOCS}.agents/skills/quickstart-contract/SKILL.md`
    }
  }
}

/** The draft PR that holds the pages file generator, as a full GitHub address (check-origins exempts it). */
const SITE_PAGES_PR = 'https://github.com/TracyHQ/tracy-template-dev/pull/1'

/** The pages file a release ships for the Pages question, generated and attached as the docs say. */
function pagesOutside(ctx: GuideContext): OutsideFix {
  return {
    label: claudeCode(),
    text: [
      'The tool that makes tracy_site_pages.json is not released yet: it is only on the draft branch feat/site-pages-file of the tracy-template-dev repository, draft PR',
      SITE_PAGES_PR,
      'and the installed tracy-dev 0.7.1 does not have it.',
      'Check out that branch in a tracy-template-dev checkout (clone the repository if there is none),',
      `then run node plugins/tracy-dev/lib/site-pages.mjs --release '${ctx.tag}' --out . there to make tracy_site_pages.json from the release, and show me the file and its warnings. Never write that file by hand.`,
      `Then attach it from the same folder with gh release upload '${ctx.tag}' -R ${REPO} tracy_site_pages.json. No new release is needed: the file changes neither the site files nor the database.`,
      'Wait for my go before the upload.',
      SYNC('the Pages question then lists the template pages.')
    ].join(' '),
    note: tr('cms-readiness.outside.pagesWhy'),
    doc: { label: 'docs/references/quickstart-release.md §3', href: RELEASE_DOC.href }
  }
}

const CUSTOMIZE_DOC = {
  label: 'tasks/spec-template-customization-question-readiness.md',
  href: `${DOCS}tasks/spec-template-customization-question-readiness.md`
}

const COVERAGE_SKILL_DOC = {
  label: '.agents/skills/quickstart-contract/SKILL.md',
  href: `${DOCS}.agents/skills/quickstart-contract/SKILL.md`
}

/**
 * How a template language string becomes declared: a Joomla language override the capture rules turn
 * into a slot, never an edit of the template's own ini (the rule is landing with the JA Boxing contract
 * work, branch feat/ja-boxing-contract, 24/10/2026; name it here once it is merged).
 */
const LANGUAGE_STRINGS =
  'A template language string (TPL_...) is declared through a Joomla language override, the capture rule for template language strings, never by editing the template ini.'

type Cause = { cause?: unknown; class?: unknown; count?: unknown }
type Shown = { kind?: unknown; value?: unknown; class?: unknown }
type Problem = { kind?: unknown; value?: unknown; token?: unknown; pages?: unknown; firstPage?: unknown }

/** "language constant TPL_FOLLOW_US (44 pages, first /)", "placeholder TITLE in \"...\"": one page problem, the way the panel and the prompt say it. */
const problemLine = (h: Problem) => {
  const pages = Number(h.pages ?? 0)
  const first = str(h.firstPage)
  const token = str(h.token)
  const what = token ? `${token} in "${String(h.value ?? '')}"` : String(h.value ?? '')
  return `${String(h.kind ?? '').replace(/-/g, ' ')} ${what}${pages > 0 ? ` (${pages} page${pages === 1 ? '' : 's'}${first ? `, first ${first}` : ''})` : ''}`
}
/** The same line in the language on screen, for the panel; the kind stays the check's own id. */
const problemLineShown = (h: Problem) => {
  const pages = Number(h.pages ?? 0)
  const first = str(h.firstPage)
  const token = str(h.token)
  const value = String(h.value ?? '')
  const what = token ? tr('cms-readiness.coverage.problem.tokenIn', { token, value }) : value
  const count = tr('cms-readiness.coverage.problem.pages', { count: pages })
  const where = first ? tr('cms-readiness.coverage.problem.first', { pages: count, first }) : count
  return `${String(h.kind ?? '').replace(/-/g, ' ')} ${what}${pages > 0 ? ` (${where})` : ''}`
}
const causesOf = (p: Record<string, unknown>) =>
  (Array.isArray(p.causes) ? (p.causes as Cause[]) : []).map(
    (c) => `${Number(c.count ?? 0)} ${String(c.class ?? '')}: ${String(c.cause ?? '')}`
  )
/** `shown`: for the panel, in the language on screen; else for the prompt, in English. */
const problemsOf = (p: Record<string, unknown>, shown = false) =>
  (Array.isArray(p.hygieneShown) ? (p.hygieneShown as Problem[]) : []).map(
    shown ? problemLineShown : problemLine
  )

/**
 * The whole fix loop of Content coverage as ONE prompt (owner, 24/10/2026: every future template
 * follows the JA Boxing run from /ops alone). Measure, read by class, fix where each class is owned,
 * measure again, then the skill's sections 8 and 9. The detail lives in the skill (section 7, K8).
 */
function coverageOutside(ctx: GuideContext, p: Record<string, unknown>, problem: string): OutsideFix {
  const contract =
    str(p.contract) ??
    `${str(p.slug) ?? slugOfTag(ctx.tag)}/${majorOfTag(ctx.tag)}/${ctx.version ?? '<version>'}`
  const causes = causesOf(p)
  const shown = (Array.isArray(p.shown) ? (p.shown as Shown[]) : []).map(
    (h) => `${String(h.kind ?? '')} "${String(h.value ?? '')}" (${String(h.class ?? '')})`
  )
  const problems = problemsOf(p)
  const wordpress = ctx.platform === 'wordpress'
  return {
    label: claudeCode(),
    text: [
      `The content coverage of the release ${ctx.tag} (${ctx.cms}${ctx.version ? ` ${ctx.version}` : ''}) on ${REPO} ${problem}`,
      ...(causes.length > 0 ? [`Holes by cause: ${causes.join('; ')}.`] : []),
      ...(shown.length > 0 ? [`First holes: ${shown.join('; ')}.`] : []),
      ...(problems.length > 0 ? [`Page problems: ${problems.join('; ')}.`] : []),
      'Work in a tch checkout with the quickstart-contract skill (.agents/skills/quickstart-contract/SKILL.md: K8 is section 7 step 7, its fix loop section 7b). Fix everything in ONE round, before the PR, so every fix lands in one PR:',
      `1. Measure. Build a local site from this release (tracy-dev restore), unpack its webroot, keep its database file, then run: node packages/cms/tracy-quickstart-tools/content-coverage/cli.mjs --site <local site url> --contract ${wordpress ? slotRolesContractDir(ctx, p) : `packages/cms/tracy-joomla-quickstart/contracts/${contract}`} --db-dump <database file of the release> --webroot <unpacked webroot> --out <empty folder outside the repo> --write${fitLeft(p) ? ' --fit' : ''}`,
      '2. Read report.html in that folder: holes by class, then Page hygiene.',
      wordpress
        ? '3. capture (the value is in the site database): the capture rules miss it, in packages/cms/tracy-wordpress-quickstart/scripts/capture-contract.mjs (run it with --all-text so every visible text of a page gets a slot, and --role-vocabulary 3 for a template on version 3 roles). Fix the rule for every template, test first; never edit one contract by hand. Demo content the presentation lock pins is a hole too: carve it out of the lock. Then capture the contract again.'
        : '3. capture (the value is in the site database): the capture rules miss it, in packages/cms/tracy-joomla-quickstart/scripts/capture-contract.py and the contract door of the Claude Cowork plugin. Fix the rule for every template, test first; never edit one contract by hand. Demo content the presentation lock pins is a hole too: carve it out of the lock. Then capture the contract again.',
      `4. template (written in the template files), and every page problem (a raw language constant, PHP error text, an unfilled placeholder): fix the template source in ${REPO}, build the next quickstart version in the same package format as this release, and capture again on it. ${LANGUAGE_STRINGS}`,
      '5. core: nothing to do.',
      ...(rolesLeft(p) ? [`The contract also ${rolesProblem(p)}`, ...rolesSteps(ctx, p, ['5a', '5b'])] : []),
      ...(fitLeft(p)
        ? [
            `The content map also ${fitProblem(p)}`,
            ...fitSteps(ctx, p, rolesLeft(p) ? ['5c', '5d'] : ['5a', '5b'])
          ]
        : []),
      '6. Only what is truly not demo content a customer sees gets an "accepted" reason of at least 12 characters on its line in content-coverage.json. Never lower the threshold.',
      "7. Measure again until the command exits 0, commit content-coverage.json beside the contract in the same PR as the fixes, then follow the skill's sections 8 and 9 for the order of the plugin release, the pin, the PR and the release.",
      'Stop before every commit, push, PR, release and upload, and wait for my go.',
      'Once the PR is merged and CI has deployed this server, Content coverage on the Road to live reads the new file.'
    ].join('\n'),
    doc: COVERAGE_SKILL_DOC
  }
}

/** The slot keys a roles group names (the first eight the server sends). */
function slotKeysOf(p: Record<string, unknown>): string[] {
  return list(p.rolesShown)
}

/** Whether the roles group has something to say: anything but a declaration that is ready. */
const rolesLeft = (p: Record<string, unknown>) => typeof p.rolesState === 'string' && p.rolesState !== 'ready'

function slotRolesContractDir(ctx: GuideContext, p: Record<string, unknown>): string {
  const slug = str(p.slug) ?? slugOfTag(ctx.tag)
  const version = str(p.version) ?? ctx.version ?? '<version>'
  const rawContract = str(p.contract) ?? `${slug}/${majorOfTag(ctx.tag)}/${version}`
  const contract = rawContract.replace(/^quickstart\//, '')
  const cms = ctx.platform === 'wordpress' ? 'wordpress' : 'joomla'
  return `packages/cms/tracy-${cms}-quickstart/contracts/${contract}`
}

/**
 * What is wrong with the slot roles of a contract, as one clause for a prompt (English: its reader is the model).
 * @param p the content-coverage step's params
 */
function rolesProblem(p: Record<string, unknown>): string {
  const keys = slotKeysOf(p)
  const count = Number(p.rolesCount ?? keys.length)
  if (p.rolesState === 'missing')
    return `leaves ${count} text or image slot${count === 1 ? '' : 's'} without a role${keys.length > 0 ? ` (${keys.join(', ')}${count > keys.length ? ', ...' : ''})` : ''}.`
  if (p.rolesState === 'invalid')
    return `has an invalid slot roles declaration: ${str(p.rolesReason) ?? 'no reason given'}.`
  if (p.rolesState === 'stale')
    return `has out of date slot roles: ${str(p.rolesReason) ?? 'the contract changed'}.`
  return 'declares no slot roles (the contract was released before ADR 0038).'
}

/**
 * The steps that bind slot roles, shared by the standalone roles prompt and the whole coverage fix loop.
 * Roles live in content-map.json, written during capture (ADR 0038), never in a separate file.
 */
function rolesSteps(ctx: GuideContext, p: Record<string, unknown>, labels: [string, string]): string[] {
  const contractDir = slotRolesContractDir(ctx, p)
  const cms = ctx.platform === 'wordpress' ? 'wordpress' : 'joomla'
  return [
    `${labels[0]}. Slot roles: bind roles in content-map.json during capture, per the quickstart-contract skill (section 7 step 8). Capture the contract again, passing the content map of the previous version as --previous-map so reviewed roles carry over (the rule tables write their proposal: node scripts/slot-roles/rule-tables.mjs ${cms} < ${contractDir}/content-map.json shows it).`,
    `${labels[1]}. Review EVERY text and image slot: give it a "role" (and a "group" for a fact role), and set roleVocabularyVersion to "place-content-roles/2". Run node scripts/slot-roles/check.mjs ${contractDir} until it exits 0.`
  ]
}

/**
 * The paste-ready prompt for the slot roles group of Content coverage (ADR 0038): which release, what is missing, and
 * how to bind roles in content-map.json during capture.
 */
function slotRolesOutside(ctx: GuideContext, p: Record<string, unknown>): OutsideFix {
  const keys = slotKeysOf(p)
  return {
    label: claudeCode(),
    text: [
      `The slot roles of the release ${ctx.tag} (${ctx.cms}${ctx.version ? ` ${ctx.version}` : ''}) on ${REPO} ${rolesProblem(p)}`,
      ...(keys.length > 0 ? [`Slots without a role: ${keys.join(', ')}.`] : []),
      'Work in a tch checkout with the quickstart-contract skill (.agents/skills/quickstart-contract/SKILL.md). Fix it in ONE round, before the PR:',
      ...rolesSteps(ctx, p, ['1', '2']),
      ...(fitLeft(p) ? [`The content map also ${fitProblem(p)}`, ...fitSteps(ctx, p, ['2a', '2b'])] : []),
      '3. Measure the content coverage again (the contract changed) and commit content-coverage.json beside the contract in the same PR.',
      'Stop before every commit, push, PR and merge, and wait for my go.',
      'Once the PR is merged and CI has deployed this server, Content coverage on the Road to live reads the new contract.'
    ].join('\n'),
    doc: COVERAGE_SKILL_DOC
  }
}

/** The group's headline in the step title: what is counted. */
function rolesCounted(p: Record<string, unknown>): string {
  if (p.rolesState === 'missing')
    return tr('cms-readiness.coverage.noRole', { count: Number(p.rolesCount ?? 0) })
  if (p.rolesState === 'invalid') return tr('cms-readiness.coverage.rolesInvalid')
  if (p.rolesState === 'stale') return tr('cms-readiness.coverage.rolesStale')
  return tr('cms-readiness.coverage.rolesNone')
}

/** The list of slots without a role, for the panel. */
function rolesLists(p: Record<string, unknown>) {
  const keys = slotKeysOf(p)
  return p.rolesState === 'missing' && keys.length > 0
    ? [
        {
          heading: tr('cms-readiness.coverage.list.noRole'),
          count: Number(p.rolesCount ?? keys.length),
          lines: keys
        }
      ]
    : []
}

/** Whether the Slot fit group has something to say: anything but a ready fit, or a platform it does not judge. */
const fitLeft = (p: Record<string, unknown>) =>
  typeof p.fitState === 'string' && p.fitState !== 'ready' && p.fitState !== 'not-applicable'

/** The slot keys the Slot fit group names (the first eight the server sends). */
const fitKeysOf = (p: Record<string, unknown>): string[] => list(p.fitShown)

/**
 * What is wrong with the Slot fit of a content map, as one clause for a prompt (English: its reader is the model).
 * @param p the content-coverage step's params
 */
function fitProblem(p: Record<string, unknown>): string {
  const keys = fitKeysOf(p)
  const count = Number(p.fitCount ?? keys.length)
  const named = keys.length > 0 ? ` (${keys.join(', ')}${count > keys.length ? ', ...' : ''})` : ''
  if (p.fitState === 'missing')
    return `leaves ${count} text or image slot${count === 1 ? '' : 's'} without a fit${named}.`
  if (p.fitState === 'invalid')
    return `has an invalid Slot fit declaration: ${str(p.fitReason) ?? 'no reason given'}.`
  return `declares no Slot fit (it was captured before ADR 0039; ${count} text or image slot${count === 1 ? '' : 's'}).`
}

/**
 * The steps that measure Slot fit, shared by its own prompt, the roles prompt and the whole coverage fix loop. Slot fit
 * is measured by the content coverage audit, never written by hand, and only enters a new contract version (ADR 0039).
 */
function fitSteps(ctx: GuideContext, p: Record<string, unknown>, labels: [string, string]): string[] {
  const nextDir = slotRolesContractDir(ctx, p).replace(/\/[^/]*$/, '/<next version>')
  return [
    `${labels[0]}. Slot fit: measure it with the content coverage audit, adding --write --fit (section 7 step 7): node packages/cms/tracy-quickstart-tools/content-coverage/cli.mjs --site <local site url> --contract <the next contract version> --db-dump <database file> --webroot <unpacked webroot> --out <empty folder outside the repo> --write --fit. It writes slotFitVersion, fitGroups and a fit on every text and image slot of content-map.json, and sets each picture's customize "keep" from its measured kind. Never write a fit by hand.`,
    `${labels[1]}. A released content map never changes (ADR 0039, docs/adr/0039-slot-fit-lives-in-content-map.md): Slot fit goes into the next contract version. Run node scripts/slot-roles/check.mjs ${nextDir} until it exits 0 (it checks Slot fit too).`
  ]
}

/**
 * The paste-ready prompt for the Slot fit group of Content coverage (ADR 0039 decision 7): which release, what is
 * missing, and how to measure Slot fit for the next contract version.
 */
function slotFitOutside(ctx: GuideContext, p: Record<string, unknown>): OutsideFix {
  return {
    label: claudeCode(),
    text: [
      `The Slot fit of the release ${ctx.tag} (${ctx.cms}${ctx.version ? ` ${ctx.version}` : ''}) on ${REPO}: its content map ${fitProblem(p)}`,
      'Work in a tch checkout with the quickstart-contract skill (.agents/skills/quickstart-contract/SKILL.md). Fix it in ONE round, before the PR:',
      ...fitSteps(ctx, p, ['1', '2']),
      '3. The same run measures the content coverage again: commit content-map.json and content-coverage.json of the new contract version in the same PR.',
      'Stop before every commit, push, PR and merge, and wait for my go.',
      'Once the PR is merged and CI has deployed this server, Content coverage on the Road to live reads the new contract.'
    ].join('\n'),
    doc: COVERAGE_SKILL_DOC
  }
}

/** The Slot fit group's headline in the step title: what is counted. */
function fitCounted(p: Record<string, unknown>): string {
  if (p.fitState === 'missing') return tr('cms-readiness.coverage.noFit', { count: Number(p.fitCount ?? 0) })
  if (p.fitState === 'invalid') return tr('cms-readiness.coverage.fitInvalid')
  return tr('cms-readiness.coverage.fitNone')
}

/** The list of slots without a fit, for the panel (only when the map declares Slot fit: else it is every slot). */
function fitLists(p: Record<string, unknown>) {
  const keys = fitKeysOf(p)
  return p.fitState === 'missing' && keys.length > 0
    ? [
        {
          heading: tr('cms-readiness.coverage.list.noFit'),
          count: Number(p.fitCount ?? keys.length),
          lines: keys
        }
      ]
    : []
}

/** The failing label rules a step carries (ADR 0040), as sent; anything not shaped like one is dropped. */
const labelRulesOf = (p: Record<string, unknown>) =>
  (Array.isArray(p.labelFailing) ? p.labelFailing : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof x.rule === 'string')
    .map((x) => ({
      rule: String(x.rule),
      title: str(x.title) ?? String(x.rule),
      count: Number(x.count ?? 0),
      keys: list(x.keys)
    }))

/** The label rules group's headline in the step title: how many rules fail. */
const labelCounted = (p: Record<string, unknown>): string =>
  tr('cms-readiness.coverage.labels', { count: labelRulesOf(p).length })

/** One list per failing label rule: its title and the first slots (or holes) that fail it. */
const labelLists = (p: Record<string, unknown>) =>
  labelRulesOf(p)
    .filter((f) => f.keys.length > 0)
    .map((f) => ({ heading: `${f.rule} ${f.title}`, count: f.count, lines: f.keys }))

/**
 * The paste-ready prompt for the label rules group of Content coverage (ADR 0040): which rules fail, on which slots,
 * and how to relabel and measure again. English: its reader is the model.
 */
function labelRulesOutside(ctx: GuideContext, p: Record<string, unknown>): OutsideFix {
  const contractDir = slotRolesContractDir(ctx, p)
  const rules = labelRulesOf(p).map(
    (f) =>
      `${f.rule} ${f.title} (${f.count}${f.keys.length > 0 ? `: ${f.keys.join(', ')}${f.count > f.keys.length ? ', ...' : ''}` : ''})`
  )
  return {
    label: claudeCode(),
    text: [
      `The label rules of the release ${ctx.tag} (${ctx.cms}${ctx.version ? ` ${ctx.version}` : ''}) on ${REPO} fail: ${rules.join('; ')}.`,
      'Work in a tch checkout with the quickstart-contract skill (.agents/skills/quickstart-contract/SKILL.md). Fix it in ONE round, before the PR:',
      `1. Relabel. For each listed slot, read its sample and its place in ${contractDir}/content-map.json and correct its "role" and "group" (a fact such as a phone, price, hours, name or number needs a contact or price role, never an editorial one; every URL slot needs a role; a repeated block is one group per item; a call to action shares a group with its label; a face needs a person, quote or business role, or stat.proof_image when the faces prove a number). A hole listed under R9 is a fact the content map misses: capture it, do not accept it.`,
      '2. Run node scripts/slot-roles/check.mjs on that contract folder until it exits 0.',
      '3. Run the content coverage audit again with --write (section 7 step 7 of the skill) and read labelRules in content-coverage.json: every blocking rule must show a count of 0. Commit content-map.json and content-coverage.json in the same PR.',
      'Stop before every commit, push, PR and merge, and wait for my go.',
      'Once the PR is merged and CI has deployed this server, Content coverage on the Road to live reads the new file.'
    ].join('\n'),
    doc: COVERAGE_SKILL_DOC
  }
}

/** The judged slots of one list a step carries (spec #37), as sent; anything not shaped like one is dropped. */
const judgedOf = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof x.key === 'string')
    .map((x) => ({
      key: String(x.key),
      role: str(x.role) ?? 'no role',
      suggested: str(x.suggested) ?? '',
      why: str(x.why) ?? ''
    }))

/** The label judge's headline in the step title: wrong groups first, then finer mismatches, then what it never judged. */
function judgeCounted(p: Record<string, unknown>): string {
  if (p.judgeState === 'wrong-group')
    return tr('cms-readiness.coverage.judge.wrongGroup', { count: Number(p.judgeWrongGroupCount ?? 0) })
  if (p.judgeState === 'mismatch')
    return tr('cms-readiness.coverage.judge.mismatch', { count: Number(p.judgeMismatchCount ?? 0) })
  return tr('cms-readiness.coverage.judge.notJudged', { count: Number(p.judgeNotJudged ?? 0) })
}

/** The label judge's lists: slots on the wrong side of fact/editorial, then finer mismatches, each with its suggestion. */
function judgeLists(p: Record<string, unknown>) {
  const line = (x: { key: string; role: string; suggested: string }) =>
    `${x.key}: ${x.role} -> ${x.suggested}`
  const wrong = judgedOf(p.judgeWrongGroup)
  const finer = judgedOf(p.judgeMismatch)
  return [
    ...(wrong.length > 0
      ? [
          {
            heading: tr('cms-readiness.coverage.list.judgeWrongGroup'),
            count: Number(p.judgeWrongGroupCount ?? wrong.length),
            lines: wrong.map(line)
          }
        ]
      : []),
    ...(finer.length > 0
      ? [
          {
            heading: tr('cms-readiness.coverage.list.judgeMismatch'),
            count: Number(p.judgeMismatchCount ?? finer.length),
            lines: finer.map(line)
          }
        ]
      : [])
  ]
}

/**
 * The paste-ready prompt for the label judge of Content coverage (spec #37): which slots the judge (the agent that ran
 * the release) says are labelled wrong and what it suggests, or how to get them judged at all. English: its reader is the model.
 */
function labelJudgeOutside(ctx: GuideContext, p: Record<string, unknown>): OutsideFix {
  const contractDir = slotRolesContractDir(ctx, p)
  const said = (xs: ReturnType<typeof judgedOf>, total: number) =>
    `${xs.map((x) => `${x.key} is labelled ${x.role}, the judge suggests ${x.suggested}${x.why ? ` (${x.why})` : ''}`).join('; ')}${total > xs.length ? ', ...' : ''}`
  const wrong = judgedOf(p.judgeWrongGroup)
  const finer = judgedOf(p.judgeMismatch)
  const notJudged = Number(p.judgeNotJudged ?? 0)
  return {
    label: claudeCode(),
    text: [
      `The label judge of the release ${ctx.tag} (${ctx.cms}${ctx.version ? ` ${ctx.version}` : ''}) on ${REPO} looked at each component with its numbered slots.`,
      ...(wrong.length > 0
        ? [`Wrong fact/editorial group: ${said(wrong, Number(p.judgeWrongGroupCount ?? wrong.length))}.`]
        : []),
      ...(finer.length > 0
        ? [`Another role suggested: ${said(finer, Number(p.judgeMismatchCount ?? finer.length))}.`]
        : []),
      ...(notJudged > 0
        ? [
            `${notJudged} located slot${notJudged === 1 ? ' was' : 's were'} not judged (${str(p.judgeReason) ?? 'no reason given'}).`
          ]
        : []),
      'Work in a tch checkout with the quickstart-contract skill (.agents/skills/quickstart-contract/SKILL.md). Fix it in ONE round, before the PR:',
      `1. Relabel. For each listed slot, look at it on the page and in ${contractDir}/content-map.json; when the judge is right, set the suggested "role" (a fact needs a fact role; a heading that carries a number, an award or a year is claim.heading). When the judge is wrong, keep the role and say why in the PR.`,
      '2. Run node scripts/slot-roles/check.mjs on that contract folder until it exits 0.',
      '3. Run the content coverage audit again with --write (section 7 step 7 of the skill). It asks only about changed slots, in label-judge/request.json under --out: look at each crop yourself, write your verdicts and record them with content-coverage/record-judge.mjs. Read labelJudge in content-coverage.json: no slot may stay in the wrong group. Commit content-map.json and content-coverage.json in the same PR.',
      'Stop before every commit, push, PR and merge, and wait for my go.',
      'Once the PR is merged and CI has deployed this server, Content coverage on the Road to live reads the new file.'
    ].join('\n'),
    doc: COVERAGE_SKILL_DOC
  }
}

const DS_DOC = {
  label: 'tasks/spec-template-design-system-readiness.md',
  href: `${DOCS}tasks/spec-template-design-system-readiness.md`
}

/** The failing rules a step carries, as sent; anything not shaped like one is dropped. */
const rulesOf = (v: unknown): CustomizeRule[] =>
  Array.isArray(v)
    ? v
        .filter(
          (x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof x.rule === 'string'
        )
        .map((x) => ({
          rule: String(x.rule),
          text: str(x.text) ?? String(x.rule),
          question: str(x.question) ?? tr('cms-readiness.rule.allQuestions'),
          owner: str(x.owner) ?? 'template',
          message: str(x.message) ?? '',
          fix: str(x.fix),
          measuredOn: str(x.measuredOn),
          ...(x.unmeasured === true ? { unmeasured: true } : {}),
          ...(findingsOf(x.findings).length ? { findings: findingsOf(x.findings) } : {})
        }))
    : []

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []

/** The findings a rule carries, as sent; anything not shaped like one is dropped. */
const findingsOf = (v: unknown): RuleFinding[] =>
  Array.isArray(v)
    ? v
        .filter(
          (x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof x.what === 'string'
        )
        .map((x) => ({
          kind: str(x.kind) ?? '',
          what: String(x.what),
          on: strings(x.on),
          pages: strings(x.pages),
          sitewide: strings(x.sitewide),
          where: strings(x.where),
          fix: str(x.fix)
        }))
    : []

/**
 * Where a failing rule is, in plain words, for the line under its row: the check's own message
 * without its "Measured on" stamp (the row says that already), or null when it says nothing more
 * than the rule's plain line.
 */
export function ruleWhere(r: CustomizeRule): string | null {
  const m = r.message
    .replace(/\s*Measured on .*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return m && m !== r.text ? m : null
}

/** The four kinds of template a release can be, each made in a different place. */
type TemplateFamily = 'ja-joomla' | 'tracy-joomla' | 'wordpress' | 'emdash'

const familyOf = (ctx: GuideContext): TemplateFamily =>
  ctx.platform === 'emdash'
    ? 'emdash'
    : ctx.platform === 'wordpress'
      ? 'wordpress'
      : ctx.tag.startsWith('quickstart/ja-')
        ? 'ja-joomla'
        : 'tracy-joomla'

/**
 * The folder of a WordPress theme in tch: Tracy Base keeps its own name, every other theme is
 * `wp-<template>` (`wp-ja-morgan`, `wp-tracy-business`). `src/<slug>` is generated from the overlay.
 */
const wordpressSlug = (ctx: GuideContext) => {
  const t = (ctx.template ?? slugOfTag(ctx.tag)).replace(/^wp-/, '')
  return t === 'tracy-base' ? t : `wp-${t}`
}

/**
 * Where each owner's fix goes for this release (12/10/2026: every Published release on dev read).
 * A JA Joomla template is made from its source on joomlart-products; Tracy's own Joomla templates are
 * JoomlArt archives patched from `template-patches` in tch; every WordPress theme, JA ports
 * included, is generated in tch from its overlay; Tracy's EmDash templates have their own folder in
 * tch. Only the releases live on joomlart-products for all four.
 */
function ownerPlace(owner: string, ctx: GuideContext): string {
  const family = familyOf(ctx)
  const slug = slugOfTag(ctx.tag)
  if (owner === 'plugin') return 'the Claude Cowork plugin (the claude-cowork repository)'
  if (owner === 'tracy')
    return 'Tracy itself in the tch repository (a tch PR, no new release; tell me first, it is not a template fix)'
  if (family === 'emdash') {
    const name = (ctx.template ?? '').replace(/^tracy-/, '') || '<name>'
    return `the template package in the tch repository (packages/cms/tracy-emdash-theme-${name})`
  }
  if (owner === 'contract') {
    const cms = family === 'wordpress' ? 'wordpress' : 'joomla'
    return `the content contract in the tch repository (packages/cms/tracy-${cms}-quickstart/contracts/${slug}/${majorOfTag(ctx.tag)}, by a PR)`
  }
  if (family === 'wordpress')
    return `the theme in the tch repository (packages/cms/tracy-wordpress-theme/overlays/${wordpressSlug(ctx)}; src/${wordpressSlug(ctx)} is generated from it)`
  if (family === 'tracy-joomla')
    return 'the template patches in the tch repository (packages/cms/tracy-joomla-quickstart/template-patches, applied to the webroot before the release is cut again)'
  return `the template source in ${REPO} (products/joomlart/*/${slug.replaceAll('-', '_')}/source)`
}

/** The skill or guide that fixes a template of this family. */
function skillLine(ctx: GuideContext): string {
  switch (familyOf(ctx)) {
    case 'wordpress':
      return 'Use the tracy-wordpress-theme skill (vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/SKILL.md in tch, read in place) and packages/cms/tracy-wordpress-theme/README.md for theme rules; a contract rule goes in packages/cms/tracy-wordpress-quickstart/contracts.'
    case 'emdash':
      return 'Use the tracy-emdash-template skill for every rule.'
    case 'tracy-joomla':
      return 'Follow packages/cms/tracy-joomla-quickstart/template-patches/README.md for template rules and packages/cms/tracy-joomla-quickstart/contracts/README.md for contract rules.'
    default:
      return 'Use the joomlart-t4-template skill for template rules and the quickstart-contract skill for contract rules.'
  }
}

/**
 * What finishes the work: a template or plugin rule needs a new release; a contract or Tracy rule
 * is a tch PR that /ops reads once CI has deployed this server, with no new release.
 */
function finishLines(owners: Set<string>): string[] {
  const release = owners.has('template') || owners.has('plugin')
  const pr = owners.has('contract') || owners.has('tracy')
  return [
    'Fix the must fix rules first.',
    ...(release
      ? [
          'A template or plugin rule needs a new release: release it, then run the check again on that release until no must fix rule is left.'
        ]
      : []),
    ...(pr
      ? [
          'A contract or Tracy rule is a tch PR into develop and needs no new release: /ops judges by it once CI has deployed this server.'
        ]
      : [])
  ]
}

/**
 * ONE prompt for the whole release (Akemi, 10/10/2026: one text to paste), listing every failing
 * rule with the check's own words, where its fix goes, the skill, and how to see the result.
 */
function customizeOutside(
  ctx: GuideContext,
  rules: { mustFix: CustomizeRule[]; worthFixing: CustomizeRule[] }
): OutsideFix {
  const line = (r: CustomizeRule, group: string) =>
    `${r.rule} (${group}, ${r.question}, fix in ${ownerPlace(r.owner, ctx)}): ${r.message}${r.fix ? ` Fix: ${r.fix}` : ''}`
  return {
    label: claudeCode(),
    text: [
      `The Customize your site check of the release ${ctx.tag} (${ctx.cms}${ctx.version ? ` ${ctx.version}` : ''}) on ${REPO} fails these rules.`,
      ...rules.mustFix.map((r) => line(r, 'must fix')),
      ...rules.worthFixing.map((r) => line(r, 'worth fixing')),
      skillLine(ctx),
      `First run the check on this machine in a tch checkout: gh release download '${ctx.tag}' -R ${REPO} -D <an empty folder>, then node scripts/template-customization-question-readiness.mjs <that folder> --tag '${ctx.tag}', and confirm you see the same failures.`,
      ...finishLines(new Set([...rules.mustFix, ...rules.worthFixing].map((r) => r.owner))),
      'Stop before every commit, push, PR, release and upload, and wait for my go.',
      'Then tell me to press Check again on Customize your site in the Road to live on /ops.'
    ].join(' '),
    doc: CUSTOMIZE_DOC
  }
}

/**
 * ONE prompt for the Design system step of a release (ADR 0031), in the shape of Customize your
 * site's: every failing rule with the check's own words, the skill that fixes it, the local command
 * that shows the same failures, what finishes the work, and the stops.
 */
function designSystemOutside(
  ctx: GuideContext,
  rules: { mustFix: CustomizeRule[]; worthFixing: CustomizeRule[]; unmeasured?: CustomizeRule[] }
): OutsideFix {
  const unmeasured = rules.unmeasured ?? []
  const where = (owner: string) =>
    owner === 'ops'
      ? '/ops on this server (Road to live step Demo, or Demo Site; no code change)'
      : owner === 'contract'
        ? 'the slot contract in the tch repository (packages/design/tracy-ds-slot/templates, by a PR)'
        : ownerPlace('template', ctx)
  const line = (r: CustomizeRule, group: string) =>
    `${r.rule} (${r.unmeasured ? `${group}, not measured yet` : group}, ${r.question}, fix in ${where(r.owner)}): ${r.message}${r.fix ? ` Fix: ${r.fix}` : ''}${(r.findings ?? []).map((k) => ` Found: ${k.what} on ${k.on.join(', ')}${k.sitewide?.length ? `, site-wide ${k.sitewide.join(', ')}` : ''}${k.pages.length ? `, pages ${k.pages.join(', ')}` : ''}${k.where.length ? ` at ${k.where.join(', ')}` : ''}${k.fix ? `. Fix: ${k.fix}` : ''}.`).join('')}`
  // rules waiting for the same measurement say their reason and their fix once (`ruleRows`)
  const lines = (list: CustomizeRule[], group: string) =>
    ruleRows(list, false).map((row) =>
      row.kind === 'one'
        ? line(row.rule, group)
        : `${row.rules.map((r) => r.rule).join(', ')} (${group}, not measured yet, ${row.question}, fix in ${where(row.rules[0].owner)}): ${row.text} ${row.reason}${row.fix ? ` Fix: ${row.fix}` : ''}`
    )
  const owners = new Set([...rules.mustFix, ...rules.worthFixing].map((r) => r.owner))
  const failing = rules.mustFix.length + rules.worthFixing.length
  return {
    label: claudeCode(),
    text: [
      `The Design system check of the release ${ctx.tag} (${ctx.cms}${ctx.version ? ` ${ctx.version}` : ''}) on ${REPO} ${failing ? 'fails these rules' : 'has rules not measured yet'}.`,
      ...lines(rules.mustFix, 'must fix'),
      ...lines(rules.worthFixing, 'worth fixing'),
      ...unmeasured.map((r) => `${r.rule} (not measured yet, ${r.question}): ${r.message}`),
      'Use the tdsr skill (.agents/skills/tdsr/SKILL.md in tch).',
      ...(unmeasured.length
        ? [
            'A rule not measured yet needs a run on a built site on your machine: the tdsr skill measures it and writes design-system-measurement.json. Bring that file with the fix: the designSystem block of VERIFICATION.json in a new release, or the file in the contract folder of this version in tch (packages/cms/tracy-joomla-quickstart/contracts, packages/cms/tracy-wordpress-quickstart/contracts). Without the file the rule stays "Not measured yet".'
          ]
        : []),
      `First run the check on this machine in a tch checkout: node scripts/template-design-system-readiness.mjs <an empty folder> --tag '${ctx.tag}' --fetch, and confirm you see the same failures.`,
      'Fix the must fix rules first.',
      ...(owners.has('template')
        ? [
            'A template rule needs a new release: release it, move maxVersion in the slot contract, then run the check again on that release.'
          ]
        : []),
      ...(owners.has('contract')
        ? [
            'A contract rule is a tch PR into develop and needs no new release: /ops judges by it once CI has deployed this server.'
          ]
        : []),
      'Stop before every commit, push, PR, release and upload, and wait for my go.',
      'Then tell me to press Check again on Design system in the Road to live on /ops.'
    ].join(' '),
    doc: DS_DOC
  }
}

/** The words of one polish item (a card gap or the missing pages file), by its own code. */
export function polishItemText(code: string, params: Record<string, unknown>): string {
  switch (code) {
    case 'pictures-missing':
      return tr('cms-readiness.polish.item.picturesMissing', {
        missing: String(params.missing),
        total: String(params.total),
        files: list(params.files).join(', ')
      })
    case 'layouts-without-shots':
      return tr('cms-readiness.polish.item.layoutsWithoutShots', { layouts: String(params.layouts) })
    case 'no-category':
      return tr('cms-readiness.polish.item.noCategory')
    case 'no-thumbnail':
      return tr('cms-readiness.polish.item.noThumbnail')
    case 'no-blurb':
      return tr('cms-readiness.polish.item.noBlurb')
    case 'no-pages-file':
      return tr('cms-readiness.polish.item.noPagesFile')
    default:
      return code
  }
}

/** The key of one or two words per polish item, for the step's single fact line ("Missing: blurb, pages file."). */
const POLISH_WORD: Record<string, string> = {
  'pictures-missing': 'cms-readiness.polish.word.picturesMissing',
  'layouts-without-shots': 'cms-readiness.polish.word.layoutsWithoutShots',
  'no-category': 'cms-readiness.polish.word.noCategory',
  'no-thumbnail': 'cms-readiness.polish.word.noThumbnail',
  'no-blurb': 'cms-readiness.polish.word.noBlurb',
  'no-pages-file': 'cms-readiness.polish.word.noPagesFile'
}

/** The guide for one step of one release. */
export function guideOf(s: RoadStep, ctx: GuideContext): StepGuide {
  const why = STEP_WHY[s.step] ?? ''
  const p = s.params ?? {}
  const g = (title: string, rest: Partial<StepGuide> = {}): StepGuide => ({ title, why, ...rest })
  const own: ContractFor = {
    tag: ctx.tag,
    platform: ctx.platform,
    version: str(p.version) ?? ctx.version ?? '<version>'
  }
  switch (s.code) {
    // 1. Release
    case 'release-published':
      return g(tr('cms-readiness.release.published'))
    case 'release-draft':
      return g(tr('cms-readiness.release.draft'), {
        ops: {
          target: {
            view: 'settings',
            section: 'github',
            label: tr('cms-readiness.target.release'),
            control: 'open-github'
          },
          steps: [
            tr('cms-readiness.release.draft.step1'),
            tr('cms-readiness.release.draft.step2'),
            tr('cms-readiness.release.draft.step3')
          ]
        }
      })
    // 2. Install file
    case 'install-file-ready':
      return g(tr('cms-readiness.installFile.ready'))
    case 'no-install-file':
      return g(tr('cms-readiness.installFile.none'), {
        detail: tr('cms-readiness.installFile.none.detail'),
        ops: {
          target: createFile(),
          steps: [tr('cms-readiness.installFile.none.step1'), tr('cms-readiness.installFile.none.step2')]
        },
        outside: installFileOutside(ctx)
      })
    case 'install-file-invalid':
      return g(tr('cms-readiness.installFile.invalid'), {
        detail: str(p.reason) ?? undefined,
        outside: installFileOutside(ctx, str(p.reason))
      })
    case 'no-template':
      return g(tr('cms-readiness.installFile.noTemplate'), {
        detail: tr('cms-readiness.installFile.noTemplate.detail'),
        outside: installFileOutside(ctx, 'it names no template.')
      })
    case 'template-not-an-id':
      return g(tr('cms-readiness.installFile.notAnId'), {
        detail: tr('cms-readiness.installFile.notAnId.detail', {
          template: JSON.stringify(str(p.template) ?? '')
        }),
        outside: installFileOutside(
          ctx,
          `it names the template ${JSON.stringify(str(p.template) ?? '')}, which is not an id (letters, digits, dashes and underscores only).`
        )
      })
    case 'asset-missing': {
      const files = list(p.files)
      return g(tr('cms-readiness.installFile.assetMissing'), {
        detail: tr('cms-readiness.installFile.assetMissing.detail', { files: files.join(', ') }),
        outside: {
          label: claudeCode(),
          text: [
            `The release ${ctx.tag} on ${REPO} lacks ${files.join(', ')}, which its tracy_setting.json names.`,
            'Ask me first whether I have the file from the packed release.',
            `If I do, attach it from the folder that holds it: ${files.map((f) => `gh release upload '${ctx.tag}' -R ${REPO} ${f}`).join(', then ')}.`,
            `If not, in a tch checkout write tracy_setting.json again from the files the release has: ${writeCommand(ctx)}, then run the upload command it prints.`,
            'Wait for my go before any upload.',
            SYNC('this warning then goes away.')
          ].join(' '),
          doc: RELEASE_DOC
        }
      })
    }
    // 3. Contract (the long pole: started at once)
    case 'contract-not-needed':
      return g(tr('cms-readiness.contract.notNeeded'), {
        detail: tr('cms-readiness.common.emdashNoContract')
      })
    case 'contract-exact':
      return g(tr('cms-readiness.contract.exact'), {
        detail: str(p.profile)
          ? tr('cms-readiness.contract.exact.detail', { profile: String(p.profile) })
          : undefined
      })
    case 'contract-lower':
      return g(tr('cms-readiness.contract.lower'), {
        detail: tr('cms-readiness.contract.lower.detail', {
          profile: String(p.profile),
          version: String(p.version)
        }),
        outside: contractOutside(p, own)
      })
    case 'no-contract':
      return g(tr('cms-readiness.contract.none'), {
        detail: ctx.platform === 'emdash' ? undefined : tr('cms-readiness.contract.line'),
        outside: contractOutside(p, own)
      })
    case 'sibling-no-contract': {
      type Missing = { tag: string; platform?: string; version?: string | null }
      const missing: Missing[] = Array.isArray(p.missing)
        ? (p.missing as Missing[])
        : list(p.tags).map((tag) => ({ tag }))
      const first = missing[0]
      const tag = first?.tag ?? list(p.tags)[0] ?? ctx.tag
      return g(tr('cms-readiness.contract.sibling'), {
        detail: tr('cms-readiness.contract.sibling.detail', { tags: missing.map((m) => m.tag).join(', ') }),
        outside: contractOutside(
          { slug: slugOfTag(tag) },
          {
            tag,
            platform: (first?.platform as GuideContext['platform']) ?? platformOfTag(tag),
            version: str(first?.version) ?? '<its version>'
          }
        )
      })
    }
    // 3b. Content coverage: the audit's file committed beside the contract (owner, 24/10/2026)
    case 'coverage-not-needed':
      return g(tr('cms-readiness.coverage.notNeeded'), {
        detail:
          ctx.platform === 'emdash'
            ? tr('cms-readiness.common.emdashNoContract')
            : tr('cms-readiness.coverage.joomlaOnly')
      })
    case 'coverage-waiting':
      return g(STEP_TITLE['content-coverage'])
    case 'coverage-ready': {
      const c = (p.coverage ?? {}) as Record<string, unknown>
      const accepted = Number(p.accepted ?? 0)
      return g(
        tr('cms-readiness.coverage.ready', {
          step: STEP_TITLE['content-coverage'],
          text: Number(c.text ?? 0),
          images: Number(c.images ?? 0)
        }),
        { detail: accepted > 0 ? tr('cms-readiness.coverage.accepted', { count: accepted }) : undefined }
      )
    }
    case 'coverage-not-measured':
      return g(tr('cms-readiness.coverage.notMeasured'), {
        detail:
          p.live === true
            ? tr('cms-readiness.coverage.notMeasured.live')
            : tr('cms-readiness.coverage.notMeasured.waits'),
        outside: coverageOutside(ctx, p, 'is not measured yet, so Publish waits for it. Measure it first.')
      })
    case 'coverage-stale':
      return g(tr('cms-readiness.coverage.stale'), {
        detail: tr('cms-readiness.coverage.stale.detail', {
          reason: str(p.reason) ?? tr('cms-readiness.coverage.stale.changed')
        }).slice(0, 90),
        outside: coverageOutside(
          ctx,
          p,
          `was measured on another contract (${str(p.reason) ?? 'it changed'}). Measure it again.`
        )
      })
    case 'coverage-invalid':
      return g(tr('cms-readiness.coverage.invalid'), {
        detail: (str(p.reason) ? `${str(p.reason)}.` : tr('cms-readiness.coverage.invalid.unreadable')).slice(
          0,
          90
        ),
        outside: coverageOutside(
          ctx,
          p,
          `cannot be read: ${str(p.reason) ?? 'no reason given'}. Measure it again.`
        )
      })
    case 'coverage-holes':
    case 'coverage-live-holes': {
      const holes = Number(p.holes ?? 0)
      const problems = Number(p.hygiene ?? 0)
      const by = (p.byClass ?? {}) as Record<string, unknown>
      const locked = Number(p.lockedContent ?? 0)
      const c = (p.coverage ?? {}) as Record<string, unknown>
      const counted = [
        ...(holes > 0 || problems === 0 ? [tr('cms-readiness.coverage.holes', { count: holes })] : []),
        ...(problems > 0 ? [tr('cms-readiness.coverage.pageProblems', { count: problems })] : []),
        ...(rolesLeft(p) ? [rolesCounted(p)] : []),
        ...(fitLeft(p) ? [fitCounted(p)] : [])
      ]
      const what = [
        ...(holes > 0
          ? [
              `leaves ${holes} piece${holes === 1 ? '' : 's'} of demo content undeclared (text ${Number(c.text ?? 0)}%, images ${Number(c.images ?? 0)}% covered)`
            ]
          : []),
        ...(problems > 0
          ? [
              `${holes > 0 ? 'and ' : ''}finds ${problems} page problem${problems === 1 ? '' : 's'} customers must never see`
            ]
          : []),
        ...(str(p.incomplete) ? [`and ${String(p.incomplete)}`] : [])
      ]
      const lists = [
        ...(causesOf(p).length > 0
          ? [{ heading: tr('cms-readiness.coverage.list.notDeclared'), count: holes, lines: causesOf(p) }]
          : []),
        ...(problemsOf(p).length > 0
          ? [
              {
                heading: tr('cms-readiness.coverage.list.pageProblems'),
                count: problems,
                lines: problemsOf(p, true)
              }
            ]
          : []),
        ...rolesLists(p),
        ...fitLists(p)
      ]
      return g(
        tr('cms-readiness.coverage.counted', {
          step: STEP_TITLE['content-coverage'],
          counted: counted.join(', ')
        }),
        {
          detail:
            s.code === 'coverage-live-holes'
              ? tr('cms-readiness.common.liveFixNext')
              : holes === 0 && problems === 0
                ? tr('cms-readiness.coverage.incomplete', {
                    reason: str(p.incomplete) ?? tr('cms-readiness.coverage.incomplete.pages')
                  }).slice(0, 90)
                : holes === 0
                  ? tr('cms-readiness.coverage.onlyProblems')
                  : tr('cms-readiness.coverage.byClass', {
                      capture: Number(by.capture ?? 0),
                      locked,
                      template: Number(by.template ?? 0),
                      unknown: Number(by.unknown ?? 0)
                    }),
          ...(lists.length > 0 ? { lists } : {}),
          outside: coverageOutside(ctx, p, `${what.length > 0 ? what.join(' ') : 'is incomplete'}.`)
        }
      )
    }
    // 3c. Slot roles, the third group of Content coverage (ADR 0038): roles bound in content-map.json
    case 'coverage-roles':
    case 'coverage-live-roles': {
      const detail =
        s.code === 'coverage-live-roles'
          ? tr('cms-readiness.common.liveFixNext')
          : p.rolesState === 'none'
            ? tr('cms-readiness.coverage.rolesNone.detail')
            : p.rolesState === 'missing'
              ? tr('cms-readiness.coverage.noRole.detail')
              : (str(p.rolesReason) ?? tr('cms-readiness.coverage.rolesInvalid.detail')).slice(0, 90)
      const lists = [...rolesLists(p), ...fitLists(p)]
      return g(
        tr('cms-readiness.coverage.counted', {
          step: STEP_TITLE['content-coverage'],
          counted: [rolesCounted(p), ...(fitLeft(p) ? [fitCounted(p)] : [])].join(', ')
        }),
        {
          detail,
          ...(lists.length > 0 ? { lists } : {}),
          outside: slotRolesOutside(ctx, p)
        }
      )
    }
    // 3d. Slot fit, the fourth group of Content coverage (ADR 0039): measured into content-map.json by the audit
    case 'coverage-fit':
    case 'coverage-live-fit': {
      const detail =
        s.code === 'coverage-live-fit'
          ? tr('cms-readiness.common.liveFixNext')
          : p.fitState === 'none'
            ? tr('cms-readiness.coverage.fitNone.detail')
            : p.fitState === 'missing'
              ? tr('cms-readiness.coverage.noFit.detail')
              : (str(p.fitReason) ?? tr('cms-readiness.coverage.fitInvalid.detail')).slice(0, 90)
      return g(
        tr('cms-readiness.coverage.counted', {
          step: STEP_TITLE['content-coverage'],
          counted: fitCounted(p)
        }),
        {
          detail,
          ...(fitLists(p).length > 0 ? { lists: fitLists(p) } : {}),
          outside: slotFitOutside(ctx, p)
        }
      )
    }
    // 3e. Label rules, the fifth group of Content coverage (ADR 0040): rules R2 to R9 committed by the audit
    case 'coverage-labels':
    case 'coverage-live-labels':
      return g(
        tr('cms-readiness.coverage.counted', {
          step: STEP_TITLE['content-coverage'],
          counted: labelCounted(p)
        }),
        {
          detail:
            s.code === 'coverage-live-labels'
              ? tr('cms-readiness.common.liveFixNext')
              : tr('cms-readiness.coverage.labels.detail'),
          ...(labelLists(p).length > 0 ? { lists: labelLists(p) } : {}),
          outside: labelRulesOutside(ctx, p)
        }
      )
    // 3f. The LLM label judge (spec #37), in the label rules group: verdicts committed by the audit
    case 'coverage-judge':
    case 'coverage-judge-warn': {
      const lists = judgeLists(p)
      return g(
        tr('cms-readiness.coverage.counted', {
          step: STEP_TITLE['content-coverage'],
          counted: judgeCounted(p)
        }),
        {
          detail:
            s.code === 'coverage-judge'
              ? tr('cms-readiness.coverage.judge.detail')
              : p.live === true
                ? tr('cms-readiness.common.liveFixNext')
                : p.judgeState === 'mismatch'
                  ? tr('cms-readiness.coverage.judge.mismatch.detail')
                  : tr('cms-readiness.coverage.judge.notJudged.detail'),
          ...(lists.length > 0 ? { lists } : {}),
          outside: labelJudgeOutside(ctx, p)
        }
      )
    }
    // 4. Customize your site (ADR 0029 §4): the readiness check of this version
    case 'customize-waiting':
      return g(STEP_TITLE.customize)
    case 'customize-not-checked':
      return g(STEP_TITLE.customize, { detail: tr('cms-readiness.common.notCheckedYet'), checkAgain: true })
    case 'customize-checking':
      return g(STEP_TITLE.customize, { detail: tr('cms-readiness.common.checkingNow') })
    case 'customize-error':
      return g(STEP_TITLE.customize, {
        detail: tr('cms-readiness.common.couldNotCheck', {
          reason: str(p.reason) ?? tr('cms-readiness.noReason')
        }).slice(0, 90),
        checkAgain: true
      })
    case 'customize-unchecked':
    case 'customize-live-unchecked': {
      // a rule that could not be read (STAB-1: the Claude Cowork plugin a new site gets) is never a
      // pass: a new Publish waits for it, a published template only warns (ADR 0029)
      const unread = rulesOf(p.notChecked)
      const at = str(p.checkedAt)
      const when = at ? ` on ${at.slice(0, 16).replace('T', ' ')} UTC` : ''
      const names = unread.map((r) => r.rule).join(', ') || tr('cms-readiness.customize.unchecked.aRule')
      return g(tr('cms-readiness.customize.unchecked.title', { step: STEP_TITLE.customize, rules: names }), {
        detail:
          s.code === 'customize-live-unchecked'
            ? tr('cms-readiness.customize.unchecked.live')
            : at
              ? tr('cms-readiness.customize.unchecked.detailAt', { at: at.slice(0, 16).replace('T', ' ') })
              : tr('cms-readiness.customize.unchecked.detail'),
        checkAgain: true,
        outside: {
          label: tr('cms-readiness.outside.devTeam'),
          text: `Release ${ctx.tag}: the Customize your site check${when} could not read ${unread.map((r) => `${r.rule} (${r.message})`).join('; ') || 'a rule'}. Make sure the Claude Cowork plugin release a new site gets is uploaded and reachable, then press Check again.`,
          doc: CUSTOMIZE_DOC
        }
      })
    }
    case 'customize-must-fix':
    case 'customize-worth-fixing':
    case 'customize-live-failing':
    case 'customize-ready': {
      const rules = { mustFix: rulesOf(p.mustFix), worthFixing: rulesOf(p.worthFixing) }
      const failing = [...rules.mustFix, ...rules.worthFixing]
      // A prompt only where the fix is outside Tracy: a rule only Tracy can fix goes to the dev team.
      const inTemplate = failing.some((r) => r.owner !== 'tracy')
      const title = tr('cms-readiness.common.score', {
        step: STEP_TITLE.customize,
        passed: Number(p.passed ?? 0),
        total: Number(p.total ?? 0)
      })
      return g(title, {
        detail: s.code === 'customize-live-failing' ? tr('cms-readiness.common.liveFixNext') : undefined,
        rules: failing.length > 0 ? rules : undefined,
        checkAgain: true,
        outside:
          failing.length === 0
            ? undefined
            : inTemplate
              ? customizeOutside(ctx, rules)
              : {
                  label: tr('cms-readiness.outside.devTeam'),
                  text: `Release ${ctx.tag}: the Customize your site check fails ${failing.map((r) => `${r.rule} (${r.message})`).join('; ')}. Only Tracy can fix these.`,
                  doc: CUSTOMIZE_DOC
                }
      })
    }
    // 5. Design system (ADR 0031): the Template Design System Readiness check of this version
    case 'ds-waiting':
      return g(STEP_TITLE['design-system'])
    case 'ds-not-checked':
      return g(STEP_TITLE['design-system'], {
        detail: tr('cms-readiness.common.notCheckedYet'),
        checkAgain: true
      })
    case 'ds-checking':
      return g(STEP_TITLE['design-system'], { detail: tr('cms-readiness.common.checkingNow') })
    case 'ds-error':
      return g(STEP_TITLE['design-system'], {
        detail: tr('cms-readiness.common.couldNotCheck', {
          reason: str(p.reason) ?? tr('cms-readiness.noReason')
        }).slice(0, 90),
        checkAgain: true
      })
    case 'ds-not-at-probe': {
      // no measurement at the current preview probe: that alone, no grade, no ratio, no rule groups
      // built from older evidence; the prompt is the measure commands (Akemi 16/10/2026)
      const gap = (p.notAtProbe ?? {}) as { current?: unknown; measured?: unknown; measure?: unknown }
      const probe = Number(gap.current ?? 0)
      const older = typeof gap.measured === 'number' ? gap.measured : null
      const measure = str(gap.measure)
      return g(tr('cms-readiness.ds.notAtProbe', { step: STEP_TITLE['design-system'], probe }), {
        detail: `${
          older === null
            ? tr('cms-readiness.ds.notAtProbe.none', { version: own.version, probe })
            : tr('cms-readiness.ds.notAtProbe.older', { version: own.version, older })
        } ${s.state === 'todo' ? tr('cms-readiness.ds.publishWaits') : tr('cms-readiness.ds.staysLive')}`,
        checkAgain: true,
        outside: {
          label: claudeCode(),
          text: [
            `The Design system check of the release ${ctx.tag} (${ctx.cms}${ctx.version ? ` ${ctx.version}` : ''}) on ${REPO} has no measurement at the current preview probe v${probe}, so it was not judged. Measure it first, with the tdsr skill (.agents/skills/tdsr/SKILL.md in tch).`,
            measure ??
              'Measure it with the tdsr skill and commit the design-system-measurement.json it writes.',
            'Stop before every commit, push, PR, release and upload, and wait for my go.',
            'Then tell me to press Check again on Design system in the Road to live on /ops: the rules it fails show once it is measured.'
          ].join('\n'),
          doc: DS_DOC
        }
      })
    }
    case 'ds-must-fix':
    case 'ds-worth-fixing':
    case 'ds-not-measured':
    case 'ds-live-failing':
    case 'ds-ready': {
      // the built-site rules are scored from a measurement file (spec decision 15): the title carries
      // the grade (A / B / C), the detail says which run the numbers came from, or that none did yet
      const rules = {
        mustFix: rulesOf(p.mustFix),
        worthFixing: rulesOf(p.worthFixing),
        unmeasured: rulesOf(p.unmeasured),
        passed: rulesOf(p.measuredPassed)
      }
      const failing = [...rules.mustFix, ...rules.worthFixing, ...rules.unmeasured]
      const grade = str(p.grade)
      const measuredOn = str(p.measuredOn)
      const evidence = str(p.evidence)
      return g(
        tr(grade ? 'cms-readiness.common.scoreGraded' : 'cms-readiness.common.score', {
          step: STEP_TITLE['design-system'],
          grade: grade ?? '',
          passed: Number(p.passed ?? 0),
          total: Number(p.total ?? 0)
        }),
        {
          detail:
            s.code === 'ds-live-failing'
              ? tr('cms-readiness.common.liveFixNext')
              : measuredOn
                ? tr('cms-readiness.ds.measuredOn', { when: measuredOn })
                : rules.unmeasured.length > 0
                  ? p.unmeasuredHolds === true && s.state === 'todo'
                    ? tr('cms-readiness.ds.notMeasuredHolds', { version: own.version })
                    : tr('cms-readiness.ds.notMeasured', { version: own.version })
                  : undefined,
          // the rows carry "Measured on" each, so a pass is listed too: pass, fail, Not measured yet
          rules: failing.length > 0 || rules.passed.length > 0 ? rules : undefined,
          evidence:
            evidence && /^[\w./-]+$/.test(evidence) && !evidence.includes('..')
              ? { label: tr('cms-readiness.evidence.label'), href: `${DOCS}${evidence}` }
              : undefined,
          checkAgain: true,
          outside: failing.length === 0 ? undefined : designSystemOutside(ctx, rules)
        }
      )
    }
    // 6. Demo
    case 'demo-live':
      return g(tr('cms-readiness.demo.live'), {
        detail: str(p.version)
          ? tr('cms-readiness.demo.live.detail', { version: String(p.version) })
          : undefined
      })
    case 'demo-version':
      return g(tr('cms-readiness.demo.older'), {
        detail: tr('cms-readiness.demo.older.detail', {
          demoVersion: String(p.demoVersion),
          version: String(p.version)
        }),
        ops: {
          target: demoSite(),
          steps: [
            tr('cms-readiness.demo.older.step1', { version: String(p.version) }),
            tr('cms-readiness.demo.older.step2', { version: String(p.version) })
          ]
        }
      })
    case 'no-demo':
      return g(tr('cms-readiness.demo.none'), {
        ops: {
          target: demoSite(),
          steps: [tr('cms-readiness.demo.none.step1'), tr('cms-readiness.demo.none.step2')]
        }
      })
    case 'demo-failed': {
      // The raw reason stays on the Demo Site row, where it is shown already; Go there leads there.
      const failure = failedInstallGuide(str(p.reason), str(p.step))
      const ran = str(p.version)
      const latest = str(p.releaseVersion)
      const facts = [
        ran ? tr('cms-readiness.demo.failed.on', { version: ran }) : tr('cms-readiness.demo.failed.install'),
        ran && latest && ran !== latest ? tr('cms-readiness.demo.failed.retry', { version: latest }) : null,
        failure.whatToDo
      ].filter((x): x is string => x !== null)
      return g(tr('cms-readiness.demo.failed'), {
        detail: facts.join(' '),
        ops: { target: demoSite(), steps: failure.howTo }
      })
    }
    // 7. Listing
    case 'listing-saved':
      return g(tr(p.hidden === true ? 'cms-readiness.listing.savedHidden' : 'cms-readiness.listing.saved'))
    case 'listing-incomplete': {
      // A saved listing that lacks pages of the release (its tracy_site_pages.json, top-level, at
      // most six), carries pages a listing does not show (Login, a 404, a language switch, a legal
      // page) or lacks a desktop picture. Published, it only warns: customers keep seeing it.
      type Page = { label?: string; path?: string }
      const pagesIn = (v: unknown) => (Array.isArray(v) ? (v as Page[]) : [])
      const missing = pagesIn(p.missing)
      const forbidden = pagesIn(p.forbidden)
      const noDesktop = Number(p.noDesktop ?? 0)
      // One fact line under 90 characters: pages with their paths, else their names, else a count.
      const said = (pages: Page[]) => [
        pages.map((m) => `${String(m.label)} (${String(m.path)})`).join(', '),
        pages.map((m) => String(m.label)).join(', '),
        tr('cms-readiness.listing.pageCount', { count: pages.length })
      ]
      const pictures = noDesktop > 0 ? tr('cms-readiness.listing.noDesktop', { count: noDesktop }) : ''
      const variants = [0, 1, 2].map((i) =>
        [
          missing.length > 0 ? tr('cms-readiness.listing.missing', { pages: said(missing)[i] }) : '',
          forbidden.length > 0 ? tr('cms-readiness.listing.remove', { pages: said(forbidden)[i] }) : '',
          pictures
        ]
          .filter((x) => x !== '')
          .join(' ')
      )
      const detail = variants.find((f) => f.length <= 90) ?? variants[2]
      return g(
        missing.length > 0
          ? tr('cms-readiness.listing.missesPages')
          : forbidden.length > 0
            ? tr('cms-readiness.listing.systemPages')
            : tr('cms-readiness.listing.missesPictures'),
        {
          detail,
          ops: {
            target: editListing(),
            steps: [
              ...(missing.length > 0 ? [tr('cms-readiness.listing.step.addLayout')] : []),
              ...(forbidden.length > 0 ? [tr('cms-readiness.listing.step.removePages')] : []),
              tr('cms-readiness.listing.step.update')
            ]
          }
        }
      )
    }
    case 'no-listing':
      // The listing waits for the demo (Akemi, 11/10/2026): the road blocks it while no demo is live,
      // since Create listing fills the form and takes the pictures from it. Should the server still
      // send it as to do without a demo, the one advice is the same: install the demo first.
      return p.demo === false
        ? g(tr('cms-readiness.listing.none'), {
            detail: tr('cms-readiness.common.installDemoFirst'),
            ops: { target: demoSite(), steps: [tr('cms-readiness.listing.none.installDemo')] }
          })
        : g(tr('cms-readiness.listing.none'), {
            ops: {
              target: createListing(),
              steps: [tr('cms-readiness.listing.none.create'), tr('cms-readiness.listing.none.save')]
            }
          })
    // 8. Published
    case 'published':
      return g(STEP_TITLE.published, { detail: tr('cms-readiness.published.done.detail') })
    case 'not-published':
      return g(tr('cms-readiness.published.not'))
    case 'ready-to-publish':
      return g(tr('cms-readiness.published.ready'), {
        detail: tr('cms-readiness.published.ready.detail'),
        ops: { target: publishListing(), steps: [tr('cms-readiness.published.ready.step', { cms: ctx.cms })] }
      })
    case 'not-showable': {
      const reason = str(p.why)
      return g(tr('cms-readiness.published.hidden'), {
        detail: reason ?? tr('cms-readiness.published.hidden.detail'),
        outside: {
          label: tr('cms-readiness.outside.devTeam'),
          text: `Release ${ctx.tag}: every step before Publish is done, yet Tracy would still not show the listing.${reason ? ` Reason: ${reason}` : ''}`,
          doc: RELEASE_DOC
        }
      })
    }
    // 9. Polish
    case 'polish-done':
      return g(tr('cms-readiness.polish.done'))
    case 'polish': {
      const items = Array.isArray(p.items)
        ? (p.items as { code: string; params: Record<string, unknown> }[])
        : []
      const pages = items.some((i) => i.code === 'no-pages-file')
      const onCard = items.filter((i) => i.code !== 'no-pages-file')
      return g(
        s.state === 'blocked' ? STEP_TITLE.polish : tr('cms-readiness.polish.count', { count: items.length }),
        {
          detail:
            items.length > 0
              ? tr('cms-readiness.polish.missing', {
                  items: items
                    .map((i) => (Object.hasOwn(POLISH_WORD, i.code) ? tr(POLISH_WORD[i.code]) : i.code))
                    .join(', ')
                })
              : undefined,
          ops:
            onCard.length > 0
              ? { target: editListing(), steps: [tr('cms-readiness.polish.step')] }
              : undefined,
          outside: pages ? pagesOutside(ctx) : undefined
        }
      )
    }
    default:
      return g(STEP_TITLE[s.step] ?? s.code)
  }
}

/**
 * The line a blocked step shows: what it waits for. Publish names EVERY step it still needs (the
 * server's `params.waiting`), so it never says step 5 while step 3 is missing too.
 */
export function waitingLine(s: RoadStep): string | null {
  if (s.state !== 'blocked' || !s.blockedBy) return null
  // The demo waits for the contract for one reason, said instead of the step's bare name.
  if (s.step === 'demo' && s.blockedBy === 'contract')
    return tr('cms-readiness.waiting.contract', { n: stepNumber('contract') })
  const all = list(s.params?.waiting).filter((n): n is StepName => ROAD_ORDER.includes(n as StepName))
  const steps = all.length > 0 ? all : [s.blockedBy]
  if (steps.length === 1)
    return tr('cms-readiness.waiting.one', { n: stepNumber(steps[0]), title: STEP_TITLE[steps[0]] })
  const numbers = steps.map(stepNumber)
  return tr('cms-readiness.waiting.many', {
    numbers: numbers.slice(0, -1).join(', '),
    last: String(numbers.at(-1)),
    titles: steps.map((n) => STEP_TITLE[n]).join(', ')
  })
}

/**
 * Why Save listing (or Create listing) is off, by code: the rules the listing form checks before it
 * sends anything (`DesignInspiration.tsx`). The server checks the card again (`composeCard`).
 */
export type ListingRule =
  | 'demo-required'
  | 'pages-need-label-and-path'
  | 'pages-shooting'
  | 'layout-no-desktop'
  | 'picture-not-held'
  | 'no-category'
  | 'no-blurb'
  | 'no-home-picture'
  | 'no-thumbnail'

export function listingRuleText(code: ListingRule, params: Record<string, unknown> = {}): string {
  switch (code) {
    case 'demo-required':
      return tr('cms-readiness.common.installDemoFirst')
    case 'pages-need-label-and-path':
      return typeof params.count === 'number'
        ? tr('cms-readiness.listingRule.pagesNeedLabel', { count: params.count })
        : tr('cms-readiness.listingRule.pagesNeedLabel_other', { count: String(params.count) })
    case 'pages-shooting':
      return tr('cms-readiness.listingRule.pagesShooting')
    case 'layout-no-desktop':
      return tr('cms-readiness.listingRule.layoutNoDesktop', {
        missing: String(params.missing),
        total: String(params.total)
      })
    case 'picture-not-held':
      return tr('cms-readiness.listingRule.pictureNotHeld', { files: list(params.files).join(', ') })
    case 'no-category':
      return tr('cms-readiness.listingRule.noCategory')
    case 'no-blurb':
      return tr('cms-readiness.listingRule.noBlurb')
    case 'no-home-picture':
      return tr('cms-readiness.listingRule.noHomePicture')
    case 'no-thumbnail':
      return tr('cms-readiness.listingRule.noThumbnail')
  }
}
