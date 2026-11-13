/**
 * Whether this page's chat box is the creation workspace's Help-only composer.
 *
 * The creation workspace (`/new/`) has no site behind it, so an ordinary draft there must never reach
 * a site agent: the composer is replaced by one that only asks Help. Two chats of that workspace keep
 * their agent composer, because their session runs an agent the seat door chose for them:
 * - the landing page widget's native conversation (its `tracy-widget-native` mark);
 * - the build chat (TracyHQ/tracy#602), `/new/s/<build session>`: the build agent, fenced to the
 *   build tools at the seat door. `/help` still asks Help there.
 */
import { isBuildChatPage } from '@tracy/core/build-chat'

export function helpOnlyComposer(page: {
  /** The widget's native conversation mark is on the page. */
  widget: boolean
  /** `location.pathname`. */
  pathname: string
  /** `document.baseURI`: the base, rather than the session URL, identifies the creation workspace. */
  base: string
  /** `tracy-chat-input-audience` meta content, if any. */
  audience: string | null
}): boolean {
  if (page.widget || isBuildChatPage(page.pathname)) return false
  if (page.audience === 'onboarding') return true
  try {
    return new URL(page.base).pathname === '/new/'
  } catch {
    return false
  }
}
