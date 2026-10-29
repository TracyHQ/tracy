/**
 * MOCK DATA, part two: the per-screen tables. Same rules as `fixtures.ts` — hand-copied on
 * 2026-09-12 from commit `d0da35c55`, nothing fetched, nothing invented that is not labelled.
 *
 * Kept apart from `fixtures.ts` only for size. The split is by screen, not by trust: both files
 * are equally stale the moment somebody edits the sources they were copied from.
 */
import type { Cms, Provenance, Status } from './fixtures'

// ── M02 · the stages each CMS really has ─────────────────────────────────────────────────────

/**
 * SIX STAGES PER CMS, AND NO LAYER ABOVE THEM (Lee, 12/09).
 *
 * An earlier draft laid a proposed eight-step chain over both CMS and mapped each step onto a real
 * stage. It read well and it was wrong in the one way that matters: it implied a shared model that
 * nothing in the code shares. `makeStages()` is written twice, the arrays differ at position two
 * (`template` on Joomla, `theme` on WordPress), and the two `copy` stages are not even the same
 * function — Joomla has its own, WordPress uses the shared one, and they refuse on different
 * grounds. So there are two diagrams here, they are unrelated, and EmDash has none at all.
 *
 * Stage ids and order are `STAGES` in each `src/host/stages.mjs`. Every `detail` quoted below is
 * the string that file returns, copied verbatim on 12/09.
 */
export type Executor = 'agent' | 'plugin' | 'script' | 'cowork' | 'none'

export const EXECUTOR_LABEL: Record<Executor, string> = {
  agent: 'Agent, in the session',
  plugin: 'Plugin in the dsh page',
  script: 'Pipeline script on the host',
  cowork: 'Claude Cowork plugin, inside the site',
  none: 'Nobody — no code runs here'
}

export interface Stage {
  /** The id in `STAGES`, exactly as the array spells it. */
  id: string
  /** What the stage does, in the fewest words that stay true. */
  label: string
  status: Status
  executor: Executor
  input: string
  output: string
  /** Tool, skill and door ids this stage leans on, as the agent or the host sees them. */
  uses: readonly string[]
  contract: string
  /** When it runs, and what makes it refuse. */
  condition: string
  /** The sentence the customer sees when the stage parks or fails. Verbatim where one exists. */
  waiting?: string
  /** The line a `done` stage answers with. Verbatim. */
  done?: string
  note: string
  /** The file that implements it. */
  source: string
  provenance: Provenance
}

const JOOMLA_STAGES: readonly Stage[] = [
  {
    id: 'check',
    label: 'Is this site the quickstart this design needs',
    status: 'blocked',
    executor: 'cowork',
    input: 'The chosen design inspiration, and whatever the site answers to `inspect`.',
    output: 'A verdict, and nothing else — this stage writes nothing.',
    uses: ['content.contract · inspect'],
    contract: 'tracy-apple/j6/1.1.0',
    condition:
      'Refuses any inspiration other than `apple`, then refuses any installed contract id other than `tracy-apple/j6/1.1.0`.',
    waiting: 'This design does not yet have a released quickstart content/display contract.',
    done: 'The installed quickstart matches its content and display contract.',
    note: 'This is where 151 of the 152 design systems stop, and it stops them AFTER the customer has chosen.',
    source: 'packages/site/tracy-site-build-joomla/src/host/stages.mjs',
    provenance: 'surveyed'
  },
  {
    id: 'template',
    label: 'Leave the quickstart template alone',
    status: 'ready',
    executor: 'cowork',
    input: 'The installed quickstart.',
    output: 'Nothing changes. The stage inspects and reports.',
    uses: ['content.contract · inspect'],
    contract: 'tracy-apple/j6/1.1.0',
    condition: 'Always runs; the only failure is the Claude Cowork plugin not answering.',
    done: 'The original quickstart template is preserved.',
    note: 'Named `template` and it installs no template — the template arrived inside the archive. Installing a second one, Airbnb, is the provider still marked `pending`.',
    source: 'packages/site/tracy-site-build-joomla/src/host/stages.mjs',
    provenance: 'surveyed'
  },
  {
    id: 'style',
    label: 'Lock the layout',
    status: 'ready',
    executor: 'cowork',
    input: 'The presentation lock of the installed contract.',
    output: 'Layouts, modules, menus and access rules bound.',
    uses: ['content.contract · bind'],
    contract: 'tracy-apple/j6/1.1.0',
    condition: 'Runs after `check` accepted the contract id.',
    done: 'Original layouts, modules, menus and access rules are locked.',
    note: 'The one stage whose whole job is to take away permission. After it, `seed` can write words and nothing else.',
    source: 'packages/site/tracy-site-build-joomla/src/host/stages.mjs',
    provenance: 'surveyed'
  },
  {
    id: 'copy',
    label: 'Collect the customer’s words',
    status: 'ready',
    executor: 'script',
    input: 'The answers from the Build tab.',
    output: '`design-preview.json` with `site` and `chosen`.',
    uses: ['siteFromAnswers'],
    contract: 'tracy-apple/j6/1.1.0',
    condition:
      'Parks on `form:name,about` when either is empty, and again when the language list is anything other than exactly `["en"]`.',
    waiting:
      'Additional languages require a versioned quickstart profile; this contract preserves the original menu and language structure.',
    done: 'Customer inputs are ready for the existing quickstart slots.',
    note: '🔒 NOT the same function as WordPress’s `copy`. This one is written in the Joomla plugin, writes the preview itself, and calls no model.',
    source: 'packages/site/tracy-site-build-joomla/src/host/stages.mjs',
    provenance: 'surveyed'
  },
  {
    id: 'seed',
    label: 'Write the pages',
    status: 'ready',
    executor: 'script',
    input: '`design-preview.json` and `design-copy/<id>.json`.',
    output: 'Pages, posts and menu entries written into the existing slots.',
    uses: ['tracy-seed', 'content.contract · apply'],
    contract: 'tracy-apple/j6/1.1.0',
    condition: 'Parks on `CONTENT_REQUIRED:` when the seeder finds a slot it has nothing to put in.',
    note: 'Shared with WordPress — the same `seedStage`. What differs is where the writes leave through: here, the contract door, so the lock is enforced rather than trusted.',
    source: 'packages/site/tracy-site-build-core/src/host/stages-shared.mjs · seedStage',
    provenance: 'surveyed'
  },
  {
    id: 'shot',
    label: 'Photograph the result',
    status: 'not-verified',
    executor: 'script',
    input: 'The site’s public address, carried on the job.',
    output: 'One screenshot shown to the customer.',
    uses: ['chrome'],
    contract: '—',
    condition:
      'Skips when there is no browser, no address, or the address answers anything but 200 — a draft behind sign-in is skipped, not photographed.',
    waiting: 'This draft needs sign-in; view it in the Live site tab.',
    note: 'Nothing compares the picture to anything. "The build worked" is still a person looking at it.',
    source: 'packages/site/tracy-site-build-core/src/host/stages-shared.mjs · shotStage',
    provenance: 'surveyed'
  }
]

const WORDPRESS_STAGES: readonly Stage[] = [
  {
    id: 'check',
    label: 'Is this site a WordPress site, and is the design real',
    status: 'ready',
    executor: 'cowork',
    input: 'The chosen design inspiration, and `core.manifest` from the site.',
    output: 'A verdict, plus the released theme package it found.',
    uses: ['core.manifest', 'releasedPackage'],
    contract: '—',
    condition:
      'Refuses a `brand:` inspiration, an id that is not in the library, a site whose manifest names another CMS, and a release it cannot reach.',
    waiting:
      'A brand has no theme style yet — pick a design system for now; brand styles come with the next theme.',
    note: 'Shared `checkStage`. Any of the 152 passes here — the asymmetry with Joomla starts at this stage and never closes.',
    source: 'packages/site/tracy-site-build-core/src/host/stages-shared.mjs · checkStage',
    provenance: 'surveyed'
  },
  {
    id: 'theme',
    label: 'Install and switch on the theme',
    status: 'ready',
    executor: 'cowork',
    input: 'The released `tracy` theme package, read from the public update manifest.',
    output: 'Theme installed and active. Polylang too, when more than one language was asked for.',
    uses: ['theme.list', 'theme.install', 'theme.activate', 'plugin.install', 'plugin.activate'],
    contract: '—',
    condition:
      'Matches an existing theme on BOTH `stylesheet` and `name` — matching on one found nothing on a site that already had it, and the build installed it twice.',
    done: 'tracy installed on <site>',
    note: '🔒 Polylang failing is a WARNING, never a failure: a site missing a translation is not a site missing its look. The task list reads exactly `polylang on` as success.',
    source: 'packages/site/tracy-site-build-wordpress/src/host/stages.mjs',
    provenance: 'surveyed'
  },
  {
    id: 'style',
    label: 'Switch on the style variation',
    status: 'ready',
    executor: 'cowork',
    input: 'The design id, stripped to `[a-z0-9-]`.',
    output: 'One of 152 style variations active on the theme.',
    uses: ['theme.style'],
    contract: '—',
    condition:
      'Fails when the installed component is too old to know the action — a version to upgrade, not a bug to hunt.',
    done: '<design> on <site>',
    note: 'Joomla’s stage of the same name does the opposite: it binds a lock. Same word, unrelated work.',
    source: 'packages/site/tracy-site-build-wordpress/src/host/stages.mjs',
    provenance: 'surveyed'
  },
  {
    id: 'copy',
    label: 'Write the customer’s words, one take per language',
    status: 'ready',
    executor: 'agent',
    input: 'The answers, plus whatever the preview already held.',
    output: '`design-copy/<id>.json`, and `<id>.<lang>.json` for every further language.',
    uses: ['copyHome', 'briefOf'],
    contract: '—',
    condition:
      'Parks on `form:name,about` when there is no name, or no words at all — `about`, `headline` or `sub`, any one will do.',
    waiting: 'Tracy needs a little more before writing your words.',
    note: '🔒 NOT the same function as Joomla’s `copy`. This one calls a model, once per language, and every requested language is required — a missing translation leaves a failed stage to retry.',
    source: 'packages/site/tracy-site-build-core/src/host/stages-shared.mjs · copyStage',
    provenance: 'surveyed'
  },
  {
    id: 'seed',
    label: 'Write the pages',
    status: 'ready',
    executor: 'script',
    input: '`design-preview.json` and `design-copy/<id>.json`.',
    output: 'Pages, posts and menus written with the `wp` CLI.',
    uses: ['tracy-seed', 'wp'],
    contract: '—',
    condition: 'Parks on `CONTENT_REQUIRED:` the same way Joomla does.',
    note: 'Same `seedStage`, and the writes land in the database with no lock in the way — there is no contract on a WordPress site to check them against.',
    source: 'packages/site/tracy-site-build-core/src/host/stages-shared.mjs · seedStage',
    provenance: 'surveyed'
  },
  {
    id: 'shot',
    label: 'Photograph the result',
    status: 'not-verified',
    executor: 'script',
    input: 'The site’s public address, carried on the job.',
    output: 'One screenshot shown to the customer.',
    uses: ['chrome'],
    contract: '—',
    condition: 'Same skips as Joomla: no browser, no address, or an address that does not answer 200.',
    waiting: 'This draft needs sign-in; view it in the Live site tab.',
    note: 'Same gap as Joomla — nothing checks the picture.',
    source: 'packages/site/tracy-site-build-core/src/host/stages-shared.mjs · shotStage',
    provenance: 'surveyed'
  }
]

/** EmDash has no `stages.mjs` at all, which is a different thing from having empty stages. */
export const STAGES: Record<Cms, readonly Stage[]> = {
  joomla: JOOMLA_STAGES,
  wordpress: WORDPRESS_STAGES,
  emdash: []
}

/** What EmDash does have, so the empty diagram can say it rather than just being empty. */
export const EMDASH_HAS: readonly { what: string; where: string; but: string }[] = [
  {
    what: '4 presets that boot',
    where: 'packages/bundle/tracy-cowork/presets/*-emdash/',
    but: 'They carry no EmDash tool or skill — the platform overlay is empty.'
  },
  {
    what: 'A provision script',
    where: 'packages/fleet/tracy-fleet-operation/scripts/provision/emdash/',
    but: 'It stands a site up. Nothing then knows how to build one.'
  },
  {
    what: 'A place in the design library',
    where: 'the same 152 design systems',
    but: 'Nothing consumes a chosen design for EmDash, because there is no theme to apply it to.'
  }
]
// ── M03 · bases and template mapping ─────────────────────────────────────────────────────────

export interface Base {
  id: string
  cms: Cms
  version: string
  cowork: string
  contract: string
  status: Status
  artifacts: readonly {
    name: string
    kind: string
    bytes: number | null
    sha256: string | null
    source: string
  }[]
  compat: string
  provenance: Provenance
}

export const BASES: readonly Base[] = [
  {
    id: 'tracy-apple/j6',
    cms: 'joomla',
    version: '1.1.0',
    cowork: 'pkg_claudecowork 0.14.0',
    contract: 'tracy-apple/j6/1.1.0',
    status: 'ready',
    artifacts: [
      {
        name: 'tracy-apple-j6-webroot-1.1.0.tar.gz',
        kind: 'webroot',
        bytes: 58407213,
        sha256: '90e91e51af5c3dde6f731997e35f0d48ed381c6bfef82fe7f726a92f27f3e4eb',
        source: 'JoomlArt-Products/joomlart-products · release tracy-apple/j6'
      },
      {
        name: 'tracy-apple-j6-database-1.1.0.sql.gz',
        kind: 'database',
        bytes: 191683,
        sha256: '20e3987b05ce77b9ca37ab8add76492cd7d5efcf3fc6a3f6832ae99c6b9537ba',
        source: 'JoomlArt-Products/joomlart-products · release tracy-apple/j6'
      },
      {
        name: 'pkg_claudecowork.zip',
        kind: 'cowork',
        bytes: 403669,
        sha256: '9e9ec0d9a563d9253fdaef9f8b17eedff397e68e7fdc75c3a138d33dac0c2d44',
        source: 'TracyHQ/claude-cowork · release joomla-v0.14.0-contract.3'
      }
    ],
    compat: 'Joomla 6 only (`platformMajors: [6]`). Extensions: template `tracy`, system plugin `t4`.',
    provenance: 'surveyed'
  },
  {
    id: 'wordpress · fresh install',
    cms: 'wordpress',
    version: 'no base version',
    cowork: '—',
    contract: '—',
    status: 'ready',
    artifacts: [
      {
        name: 'tracy block theme',
        kind: 'theme',
        bytes: null,
        sha256: null,
        source: 'packages/cms/tracy-wordpress-theme — built in this repo, no release pinned here'
      }
    ],
    compat:
      'Any WordPress the host installs. Polylang is added only when more than one language is asked for.',
    provenance: 'surveyed'
  },
  {
    id: 'emdash',
    cms: 'emdash',
    version: '—',
    cowork: '—',
    contract: '—',
    status: 'pending',
    artifacts: [],
    compat: 'Undecided.',
    provenance: 'surveyed'
  }
]

export interface Mapping {
  design: string
  designLabel: string
  cms: Cms
  base: string
  /** The template or style variation that has to be installed, or null when nothing exists. */
  template: string | null
  /** What the customer would actually get. Never guessed: `null` means the build refuses. */
  effective: string | null
  status: Status
  reason: string
  provenance: Provenance
}

/**
 * A SAMPLE of the mapping table, not the whole thing.
 *
 * The real table would have one row per design system per CMS — 152 × 2. Eight rows are enough to
 * judge the shape, and the header says the sample size so nobody reads "8 rows" as "8 designs".
 */
export const MAPPINGS: readonly Mapping[] = [
  {
    design: 'apple',
    designLabel: 'Apple',
    cms: 'joomla',
    base: 'tracy-apple/j6 1.1.0',
    template: 'bundled in the quickstart',
    effective: 'apple',
    status: 'ready',
    reason: 'Provider `tracy-apple-j6` is `ready`, and the `check` stage accepts this one id.',
    provenance: 'surveyed'
  },
  {
    design: 'airbnb',
    designLabel: 'Airbnb',
    cms: 'joomla',
    base: 'tracy-apple/j6 1.1.0',
    template: 'tpl_tracy_airbnb-j6-1.0.0.zip · 822 KB · pinned',
    effective: null,
    status: 'pending',
    reason:
      'The package is in the catalogue with a sha256, and the provider is `pending`: "This change requires a separately versioned quickstart content and display contract."',
    provenance: 'surveyed'
  },
  {
    design: 'bmw',
    designLabel: 'BMW',
    cms: 'joomla',
    base: 'tracy-apple/j6 1.1.0',
    template: null,
    effective: null,
    status: 'missing',
    reason:
      'No template artifact is declared for this design system. Nothing to download, nothing to install.',
    provenance: 'surveyed'
  },
  {
    design: 'cal',
    designLabel: 'Cal',
    cms: 'joomla',
    base: 'tracy-apple/j6 1.1.0',
    template: null,
    effective: 'apple',
    status: 'pending',
    reason:
      'Planned fallback: a valid design with no template would build on Apple, and the customer would be told BEFORE the site is created. Not implemented — today the build refuses instead.',
    provenance: 'planned'
  },
  {
    design: 'linear',
    designLabel: 'Linear',
    cms: 'joomla',
    base: 'tracy-apple/j6 1.1.0',
    template: 'tpl_tracy_linear-j6-1.0.0.zip · declared',
    effective: null,
    status: 'error',
    reason:
      'Simulated: the release asset answered 404 when the host fetched it. The package is declared and reachable in the catalogue — the download is what failed, which is a different repair from a missing package.',
    provenance: 'simulated'
  },
  {
    design: 'apple',
    designLabel: 'Apple',
    cms: 'wordpress',
    base: 'fresh install',
    template: 'style variation `apple` in the `tracy` theme',
    effective: 'apple',
    status: 'ready',
    reason: 'One of 152 variations generated from the vendor catalogue into the block theme.',
    provenance: 'surveyed'
  },
  {
    design: 'airbnb',
    designLabel: 'Airbnb',
    cms: 'wordpress',
    base: 'fresh install',
    template: 'style variation `airbnb` in the `tracy` theme',
    effective: 'airbnb',
    status: 'ready',
    reason: 'Same generator, same catalogue. WordPress needs no separate artifact per design.',
    provenance: 'surveyed'
  },
  {
    design: 'apple',
    designLabel: 'Apple',
    cms: 'emdash',
    base: '—',
    template: null,
    effective: null,
    status: 'pending',
    reason: 'No EmDash theme exists, so no design system resolves to anything.',
    provenance: 'surveyed'
  }
]

// ── M05 · tools and skills ───────────────────────────────────────────────────────────────────

/**
 * The three layers, kept apart on purpose.
 *
 * `declared` is a line in a preset or a plugin manifest. `loaded` is dsh having mounted it at boot.
 * `allowed` is whether this particular site lets the call through. A tool can be all three and
 * still refuse a specific path, which is the fourth column.
 */
export interface Tool {
  name: string
  purpose: string
  source: string
  declaredIn: string
  declared: boolean
  loaded: boolean
  /** Per-site verdict for the sample site below. */
  allowed: boolean
  /** The verbatim refusal, when there is one. */
  refusal: string | null
  fence: string
  /**
   * The real stages that invoke this tool, by stage id. EMPTY IS THE COMMON ANSWER and it is not a
   * gap: most of these are things the AGENT calls in a session, while a stage is host code. A
   * screen that filed every tool under a stage would invent a pipeline nobody wrote.
   */
  stages: readonly string[]
  roles: readonly string[]
  cms: readonly Cms[]
  provenance: Provenance
}

/** The site every "allowed" column below is answered for. Fake label, real shape. */
export const SAMPLE_SITE = {
  label: 'tchdemo9',
  cms: 'joomla' as Cms,
  contract: 'tracy-apple/j6/1.1.0',
  policyFile: '/site/.content-contracts/tchdemo9.json',
  root: '/site/tchdemo9'
}

export const TOOLS: readonly Tool[] = [
  {
    name: 'bash',
    purpose: 'Run a shell command inside the site container.',
    source: '@deepseek-ai/dsh-tool-bash',
    declaredIn: 'presets/<role>-<cms>/agent.cordis.yml · row `tool-bash`',
    declared: true,
    loaded: true,
    allowed: false,
    refusal:
      'This quickstart allows content-contract tools only; shell, terminal and other write paths are disabled.',
    fence: "`workdir` is fenced to the session's site root; the command text itself is never read as a path.",
    stages: [],
    roles: ['designer', 'developer', 'writer', 'seo-geo'],
    cms: ['joomla', 'wordpress', 'emdash'],
    provenance: 'surveyed'
  },
  {
    name: 'terminal_open',
    purpose: 'Open an interactive terminal in the container.',
    source: '@deepseek-ai/dsh-tool-bash',
    declaredIn: 'presets/<role>-<cms>/agent.cordis.yml',
    declared: true,
    loaded: true,
    allowed: false,
    refusal:
      'This quickstart allows content-contract tools only; shell, terminal and other write paths are disabled.',
    fence: '`cwd` is fenced to the site root.',
    stages: [],
    roles: ['developer'],
    cms: ['joomla', 'wordpress', 'emdash'],
    provenance: 'surveyed'
  },
  {
    name: 'write',
    purpose: 'Write a file.',
    source: '@deepseek-ai/dsh-tool-fs',
    declaredIn: 'presets/<role>-<cms>/agent.cordis.yml · row `tool-fs`',
    declared: true,
    loaded: true,
    allowed: true,
    refusal: 'Only draft files in docs/agents are accessible; use tracy_site to read or change site content.',
    fence:
      '`file_path` is fenced. Under a content contract the fence narrows from the whole site root to `<site>/docs/agents/**`.',
    stages: [],
    roles: ['designer', 'developer', 'writer', 'seo-geo'],
    cms: ['joomla', 'wordpress', 'emdash'],
    provenance: 'surveyed'
  },
  {
    name: 'read',
    purpose: 'Read a file.',
    source: '@deepseek-ai/dsh-tool-fs',
    declaredIn: 'presets/<role>-<cms>/agent.cordis.yml · row `tool-fs`',
    declared: true,
    loaded: true,
    allowed: true,
    refusal: null,
    fence: '`file_path` is fenced to the site root, and narrowed to `docs/agents/**` under a contract.',
    stages: [],
    roles: ['designer', 'developer', 'writer', 'seo-geo'],
    cms: ['joomla', 'wordpress', 'emdash'],
    provenance: 'surveyed'
  },
  {
    name: 'grep',
    purpose: 'Search file contents.',
    source: '@deepseek-ai/dsh-tool-fs-search',
    declaredIn: 'presets/<role>-<cms>/agent.cordis.yml · row `tool-fs-search`',
    declared: true,
    loaded: true,
    allowed: true,
    refusal: null,
    fence:
      '`path` is fenced; `pattern` and `include` are content, so a regex containing a slash is not a path.',
    stages: [],
    roles: ['developer', 'writer', 'seo-geo'],
    cms: ['joomla', 'wordpress', 'emdash'],
    provenance: 'surveyed'
  },
  {
    name: 'tracy_site',
    purpose: "Read and change site content through the seat book's Apply door.",
    source: '@tracy/dsh-site-tools',
    declaredIn: 'cordis.patch.yml of the plugin, then `ctx.tools.register()` at boot',
    declared: true,
    loaded: true,
    allowed: true,
    refusal: null,
    fence: 'No path argument. The door writes as the viewer, with their own cookie.',
    stages: [],
    roles: ['designer', 'writer', 'seo-geo'],
    cms: ['joomla', 'wordpress'],
    provenance: 'surveyed'
  },
  {
    name: 'tracy_design_propose',
    purpose: "Offer three design inspirations and record the customer's pick.",
    source: '@tracy/dsh-design-inspiration',
    declaredIn: 'cordis.patch.yml of the plugin',
    declared: true,
    loaded: true,
    allowed: true,
    refusal: null,
    fence: 'Writes only `docs/agents/design-preview.json`.',
    stages: ['copy'],
    roles: ['designer'],
    cms: ['joomla', 'wordpress', 'emdash'],
    provenance: 'surveyed'
  },
  {
    name: 'tracy_design_copy',
    purpose: "Write the customer's words into the chosen layout's slots.",
    source: '@tracy/dsh-design-inspiration',
    declaredIn: 'cordis.patch.yml of the plugin',
    declared: true,
    loaded: true,
    allowed: true,
    refusal: null,
    fence: 'Writes only under `docs/agents/design-copy/`.',
    stages: ['copy', 'seed'],
    roles: ['designer', 'writer'],
    cms: ['joomla', 'wordpress', 'emdash'],
    provenance: 'surveyed'
  },
  {
    name: 'tracy_brand',
    purpose: 'Extract a brand from a URL into a design inspiration.',
    source: '@tracy/dsh-brand-engine',
    declaredIn: 'cordis.patch.yml of the plugin',
    declared: true,
    loaded: true,
    allowed: true,
    refusal: null,
    fence: 'Writes under `Brand/<host>/` in the site folder.',
    stages: [],
    roles: ['designer'],
    cms: ['joomla', 'wordpress', 'emdash'],
    provenance: 'surveyed'
  },
  {
    name: 'tracy_site_build_joomla',
    purpose: 'Drive the Joomla build stages from inside the session.',
    source: '@tracy/dsh-site-build-joomla',
    declaredIn: 'cordis.patch.yml of the plugin',
    declared: true,
    loaded: true,
    allowed: true,
    refusal: null,
    fence: 'No path argument; every write goes through the contract door.',
    stages: ['check', 'template', 'style', 'copy', 'seed', 'shot'],
    roles: ['designer', 'developer'],
    cms: ['joomla'],
    provenance: 'surveyed'
  }
]

export interface Skill {
  id: string
  path: string
  source: string
  version: string | null
  condition: string
  /** An excerpt of the instructions, never the whole file. */
  excerpt: string
  /** Whether anything MACHINE-ENFORCES what the skill says. Usually nothing does. */
  enforced: string
  cms: readonly Cms[]
  provenance: Provenance
}

export const SKILLS: readonly Skill[] = [
  {
    id: 't4-framework-knowledge',
    path: 'packages/design/tracy-design-skill/skills/t4-framework-knowledge',
    source: 'Imported from TracyHQ/skills on 03/09',
    version: null,
    condition: 'Mounted from `/opt/tracy/skills` at rank 300. Read only when the agent decides to.',
    excerpt:
      "Layout changes belong in template overrides (templates/<template>/html/...), never in core files\nor an extension's own views — overrides survive updates and edits in place do not.\n\n[excerpt · the file is longer]",
    enforced:
      'Nothing enforces this. The path fence stops writes outside the site; it does not stop a write to a core file inside it.',
    cms: ['joomla'],
    provenance: 'surveyed'
  },
  {
    id: 'tracy-design-inspiration',
    path: 'packages/design/tracy-design-skill/skills/tracy-design-inspiration',
    source: 'This repo',
    version: null,
    condition: 'Mounted at rank 300. A customer skill of the same name in their workspace wins at rank 100.',
    excerpt:
      'Offer three inspirations, not a list of 152. Show the customer what each one looks like before\nasking them to choose.\n\n[excerpt]',
    enforced:
      '`tracy_design_propose` takes exactly three picks, so this one sentence IS enforced by the tool.',
    cms: ['joomla', 'wordpress', 'emdash'],
    provenance: 'surveyed'
  },
  {
    id: 'tracy-file-links',
    path: 'packages/design/tracy-design-skill/skills/tracy-file-links',
    source: 'This repo',
    version: null,
    condition: 'Mounted at rank 300.',
    excerpt: 'Link a file the customer can open, not a path they have to find.\n\n[excerpt]',
    enforced: 'Nothing. It is a writing convention.',
    cms: ['joomla', 'wordpress', 'emdash'],
    provenance: 'surveyed'
  }
]

// ── M06 · the brief ──────────────────────────────────────────────────────────────────────────

export type QuestionKind = 'text' | 'textarea' | 'multi' | 'choice'

export interface BriefQuestion {
  id: string
  order: number
  label: string
  kind: QuestionKind
  required: boolean
  defaultValue: string
  /** When the question appears at all. */
  condition: string
  step: 1 | 2
  /** Where the answer lands, all the way to the seeder's input. */
  field: string
  options?: readonly { value: string; label: string }[]
  hint?: string
  /** Standard set, or a follow-up the agent added because something was missing. */
  origin: 'standard' | 'follow-up'
  provenance: Provenance
}

export const STANDARD_QUESTIONS: readonly BriefQuestion[] = [
  {
    id: 'name',
    order: 1,
    label: 'Business name',
    kind: 'text',
    required: true,
    defaultValue: '',
    condition: 'Always',
    step: 1,
    field: 'answers.name → site.name',
    hint: 'Claude Studio',
    origin: 'standard',
    provenance: 'surveyed'
  },
  {
    id: 'about',
    order: 2,
    label: 'One line about your business',
    kind: 'textarea',
    required: true,
    defaultValue: '',
    condition: 'Always',
    step: 1,
    field: 'answers.about → site.about',
    hint: 'What you do, for whom, and what makes you the right choice.',
    origin: 'standard',
    provenance: 'surveyed'
  },
  {
    id: 'pages',
    order: 3,
    label: 'Pages',
    kind: 'multi',
    required: true,
    defaultValue: 'all seven on',
    condition: 'Always. `home` is on and cannot be turned off.',
    step: 1,
    field: 'answers.pages → site.wanted',
    options: [
      { value: 'home', label: 'Home' },
      { value: 'product', label: 'Product' },
      { value: 'service', label: 'Service' },
      { value: 'blog', label: 'Blog' },
      { value: 'about', label: 'About us' },
      { value: 'pricing', label: 'Pricing' },
      { value: 'contact', label: 'Contact' }
    ],
    origin: 'standard',
    provenance: 'surveyed'
  },
  {
    id: 'languages',
    order: 4,
    label: 'Site language',
    kind: 'multi',
    required: true,
    defaultValue: 'en',
    condition:
      'Only when the CMS can act on it. Joomla offers English alone until a versioned profile exists.',
    step: 2,
    field: 'answers.languages → site.languages',
    options: [{ value: 'en', label: 'English' }],
    origin: 'standard',
    provenance: 'surveyed'
  },
  {
    id: 'tone',
    order: 5,
    label: 'Tone',
    kind: 'choice',
    required: false,
    defaultValue: 'plain',
    condition: 'Always',
    step: 2,
    field: 'answers.tone → site.tone',
    options: [
      { value: 'plain', label: 'Plain' },
      { value: 'warm', label: 'Warm' },
      { value: 'bold', label: 'Bold' }
    ],
    origin: 'standard',
    provenance: 'surveyed'
  }
]

/**
 * Follow-ups the agent adds when the brief leaves a slot with nothing to put in it.
 *
 * SIMULATED. The engine has the mechanism — any answer whose id is not one of the six known ones
 * travels as a line of `site.notes` — but there is no fixed list of follow-ups in the code. These
 * two are written the way the agent should ask: one plain question, and the place the answer lands.
 */
export const FOLLOW_UPS: readonly BriefQuestion[] = [
  {
    id: 'contact',
    order: 6,
    label: 'What address should the Contact page show?',
    kind: 'text',
    required: false,
    defaultValue: '',
    condition: 'Added when the Contact page is on and the brief mentioned no address.',
    step: 2,
    field: 'answers.contact → site.contact',
    hint: 'Used on the Contact page and in the footer.',
    origin: 'follow-up',
    provenance: 'simulated'
  },
  {
    id: 'cta',
    order: 7,
    label: 'What should the main button say, and where should it go?',
    kind: 'text',
    required: false,
    defaultValue: '',
    condition: 'Added when the hero section has a call to action and the brief named none.',
    step: 2,
    field: 'answers.cta → site.notes[]',
    hint: 'Appears on the hero of every page that has one.',
    origin: 'follow-up',
    provenance: 'simulated'
  }
]

// ── M07 · contracts ──────────────────────────────────────────────────────────────────────────

export interface LockRow {
  key: string
  title: string
  type: string
  status: string
  position: string
  menu: string
  access: string
  editable: readonly string[]
  /** The rest of the locked record, shown in the drawer. */
  detail: Record<string, string>
}

/** Five of the 51 module rows, copied verbatim. The header says five of 51. */
export const LOCK_ROWS: readonly LockRow[] = [
  {
    key: 'module-169',
    title: '[Tracy Apple] Chrome - Mobile menu',
    type: 'mod_menu',
    status: 'Published',
    position: 'off-canvas',
    menu: 'All pages',
    access: 'Public',
    editable: [],
    detail: {
      ordering: '1',
      showtitle: '0',
      language: '*',
      publish_up: 'null',
      publish_down: 'null',
      client_id: '0',
      params: '{"menutype":"tracy","base":"","startLevel":1,"endLevel":0,"showAllChildren":1,…}'
    }
  },
  {
    key: 'module-170',
    title: '[Tracy Apple] Chrome - Header action',
    type: 'mod_custom',
    status: 'Published',
    position: 'header-r',
    menu: 'All pages',
    access: 'Public',
    editable: ['content'],
    detail: {
      ordering: '1',
      showtitle: '0',
      language: '*',
      publish_up: 'null',
      publish_down: 'null',
      client_id: '0',
      params: '{"prepare_content":1,"backgroundimage":"","layout":"_:default"}'
    }
  },
  {
    key: 'module-171',
    title: '[Tracy Apple] Footer - Design',
    type: 'mod_custom',
    status: 'Published',
    position: 'footnav-1',
    menu: 'All pages',
    access: 'Public',
    editable: ['content'],
    detail: {
      ordering: '1',
      showtitle: '1',
      language: '*',
      publish_up: 'null',
      publish_down: 'null',
      client_id: '0',
      params: '{"prepare_content":1,"layout":"_:default"}'
    }
  },
  {
    key: 'module-172',
    title: '[Tracy Apple] Footer - Pages',
    type: 'mod_custom',
    status: 'Published',
    position: 'footnav-2',
    menu: 'All pages',
    access: 'Public',
    editable: ['content'],
    detail: {
      ordering: '2',
      showtitle: '1',
      language: '*',
      publish_up: 'null',
      publish_down: 'null',
      client_id: '0',
      params: '{"prepare_content":1,"layout":"_:default"}'
    }
  },
  {
    key: 'templateStyle-8',
    title: 'Tracy - Apple',
    type: 'templateStyle',
    status: 'Default',
    position: '—',
    menu: 'All pages',
    access: '—',
    editable: [],
    detail: {
      template: 'tracy',
      home: '1',
      params: '{"t4_profile":"apple","logo":"images/tracy/logo.svg",…}',
      note: 'Changing this is how a site would switch design system. The lock forbids it.'
    }
  }
]

/** The entity kinds in the content map, counted from the real file on 12/09. */
export const ENTITY_KINDS: readonly { kind: string; count: number; editable: string }[] = [
  { kind: 'article', count: 78, editable: 'title, intro, fulltext, metadesc' },
  { kind: 'module', count: 51, editable: 'content — on mod_custom only' },
  { kind: 'menuItem', count: 46, editable: 'title — routing, layout and access are locked' },
  { kind: 'category', count: 14, editable: 'title, description' },
  { kind: 'templateStyle', count: 8, editable: 'nothing' }
]

export interface SlotRow {
  entity: string
  slot: string
  kind: 'text' | 'image' | 'cta'
  from: string
  sample: string
}

/** SIMULATED mapping of customer answers onto slots — the real map is 197 entities of raw records. */
export const SLOTS: readonly SlotRow[] = [
  {
    entity: 'article-12 · Home hero',
    slot: 'heading',
    kind: 'text',
    from: 'site.name',
    sample: 'Claude Studio'
  },
  {
    entity: 'article-12 · Home hero',
    slot: 'subheading',
    kind: 'text',
    from: 'site.about',
    sample: 'Interior design for small offices.'
  },
  {
    entity: 'article-12 · Home hero',
    slot: 'cta',
    kind: 'cta',
    from: 'answers.cta → site.notes[]',
    sample: 'Book a visit → /contact'
  },
  {
    entity: 'article-12 · Home hero',
    slot: 'cover',
    kind: 'image',
    from: 'image model, one turn per post',
    sample: 'generated · 1600×900'
  },
  {
    entity: 'module-170 · Header action',
    slot: 'content',
    kind: 'cta',
    from: 'answers.cta → site.notes[]',
    sample: 'Book a visit'
  },
  {
    entity: 'article-31 · Contact',
    slot: 'body',
    kind: 'text',
    from: 'site.contact',
    sample: '12 Ly Thuong Kiet, Hanoi'
  }
]

/** Two sample changes: one the contract allows, one it refuses. */
export const CHANGES: readonly {
  id: string
  what: string
  target: string
  verdict: 'allowed' | 'warned'
  reason: string
  before: string
  after: string
}[] = [
  {
    id: 'change-1',
    what: 'Rewrite the header action label',
    target: 'module-170 · content',
    verdict: 'allowed',
    reason: '`content` is editable on a mod_custom module. Position, access and ordering are untouched.',
    before: '<a class="btn" href="/contact">Get in touch</a>',
    after: '<a class="btn" href="/contact">Book a visit</a>'
  },
  {
    id: 'change-2',
    what: 'Move the header action into the hero and make it members-only',
    target: 'module-170 · position, access',
    verdict: 'warned',
    reason:
      "Allowed, outside the quickstart's design: moving a module changes the layout the contract recommends keeping. Tracy says so before it writes.",
    before: 'position: header-r · access: Public',
    after: 'position: hero-1 · access: Registered'
  }
]

/** A site binding, with invented ids — no real label, no real session, no token anywhere. */
export const BINDING = {
  site: 'tchdemo9',
  contract: 'tracy-apple/j6/1.1.0',
  boundAt: '2026-09-10 04:12 UTC · simulated',
  drift: [
    {
      key: 'module-171',
      field: 'position',
      expected: 'footnav-1',
      found: 'footnav-2',
      verdict: 'Drift — somebody moved it outside the door.'
    },
    {
      key: 'article-31',
      field: 'title',
      expected: 'Contact',
      found: 'Contact us',
      verdict: 'Within contract — `title` is editable on an article.'
    }
  ]
}
