/**
 * Voice input for text boxes this plugin does not draw: the Browser tab's comment popover and the
 * Reply box of its thread card (`vendor/tracy/dsh-better-sidebar`, `CommentVoice.tsx`). David
 * 15/10/2026: "flow y chang" as the chat box's microphone, so the box draws THE SAME component
 * (`VoiceInput.tsx`, wrapped with the operator's switch, the translations and the language hint);
 * there is one implementation of dictation, and every fix to it reaches every box.
 *
 * WHY A PAGE GLOBAL AND AN EVENT (council 15/10/2026, option B). The fork imports nothing of Tracy's
 * (its TRACY-FORK.md rule, as the Undo and Design system toolbar buttons). Both bundles take React
 * from dsh, so a component of this bundle renders in the fork's tree. This plugin puts
 * `{version, Component}` on the dsh page's window under {@link VOICE_BRIDGE_KEY} and then says so
 * with {@link VOICE_BRIDGE_EVENT}; the fork listens first and reads the global after, so either bundle
 * may load first. Going away (the client graph unloads), the global is removed and the event said
 * again: the boxes drop the microphone.
 *
 * THE CONTRACT, version 1. `Component` takes the props of dsh's `conversation.input.activity` slot,
 * as the box adapts its own text area to them: `inputActions` (`captureInsertion`, `insertText`,
 * `submit` — what the box's Enter does), `useInput`, `locked`, `onActiveChange`. Everything Tracy's
 * (switch, words, language) is the wrapper's. A change of what a prop means is a new major version;
 * a box that does not know the version draws no microphone. The fork keeps a copy of the two names
 * and the number (`src/client/voice-bridge.ts`); `test/voice-bridge.test.mjs` holds them equal.
 */

export const VOICE_BRIDGE_KEY = '__TRACY_VOICE_INPUT__'
export const VOICE_BRIDGE_EVENT = 'tracy:voice-input-changed'
export const VOICE_BRIDGE_VERSION = 1

/**
 * Publish the component for other boxes on the page.
 * @param {unknown} Component - a React component taking the contract's props.
 * @param {Window & typeof globalThis} [target] - the dsh page's window.
 * @returns {() => void} take it back.
 */
export function publishVoiceInput(Component, target = globalThis.window) {
  if (!target) return () => {}
  const slot = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (target))
  const entry = Object.freeze({ version: VOICE_BRIDGE_VERSION, Component })
  slot[VOICE_BRIDGE_KEY] = entry
  target.dispatchEvent(new Event(VOICE_BRIDGE_EVENT))
  return () => {
    // A newer publish (a reload of this plugin) is not taken back by the older one's disposer.
    if (slot[VOICE_BRIDGE_KEY] !== entry) return
    delete slot[VOICE_BRIDGE_KEY]
    target.dispatchEvent(new Event(VOICE_BRIDGE_EVENT))
  }
}
