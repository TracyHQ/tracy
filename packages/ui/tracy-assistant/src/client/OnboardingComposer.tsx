/**
 * Help-only composer for the creation workspace. It never receives an agent send callback.
 *
 * Files (David, 26/10/2026): the paperclip, a drop anywhere on the page, or a paste adds files. Each is
 * uploaded at once (`files.ts`) and shown as a chip; a question carries the stored ones, and may be only
 * files. Send waits while an upload runs.
 */
import { Paperclip } from 'lucide-react'
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import { createPortal } from 'react-dom'
import { DraftChips } from './FileChips'
import { ACCEPT_ATTR, type DraftFile, type HelpFile, MAX_FILES, problemOf, type uploadFile } from './files'
import type { AssistantKey, Translate } from './strings'

// Version 1 of chat-input's voice-bridge.mjs: the same dictation component used by site composers.
const VOICE_BRIDGE_KEY = '__TRACY_VOICE_INPUT__'
const VOICE_BRIDGE_EVENT = 'tracy:voice-input-changed'
interface VoiceSpan {
  start: number
  end: number
  draftRev: number
}
interface VoiceProps {
  inputActions: {
    captureInsertion(): VoiceSpan
    insertText(text: string, span: VoiceSpan): boolean
    submit(): void
  }
  useInput: <T>(selector: (state: { draft: string }) => T) => T
  locked?: boolean
  onActiveChange?: (active: boolean) => void
}
function readVoice(): ComponentType<VoiceProps> | null {
  if (typeof window === 'undefined') return null
  const entry = (window as unknown as Record<string, unknown>)[VOICE_BRIDGE_KEY]
  if (!entry || typeof entry !== 'object') return null
  const { version, Component } = entry as { version?: unknown; Component?: unknown }
  if (version !== 1 || !Component || (typeof Component !== 'function' && typeof Component !== 'object'))
    return null
  return Component as ComponentType<VoiceProps>
}
function subscribeVoice(listener: () => void) {
  window.addEventListener(VOICE_BRIDGE_EVENT, listener)
  return () => window.removeEventListener(VOICE_BRIDGE_EVENT, listener)
}
const noVoice = () => null

/** Local ids of draft chips. */
let chipCounter = 0

export function OnboardingComposer({
  ask,
  upload,
  enabled,
  t,
  activity,
  hasQuestion = false,
  startRow
}: {
  ask: (text: string, files: readonly HelpFile[]) => void
  /** Stores one file (`files.ts`, `uploadFile` bound to the session); absent, the chat box takes no files. */
  upload?: (file: File) => ReturnType<typeof uploadFile>
  enabled: boolean
  t: Translate
  activity?: ReactNode
  hasQuestion?: boolean
  /** The start doors, shown right above the composer once the page holds a conversation. */
  startRow?: ReactNode
}) {
  const [draft, setDraft] = useState('')
  const [sent, setSent] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const [files, setFiles] = useState<DraftFile[]>([])
  const [notice, setNotice] = useState<{ key: AssistantKey; name?: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const Voice = useSyncExternalStore(subscribeVoice, readVoice, noVoice)
  const field = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const words = useRef({ text: '', rev: 0 })
  const filesNow = useRef<DraftFile[]>([])
  filesNow.current = files
  const latest = useRef({ ask, enabled, upload })
  latest.current = { ask, enabled, upload }
  const takesFiles = upload !== undefined && enabled
  /** Change one chip by its key, wherever the list is by then. */
  const patchFile = useCallback((key: string, change: Partial<DraftFile>) => {
    setFiles((list) => list.map((f) => (f.key === key ? { ...f, ...change } : f)))
  }, [])
  const addFiles = useCallback(
    (list: readonly File[]) => {
      const store = latest.current.upload
      if (!latest.current.enabled || !store || list.length === 0) return
      setNotice(null)
      let room = MAX_FILES - filesNow.current.filter((f) => f.status !== 'failed').length
      const added: DraftFile[] = []
      for (const file of list) {
        const key = `f${++chipCounter}`
        const problem = problemOf(file)
        if (problem) {
          added.push({ key, name: file.name, bytes: file.size, status: 'failed', problem })
          setNotice({ key: problem, name: file.name })
          continue
        }
        if (room <= 0) {
          setNotice({ key: 'file.tooMany' })
          continue
        }
        room--
        added.push({ key, name: file.name, bytes: file.size, status: 'uploading' })
        void store(file).then((out) => {
          if (out.ok) patchFile(key, { status: 'done', file: out.file, bytes: out.file.bytes })
          else {
            patchFile(key, { status: 'failed', problem: out.problem })
            setNotice({ key: out.problem, name: file.name })
          }
        })
      }
      if (added.length > 0) {
        filesNow.current = [...filesNow.current, ...added]
        setFiles(filesNow.current)
      }
    },
    [patchFile]
  )
  // Update the revision synchronously: dictation may write and capture again before React renders.
  const write = useCallback((text: string) => {
    if (text === words.current.text) return
    words.current = { text, rev: words.current.rev + 1 }
    setDraft(text)
  }, [])
  const send = useCallback((text: string, stored: readonly HelpFile[]) => {
    if (!latest.current.enabled || (text.trim() === '' && stored.length === 0)) return
    setSent(true)
    latest.current.ask(text, stored)
  }, [])
  const submit = useCallback(() => {
    const list = filesNow.current
    // Nothing goes while a file is still on its way: the question would leave it behind.
    if (!latest.current.enabled || list.some((f) => f.status === 'uploading')) return
    const stored = list.flatMap((f) => (f.status === 'done' && f.file ? [f.file] : []))
    if (words.current.text.trim() === '' && stored.length === 0) return
    send(words.current.text, stored)
    write('')
    setFiles([])
    setNotice(null)
  }, [send, write])
  // A drop anywhere on the page adds files, as a site's chat box does (`@tracy/dsh-chat-input`'s
  // `composer-drop.ts`; that one is not mounted here, this composer replaces dsh's bar).
  useEffect(() => {
    if (!takesFiles) return
    let depth = 0
    const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') === true
    const onEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth += 1
      setDragging(true)
    }
    const onOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth = 0
      setDragging(false)
      addFiles([...(event.dataTransfer?.files ?? [])])
    }
    document.addEventListener('dragenter', onEnter)
    document.addEventListener('dragover', onOver)
    document.addEventListener('dragleave', onLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onEnter)
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('dragleave', onLeave)
      document.removeEventListener('drop', onDrop)
      setDragging(false)
    }
  }, [takesFiles, addFiles])
  const inputActions = useMemo(
    () => ({
      captureInsertion() {
        const { text, rev } = words.current
        const el = field.current
        const focused = el && el.value === text && el.ownerDocument.activeElement === el
        const end = focused ? Math.min(Math.max(el.selectionEnd, 0), text.length) : text.length
        const start = focused ? Math.min(Math.max(el.selectionStart, 0), end) : end
        return { start, end, draftRev: rev }
      },
      insertText(text: string, span: VoiceSpan) {
        const current = words.current
        if (
          !latest.current.enabled ||
          span.draftRev !== current.rev ||
          span.start < 0 ||
          span.start > span.end ||
          span.end > current.text.length
        )
          return false
        write(current.text.slice(0, span.start) + text + current.text.slice(span.end))
        return true
      },
      submit
    }),
    [submit, write]
  )
  const useInput = useCallback(
    <T,>(selector: (state: { draft: string }) => T): T => selector({ draft: words.current.text }),
    []
  )
  const conversation = sent || hasQuestion
  const uploading = files.some((f) => f.status === 'uploading')
  const stored = files.some((f) => f.status === 'done')
  const canSend = enabled && !uploading && (draft.trim() !== '' || stored)
  return (
    <div
      className="tv-onboarding-input"
      data-tracy-help-composer=""
      data-tracy-help-conversation={conversation ? '' : undefined}
    >
      {conversation ? startRow : null}
      <form
        className="tv-onboarding-composer"
        data-composer-card=""
        data-voice-composer=""
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <DraftChips
          files={files}
          t={t}
          onRemove={(key) => setFiles((list) => list.filter((f) => f.key !== key))}
        />
        <div data-input-scroll="">
          <textarea
            ref={field}
            className="tv-onboarding_input"
            aria-label={t('onboarding.placeholder')}
            placeholder={enabled ? t('onboarding.placeholder') : t('error.unavailable')}
            value={draft}
            rows={1}
            disabled={!enabled}
            onChange={(event) => write(event.target.value)}
            onPaste={(event) => {
              const pasted = [...event.clipboardData.files]
              if (pasted.length === 0 || !takesFiles) return
              event.preventDefault()
              addFiles(pasted)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
              event.preventDefault()
              submit()
            }}
          />
        </div>
        <div className="tv-onboarding_row">
          {upload !== undefined && (
            <div className="tv-onboarding_tools">
              <button
                type="button"
                className="tv-onboarding_add"
                aria-label={t('onboarding.attach')}
                title={t('onboarding.attach')}
                disabled={!enabled}
                onClick={() => picker.current?.click()}
              >
                <Paperclip aria-hidden="true" />
              </button>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                accept={ACCEPT_ATTR}
                onChange={(event) => {
                  addFiles([...(event.target.files ?? [])])
                  // The same file picked again is a new pick.
                  event.target.value = ''
                }}
              />
            </div>
          )}
          <div className="tv-onboarding_trailing" data-voice-active={voiceActive || undefined}>
            {Voice && enabled ? (
              <Voice inputActions={inputActions} useInput={useInput} onActiveChange={setVoiceActive} />
            ) : null}
            {activity}
            <button
              className="tv-onboarding_primary"
              type="submit"
              disabled={!canSend}
              aria-label={t('onboarding.send')}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path
                  d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>
      </form>
      {notice && (
        <p className="tv-onboarding-notice" role="status">
          {t(notice.key, notice.name === undefined ? undefined : { name: notice.name })}
        </p>
      )}
      {dragging &&
        createPortal(
          <div className="tv-drop" role="status">
            <div className="tv-drop-title">{t('onboarding.drop')}</div>
          </div>,
          document.body
        )}
    </div>
  )
}
