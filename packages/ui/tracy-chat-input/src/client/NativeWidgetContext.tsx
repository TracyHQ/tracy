/** An imported record, not replayed native messages. The native composer and permission cards stay intact. */
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { Translate } from './strings'

type Imported = {
  sessionId: string
  context: { history: { role: string; text: string }[]; brief: { name: string; about: string } }
  contextHash: string
  currentBuild?: {
    state: string
    links?: { openWebsite?: string | null; continueTracy?: string | null } | null
  }
}
export function nativeWidgetSession(sessionId?: string): string | null {
  return /^session-widget-[a-f0-9-]{36}$/i.test(sessionId ?? '') ? sessionId! : null
}

export function NativeWidgetContext({
  session,
  input,
  inputActions,
  t,
  startVoice
}: {
  session?: { sessionId?: string }
  input?: { draft?: string }
  inputActions?: { setDraft?: (text: string) => void }
  t: Translate
  startVoice?: (sessionId: string) => void
}): JSX.Element | null {
  const id = nativeWidgetSession(session?.sessionId)
  const [record, setRecord] = useState<Imported | null>(null)
  const [failed, setFailed] = useState(false)
  const started = useRef<string | null>(null)
  const consumed = useRef(new Set<string>())
  useEffect(() => {
    if (!id || session?.sessionId !== id) return
    setFailed(false)
    const controller = new AbortController()
    const door = location.pathname.startsWith('/widget/native/')
      ? '/widget/api/native/context'
      : '/api/widget-native/context'
    void fetch(door + '?session=' + encodeURIComponent(id), {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw Error('WIDGET_NATIVE_CONTEXT_UNAVAILABLE')
        const value = (await response.json()) as Imported
        if (!Array.isArray(value.context?.history) || !value.context.brief || !value.contextHash)
          throw Error('WIDGET_NATIVE_CONTEXT_UNAVAILABLE')
        setRecord({ ...value, sessionId: id })
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [id, session?.sessionId])
  useEffect(() => {
    if (
      !id ||
      session?.sessionId !== id ||
      record?.sessionId !== id ||
      !inputActions?.setDraft ||
      consumed.current.has(id)
    )
      return
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== window.parent ||
        event.data?.type !== 'tracy-widget-native-draft' ||
        event.data.sessionId !== id ||
        typeof event.data.text !== 'string' ||
        event.data.text.length > 4000
      )
        return
      // Existing native text wins. Recovery is never submitted by the handoff.
      if (input?.draft && input.draft !== event.data.text) return
      inputActions.setDraft?.(event.data.text)
      consumed.current.add(id)
      if (event.data.startVoice === true && started.current !== id) {
        started.current = id
        startVoice?.(id)
      }
      window.parent.postMessage({ type: 'tracy-widget-native-draft-kept', sessionId: id }, location.origin)
    }
    window.addEventListener('message', receive)
    window.parent.postMessage({ type: 'tracy-widget-native-ready', sessionId: id }, location.origin)
    return () => window.removeEventListener('message', receive)
  }, [id, session?.sessionId, record, input?.draft, inputActions, startVoice])
  if (!id || session?.sessionId !== id) return null
  if (record?.sessionId !== id)
    return <div role="status">{t(failed ? 'widget.contextUnavailable' : 'widget.contextLoading')}</div>
  const safeLink = (value?: string | null) => {
    if (!value) return undefined
    try {
      const url = new URL(value, location.origin)
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : undefined
    } catch {
      return undefined
    }
  }
  return (
    <div className="tv-widget-context">
      {record.currentBuild?.state === 'done' && (
        <p role="status">
          {t('widget.siteReady')}{' '}
          {safeLink(record.currentBuild.links?.openWebsite) && (
            <a href={safeLink(record.currentBuild.links?.openWebsite)} target="_blank" rel="noopener">
              {t('widget.openWebsite')}
            </a>
          )}{' '}
          {safeLink(record.currentBuild.links?.continueTracy) && (
            <a href={safeLink(record.currentBuild.links?.continueTracy)} target="_blank" rel="noopener">
              {t('widget.continueTracy')}
            </a>
          )}
        </p>
      )}
      <details className="tv-widget-import">
        <summary>{t('widget.imported')}</summary>
        <p>{t('widget.importedHint')}</p>
        {record.context.history.map((row, index) => (
          <p key={index} dir="auto">
            <strong>{row.role === 'user' ? t('widget.you') : 'Tracy'}: </strong>
            {row.text}
          </p>
        ))}
        <p dir="auto">
          <strong>{record.context.brief.name}</strong>
        </p>
        <p dir="auto">{record.context.brief.about}</p>
      </details>
    </div>
  )
}
