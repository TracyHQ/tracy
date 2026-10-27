/**
 * The page `test/e2e/voice-input.test.mjs` drives for the Browser tab's comment boxes: the fork's real
 * `CommentVoice` (`vendor/tracy/dsh-better-sidebar/src/client/CommentVoice.tsx`, the `<textarea>`
 * adapter) inside a stand-in of the comment popover — the same `data-voice-composer` root, a controlled
 * text area whose Enter sends with the microphone in its field (the fork's place for it), a foot with
 * the paperclip, "Note for team" and "Ask Tracy ↵" — and the
 * real `VoiceInput` published through the real bridge (`voice-bridge.mjs`), as `index.tsx` does it.
 *
 * `?lang=` is the interface language the published microphone hints with; `?late=1` publishes it after
 * the boxes are drawn (the chat plugin loading second); `?two=1` draws two boxes (one listens at a time).
 * `window.__comment` reads each box's words, what it sent and whether it was closed.
 */
import { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceInput, type VoiceInputProps } from '../../src/client/VoiceInput'
import { VOICE_CSS } from '../../src/client/voice-styles'
import { publishVoiceInput } from '../../src/client/voice-bridge.mjs'
import { CommentVoice } from '../../../../../vendor/tracy/dsh-better-sidebar/src/client/CommentVoice.tsx'

const params = new URLSearchParams(location.search)
const lang = params.get('lang') ?? ''
const boxes: Record<string, { text: string; sent: string[]; closed: boolean }> = {}
const times = { drawn: 0, published: 0 }
;(window as unknown as { __comment: object }).__comment = {
  times: () => ({ ...times }),
  text: (id = 'a') => boxes[id]?.text ?? '',
  sent: (id = 'a') => [...(boxes[id]?.sent ?? [])],
  closed: (id = 'a') => boxes[id]?.closed === true
}

function Popover({ id }: { id: string }) {
  boxes[id] ??= { text: '', sent: [], closed: false }
  const [text, setWords] = useState('')
  const textRef = useRef(text)
  const setText = useCallback(
    (next: string) => {
      textRef.current = next
      boxes[id].text = next
      setWords(next)
    },
    [id]
  )
  const field = useRef<HTMLTextAreaElement | null>(null)
  const [voice, setVoice] = useState(false)
  const [closed, setClosed] = useState(false)
  const send = useCallback(() => {
    if (textRef.current.trim() === '') return
    boxes[id].sent.push(textRef.current)
    setText('')
  }, [id, setText])
  if (closed) return null
  times.drawn ||= performance.now()
  return (
    <div
      className="fx-popover"
      role="dialog"
      aria-label={`Comment ${id}`}
      data-box={id}
      data-voice-composer=""
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          boxes[id].closed = true
          setClosed(true)
        }
      }}
    >
      <div className="fx-head">
        <span>Comment</span>
        <button type="button" className="fx-x" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="fx-path">
        Block › Header › Block › Menu › <b>List</b>
      </div>
      <div className={voice ? 'fx-field fx-field-on' : 'fx-field'}>
        <textarea
          ref={field}
          className="fx-area"
          rows={3}
          value={text}
          placeholder="Describe what should change…"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
        />
        <span className={voice ? 'fx-voice fx-voice-on' : 'fx-voice'}>
          <CommentVoice text={text} setText={setText} field={field} submit={send} onActiveChange={setVoice} />
        </span>
      </div>
      <div className="fx-foot">
        {!voice && (
          <button type="button" className="fx-clip" aria-label="Attach files">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        <span className="fx-end">
          {!voice && (
            <button type="button" className="fx-secondary">
              Note for team
            </button>
          )}
          <button type="button" className="fx-send" onClick={send}>
            Ask Tracy <span className="fx-key">↵</span>
          </button>
        </span>
      </div>
    </div>
  )
}

/** As `index.tsx` publishes it: the switch is on here, the words English, the hint the interface's. */
const BoxVoice = (props: Omit<VoiceInputProps, 'shown' | 't' | 'mainLanguage' | 'sessionId'>) => (
  <VoiceInput {...props} shown mainLanguage={() => lang} />
)
const publish = () => {
  times.published = performance.now()
  publishVoiceInput(BoxVoice)
}
if (params.get('late') === '1') setTimeout(publish, 1500)
else publish()

const style = document.createElement('style')
style.textContent = `${VOICE_CSS}
:root { color-scheme: dark; --foreground: #ececec; --background: #1f1f1f; --muted-foreground: #9a9a9a; --input: #3a3a3a; --border: #3a3a3a; --dsw-alias-brand-primary: #bf5b3d; }
body { margin: 0; padding: 32px 24px; background: #121417; color: var(--foreground); font: 12px/18px system-ui, sans-serif; display: flex; gap: 24px; align-items: flex-start; }
.fx-popover { box-sizing: border-box; width: 340px; padding: 10px; border: 1px solid #3a3a3a; border-radius: 8px; background: #262626; box-shadow: 0 8px 24px rgb(0 0 0 / 0.4); }
.fx-head { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 600; color: #cfcfcf; }
.fx-x { width: 22px; height: 22px; border: 0; background: transparent; color: #9a9a9a; }
.fx-path { margin: 8px 0; color: #9a9a9a; font-size: 13px; }
.fx-path b { padding: 2px 6px; border-radius: 6px; background: #4a3a33; color: #f2e6e0; font-weight: 600; }
.fx-area { box-sizing: border-box; width: 100%; padding: 8px 10px; border: 1px solid #3a3a3a; border-radius: 8px; background: #1c1c1c; color: var(--foreground); font: 13px/19px system-ui, sans-serif; resize: none; outline: none; }
.fx-area:focus { border-color: #bf5b3d; }
.fx-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.fx-clip { width: 28px; height: 28px; border: 1px solid #3a3a3a; border-radius: 8px; background: #1f1f1f; color: #9a9a9a; display: inline-flex; align-items: center; justify-content: center; }
.fx-end { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px; margin-left: auto; }
.fx-field { position: relative; }
.fx-voice { position: absolute; right: 4px; bottom: 4px; display: flex; align-items: center; min-width: 0; }
.fx-voice:empty { display: none; }
.fx-field:has(.fx-voice:not(:empty)) .fx-area { padding-right: 36px; }
.fx-voice-on { left: 6px; right: 6px; bottom: 6px; }
.fx-field-on .fx-area { padding-right: 10px; padding-bottom: 40px; }
.fx-secondary { height: 32px; padding: 0 12px; border: 1px solid #3a3a3a; border-radius: 8px; background: #1f1f1f; color: #ececec; font: 600 13px system-ui, sans-serif; }
.fx-send { height: 28px; padding: 0 10px; border: 0; border-radius: 8px; background: #bf5b3d; color: #fff; font: 600 12px system-ui, sans-serif; display: inline-flex; align-items: center; gap: 6px; }
.fx-key { opacity: 0.8; }
`
document.head.appendChild(style)
const root = document.createElement('div')
root.style.display = 'contents'
document.body.appendChild(root)
createRoot(root).render(
  <>
    <Popover id="a" />
    {params.get('two') === '1' && <Popover id="b" />}
  </>
)
