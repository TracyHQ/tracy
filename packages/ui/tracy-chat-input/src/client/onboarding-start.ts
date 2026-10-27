/** Shared entry for creation-home pills and the actions under a Help answer. */
import { openTabWithMeta, type SidebarRight } from '@tracy/core/tab-link'

export const ONBOARDING_START_EVENT = 'tracy:onboarding-start'
/** `business` is Add site's Build from my business, offered only while its switch is on. */
export type StartAction = 'create' | 'templates' | 'import' | 'business'
/** The platforms Add site creates on (`tracy-add-site`'s `CreatePlatform`). */
export type StartPlatform = 'joomla' | 'wordpress' | 'emdash'

const PLATFORMS: readonly StartPlatform[] = ['joomla', 'wordpress', 'emdash']

/** A platform a Help action names (`tracy-action:create?platform=…`), or undefined for anything else. */
export function startPlatformOf(value: unknown): StartPlatform | undefined {
  return PLATFORMS.find((p) => p === value)
}

/** Ambiguous platform mentions never preselect a platform. */
export function platformOfQuestion(question: string): StartPlatform | undefined {
  const named = PLATFORMS.filter((p) => new RegExp(`\\b${p}\\b`, 'i').test(question))
  return named.length === 1 ? named[0] : undefined
}

/**
 * Open the step `action` starts. `platform` is the one a Help action picked; without it, a platform
 * the question named alone is preselected for Create.
 */
export function openOnboardingStart(
  sidebar: Parameters<typeof openTabWithMeta>[0] | undefined,
  right: SidebarRight | undefined,
  action: StartAction,
  question = '',
  platform?: StartPlatform
): void {
  if (!sidebar) return
  if (action === 'templates') {
    sidebar.openTab?.({ type: 'tracy:design-inspiration' })
    return
  }
  // Create accepts pressedPlatform. Import and business accept only pressedOrigin at their current entry point.
  const picked = action === 'create' ? (platform ?? platformOfQuestion(question)) : undefined
  openTabWithMeta(sidebar, right, {
    type: 'tracy:add-site',
    meta: { origin: action, pressedAt: Date.now(), ...(picked ? { platform: picked } : {}) }
  })
}
