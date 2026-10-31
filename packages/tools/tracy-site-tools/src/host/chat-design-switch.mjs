/**
 * The operator's switch for the chat route to a design system, read at Tracy (`chat-design-route.mjs`
 * says what the route is). Its own module so the catalogue it imports rides only the bundles that ask.
 */
// A relative path, not `@tracy/core/ui-switches`: this plugin's host bundle keeps packages external, and
// the plugin folder the image copies has no node_modules to resolve a bare import from (as `deploy-hold.mjs`).
import { switchesAtTracy } from '../../../../core/tracy-core/src/ui-switches/index.mjs'
import { BUTTON_SWITCH, CHAT_DS_SWITCH } from './chat-design-route.mjs'

/**
 * Whether the chat route and the button are on, as Tracy says now. `chat` is false when Tracy cannot
 * be read; `button` is then assumed on (its default), so the sentence still points somewhere real.
 * `library`: whether Tracy offers the design-system library at all (`GET /api/design-systems`, the
 * door `tracy_design_library` reads at call time), read beside the switches so the site context says
 * it before the first step (#259). Anything but a plain `shown: true` is off, as the tools read it.
 * @param {string | null | undefined} origin
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ chat: boolean, button: boolean, library: boolean }>}
 */
export async function designRoutesAt(origin, fetchImpl) {
  const [on, library] = await Promise.all([
    switchesAtTracy(origin, { ...(fetchImpl ? { fetch: fetchImpl } : {}), timeoutMs: 2500 }),
    libraryShownAt(origin, fetchImpl ?? fetch)
  ])
  return { chat: on?.(CHAT_DS_SWITCH) === true, button: on === null ? true : on(BUTTON_SWITCH), library }
}

/**
 * @param {string | null | undefined} origin
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<boolean>}
 */
async function libraryShownAt(origin, fetchImpl) {
  if (!origin) return false
  try {
    const response = await fetchImpl(`${origin.replace(/\/+$/, '')}/api/design-systems`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(2500)
    })
    if (!response.ok) return false
    return (await response.json())?.shown === true
  } catch {
    return false
  }
}
