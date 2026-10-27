/**
 * The Inbox tab: every notification of the signed-in person, from every site, newest first.
 *
 * Layout "option I" (Akemi 03/10) in the shared page shell (25/10/2026): the title "Inbox" with a
 * one-line lead and Mark all as read on its right, the Unread / All filter under the lead, then up
 * to three sections by what the reader has to do (`sections.ts`): Needs your answer,
 * Comments, Team updates, each with a count; a section with no row is not drawn. A muted line
 * closes the list. Mode B, like every plugin in dsh's page: `@tracy/ui` + Tailwind utilities, no
 * preflight, so `m-0` on paragraphs and `list-none` on the list are not decoration.
 *
 * Nothing is invented: a row whose kind this build does not know is skipped (`describe`), a list
 * that could not be read says so with a retry, and the count comes from the server only.
 */
import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { Inbox as InboxIcon } from 'lucide-react'
import { Button, useTabLoading } from '@tracy/ui'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { useInterfaceLocale } from '@tracy/core/interface-languages/react'

import { type Filter, answerInvitation, markAllRead, markRead, readPage } from './api'
import { inCreationWorkspace, landingAfterAccept } from './onboarding'
import { relativeTime } from './relative-time'
import type { InboxNotification, RowTarget } from './rows'
import { SectionRow } from './section-rows'
import { siteLinks } from './site-links'
import { buildSections, capItems, type SectionId } from './sections'
import type { Translate } from './strings'
import { unread, useUnread } from './unread'
import { readSites } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; rows: InboxNotification[]; next: string | null; more: boolean }

export function InboxTab({
  t,
  open,
  onRows,
  onOpen
}: {
  t: Translate
  open: (target: RowTarget) => void
  /** Every first page read, for the Team start card's news (`team-news.ts`). */
  onRows?: (rows: readonly InboxNotification[]) => void
  /**
   * Called on mount, its return on unmount: while this tab lives it is the one that re-reads the
   * first page when the count moves, so the unread poll does not read it a second time (`team-news.ts`).
   */
  onOpen?: () => () => void
}): JSX.Element {
  useInterfaceLocale()
  const count = useUnread()
  const [filter, setFilter] = useState<Filter>('unread')
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [now, setNow] = useState(() => Date.now())
  /** Needs your answer shows every card ("Show all"); collapsed by default, kept while the tab lives. */
  const [answerExpanded, setAnswerExpanded] = useState(false)
  /** The count the list on screen already reflects; a different one from the poll means news. */
  const shownCount = useRef<number | null>(null)
  /** Rows that arrived unread: in the Unread filter they stay until the list is read again. */
  const arrivedUnread = useRef<Set<string>>(new Set())
  /** Site key to live address, for the site chips; the page-wide shared `/api/sites` answer. */
  const [links, setLinks] = useState<Map<string, string>>(() => new Map())
  /** On the creation workspace (C1) an accepted invitation lands in the site itself. */
  const [onboarding] = useState(() => inCreationWorkspace(document.baseURI))

  const read = useCallback(
    async (silent = false) => {
      if (!silent) setLoad({ state: 'loading' })
      const page = await readPage(filter, null)
      if (page === null) {
        if (!silent) setLoad({ state: 'failed' })
        return
      }
      onRows?.(page.notifications)
      shownCount.current = page.unread
      arrivedUnread.current = new Set(page.notifications.filter((n) => n.readAt === null).map((n) => n.id))
      unread.set(page.unread)
      setNow(Date.now())
      setLoad({ state: 'ready', rows: page.notifications, next: page.next, more: false })
      // Shared with every plugin on the page and kept 30 s, so this rarely asks the door itself.
      void readSites()
        .then(({ status, body }) => {
          if (status === 200) setLinks(siteLinks(body))
        })
        .catch(() => {})
    },
    [filter, onRows]
  )

  useEffect(() => onOpen?.(), [onOpen])

  useEffect(() => {
    void read()
  }, [read])

  // The poll found a count the list does not reflect: something arrived or was read elsewhere.
  useEffect(() => {
    if (shownCount.current === null || count === shownCount.current) return
    void read(true)
  }, [count, read])

  // Ages move on while the tab stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useTabLoading(load.state === 'loading')

  const loadMore = async (): Promise<void> => {
    if (load.state !== 'ready' || load.next === null || load.more) return
    setLoad({ ...load, more: true })
    const page = await readPage(filter, load.next)
    for (const n of page?.notifications ?? []) if (n.readAt === null) arrivedUnread.current.add(n.id)
    setLoad((current) =>
      current.state !== 'ready'
        ? current
        : page === null
          ? { ...current, more: false }
          : { state: 'ready', rows: [...current.rows, ...page.notifications], next: page.next, more: false }
    )
  }

  /** Mark one row read on screen and in the count; the server is told by the caller. */
  const markShown = (id: string): void => {
    setLoad((current) =>
      current.state !== 'ready'
        ? current
        : {
            ...current,
            rows: current.rows.map((row) =>
              row.id === id && row.readAt === null ? { ...row, readAt: new Date().toISOString() } : row
            )
          }
    )
    const next = Math.max(0, unread.get() - 1)
    shownCount.current = next
    unread.set(next)
  }

  const press = async (row: InboxNotification, target: RowTarget): Promise<void> => {
    if (row.readAt === null) {
      markShown(row.id)
      // Read first, then open: the target may load another page.
      await markRead(row.id)
      unread.poke()
    }
    open(target)
  }

  /** Accept or Decline an invitation from its row; the list re-reads so the row shows it settled. */
  const answer = async (row: InboxNotification, reply: 'accept' | 'decline'): Promise<boolean> => {
    if (row.siteKey === null) return false
    const ok = await answerInvitation(row.siteKey, reply)
    if (!ok) return false
    if (row.readAt === null) await markRead(row.id)
    // From the creation workspace an accepted invitation lands in the site itself (C1).
    if (onboarding && reply === 'accept') {
      location.assign(landingAfterAccept(row.siteKey))
      return true
    }
    await read(true)
    unread.poke()
    return true
  }

  const markAll = async (): Promise<void> => {
    if (!(await markAllRead())) return
    const stamp = new Date().toISOString()
    shownCount.current = 0
    unread.set(0)
    setLoad((current) =>
      current.state !== 'ready'
        ? current
        : {
            ...current,
            rows: current.rows.map((row) => (row.readAt === null ? { ...row, readAt: stamp } : row))
          }
    )
    unread.poke()
  }

  // The page head: the title and its lead on the left, Mark all as read on the right (the My Sites
  // and Team page shell, 24/10/2026), then the Unread / All filter under the lead, aligned left.
  const header = (
    <>
      <div className="tracy-inbox-block tracy-inbox-head">
        <div className="tracy-inbox-head-text">
          <h2 className="tracy-inbox-title">{t('tab.title')}</h2>
          <p className="tracy-inbox-lead">{t('page.lead')}</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="tracy-inbox-markall"
          disabled={count === 0}
          onClick={() => void markAll()}
        >
          {t('action.markAllRead')}
        </Button>
      </div>
      <div className="tracy-inbox-block tracy-inbox-filters" role="group" aria-label={t('filter.label')}>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="tracy-inbox-filter gap-1.5"
          aria-pressed={filter === 'unread'}
          onClick={() => setFilter('unread')}
        >
          {t('filter.unread')}
          {count > 0 ? <span className="tabular-nums">{count}</span> : null}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="tracy-inbox-filter"
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          {t('filter.all')}
        </Button>
      </div>
    </>
  )

  if (load.state === 'loading') return <div className={PAGE}>{header}</div>
  if (load.state === 'failed')
    return (
      <div className={PAGE}>
        {header}
        <div className="tracy-inbox-body text-muted-foreground text-sm">
          <p className="m-0">{t('state.failed')}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void read()}>
            {t('action.retry')}
          </Button>
        </div>
      </div>
    )

  const locale = interfaceLocale()
  // In Unread, a row read just now leaves with the next read of the list, not under the pointer.
  const sections = buildSections(load.rows, { unreadOnly: filter === 'unread', keep: arrivedUnread.current })
  if (sections.length === 0)
    return (
      <div className={PAGE}>
        {header}
        <div className="tracy-inbox-body">
          {filter === 'unread' ? (
            <Empty title={t('empty.unread.title')} body={t('empty.unread.body')} />
          ) : (
            <Empty title={t('empty.all.title')} body={t('retention')} />
          )}
        </div>
      </div>
    )

  return (
    <div className={PAGE}>
      {header}
      <div className="tracy-inbox-body">
        {sections.map((section) => {
          // Only Needs your answer is capped; the other sections draw every row.
          const capped =
            section.id === 'answer'
              ? capItems(section.items, answerExpanded)
              : { shown: section.items, hidden: 0, cappable: false }
          return (
            <section
              key={section.id}
              className="tracy-inbox-section"
              aria-labelledby={`tracy-inbox-${section.id}`}
            >
              <h3 id={`tracy-inbox-${section.id}`} className="tracy-inbox-section-head">
                {t(SECTION_TITLE[section.id])}
                <span className="tracy-inbox-count tabular-nums">{section.items.length}</span>
                {section.id === 'answer' ? (
                  <span className="tracy-inbox-hint">{t('section.answer.hint')}</span>
                ) : null}
              </h3>
              <ul className={section.id === 'answer' ? 'tracy-inbox-cards' : 'tracy-inbox-list'}>
                {capped.shown.map((item) => (
                  <SectionRow
                    key={item.row.id}
                    section={section.id}
                    item={item}
                    t={t}
                    when={relativeTime(item.row.createdAt, now, locale)}
                    onPress={(target) => void press(item.row, target)}
                    onAnswer={(reply) => answer(item.row, reply)}
                    siteHref={item.row.siteKey ? (links.get(item.row.siteKey) ?? null) : null}
                  />
                ))}
              </ul>
              {capped.cappable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="tracy-inbox-toggle"
                  aria-expanded={answerExpanded}
                  onClick={() => setAnswerExpanded((open) => !open)}
                >
                  {answerExpanded
                    ? t('section.showFewer')
                    : t('section.showAll', { count: section.items.length })}
                </Button>
              ) : null}
            </section>
          )
        })}
        {load.next !== null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="tracy-inbox-more"
            disabled={load.more}
            onClick={() => void loadMore()}
          >
            {t('action.loadMore')}
          </Button>
        )}
        <p className="tracy-inbox-gap-4 text-muted-foreground">{t('retention')}</p>
      </div>
    </div>
  )
}

/**
 * The tab's root: a full-width page on the card surface, never a centred card (the My Sites, Team
 * and Site changes page shell of 24/10/2026; geometry in styles.ts, tracy-inbox-page).
 */
const PAGE = 'tracy-inbox tracy-inbox-page flex h-full min-h-0 flex-col'

/** Header key of each section. */
const SECTION_TITLE: Readonly<Record<SectionId, string>> = {
  answer: 'section.answer',
  comments: 'section.comments',
  team: 'section.team'
}

function Empty({ title, body }: { title: string; body: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <InboxIcon className="size-6 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
      <p className="m-0 font-medium text-foreground text-sm">{title}</p>
      <p className="m-0 text-muted-foreground text-xs">{body}</p>
    </div>
  )
}
