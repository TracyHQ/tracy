/**
 * MOCK DATA for the "Ops · build configuration" drawing. Not product data, not a live reading.
 *
 * Every value here was COPIED BY HAND on 2026-09-12 from the files named in `SURVEYED`, at commit
 * `d0da35c55` on `develop`. That copy is the whole point and also the whole risk: the numbers are
 * true today so the shapes can be judged, and they will be stale tomorrow. Nothing on the screens
 * fetches anything, so a reviewer must read every panel as "this is the shape", never as "this is
 * the state of the fleet".
 *
 * Three habits this file keeps, because the screens are about configuration and a configuration
 * screen that guesses is worse than one that is blank:
 *
 *   - `IN REPO`, `PACKAGED` and `RUNNING` are three separate fields, never one. A file that exists
 *     in the tree has not been built into an image, and an image has not been observed running.
 *   - A fact nobody observed is `not-verified`, never `missing`. The two look the same from a
 *     terminal and mean opposite things to whoever gets paged.
 *   - Anything shortened is marked `excerpt`, and no hash is invented. Real sha256 values below are
 *     the real ones; where there is no real one the field says so.
 */

/** The three CMS platforms the build configuration has to answer for. Same ids as `matrix.ts`. */
export type Cms = 'joomla' | 'wordpress' | 'emdash'

export const CMS_LABEL: Record<Cms, string> = {
  joomla: 'Joomla',
  wordpress: 'WordPress',
  emdash: 'EmDash'
}

export const CMS_LIST: readonly Cms[] = ['joomla', 'wordpress', 'emdash']

/**
 * Two environments, and they are two BRANCHES.
 *
 * `Main` follows the branch production is cut from — `main`, which is `main-v3` right now — and
 * `Dev` follows `develop`. That is the whole model (Lee, 12/09): an environment here is "what a
 * branch would look like once it is out", not a machine somebody can point at.
 *
 * They are still SAMPLE SCENARIOS. Switching them swaps which invented snapshot is drawn; nothing
 * is read. The banner above says so on every screen, because a picker that looked like it targeted
 * a live fleet would be the single most misleading control on these pages.
 */
export type Env = 'main' | 'dev'

export const ENVS: readonly { id: Env; label: string; note: string }[] = [
  { id: 'main', label: 'Main', note: 'branch main-v3 · cowork.tracy.ai' },
  { id: 'dev', label: 'Dev', note: 'branch develop · cowork.tracy.site' }
]

/**
 * Status vocabulary, shared by every screen.
 *
 * Each one carries WORDS, never only a colour — the screens print the label next to the dot, and
 * the state stories check exactly that.
 */
export type Status =
  | 'ready'
  | 'not-verified'
  | 'missing'
  | 'pending'
  | 'blocked'
  | 'mismatch'
  | 'error'
  | 'loading'

export const STATUS_LABEL: Record<Status, string> = {
  ready: 'Ready',
  'not-verified': 'Not verified',
  missing: 'Missing configuration',
  pending: 'Pending implementation',
  blocked: 'Blocked',
  mismatch: 'Version mismatch',
  error: 'Error',
  loading: 'Loading'
}

/** One of the three layers a configuration fact can live at. `unknown` is a real answer. */
export type LayerState = 'yes' | 'no' | 'unknown'

export interface Layers {
  /** The file is in this repository at the surveyed commit. */
  repo: LayerState
  /** It was built into the host image / the deployed bundle. */
  packaged: LayerState
  /** Somebody observed it answering on a running surface. */
  running: LayerState
}

export const LAYER_LABEL: Record<keyof Layers, string> = {
  repo: 'In repo',
  packaged: 'Packaged',
  running: 'Running'
}

/** Whether a value below was read off the tree, is only planned, or was invented for the drawing. */
export type Provenance = 'surveyed' | 'planned' | 'simulated'

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  surveyed: 'From repo · 12/09',
  planned: 'Planned · not implemented',
  simulated: 'Simulated sample'
}

/** The files this fixture was copied from, printed on the overview so a reader can go and check. */
export const SURVEYED: readonly { path: string; gives: string }[] = [
  {
    path: 'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json',
    gives: 'base quickstart, artifact sizes and sha256, cowork version, contract id'
  },
  {
    path: 'packages/site/tracy-site-build-joomla/src/host/capabilities.json',
    gives: 'providers and their ready/pending state, artifacts, capabilities'
  },
  {
    path: 'packages/cms/tracy-joomla-quickstart/contracts/tracy-apple/j6/1.1.0/',
    gives: 'manifest, content map (197 entities), presentation lock'
  },
  {
    path: 'config/mode-matrix.json + scripts/gen-presets.ts',
    gives: 'roles, platforms, tool and skill rows'
  },
  { path: 'packages/bundle/tracy-cowork/presets/', gives: 'the twelve generated preset folders' },
  {
    path: 'packages/design/tracy-design-inspiration/src/client/preset-for.mjs',
    gives: 'the role-kept / platform-swapped resolver rule'
  },
  {
    path: 'packages/site/tracy-site-build-core/src/client/BuildForm.tsx',
    gives: 'the standard five questions and the two steps'
  },
  {
    path: 'packages/site/tracy-site-build-{joomla,wordpress}/src/host/stages.mjs',
    gives: 'the six real stages per CMS and their detail strings'
  },
  {
    path: 'packages/tools/tracy-subprocess-docker/src/{route,content-contract}.mjs',
    gives: 'the path fence table and the two content-contract refusal sentences'
  },
  {
    path: 'packages/cms/tracy-{joomla-template,wordpress-theme}/**/inspirations.json',
    gives: '152 design systems, both CMS, generated from the same vendor catalogue'
  }
]

/** The catalogue size, counted in the two `inspirations.json` files on 12/09. Both say 152. */
export const DESIGN_SYSTEM_COUNT = 152

// ── M01 · the seven configuration areas ──────────────────────────────────────────────────────

export type AreaId = 'base' | 'template' | 'contract' | 'questionnaire' | 'preset' | 'seeder' | 'verification'

export type ScreenId = 'overview' | 'flow' | 'catalog' | 'presets' | 'tools' | 'brief' | 'contracts'

export const AREAS: readonly { id: AreaId; label: string; blurb: string; goto: ScreenId }[] = [
  { id: 'base', label: 'Base quickstart', blurb: 'The archive a new site is restored from', goto: 'catalog' },
  {
    id: 'template',
    label: 'Template mapping',
    blurb: 'Which design inspiration resolves to which template',
    goto: 'catalog'
  },
  { id: 'contract', label: 'Contract', blurb: 'What an agent may change on a built site', goto: 'contracts' },
  {
    id: 'questionnaire',
    label: 'Site questions',
    blurb: 'What a customer answers before a build',
    goto: 'brief'
  },
  { id: 'preset', label: 'Preset', blurb: 'The agent a build session runs as', goto: 'presets' },
  { id: 'seeder', label: 'Seeder', blurb: 'What writes the words and the images', goto: 'tools' },
  { id: 'verification', label: 'Verification', blurb: 'How a finished build is checked', goto: 'flow' }
]

export interface Cell {
  status: Status
  /** One line naming the thing, not its state — the state is the chip beside it. */
  headline: string
  /** Why it is in that state. Never a percentage: a percentage of an unknown is an invention. */
  reason: string
  /** What is still missing, in the order somebody would do it. Empty when nothing is. */
  missing: readonly string[]
  layers: Layers
  provenance: Provenance
}

type Grid = Record<AreaId, Record<Cms, Cell>>

const NOT_BUILT: Omit<Cell, 'headline' | 'reason' | 'missing'> = {
  status: 'pending',
  layers: { repo: 'no', packaged: 'no', running: 'no' },
  provenance: 'surveyed'
}

/**
 * `main` — the branch production is cut from, `main-v3` today. The baseline the other one varies.
 *
 * Read it as the answer to "what does that branch say, and what has anybody actually seen".
 */
const MAIN: Grid = {
  base: {
    joomla: {
      status: 'ready',
      headline: 'tracy-apple/j6 · 1.1.0',
      reason:
        'One base in quickstarts.json: webroot 55.7 MB and database 187 KB, both with a sha256, plus Claude Cowork plugin pkg_claudecowork 0.14.0.',
      missing: [],
      layers: { repo: 'yes', packaged: 'yes', running: 'yes' },
      provenance: 'surveyed'
    },
    wordpress: {
      status: 'ready',
      headline: 'Theme install · no quickstart archive',
      reason:
        'WordPress does not restore an archive. The build installs and activates the `tracy` block theme on a fresh site, so there is no base to version.',
      missing: [],
      layers: { repo: 'yes', packaged: 'yes', running: 'yes' },
      provenance: 'surveyed'
    },
    emdash: {
      ...NOT_BUILT,
      headline: 'No base defined',
      reason:
        'EmDash has four presets and a provision script, and nothing that answers "what does a new EmDash site start from".',
      missing: [
        'Decide whether EmDash starts from an archive or from a fresh install',
        'Write the base entry'
      ]
    }
  },
  template: {
    joomla: {
      status: 'blocked',
      headline: '1 of 152 design systems has a template',
      reason:
        'The `check` stage refuses any inspiration other than `apple`. Airbnb has a package pinned in the capability catalogue, but its provider is `pending`, so it is not installable.',
      missing: ['Release the Airbnb contract profile', 'Decide the fallback for the other 150'],
      layers: { repo: 'yes', packaged: 'yes', running: 'yes' },
      provenance: 'surveyed'
    },
    wordpress: {
      status: 'ready',
      headline: '152 style variations in one theme',
      reason:
        'The `tracy` block theme carries one style variation per design system, generated from the same vendor catalogue as Joomla.',
      missing: [],
      layers: { repo: 'yes', packaged: 'yes', running: 'yes' },
      provenance: 'surveyed'
    },
    emdash: {
      ...NOT_BUILT,
      headline: 'No template mapping',
      reason: 'No EmDash theme exists in this repo, so no design system resolves to anything.',
      missing: ['Choose the EmDash theming unit', 'Generate the mapping from the vendor catalogue']
    }
  },
  contract: {
    joomla: {
      status: 'ready',
      headline: 'tracy-apple/j6/1.1.0',
      reason:
        'Three files: manifest, a content map of 197 entities, and a presentation lock. Mode is `content-recommendation` — the map says how to change the text and keep the design.',
      missing: [],
      layers: { repo: 'yes', packaged: 'yes', running: 'yes' },
      provenance: 'surveyed'
    },
    wordpress: {
      status: 'missing',
      headline: 'No contract files',
      reason:
        'There is no `contracts/` folder and no capability catalogue for WordPress. What an agent may change on a built WordPress site is decided by the sandbox and the path fence alone.',
      missing: ['Decide whether WordPress needs a contract at all', 'If it does: a content map and a lock'],
      layers: { repo: 'no', packaged: 'no', running: 'no' },
      provenance: 'surveyed'
    },
    emdash: {
      ...NOT_BUILT,
      headline: 'No contract files',
      reason: 'Follows the base: nothing to write a contract against yet.',
      missing: ['Define the base first']
    }
  },
  questionnaire: {
    joomla: {
      status: 'ready',
      headline: 'Standard five · languages locked to English',
      reason:
        'Same five questions as WordPress, but the `copy` stage refuses any language list other than `["en"]` — the contract preserves the original menu and language structure.',
      missing: ['A versioned multilingual profile, so the language answer can move'],
      layers: { repo: 'yes', packaged: 'yes', running: 'yes' },
      provenance: 'surveyed'
    },
    wordpress: {
      status: 'ready',
      headline: 'Standard five · two steps',
      reason:
        'Business name, one line about it, pages, site language, tone. Steps split after `pages`. The agent may replace the whole set with questions of its own.',
      missing: [],
      layers: { repo: 'yes', packaged: 'yes', running: 'yes' },
      provenance: 'surveyed'
    },
    emdash: {
      ...NOT_BUILT,
      headline: 'No questionnaire of its own',
      reason: 'No EmDash build tab exists, so the shared five are never asked on its behalf.',
      missing: ['A build tab, or a decision that EmDash reuses the shared set']
    }
  },
  preset: {
    joomla: {
      status: 'ready',
      headline: '4 presets · designer · developer · writer · seo-geo',
      reason:
        'Generated from config/mode-matrix.json. Joomla contributes one skill of its own, `t4-framework-knowledge`, and no tools.',
      missing: [],
      layers: { repo: 'yes', packaged: 'yes', running: 'yes' },
      provenance: 'surveyed'
    },
    wordpress: {
      status: 'ready',
      headline: '4 presets · designer · developer · writer · seo-geo',
      reason: 'Generated from the same matrix. WordPress contributes `tracy-webroot-read`.',
      missing: [],
      layers: { repo: 'yes', packaged: 'yes', running: 'yes' },
      provenance: 'surveyed'
    },
    emdash: {
      status: 'ready',
      headline: '4 presets · generated like the others',
      reason:
        'The presets exist and boot. They carry no EmDash tools or skills, because the overlay is empty — a preset is not a build flow.',
      missing: [],
      layers: { repo: 'yes', packaged: 'yes', running: 'unknown' },
      provenance: 'surveyed'
    }
  },
  seeder: {
    joomla: {
      status: 'ready',
      headline: 'tracy-seed --platform joomla',
      reason:
        'Writes through the `content.contract` door rather than the filesystem, so every write is checked against the presentation lock.',
      missing: [],
      layers: { repo: 'yes', packaged: 'yes', running: 'yes' },
      provenance: 'surveyed'
    },
    wordpress: {
      status: 'ready',
      headline: 'tracy-seed --platform wordpress',
      reason:
        'Writes with the `wp` CLI inside the site container. No contract stands between it and the site.',
      missing: [],
      layers: { repo: 'yes', packaged: 'yes', running: 'yes' },
      provenance: 'surveyed'
    },
    emdash: {
      ...NOT_BUILT,
      headline: 'No writer',
      reason: 'The seeder has two writers. A third would need an EmDash content API to write through.',
      missing: ['An EmDash writer in tracy-seeder']
    }
  },
  verification: {
    joomla: {
      status: 'not-verified',
      headline: 'shot stage only',
      reason:
        'The last stage takes a screenshot. Nothing compares it to anything, so "the build worked" is still a human looking at a picture.',
      missing: ['Decide what a passed build looks like', 'Compare the shot, or check the rendered slots'],
      layers: { repo: 'yes', packaged: 'yes', running: 'unknown' },
      provenance: 'surveyed'
    },
    wordpress: {
      status: 'not-verified',
      headline: 'shot stage only',
      reason: 'Same as Joomla: a screenshot is taken and nobody checks it.',
      missing: ['Decide what a passed build looks like'],
      layers: { repo: 'yes', packaged: 'yes', running: 'unknown' },
      provenance: 'surveyed'
    },
    emdash: {
      ...NOT_BUILT,
      headline: 'Nothing to verify',
      reason: 'No build, so no result.',
      missing: ['Define the base first']
    }
  }
}

/**
 * `develop` — and it differs from `main` in exactly the two ways worth drawing.
 *
 * Both are the shape of a real incident: a branch that is right while the machine serving it is
 * old, and a fetch that failed on files that do exist. Neither is visible under one green tick.
 */
const DEV: Grid = {
  ...MAIN,
  base: {
    ...MAIN.base,
    joomla: {
      status: 'mismatch',
      headline: 'tracy-apple/j6 · repo 1.1.0 · running 1.0.0',
      reason:
        'The dev host still serves the 1.0.0 restore. `develop` moved to the runtime quickstart 1.1.0 with the 0.14.0 cowork; the host was never rebuilt.',
      missing: ['Rebuild the host image on contabo2', 'Re-run the provision step for the dev site'],
      layers: { repo: 'yes', packaged: 'no', running: 'yes' },
      provenance: 'simulated'
    }
  },
  contract: {
    ...MAIN.contract,
    joomla: {
      status: 'error',
      headline: 'Contract files unreadable',
      reason:
        'The Claude Cowork plugin answered `inspect` with a contract id the host does not have on disk. Sample failure: the archive was fetched but the three contract files never landed.',
      missing: [
        'Re-download the Claude Cowork plugin package',
        'Compare its three sha256 values with the catalogue'
      ],
      layers: { repo: 'yes', packaged: 'yes', running: 'no' },
      provenance: 'simulated'
    }
  }
}

export const GRID: Record<Env, Grid> = { main: MAIN, dev: DEV }

/**
 * The three version lines printed at the top of every screen.
 *
 * The configuration line is REAL — both branch heads were read on 12/09. Runtime and observed are
 * invented, and `simulated` is printed next to them rather than left for a reader to work out.
 */
export const SNAPSHOT: Record<Env, { config: string; runtime: string; observed: string }> = {
  main: {
    config: 'main-v3 @ e43d4d06f',
    runtime: 'host dsh 0.18.1 · cowork 0.14.0',
    observed: '2026-09-12 09:40 UTC · simulated'
  },
  dev: {
    config: 'develop @ d0da35c55',
    runtime: 'host dsh 0.17.4 · cowork 0.13.0',
    observed: '2026-09-11 22:05 UTC · simulated'
  }
}
