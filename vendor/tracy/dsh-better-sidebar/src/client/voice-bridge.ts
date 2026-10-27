/**
 * Tracy's microphone in this fork's comment boxes, the contract side (TCH `feat/voice-comment`, David
 * 15/10/2026: voice in the comment popover, "flow y chang" as the chat box's). The fork imports nothing of
 * Tracy's: TCH `@tracy/dsh-chat-input` puts `{version, Component}` on the dsh page's window under
 * {@link VOICE_BRIDGE_KEY} and says so with {@link VOICE_BRIDGE_EVENT} (`voice-bridge.mjs` there); the
 * Component is the chat box's own `VoiceInput`, with Tracy's switch, words and language already bound.
 * This side listens first and reads the global after, so either bundle may load first; no global, an
 * unknown version or an operator who turned voice off draws no microphone.
 *
 * Version 1's props are those of dsh's `conversation.input.activity` slot (the chat box's microphone),
 * which `CommentVoice.tsx` adapts a `<textarea>` to. TCH `packages/ui/tracy-chat-input/test/voice-bridge.test.mjs`
 * holds the two names and the number equal on both sides.
 */
import { useSyncExternalStore, type ComponentType } from 'react'

export const VOICE_BRIDGE_KEY = '__TRACY_VOICE_INPUT__'
export const VOICE_BRIDGE_EVENT = 'tracy:voice-input-changed'
export const VOICE_BRIDGE_VERSION = 1

/** A place in the box's words, with the revision it was read at (dsh's `TokenSpan`). */
export interface VoiceSpan {
  start: number
  end: number
  draftRev: number
}

/** What the microphone may do to a box (dsh's `InputActions`, the part it uses). */
export interface VoiceActions {
  captureInsertion(): VoiceSpan
  insertText(text: string, span: VoiceSpan): boolean
  /** The box's Enter: the microphone presses it once the last phrase is confirmed. */
  submit(): void
}

/** Version 1's props. */
export interface VoiceBoxProps {
  inputActions: VoiceActions
  useInput: <T>(selector: (state: { draft: string }) => T) => T
  locked?: boolean
  onActiveChange?: (active: boolean) => void
}

export type VoiceComponent = ComponentType<VoiceBoxProps>

/** The published microphone, or null (none, or a version this fork does not know). */
export function readVoiceComponent(target: object = globalThis): VoiceComponent | null {
  const entry = (target as Record<string, unknown>)[VOICE_BRIDGE_KEY]
  if (entry === null || typeof entry !== 'object') return null
  const { version, Component } = entry as { version?: unknown; Component?: unknown }
  if (version !== VOICE_BRIDGE_VERSION) return null
  // A function component, or a memo/forwardRef object.
  if (typeof Component !== 'function' && (Component === null || typeof Component !== 'object')) return null
  return Component as VoiceComponent
}

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(VOICE_BRIDGE_EVENT, listener)
  return () => { window.removeEventListener(VOICE_BRIDGE_EVENT, listener) }
}

/** The microphone Tracy published, followed live. */
export function useVoiceComponent(): VoiceComponent | null {
  return useSyncExternalStore(subscribe, () => readVoiceComponent(), () => null)
}
