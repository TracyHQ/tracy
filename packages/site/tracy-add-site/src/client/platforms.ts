import { chatDraftOf } from './chat-draft.mjs'
/**
 * The platforms a site can be BORN on, and the platforms a site can be IMPORTED from — two different
 * questions, two different tables.
 *
 * This table is copied from `tracy-desk` `src/shared/types/createPlatforms.ts` and
 * `src/renderer/components/siteSetup/migratePlatform.ts` on `origin/develop`, on 31/08.
 *
 * ⚠ THE TWO PREDICATES ARE KEPT APART ON PURPOSE; DO NOT MERGE THEM. `migratePlatform.ts` records the cost of merging:
 * `isMigratable` (joomla · wordpress) answers *"is there a Migrate to run"*, while
 * `needsConnectionStep` (joomla · wordpress · **shopify**) answers *"does the wizard stop at the
 * Connection screen"*. They only LOOK alike. Borrowing the first to ask the second pushed
 * a Shopify site straight out of the wizard with no Connection screen — bug #560, and the reason
 * `tracy-desk` split them on 25/08.
 *
 * 🔒 `label` is a PROPER NOUN and goes through no translation. See `vocabulary.md` §7.
 */

export type CreatePlatform = 'joomla' | 'wordpress' | 'emdash'

export interface PlatformEntry {
  value: CreatePlatform
  /** The brand name — a proper noun, never translated. */
  label: string
  /**
   * `false` when the fleet has no install path for it yet. The choice STILL shows: what Tracy will build for you
   * is worth reading before it is worth pressing, and hiding it makes the roadmap invisible to exactly the people
   * who care. Flip this flag on the day that platform's `--fresh` branch lands on the fleet, not sooner.
   */
  installable: boolean
}

/**
 * The order and readiness of platforms in the Create branch.
 *
 * **Joomla comes first and is preselected** (since 24/08): it is the platform Tracy's first customers
 * live on, so that is what "a new site" should mean by default — ahead of whichever
 * platform happened to become buildable first.
 */
export const CREATE_PLATFORMS: readonly PlatformEntry[] = [
  { value: 'joomla', label: 'Joomla', installable: true },
  { value: 'wordpress', label: 'WordPress', installable: true },
  { value: 'emdash', label: 'EmDash', installable: true }
]

export const DEFAULT_CREATE_PLATFORM: CreatePlatform = 'joomla'

/**
 * The `pluginToggles` key for each platform — the operator switches each one on/off in the tab's
 * gear. Separate from `value` through a function rather than a field: the config key and the value sent
 * to the fleet are two things that may have to differ, and a shared field would glue them together.
 * @param platform The platform.
 * @returns The key used in `pluginSettings['tracy:add-site']`.
 */
export function toggleKeyFor(platform: CreatePlatform): string {
  return `platform_${platform}`
}

/**
 * A press of "Create with <CMS>" as the tab carries it: the platform, the template, and which
 * press it was.
 *
 * Both openers put it in `tab.meta` — `tracy-design-inspiration`'s `buildOpener` and
 * `tracy-tab-link` (from the intent cookie or the stash) — stamped with `pressedAt`. `key` tells a
 * NEW press apart from an update of the same one (the opener re-lands its tab pending → ready under
 * the same `pressedAt`), so an update never undoes a pick made by hand in between.
 */
export interface PlatformPress {
  chatDraft?: ReturnType<typeof chatDraftOf>
  /** Absent when the press named no platform this wizard creates on: the pill is left as it is. */
  platform?: CreatePlatform
  /** The template the press starts from: `design` (`buildOpener`), else `id` (`tracy-tab-link`). */
  design?: string
  /**
   * Which origin card to select: `create`, `import` or `business`. Carried by the start screen's cards on
   * `/new/` ("Create a new site", "Import your site", "Build it from my business"); absent leaves the
   * card as it is.
   */
  origin?: PressOrigin
  key: string
}

/** The origin cards a press may select. The fork card stays a choice made by hand. */
export type PressOrigin = 'create' | 'import' | 'business'
const PRESS_ORIGINS: readonly PressOrigin[] = ['create', 'import', 'business']

/**
 * The press a tab's `meta` carries, or undefined when it carries none — a tab opened from the `+`
 * menu, or by a plain link. The platform and the template are read apart: an intent may name a
 * design and no platform (`intentFromCookie` keeps the inspiration alone), and that design must
 * still reach the wizard. An unknown platform is dropped here rather than sent to the create door.
 * @param meta The tab's `meta`, as better-sidebar hands it to the descriptor's component.
 * @returns The press, or undefined.
 */
export function platformPressOf(meta: unknown): PlatformPress | undefined {
  if (meta === null || typeof meta !== 'object') return undefined
  const { platform, pressedAt, design, id, origin, chatDraft } = meta as {
    platform?: unknown
    pressedAt?: unknown
    design?: unknown
    id?: unknown
    origin?: unknown
    chatDraft?: unknown
  }
  const entry = CREATE_PLATFORMS.find((one) => one.value === platform)
  const named = [design, id]
    .find((one): one is string => typeof one === 'string' && one.trim() !== '')
    ?.trim()
  const card = PRESS_ORIGINS.find((one) => one === origin)
  if (entry === undefined && named === undefined && card === undefined) return undefined
  const draft = chatDraftOf(chatDraft)
  return {
    ...(draft ? { chatDraft: draft } : {}),
    ...(entry === undefined ? {} : { platform: entry.value }),
    ...(named === undefined ? {} : { design: named }),
    ...(card === undefined ? {} : { origin: card }),
    key: `${String(pressedAt ?? '')}:${entry?.value ?? ''}:${named ?? ''}${card === undefined ? '' : `:${card}`}`
  }
}
