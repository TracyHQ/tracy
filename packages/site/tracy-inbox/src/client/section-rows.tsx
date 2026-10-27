/**
 * The three row shapes of the Inbox sections (layout "option I", Akemi 03/10):
 *   - `answer`:   a raised card tinted terracotta, solid 40px icon, the action with its verb coloured, Review or Accept / Decline.
 *   - `comments`: solid terracotta 40px icon, name, the action with its verb coloured, the quote in a tinted block.
 *   - `team`:     one line, a 22px solid icon in the category colour, "Name · verb rest".
 * Every action phrase names its site, drawn as a link to the live site (`site-link.tsx`). A row
 * starts with its category tile alone, no person face (Akemi 04/10/2026, back to the approved
 * option I; the faces of 9e46e9c1f stay on every other surface).
 * Colours come from the category variables on the plugin root (`styles.ts`), set per row by its
 * `is-<category>` class; the words come from `t` in the reader's language.
 */
import { type JSX, type KeyboardEvent, type ReactNode, useState } from 'react'
import {
  AtSign,
  Check,
  History,
  PencilLine,
  Reply,
  RotateCcw,
  Shield,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus
} from 'lucide-react'
import { Button, cn } from '@tracy/ui'

import { type InboxNotification, type RowTarget, type RowView, outcomeKeyOf } from './rows'
import { type Segment, phraseParts, SITE_MARK } from './phrase-parts'
import type { SectionId, SectionItem } from './sections'
import { SiteLink } from './site-link'
import type { Translate } from './strings'

export interface RowProps {
  item: SectionItem
  t: Translate
  when: string
  onPress: (target: RowTarget) => void
  onAnswer: (reply: 'accept' | 'decline') => Promise<boolean>
  /** The live address of the row's site, or null when the reader has none to open. */
  siteHref: string | null
}

/** The white icon inside the solid circle: what happened, by kind. */
function KindIcon({ row }: { row: InboxNotification }): JSX.Element {
  const kind = row.kind
  const Icon =
    kind === 'comment.mention'
      ? AtSign
      : kind === 'comment.reply'
        ? Reply
        : kind === 'comment.resolved'
          ? Check
          : kind === 'comment.reopened'
            ? RotateCcw
            : kind === 'team.site_restored'
              ? History
              : kind === 'team.site_deleted'
                ? Trash2
                : kind === 'team.site_renamed'
                  ? PencilLine
                  : kind === 'team.join_request' ||
                      kind === 'team.invited' ||
                      kind === 'team.edit_access_request'
                    ? UserPlus
                    : kind === 'team.role_changed'
                      ? Shield
                      : kind === 'team.removed' ||
                          kind === 'team.left' ||
                          kind === 'team.invite_cancelled' ||
                          kind === 'team.declined' ||
                          kind === 'team.invite_declined' ||
                          kind === 'team.edit_access_declined' ||
                          ((kind === 'team.join_answered' || kind === 'team.edit_access_answered') &&
                            row.data?.decision === 'declined')
                        ? UserMinus
                        : UserCheck
  return <Icon strokeWidth={kind.startsWith('comment.') ? 2.2 : 2.4} aria-hidden="true" />
}

/** A quoted comment with its @mentions drawn in the primary colour, as the comment box shows them. */
function Quote({ text }: { text: string }): JSX.Element {
  const parts = text.split(/((?:^|(?<=\s))@[\p{L}\p{N}._-]*[\p{L}\p{N}_])/u)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
          <span key={i} className="tracy-inbox-mention">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  )
}

/** The action phrase in the reader's language, `{asRole}` / `{role}` translated and `SITE_MARK` for the site. */
function phraseOf(view: RowView, t: Translate): string {
  const params: Record<string, string> = { ...view.params, site: SITE_MARK }
  if (view.asRole !== null) params.asRole = t(`asRole.${view.asRole}`)
  // The bare role name, translated like every role label (ADR 0028 §7), never the raw code.
  if (view.role !== null) params.role = t(`role.${view.role}`)
  return t(view.key, params)
}

/** The verb of a phrase in the reader's language (`verb.*` beside `act.*`), or '' when it has none. */
function verbOf(view: RowView, t: Translate): string {
  const verbKey = view.key.replace(/^act\./, 'verb.')
  if (verbKey === view.key) return ''
  const verb = t(verbKey)
  // A missing key comes back as the key itself; that is no verb.
  return verb !== verbKey ? verb : ''
}

/** Text segments of a phrase, the coloured verb in its own span. */
function Segments({ segments }: { segments: Segment[] }): JSX.Element {
  return (
    <>
      {segments.map((segment, i) =>
        segment.verb ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
          <span key={i} className="tracy-inbox-verb">
            {segment.text}
          </span>
        ) : (
          segment.text
        )
      )}
    </>
  )
}

/** The clickable shell every row shape shares: whole row is the target, Enter / Space press it. */
function Shell({
  item,
  className,
  onPress,
  children
}: {
  item: SectionItem
  className: string
  onPress: (target: RowTarget) => void
  children: ReactNode
}): JSX.Element {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPress(item.view.target)
    }
  }
  const className_ = cn(
    'tracy-inbox-row',
    className,
    `is-${item.category}`,
    item.row.readAt === null ? 'is-unread' : 'is-read',
    !item.pressable && 'is-inert'
  )
  // An open invitation is answered only by its buttons: its body is not a button at all.
  if (!item.pressable) {
    return (
      <li>
        <div data-notification={item.row.id} className={className_}>
          {children}
        </div>
      </li>
    )
  }
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        data-notification={item.row.id}
        className={className_}
        onClick={() => onPress(item.view.target)}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </li>
  )
}

/** Age and unread dot, at the right of the first line. */
function Meta({ when }: { when: string }): JSX.Element {
  return (
    <>
      <span className="tracy-inbox-age">{when}</span>
      <span className="tracy-inbox-dot" aria-hidden="true" />
    </>
  )
}

/** Cards and comments: name line, the action naming the site with its verb coloured, then the quote or the answer buttons. */
function FullRow({
  item,
  t,
  when,
  onPress,
  onAnswer,
  siteHref,
  card
}: RowProps & { card: boolean }): JSX.Element {
  const { view } = item
  const [answering, setAnswering] = useState(false)
  const [answerFailed, setAnswerFailed] = useState(false)
  const reply = (choice: 'accept' | 'decline') => (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    if (answering) return
    setAnswering(true)
    setAnswerFailed(false)
    void onAnswer(choice).then((ok) => {
      setAnswering(false)
      if (!ok) setAnswerFailed(true)
    })
  }
  // Line 1 names who acted (else the site); line 2 says what they did, and where.
  const site = view.context.site
  const title = view.actorName ?? site ?? ''
  const parts = phraseParts(phraseOf(view, t), verbOf(view, t))
  return (
    <Shell item={item} className={card ? 'is-card' : ''} onPress={onPress}>
      <span className="tracy-inbox-solid">
        <KindIcon row={item.row} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="tracy-inbox-l1">
          <span className="tracy-inbox-name">{title}</span>
          <Meta when={when} />
        </div>
        <p className="tracy-inbox-l2">
          <span className="tracy-inbox-act">
            <Segments segments={parts.before} />
            {parts.hasSite && site ? (
              <SiteLink site={site} href={view.siteLink ? siteHref : null} t={t} />
            ) : null}
            <Segments segments={parts.after} />
          </span>
        </p>
        {view.quote !== null &&
          ('deletedBy' in view.quote ? (
            <p className="tracy-inbox-quote is-deleted">
              {t('quote.deleted', { actor: view.quote.deletedBy })}
            </p>
          ) : (
            <p className="tracy-inbox-quote">
              <Quote text={view.quote.text} />
            </p>
          ))}
        {(view.action === 'answer' || view.action === 'review') && (
          <div className="tracy-inbox-actions">
            {view.action === 'review' ? (
              <Button
                type="button"
                size="xs"
                onClick={(event) => {
                  event.stopPropagation()
                  onPress(view.target)
                }}
              >
                {t('action.review')}
              </Button>
            ) : (
              <>
                <Button type="button" size="xs" disabled={answering} onClick={reply('accept')}>
                  {t('action.accept')}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={answering}
                  onClick={reply('decline')}
                >
                  {t('action.decline')}
                </Button>
              </>
            )}
          </div>
        )}
        {answerFailed && <p className="tracy-inbox-failed text-destructive">{t('action.answerFailed')}</p>}
      </div>
    </Shell>
  )
}

/**
 * Team updates: "Name · verb rest" on one line, the verb in the category colour. When the line is
 * too long the text before the site is cut with an ellipsis, so the site link stays whole.
 */
function TeamRow({ item, t, when, onPress, siteHref }: RowProps): JSX.Element {
  const { view } = item
  const parts = phraseParts(phraseOf(view, t), verbOf(view, t))
  const site = view.context.site
  return (
    <Shell item={item} className="is-compact" onPress={onPress}>
      <span className="tracy-inbox-solid is-small">
        <KindIcon row={item.row} />
      </span>
      <span className="tracy-inbox-one">
        <span className="tracy-inbox-one-head">
          {view.actorName !== null ? (
            <>
              <b>{view.actorName}</b>
              {' · '}
            </>
          ) : null}
          <Segments segments={parts.before} />
        </span>
        {parts.hasSite && site ? <SiteLink site={site} href={view.siteLink ? siteHref : null} t={t} /> : null}
        {parts.after.length > 0 ? (
          <span className="tracy-inbox-one-tail">
            <Segments segments={parts.after} />
          </span>
        ) : null}
        {view.outcome !== null ? (
          <span className="tracy-inbox-one-tail tracy-inbox-outcome">
            {' · '}
            <span className="tracy-inbox-verb">{t(outcomeKeyOf(item.row.kind, view.outcome))}</span>
          </span>
        ) : null}
      </span>
      <Meta when={when} />
    </Shell>
  )
}

/** One row in the shape its section asks for. */
export function SectionRow({ section, ...props }: RowProps & { section: SectionId }): JSX.Element {
  if (section === 'team') return <TeamRow {...props} />
  return <FullRow {...props} card={section === 'answer'} />
}
