/**
 * The feature's switch and the Default CMS picker, reduced to plain data.
 *
 * 🔒 The switch is the operator's (`/ops` › User Interface, `catalogue.json`): this file only reads it.
 * A catalogue without the id makes `isShown` throw, and an unreadable answer is treated as off.
 */
import { reasonKey } from './status.ts'

/** Same id as the Settings section, so Settings' `keepShown` hides the section with the switch. */
export const SWITCH_ID = 'website-opportunities'

export const CMS_ORDER = ['joomla', 'wordpress', 'emdash'] as const
export type Cms = (typeof CMS_ORDER)[number]
export const DEFAULT_CMS: Cms = 'joomla'

export function featureOn(ui: { isShown(id: string): boolean }): boolean {
  try {
    return ui.isShown(SWITCH_ID) === true
  } catch {
    return false
  }
}

export interface SettingsAnswer {
  cms?: unknown
  cmsSource?: unknown
  options?: ReadonlyArray<{ cms?: unknown; available?: unknown; reason?: unknown }>
}

export interface SettingsView {
  cms: Cms
  /** The server had no saved choice for this account (or an unusable one): Joomla, the code default. */
  fromDefault: boolean
  options: { cms: Cms; available: boolean; reasonKey: string | null }[]
}

const isCms = (value: unknown): value is Cms => CMS_ORDER.includes(value as Cms)

export function settingsView(answer: SettingsAnswer | null | undefined): SettingsView | null {
  if (answer === null || answer === undefined) return null
  const offered = new Map<Cms, { available: boolean; reason: unknown }>()
  for (const option of answer.options ?? []) {
    if (isCms(option.cms))
      offered.set(option.cms, { available: option.available === true, reason: option.reason })
  }
  const options = CMS_ORDER.map((cms) => {
    const option = offered.get(cms)
    if (option === undefined) return { cms, available: false, reasonKey: 'reason.other' }
    return {
      cms,
      available: option.available,
      reasonKey: option.available ? null : (reasonKey(option.reason) ?? 'reason.other')
    }
  })
  const saved = isCms(answer.cms) ? answer.cms : null
  return {
    cms: saved ?? DEFAULT_CMS,
    fromDefault: saved === null || answer.cmsSource !== 'account',
    options
  }
}

type OpenHook = (open: () => void) => () => void

/**
 * The desktop app's Help › Find Website Opportunities…, when this page runs in an app that has it
 * (`window.tracyDesktop.app.websiteOpportunities.onOpen`, feature-detected). Null on the web.
 */
export function desktopOpenHook(scope: unknown): OpenHook | null {
  const app = (
    scope as { tracyDesktop?: { app?: { websiteOpportunities?: { onOpen?: unknown } } } } | null | undefined
  )?.tracyDesktop?.app
  const onOpen = app?.websiteOpportunities?.onOpen
  if (typeof onOpen !== 'function') return null
  return (open) => {
    let stop: unknown
    try {
      stop = onOpen.call(app?.websiteOpportunities, open)
    } catch {
      stop = undefined
    }
    return () => {
      if (typeof stop === 'function') stop()
    }
  }
}
