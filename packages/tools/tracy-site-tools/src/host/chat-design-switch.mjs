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
 * @param {string | null | undefined} origin
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ chat: boolean, button: boolean }>}
 */
export async function designRoutesAt(origin, fetchImpl) {
  const on = await switchesAtTracy(origin, { ...(fetchImpl ? { fetch: fetchImpl } : {}), timeoutMs: 2500 })
  return { chat: on?.(CHAT_DS_SWITCH) === true, button: on === null ? true : on(BUTTON_SWITCH) }
}
