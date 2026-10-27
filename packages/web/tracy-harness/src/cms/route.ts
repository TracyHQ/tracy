/**
 * The `/ops/cms` address, as data: which CMSes exist, which screens exist, and how a Route reads
 * from and writes to the URL.
 *
 * 🔒 A LEAF, ON PURPOSE. Everything that must know a cms screen id or the CMS list — the root
 * shell's rail, `screens.tsx`, every screen — imports it from HERE and not from `./App`. `./App`
 * imports every screen; a root bundle that reached into it for `CMS_LABEL` would make Vite hoist the
 * whole cms chunk into `/ops`. It imports only the i18n barrel (already in the root chunk), so it can sit
 * in either chunk.
 *
 * The address rules are the ones `App.tsx` carried since the page arrived (URL is the state; `tag`
 * and `set` only ride on the Quickstarts address), moved here unchanged so the merged router keeps
 * every link people have already sent each other.
 */

import { tr } from '../i18n'

export const CMS = ['joomla', 'wordpress', 'emdash'] as const
export type Cms = (typeof CMS)[number]
export const CMS_LABEL: Record<Cms, string> = { joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' }

/** The screens, in the order the address accepts them. Labels and icons live with the screens. */
export const CMS_SCREENS = [
  'overview',
  'stages',
  'templates',
  'inspiration',
  'quickstarts',
  'inventory',
  'demos',
  'catalog',
  'contracts',
  'presets',
  'tools',
  'questions'
] as const
export type ScreenId = (typeof CMS_SCREENS)[number]

/**
 * One label per screen, in the language on screen — a `Record`, so a screen added to `CMS_SCREENS`
 * without words fails to compile. Getters, so each read during a render follows a language change.
 */
export const CMS_SCREEN_LABEL: Readonly<Record<ScreenId, string>> = {
  get overview() {
    return tr('cms-screens.label.overview')
  },
  get stages() {
    return tr('cms-screens.label.stages')
  },
  // One row per template, its Joomla / WordPress / EmDash releases folded together (Akemi, 10/10/2026).
  // It replaces Design inspiration and Quickstarts in the rail; both keep their addresses so links
  // already sent (Admin attention's `quickstarts?tag=`) still land.
  get templates() {
    return tr('cms-screens.label.templates')
  },
  get inspiration() {
    return tr('cms-screens.label.inspiration')
  },
  get quickstarts() {
    return tr('cms-screens.label.quickstarts')
  },
  get inventory() {
    return tr('cms-screens.label.inventory')
  },
  get demos() {
    return tr('cms-screens.label.demos')
  },
  // What the selected REF declares — not what customers on this server are offered; that is
  // `inspiration` (Lee, 04/10/2026: the old name read as the customer's list).
  get catalog() {
    return tr('cms-screens.label.catalog')
  },
  get contracts() {
    return tr('cms-screens.label.contracts')
  },
  get presets() {
    return tr('cms-screens.label.presets')
  },
  get tools() {
    return tr('cms-screens.label.tools')
  },
  get questions() {
    return tr('cms-screens.label.questions')
  }
}

/**
 * The screens that READ A REF, and therefore the only ones the environment choice means anything
 * on — `renderScreen` hands every one of these a snapshot.
 *
 * ⚠ `inspiration`, `quickstarts` AND `demos` ARE NOT HERE, and that is measured rather than assumed:
 * they answer from LIVE doors (what this server's database says customers are offered, what it last
 * read off GitHub, and the demo host's own sites), so `renderScreen` returns `null` for them and they
 * draw themselves. Offering an environment picker
 * above them would be a control with nothing to change — the exact shape that reads as broken.
 */
export const SNAPSHOT_SCREENS: readonly ScreenId[] = [
  'overview',
  'stages',
  'catalog',
  'contracts',
  'presets',
  'tools',
  'questions'
]

export const readsEnvironment = (screen: ScreenId) => SNAPSHOT_SCREENS.includes(screen)

export const CMS_BASE = '/ops/cms'

export interface CmsRoute {
  screen: ScreenId
  env: string
  cms: Cms
  /**
   * Quickstarts only: which release is open, and which of its questionnaires. They live in the
   * ADDRESS rather than in the screen's own state so a person can send "look at this one" to
   * somebody — the same reason `env` and `cms` are there.
   */
  tag: string | null
  set: string | null
  /**
   * Templates only: which template is open (its card id), and which tab of its page. In the address
   * so a template page is a link somebody can send, like `tag` on Quickstarts.
   */
  template?: string | null
  view?: string | null
  /**
   * Templates only: the release an open template page shows, a tag or a CMS id. Absent, the page
   * opens on the release whose listing feeds the customer card. Not `cms`: that one rides on every
   * `/ops/cms` address (Joomla when unset), so it cannot say a release was asked for.
   */
  release?: string | null
}

/** Is this pathname under `/ops/cms`? The merged shell asks before it asks anything else. */
export function isCmsPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '')
  return path === CMS_BASE || path.startsWith(`${CMS_BASE}/`)
}

/** Read the address. Anything unrecognised falls back rather than rendering a blank page. */
export function cmsRouteFromLocation(location: { pathname: string; search: string }): CmsRoute {
  const path = location.pathname.replace(/\/+$/, '')
  const tail = path.startsWith(CMS_BASE) ? path.slice(CMS_BASE.length).replace(/^\//, '') : ''
  const screen = (CMS_SCREENS as readonly string[]).includes(tail) ? (tail as ScreenId) : 'overview'
  const params = new URLSearchParams(location.search)
  const env = params.get('env') ?? ''
  const cms = (CMS as readonly string[]).includes(params.get('cms') ?? '')
    ? (params.get('cms') as Cms)
    : 'joomla'
  // A quickstart id is a release TAG and carries a slash (`tracy-business/emdash-0.x`), so it rides
  // on the query rather than the path — the same call `/api/ops/quickstart?tag=` makes.
  return {
    screen,
    env,
    cms,
    tag: params.get('tag') || null,
    set: params.get('set') || null,
    template: params.get('template') || null,
    view: params.get('view') || null,
    release: params.get('release') || null
  }
}

export function cmsHrefFor({ screen, env, cms, tag, set, template, view, release }: CmsRoute): string {
  const params = new URLSearchParams()
  if (env) params.set('env', env)
  params.set('cms', cms)
  // Only where they mean something: a `tag` left on the Presets address would be noise a reader
  // has to decide to ignore.
  if (screen === 'quickstarts' && tag) {
    params.set('tag', tag)
    if (set) params.set('set', set)
  }
  if (screen === 'templates' && template) {
    params.set('template', template)
    if (view) params.set('view', view)
    if (release) params.set('release', release)
  }
  const q = params.toString()
  return `${CMS_BASE}${screen === 'overview' ? '' : `/${screen}`}${q ? `?${q}` : ''}`
}
