/**
 * The page `test/e2e/voice-mode.test.mjs` drives: Chat or Voice for one conversation — the real voice
 * conversation (`voice-mode.mjs`) and its real pieces (`ModeMenu`, `VoiceModeView`, `VoiceModeFooter`,
 * `VoiceModeStart`, `voice-mode-view.mjs`) in a stand-in of dsh's chat column: the session header with
 * its title and utilities, the tab strip (`[data-conversation-tabs]`, one button per view, the voice
 * view's hidden as in dsh), the view of the tab pressed, and the chat box or the view's footer.
 *
 * Real on this page: the microphone path (`openMicrophone`, the AudioWorklet, 16 kHz frames), the
 * voice socket (`openSpeechLink`, to the real relay on the test's server), the reading door
 * (`fetch('/api/speech/say')`, the real tracy-web route on the test's server) and the speakers
 * (`openPlayer`, a real AudioContext). Stood in: dsh's session — its event window and its send verb —
 * driven from the test through `window.__vm`, which also says what was sent and what the chat shows.
 */
import { useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { en, fallback, type StringKey } from '../../src/client/strings'
import {
  type ModeActions,
  ModeMenu,
  VoiceModeFooter,
  VoiceModeStart,
  VoiceModeView,
  VoiceTip
} from '../../src/client/VoiceMode'
import {
  CHAT_VIEW,
  pressViewTab,
  shownSessions,
  VOICE_VIEW,
  viewTab
} from '../../src/client/voice-mode-view.mjs'
import { createVoiceMode } from '../../src/client/voice-mode.mjs'
import { claimVoice } from '../../src/client/voice-claim.mjs'
import { openMicrophone } from '../../src/client/voice-capture'
import { openSpeechLink, speechSocketUrl } from '../../src/client/voice-link.mjs'
import { openPlayer } from '../../src/client/voice-player'
import { VOICE_CSS, VOICE_MODE_CSS } from '../../src/client/voice-styles'

const SESSION = 'fixture-session'
/** Where the note introducing Voice is drawn: over the chat box (a new chat), or under the header's button. */
const TIP_AT = new URLSearchParams(globalThis.location.search).get('tip') === 'header' ? 'header' : 'wave'
const VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric' }
]

/** dsh's event window for the one session, as the voice conversation reads it. */
const feed = {
  entries: [] as { type: 'event'; event: { type: string; data: unknown } }[],
  change: { kind: 'replace', entries: [] as unknown[] } as { kind: string; entries: unknown[] },
  listeners: new Set<() => void>(),
  sent: [] as string[],
  append(events: { type: string; data: unknown }[]) {
    const wrapped = events.map((event) => ({ type: 'event' as const, event }))
    feed.entries = [...feed.entries, ...wrapped]
    feed.change = { kind: 'append', entries: wrapped }
    for (const listener of Array.from(feed.listeners)) listener()
  }
}
const subscribeFeed = (listener: () => void) => {
  feed.listeners.add(listener)
  return () => feed.listeners.delete(listener)
}

const t = (key: StringKey, params?: Record<string, string | number>) => fallback(undefined, key, params)

/** How often the voice asked dsh to stop the work (the footer's Stop, "dừng lại"). */
let cancels = 0

const mode = createVoiceMode({
  openMic: openMicrophone,
  openLink: openSpeechLink,
  socketUrl: () => speechSocketUrl(globalThis.location, 'vi', true),
  send: async (_sessionId: string, text: string) => {
    feed.sent.push(text)
    feed.append([
      { type: 'user/message', data: { content: [{ type: 'text', text }], source: { kind: 'user' } } }
    ])
    return 'sent'
  },
  cancel: async () => {
    cancels += 1
    return true
  },
  warm: true,
  events: () => ({ getSnapshot: () => feed, subscribe: subscribeFeed }),
  speak: (
    text: string,
    { voice, language, signal }: { voice: string; language: string; signal: AbortSignal }
  ) =>
    fetch('/api/speech/say', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice, language }),
      signal
    }),
  openPlayer,
  languageOf: () => 'vi',
  uiLanguage: () => 'en',
  phrase: (key: string, params?: Record<string, string | number>) =>
    key in en ? t(key as StringKey, params) : key,
  claim: claimVoice,
  limits: () => ({ maxChars: 600, sampleRate: 24_000, silenceSeconds: 30, voices: VOICES })
})

;(window as unknown as { __vm: object }).__vm = {
  state: () => mode.getSnapshot(),
  sent: () => [...feed.sent],
  append: (events: { type: string; data: unknown }[]) => feed.append(events),
  hide: () => mode.hidden(),
  cancels: () => cancels
}

/** The chat thread: the person's messages on the right, Tracy's words on the left. */
function Thread() {
  const entries = useSyncExternalStore(subscribeFeed, () => feed.entries)
  return (
    <div className="fx-thread" data-fixture="thread">
      {entries.flatMap((entry, i) => {
        const { type, data } = entry.event as { type: string; data: any }
        if (type === 'user/message')
          return [
            <div key={i} className="fx-bubble fx-mine" data-fixture="user-message">
              {data.content[0].text}
            </div>
          ]
        if (type === 'assistant/message') {
          const text = data.message.content
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { text: string }) => b.text)
            .join('\n')
          return text
            ? [
                <div key={i} className="fx-tracy" data-fixture="tracy-message">
                  {text}
                </div>
              ]
            : []
        }
        if (type === 'tool/call')
          return [
            <div key={i} className="fx-tool">
              Tool call
            </div>
          ]
        return []
      })}
    </div>
  )
}

/** dsh's view store, as far as the page shows it: the view of the tab pressed. */
const views = {
  shown: CHAT_VIEW as string,
  listeners: new Set<() => void>(),
  select(id: string) {
    views.shown = id
    for (const fn of Array.from(views.listeners)) fn()
  }
}
const subscribeViews = (fn: () => void) => {
  views.listeners.add(fn)
  return () => views.listeners.delete(fn)
}

const voiceShown = shownSessions()
const actions: ModeActions = {
  voice(sessionId) {
    mode.start(sessionId)
    pressViewTab(
      () => viewTab(document, VOICE_VIEW),
      (fn) => requestAnimationFrame(fn)
    )
  },
  chat() {
    mode.end()
    pressViewTab(
      () => viewTab(document, CHAT_VIEW),
      (fn) => requestAnimationFrame(fn)
    )
  }
}
const markShown = (id: string, on: boolean) => voiceShown.mark(id, on)

function Composer() {
  const [empty, setEmpty] = useState(true)
  return (
    <div className="fx-seat" data-slot="conversation.composer.bar">
      <div className="fx-card">
        <div className="fx-scroll">
          <div
            className="fx-draft"
            contentEditable="true"
            suppressContentEditableWarning
            data-fixture="draft"
            onInput={(event) => setEmpty((event.target as HTMLDivElement).textContent === '')}
          />
          {empty && (
            <div className="fx-placeholder" aria-hidden data-composer-placeholder="">
              Ask Tracy to change your site…
            </div>
          )}
        </div>
        <div className="fx-row">
          <button type="button" className="fx-add" aria-label="Commands">
            +
          </button>
          <div className="fx-trailing">
            <span className="fx-model">Opus 5.5</span>
            <div className="fx-activity">
              <button type="button" className="tv-voice-mic" aria-label="Dictate">
                🎙
              </button>
              <VoiceModeStart sessionId={SESSION} usable actions={actions} />
            </div>
            <button type="button" className="fx-send" aria-label="Send">
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const TABS = [
  { id: CHAT_VIEW, label: 'Chat' },
  { id: VOICE_VIEW, label: 'Voice' },
  { id: 'comments', label: 'Comments' },
  { id: 'trajectory', label: 'Trajectory' }
]

function Column() {
  const shown = useSyncExternalStore(subscribeViews, () => views.shown)
  const inVoice = useSyncExternalStore(voiceShown.subscribe, () => voiceShown.has(SESSION))
  return (
    <div className="fx-column">
      <div className="fx-header">
        <div className="fx-title">
          <span className="fx-logo" aria-hidden="true">
            W
          </span>
          demodesignsystem <span className="fx-caret">⌄</span>
        </div>
        <div className="fx-utilities" data-slot="conversation.session.header.utilities">
          <ModeMenu
            sessionId={SESSION}
            mode={mode}
            usable
            inVoice={inVoice}
            voices={VOICES}
            actions={actions}
            tip={TIP_AT === 'header'}
          />
          <button type="button" className="fx-more" aria-label="More">
            ··
          </button>
        </div>
      </div>
      <div className="fx-tabs" role="tablist" data-conversation-tabs="">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-view={tab.id}
            aria-selected={shown === tab.id}
            onClick={() => views.select(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="fx-body">
        {shown === VOICE_VIEW ? (
          <VoiceModeView sessionId={SESSION} mode={mode} actions={actions} shown={markShown} />
        ) : (
          <Thread />
        )}
      </div>
      {!inVoice && (
        <div className="fx-dock" data-slot="conversation.input.dock">
          <VoiceTip shown={TIP_AT === 'wave'} />
        </div>
      )}
      {inVoice ? <VoiceModeFooter sessionId={SESSION} mode={mode} actions={actions} /> : <Composer />}
    </div>
  )
}

const style = document.createElement('style')
style.textContent = `${VOICE_CSS}${VOICE_MODE_CSS}
:root { --foreground: #172026; --background: #ffffff; --muted-foreground: #6b7280; --input: #e3e7e9; --border: #e5e7eb; --ring: #bf5b3d; --primary: #bf5b3d; --popover: #ffffff; --destructive: #dc2626; --dsw-alias-brand-primary: #bf5b3d; }
@media (prefers-color-scheme: dark) {
  :root { --foreground: #f2f4f5; --background: #111315; --muted-foreground: #9aa3ab; --input: #394047; --border: #2c3136; --popover: #1b1f22; --destructive: #f87171; }
}
body { margin: 0; background: var(--background); color: var(--foreground); font: 14px/20px system-ui, sans-serif; }
.fx-column { display: flex; flex-direction: column; height: 100vh; max-width: 720px; margin: 0 auto; }
.fx-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 6px; }
.fx-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 17px; }
.fx-logo { display: inline-flex; width: 22px; height: 22px; border-radius: 999px; align-items: center; justify-content: center; border: 1.5px solid var(--muted-foreground); font-size: 12px; color: var(--muted-foreground); }
.fx-caret { color: var(--muted-foreground); font-weight: 400; }
.fx-utilities { display: flex; align-items: center; gap: 4px; }
.fx-more { width: 28px; height: 28px; border: 0; background: transparent; color: var(--muted-foreground); font-size: 16px; }
.fx-tabs { display: flex; gap: 22px; padding: 0 16px; border-bottom: 1px solid var(--border); }
.fx-tabs button { border: 0; background: transparent; padding: 10px 0; color: var(--muted-foreground); font: inherit; font-size: 15px; }
.fx-tabs button[aria-selected="true"] { color: var(--primary); box-shadow: inset 0 -2px 0 var(--primary); }
.fx-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.fx-thread { overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 16px; }
.fx-bubble { align-self: flex-end; max-width: 75%; padding: 10px 14px; border-radius: 14px; background: color-mix(in oklab, var(--foreground) 9%, transparent); }
.fx-tracy { align-self: flex-start; max-width: 85%; white-space: pre-wrap; }
.fx-tool { align-self: flex-start; font-size: 12px; color: var(--muted-foreground); }
.fx-seat { padding: 0 16px 16px; }
.fx-dock { padding: 0 16px; }
.fx-card { position: relative; border: 1px solid var(--border); border-radius: 16px; padding: 10px 12px 12px 8px; box-shadow: 0 1px 2px rgb(0 0 0 / 0.06); }
.fx-overlay { position: absolute; inset: 0 0 auto; height: 0; }
.fx-scroll { position: relative; }
.fx-draft { min-height: 36px; padding: 4px; outline: none; }
.fx-placeholder { position: absolute; top: 4px; left: 4px; color: var(--muted-foreground); pointer-events: none; }
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
createRoot(root).render(<Column />)
