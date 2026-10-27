/**
 * The chat route to a design system, behind the operator's switch `chat-design-system` (catalogue
 * `@tracy/core/ui-switches`, off by default since 11/10/2026 — David: the Design system button in the
 * site browser toolbar is the only way in, the chat route stays and is turned off).
 *
 * What this plugin's page holds of that route is the preview dialog's "Use this inspiration": it
 * records the pick for the agent's redesign and sends "I chose … Continue with step 3." into the
 * chat, where the agent restyles the running site. Off, the button is not drawn. "Create with
 * <CMS>" stays: it makes a NEW site from the design (the creation workspace's Build tab), not a
 * chat turn on this one.
 */

/** The switch, as the catalogue names it. */
export const CHAT_DS_SWITCH = 'chat-design-system'

/**
 * Whether the preview dialog offers "Use this inspiration".
 * @param {{ publicMode: boolean, template: boolean, chatRoute: boolean }} q - `publicMode`: the public
 *   page (no seat, no site); `template`: a finished template (it has no redesign to continue);
 *   `chatRoute`: the switch above.
 * @returns {boolean}
 */
export function offersUseThis({ publicMode, template, chatRoute }) {
  return !publicMode && !template && chatRoute
}

/**
 * Whether "Create with <CMS>" also records the pick into this site's `design-preview.json`
 * (`POST …/choose`). That record is read only by the chat redesign of the RUNNING site, and the host
 * closes the door with the same switch (403 `CHAT_DESIGN_SYSTEM_OFF`): with the route off the call
 * could only fail, once per press, in the console (DI-1, dev 12/10/2026). The new site gets its
 * design from the Build tab either way.
 * @param {{ chatRoute: boolean }} q - `chatRoute`: the switch above.
 * @returns {boolean}
 */
export function recordsPickOnCreate({ chatRoute }) {
  return chatRoute
}
