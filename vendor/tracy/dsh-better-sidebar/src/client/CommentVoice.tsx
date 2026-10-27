/**
 * Tracy's microphone in a comment box: the new-pick popover and the thread card's Reply box
 * (`CommentLayer.tsx`). The microphone is Tracy's chat-box component, drawn here as published
 * (`voice-bridge.ts`); this file only adapts the box's `<textarea>` to the props it takes in the chat box,
 * so dictation behaves the same in both (David 15/10/2026: "flow y chang").
 *
 * THE ADAPTER (`textDraft`), dsh's draft rules restated for a text area:
 *   - `captureInsertion` is the caret while the person is in the box (the selection's end is where the
 *     words go; a selection is never replaced), else the end of the words — a microphone pressed from
 *     outside the box adds to what is there;
 *   - `insertText` replaces exactly the span it is given, and only at the revision it was read at: a box
 *     changed in between (the person typed, a mention was picked) refuses, and the microphone stops for
 *     good, leaving the words where they are;
 *   - the revision moves on every change of the words, the microphone's own included.
 * `submit` is the box's Enter (the same action its ↵ button names); the microphone presses it after it
 * confirmed the last phrase, once.
 *
 * The box marks its root `data-voice-composer`: the microphone's keyboard rules (Enter finishes then
 * presses, Esc takes the dictated words back out and keeps the box open, typing stops it) apply inside
 * it. A microphone that throws draws nothing; the box works on without it.
 */
import { Component, useMemo, useRef, type ErrorInfo, type ReactElement, type ReactNode, type RefObject } from 'react'
import { useVoiceComponent, type VoiceActions } from './voice-bridge.ts'

/** A box's words as the microphone edits them. */
export interface TextDraft {
  /** The words as the box shows them now: a change this adapter did not write moves the revision. */
  sync(text: string): void
  actions: VoiceActions
}

/**
 * @param write - set the box's words (its controlled text area's setter).
 * @param caret - the text area's selection, or null when it does not show the words this adapter knows.
 * @param submit - the box's Enter.
 */
export function textDraft(write: (text: string) => void, caret: (text: string) => { start: number; end: number } | null, submit: () => void): TextDraft {
  let text = ''
  let rev = 0
  return {
    sync(next) {
      if (next === text) return
      text = next
      rev += 1
    },
    actions: {
      captureInsertion() {
        const at = caret(text)
        const end = at === null ? text.length : Math.min(Math.max(at.end, 0), text.length)
        const start = at === null ? end : Math.min(Math.max(at.start, 0), end)
        return { start, end, draftRev: rev }
      },
      insertText(words, span) {
        if (span.draftRev !== rev || span.start < 0 || span.start > span.end || span.end > text.length) return false
        text = text.slice(0, span.start) + words + text.slice(span.end)
        rev += 1
        write(text)
        return true
      },
      submit,
    },
  }
}

/** A microphone that throws is dropped; the box stays. */
class VoiceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[dsh-better-sidebar] voice input failed; the comment box goes on without it', error, info.componentStack)
  }
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * The microphone of one comment box, or nothing (Tracy published none, or voice is off).
 * @param props.onActiveChange - stable (a state setter): the box hides what the listening row replaces.
 */
export function CommentVoice(props: {
  text: string
  setText: (text: string) => void
  field: RefObject<HTMLTextAreaElement | null>
  submit: () => void
  locked?: boolean
  onActiveChange: (active: boolean) => void
}): ReactElement | null {
  const Voice = useVoiceComponent()
  const latest = useRef(props)
  latest.current = props
  const draft = useMemo(() => textDraft(
    (text) => { latest.current.setText(text) },
    (text) => {
      const el = latest.current.field.current
      if (el === null || el.value !== text || el.ownerDocument.activeElement !== el) return null
      return { start: el.selectionStart, end: el.selectionEnd }
    },
    () => { latest.current.submit() },
  ), [])
  // Idempotent: a render with the same words moves nothing (StrictMode's second pass included).
  draft.sync(props.text)
  const useInput = useMemo(() => <T,>(selector: (state: { draft: string }) => T): T => selector({ draft: latest.current.text }), [])
  if (Voice === null) return null
  return (
    <VoiceBoundary>
      <Voice inputActions={draft.actions} useInput={useInput} locked={props.locked} onActiveChange={props.onActiveChange} />
    </VoiceBoundary>
  )
}
