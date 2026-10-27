/**
 * The page `test/e2e/voice-input.test.mjs` drives: the real `VoiceInput` in a stand-in of dsh's chat
 * box — the same `data-slot`, a contenteditable draft, the activity area between a model chip and
 * Send — with `inputActions` over a plain string that keeps dsh's rules (a revision that moves with
 * content only, `insertText` refused once the revision is not the caller's, `submit` takes the draft).
 * `window.__voice` reads the draft, its revision and what was sent. `?first=<text>` is the chat's
 * opening message, in the session event window the real `voiceHint` reads (`voice-language.mjs`).
 */
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceInput } from '../../src/client/VoiceInput'
import { voiceHint } from '../../src/client/voice-language.mjs'
import { VOICE_CSS } from '../../src/client/voice-styles'

interface Span {
  start: number
  end: number
  draftRev: number
}

const store = {
  text: new URLSearchParams(location.search).get('draft') ?? '',
  rev: 0,
  sent: [] as string[],
  listeners: new Set<() => void>(),
  set(text: string) {
    if (text === store.text) return
    store.text = text
    store.rev += 1
    for (const listener of store.listeners) listener()
  }
}
;(window as unknown as { __voice: object }).__voice = {
  text: () => store.text,
  rev: () => store.rev,
  sent: () => [...store.sent]
}

const opening = new URLSearchParams(location.search).get('first')
/** dsh's session list, as far as the hint reads it: one session whose window holds the opening message. */
const sessions = {
  binding: () => ({
    eventSource: {
      getSnapshot: () => ({
        entries: opening
          ? [
              {
                type: 'event',
                event: { type: 'user/message', data: { content: [{ type: 'text', text: opening }] } }
              }
            ]
          : []
      })
    }
  })
}

const actions = {
  captureInsertion: (): Span => ({ start: store.text.length, end: store.text.length, draftRev: store.rev }),
  insertText(text: string, span: Span): boolean {
    if (span.draftRev !== store.rev) return false
    store.set(store.text.slice(0, span.start) + text + store.text.slice(span.end))
    return true
  },
  submit() {
    if (store.text.trim() === '') return
    store.sent.push(store.text)
    store.set('')
  }
}

const subscribe = (listener: () => void) => {
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}
function useInput<T>(selector: (state: { draft: string }) => T): T {
  return selector({ draft: useSyncExternalStore(subscribe, () => store.text) })
}

function Composer() {
  const draft = useSyncExternalStore(subscribe, () => store.text)
  const editable = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(false)
  // The draft paints from the store; the person's typing writes back into it.
  useLayoutEffect(() => {
    if (editable.current && editable.current.textContent !== draft) editable.current.textContent = draft
  }, [draft])
  const onActiveChange = useMemo(() => (next: boolean) => setActive(next), [])
  return (
    <div className="fx-seat" data-slot="conversation.composer.bar">
      <div className="fx-card">
        <div
          ref={editable}
          className="fx-draft"
          contentEditable="true"
          suppressContentEditableWarning
          data-placeholder="Ask Tracy to change your site…"
          onInput={(event) => store.set((event.target as HTMLDivElement).textContent ?? '')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              actions.submit()
            }
          }}
        />
        <div className="fx-row">
          <button type="button" className="fx-add" aria-label="Commands">
            +
          </button>
          <div className="fx-trailing">
            <span className="fx-model" hidden={active}>
              Opus 5.5
            </span>
            <div className={active ? 'fx-activity fx-activity-on' : 'fx-activity'}>
              <VoiceInput
                sessionId="fixture"
                inputActions={actions}
                useInput={useInput}
                onActiveChange={onActiveChange}
                shown
                mainLanguage={() => voiceHint(sessions, 'fixture')}
              />
            </div>
            <button type="button" className="fx-send" aria-label="Send" onClick={() => actions.submit()}>
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const style = document.createElement('style')
style.textContent = `${VOICE_CSS}
:root { --foreground: #172026; --background: #ffffff; --muted-foreground: #6b7280; --input: #e3e7e9; --border: #e5e7eb; --ring: #bf5b3d; --primary: #bf5b3d; }
@media (prefers-color-scheme: dark) {
  :root { --foreground: #f2f4f5; --background: #1b1f22; --muted-foreground: #9aa3ab; --input: #394047; --border: #394047; }
}
body { margin: 0; padding: 40px 24px; background: var(--background); color: var(--foreground); font: 14px/20px system-ui, sans-serif; }
.fx-seat { max-width: 680px; margin: 0 auto; }
.fx-card { border: 1px solid var(--border); border-radius: 16px; padding: 10px 12px 12px 8px; box-shadow: 0 1px 2px rgb(0 0 0 / 0.06); }
.fx-draft { min-height: 44px; padding: 4px; outline: none; white-space: pre-wrap; }
.fx-draft:empty::before { content: attr(data-placeholder); color: var(--muted-foreground); }
.fx-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.fx-add { width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--muted-foreground); }
.fx-trailing { display: flex; align-items: center; gap: 8px; margin-left: auto; flex: 1 1 auto; justify-content: flex-end; min-width: 0; }
.fx-model { font-size: 13px; color: var(--muted-foreground); }
.fx-activity { display: flex; }
.fx-activity-on { flex: 1 1 auto; min-width: 0; }
.fx-send { width: 30px; height: 30px; border: 0; border-radius: 999px; background: var(--primary); color: #fff; font-size: 16px; }
`
document.head.appendChild(style)
const root = document.createElement('div')
document.body.appendChild(root)
createRoot(root).render(<Composer />)
