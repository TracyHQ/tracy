/**
 * The Settings address, as data — `/ops/settings[/<panel>]`.
 *
 * 🔒 A LEAF, like `cms/route.ts`, and for the same reason: `App.tsx` imports it to draw the rail,
 * so anything it imported would land in the root chunk. It imports nothing.
 *
 * WHY PANELS RATHER THAN SIX MORE RAIL ROWS. The rail already carries twelve; General's six
 * subjects would have made eighteen, on a page where most people open one of them a month. The
 * shadcn admin template this surface follows puts exactly this shape behind one row — a screen
 * with a rail of its own (Lee, 22/09).
 */

export const SETTINGS_PANELS = ['team', 'signin', 'limits', 'integrations', 'naming', 'wo'] as const
export type SettingsPanel = (typeof SETTINGS_PANELS)[number]

/** The dictionary key of each panel's label and of the sentence under its heading (`settings` namespace). */
export const settingsPanelLabelKey = (panel: SettingsPanel) => `settings.panel.${panel}.label`
export const settingsPanelBlurbKey = (panel: SettingsPanel) => `settings.panel.${panel}.blurb`

/**
 * Team first, deliberately: it is the panel people actually open, and it was a top-level rail row
 * until this screen existed. Putting it anywhere else would make the move feel like a demotion of
 * the one thing that was already there.
 */
export const SETTINGS_BASE = '/ops/settings'

/**
 * ⚠ `/ops/settings/model` IS A REAL ADDRESS PEOPLE HAVE. Model & AI was a panel here until it grew
 * a provider list, a credential form and four job assignments and became its own screen (22/09).
 * `App.tsx` sends that one path to `/ops/model`; everything else unknown lands on Team as before.
 */
export const MOVED_PANELS: Record<string, string> = { model: '/ops/model' }

export function movedPanelFor(pathname: string): string | null {
  const tail = pathname.replace(/^\/ops\/settings\/?/, '').replace(/\/+$/, '')
  return MOVED_PANELS[tail] ?? null
}

export function panelFromPath(pathname: string): SettingsPanel {
  const tail = pathname.replace(/^\/ops\/settings\/?/, '').replace(/\/+$/, '')
  return (SETTINGS_PANELS as readonly string[]).includes(tail) ? (tail as SettingsPanel) : 'team'
}

export function settingsHref(panel: SettingsPanel): string {
  return panel === 'team' ? SETTINGS_BASE : `${SETTINGS_BASE}/${panel}`
}

export const isSettingsPath = (pathname: string) =>
  pathname === SETTINGS_BASE || pathname.startsWith(`${SETTINGS_BASE}/`)
