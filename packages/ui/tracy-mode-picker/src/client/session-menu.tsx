/** Session header actions over dsh's shared model directory and export controller. */
import { useState, useSyncExternalStore, type ChangeEvent } from 'react'
import {
  Button,
  Input,
  Menu,
  Modal,
  IconDownloadOutlineRegular,
  IconEllipsisOutlineRegular,
  IconPaperPlaneOutlineRegular
} from '@deepseek-ai/dsh-client-ui-primitives'
import { uiSwitches } from '@tracy/core/ui-switches'

type Selection = { provider: string; model: string; reasoningEffort?: string }
type DirectoryState = {
  current: Selection | null
  groups: readonly {
    id: string
    name: string
    models: readonly { id: string; name: string; reasoning?: { defaultEffort?: string } }[]
  }[]
  failures: readonly { id: string; name: string; message: string }[]
  status: string
  error: string | null
  pending: Selection | null
}
type Store<T> = { subscribe(fn: () => void): () => void; getSnapshot(): T }
interface Directory {
  store: Store<DirectoryState>
  load(): Promise<unknown>
  select(value: Selection): Promise<{ ok: boolean }>
}
interface DownloadEntry {
  status: string
  open?: boolean
  error?: string
}
export interface SessionMenuServices {
  modelDirectories: { directoryFor(id: string): Directory }
  sessionLogDownload: {
    store: Store<{ bySession: Record<string, DownloadEntry | undefined> }>
    download(id: string): Promise<void>
    dismiss(id: string): void
  }
  sessions: { subagentAddress(id: string): unknown }
  locale: { bind(namespace: string): (key: string, params?: Record<string, string>) => string }
  get(name: string): { openSession(id: string): void } | undefined
}

/** Shadow only the export menu cell; the original controller keeps owning downloads. */
export function sessionMenu(services: SessionMenuServices) {
  const mt = services.locale.bind('model')
  const t = services.locale.bind('session-log-download')
  return function SessionMenu({ sessionId }: { sessionId: string }) {
    const directory = services.modelDirectories.directoryFor(sessionId)
    const state = useSyncExternalStore(directory.store.subscribe.bind(directory.store), () =>
      directory.store.getSnapshot()
    )
    const downloads = useSyncExternalStore(
      services.sessionLogDownload.store.subscribe.bind(services.sessionLogDownload.store),
      () => services.sessionLogDownload.store.getSnapshot()
    )
    const switches = uiSwitches()
    useSyncExternalStore(switches.subscribe, () =>
      ['model-picker', 'dsh-session-menu-feedback', 'dsh-session-menu-download']
        .map((id) => switches.isShown(id))
        .join(':')
    )
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [error, setError] = useState<string | null>(null)
    const entry = downloads.bySession[sessionId]
    const busy = state.pending !== null
    const available =
      switches.isShown('model-picker') && services.sessions.subagentAddress(sessionId) === undefined
    const feedback = services.get('feedbackUi')
    const choices = state.groups.flatMap((group) =>
      group.models.map((model) => ({ group, model, id: JSON.stringify([group.id, model.id]) }))
    )
    const scrollable = choices.length > 10
    const visible = state.groups.flatMap((group) => {
      const rows = choices.filter(
        (choice) =>
          choice.group.id === group.id && choice.model.name.toLowerCase().includes(query.trim().toLowerCase())
      )
      return rows.length === 0
        ? []
        : [
            { type: 'label' as const, id: `group:${group.id}`, text: group.name },
            ...rows.map((choice) => ({ id: choice.id, label: choice.model.name, disabled: busy }))
          ]
    })
    const close = () => {
      setOpen(false)
      setQuery('')
      setError(null)
    }
    const reload = () => {
      void directory.load().catch(() => {
        /* The shared store carries the failure. */
      })
    }
    const select = (id: string) => {
      if (id === 'feedback' || id === 'download') {
        close()
        if (id === 'feedback') feedback?.openSession(sessionId)
        if (id === 'download') void services.sessionLogDownload.download(sessionId)
        return
      }
      const choice = choices.find((row) => row.id === id)
      if (!choice) return
      const effort =
        state.current?.provider === choice.group.id && state.current.model === choice.model.id
          ? (state.current.reasoningEffort ?? choice.model.reasoning?.defaultEffort)
          : choice.model.reasoning?.defaultEffort
      setError(null)
      void directory
        .select({
          provider: choice.group.id,
          model: choice.model.id,
          ...(effort === undefined ? {} : { reasoningEffort: effort })
        })
        .then((result) => {
          if (result.ok) close()
        })
        .catch((reason) => {
          setError(String(reason))
        })
    }
    const status = entry?.status
    return (
      <>
        <Menu
          open={open}
          align="end"
          dense
          portal
          collisionAvoidance
          onClose={close}
          listClassName={`tv-header-model-menu${scrollable ? ' tv-header-model-scroll' : ''}`}
          selectedId={
            available && state.current
              ? JSON.stringify([state.current.provider, state.current.model])
              : undefined
          }
          items={available ? visible : []}
          footer={[
            ...(switches.isShown('dsh-session-menu-download')
              ? [
                  {
                    id: 'download',
                    label: t('menu.download'),
                    icon: <IconDownloadOutlineRegular />,
                    disabled: status === 'downloading'
                  }
                ]
              : []),
            ...(feedback && switches.isShown('dsh-session-menu-feedback')
              ? [{ id: 'feedback', label: t('menu.feedback'), icon: <IconPaperPlaneOutlineRegular /> }]
              : [])
          ]}
          onSelect={select}
          anchor={
            <Button
              size="sm"
              data-session-menu=""
              aria-label={t('header.more')}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => {
                if (open) close()
                else {
                  setOpen(true)
                  if (available) reload()
                }
              }}
            >
              <IconEllipsisOutlineRegular />
            </Button>
          }
        >
          {available && (
            <div className="tv-header-model-status">
              {scrollable && (
                <Input
                  className="tv-header-model-search"
                  aria-label={mt('search.placeholder')}
                  placeholder={mt('search.placeholder')}
                  value={query}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                />
              )}
              {state.status === 'loading' && <p role="status">{mt('status.loading')}</p>}
              {(error ?? state.error) && (
                <p role="alert">{mt('error.action', { message: error ?? state.error ?? '' })}</p>
              )}
              {state.failures.map((failure) => (
                <p role="status" key={failure.id}>
                  {mt('warning.groupLoad', { name: failure.name, message: failure.message })}
                </p>
              ))}
              {state.status === 'ready' && visible.length === 0 && (
                <p role="status">{mt(choices.length === 0 ? 'empty.models' : 'search.empty')}</p>
              )}
              {(state.error !== null || state.failures.length > 0) && (
                <Button onClick={reload}>{mt('action.reload')}</Button>
              )}
            </div>
          )}
        </Menu>
        <Modal
          open={entry?.open === true}
          onClose={() => services.sessionLogDownload.dismiss(sessionId)}
          title={t(
            status === 'downloading'
              ? 'dialog.preparingTitle'
              : status === 'success'
                ? 'dialog.successTitle'
                : 'dialog.errorTitle'
          )}
          description={
            status === 'downloading'
              ? t('dialog.preparingDescription')
              : status === 'success'
                ? t('dialog.successDescription')
                : entry?.error || t('dialog.commandFailed')
          }
          closeLabel={t('dialog.close')}
          footer={
            <Button variant="primary" onClick={() => services.sessionLogDownload.dismiss(sessionId)}>
              {t('dialog.close')}
            </Button>
          }
        />
      </>
    )
  }
}
