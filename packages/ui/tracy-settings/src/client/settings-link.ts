/**
 * The address that opens Settings on one section: `?settings=<name>` (spec #809 step 5).
 *
 * "Manage notifications" in every notification email links to `<origin>/?settings=notifications`;
 * tracy-web carries the query to the person's default site, and this plugin reads it once on load,
 * opens Settings on that section, and strips it from the address. Spent on arrival like a tab link's
 * intent: left in the address, a reload would open Settings again, and a copied link would too.
 *
 * `&vendor=<id>` may ride along (`?settings=ai-accounts&vendor=copilot`, the desktop app's first-run
 * flow): the section brings that vendor's row into view. It is spent with `settings`.
 *
 * Only names listed below open anything; any other value is dropped without a sound.
 */

export const SETTINGS_PARAM = 'settings'
export const VENDOR_PARAM = 'vendor'

/** What a vendor id may look like: the seat-plan broker's provider ids (`claude`, `copilot`, …). */
const VENDOR_ID = /^[a-z][a-z0-9-]*$/

/** Public name in the address → section id in the `settings.section` ledger. */
const SECTIONS: Readonly<Record<string, string>> = {
  notifications: 'tracy-notifications',
  help: 'tracy-help-about',
  // `SECTION_ID` of `@tracy/dsh-model-plan` (packages/ui/tracy-model-plan/src/client/index.tsx),
  // copied: this package does not depend on that one.
  'ai-accounts': 'tracy-model-plan'
}

/** What a `?settings=` address asked for. */
export interface SettingsLink {
  /** The section id to open. */
  readonly section: string
  /** The vendor whose row the section should bring into view, or null. */
  readonly vendor: string | null
}

/** The section an address asks for, or null. */
export function sectionFromSearch(search: string): string | null {
  const asked = new URLSearchParams(search).get(SETTINGS_PARAM)
  return asked !== null && Object.prototype.hasOwnProperty.call(SECTIONS, asked) ? SECTIONS[asked] : null
}

/** The vendor id an address names, or null when absent or not a well-formed id. */
export function vendorFromSearch(search: string): string | null {
  const asked = new URLSearchParams(search).get(VENDOR_PARAM)
  return asked !== null && VENDOR_ID.test(asked) ? asked : null
}

/**
 * The search string without `settings` (and the `vendor` that rides with it), every other
 * parameter kept; '' when nothing is left.
 */
export function withoutSettingsParam(search: string): string {
  const params = new URLSearchParams(search)
  params.delete(SETTINGS_PARAM)
  params.delete(VENDOR_PARAM)
  const query = params.toString().replace(/%3A/gi, ':')
  return query === '' ? '' : `?${query}`
}

/**
 * Read the asked section (and vendor) from the current address and strip both parameters (once,
 * on load). An address without `settings` is left untouched, a `vendor` of its own included.
 * @returns what to open, or null.
 */
export function takeSettingsLink(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  history: Pick<History, 'replaceState' | 'state'>
): SettingsLink | null {
  if (!new URLSearchParams(location.search).has(SETTINGS_PARAM)) return null
  const section = sectionFromSearch(location.search)
  const vendor = vendorFromSearch(location.search)
  try {
    history.replaceState(
      history.state,
      '',
      `${location.pathname}${withoutSettingsParam(location.search)}${location.hash}`
    )
  } catch {
    // An address that cannot be rewritten still opens the section; a reload opens it again.
  }
  return section === null ? null : { section, vendor }
}

/**
 * Requests to open Settings on a section that arrive while the page runs, not in its address: the
 * desktop app asks for Help & about from a notification or Help › What's New… (bridge protocol 3,
 * `onOpenHelp`). Settings registers while its seat is mounted; a request made before that (or between
 * two mounts) waits, and is spent by the first one to register.
 */
export interface SectionRequests {
  /** Ask for Settings on `sectionId`. */
  ask(sectionId: string): void
  /** Receive requests; the latest waiting one is delivered at once. Returns the disposer. */
  register(open: (sectionId: string) => void): () => void
}

export function createSectionRequests(): SectionRequests {
  let listener: ((sectionId: string) => void) | null = null
  let waiting: string | null = null
  return {
    ask(sectionId) {
      if (listener === null) waiting = sectionId
      else listener(sectionId)
    },
    register(open) {
      listener = open
      if (waiting !== null) {
        const id = waiting
        waiting = null
        open(id)
      }
      return () => {
        if (listener === open) listener = null
      }
    }
  }
}
