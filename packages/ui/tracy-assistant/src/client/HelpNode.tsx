/**
 * One Help row of the agent's transcript: the question as typed, the answer streaming under it, and
 * the few buttons a row needs. It is drawn by dsh's `conversation.chat.node` slot for the local row
 * kind `tracy-help` (`index.tsx`); the rows themselves are written by `help.ts`.
 *
 * 🔒 AN ANSWER IS NEVER HTML (`chat.ts` says why): each paragraph, list item, bold, code and link is
 * a React element built from the model's text, and a link is clickable only when its address is
 * one the server listed with the answer.
 *
 * A FINISHED ANSWER ENDS LIKE AN AGENT REPLY (David, 12/10/2026): dsh's own action row — copy,
 * thumbs up/down, branch, the clock — drawn by dsh itself (`ctx.chatLocal.AnswerActions`, fork
 * tracy.42), so its icons, sizes, hover and tooltips are the agent row's. Which of all the answers
 * keeps it out is dsh's rule too: the last finished one, until a new request is sent. A question and
 * its answer are upserted as an exchange (`help.ts`), so a Help question takes the row away from the
 * answer before it.
 */
import { Check, Copy, Sparkles, X } from 'lucide-react'
import { type ComponentType, type ReactNode, useState } from 'react'
import { type Block, blocksOf, type Inline, type NavLink } from './chat'
import { SentChips } from './FileChips'
import { answerTextOf, COMMAND, controllerOf, type HelpData } from './help'
import type { Translate } from './strings'

/** A start action's address (`apps/tracy-web/src/assistant/prompt.js`, `ACTION_SCHEME`). */
export const ACTION_SCHEME = 'tracy-action:'

/** What pressing a start action does: opens its step on the page (`index.tsx`). */
export type OnAction = (href: string) => void

/** Suggested questions under the greeting. */
const CHIPS = ['chip.what', 'chip.undo', 'chip.sites', 'chip.report'] as const

/** The Discord invite Help offers; the same address the server lists among the allowed links. */
const DISCORD = 'https://discord.gg/BM9TMRcEBb'

function InlineView({ inline, onAction }: { inline: Inline[]; onAction?: OnAction }) {
  return (
    <>
      {inline.map((part, i) => {
        if (part.kind === 'bold') return <strong key={i}>{part.text}</strong>
        if (part.kind === 'code') return <code key={i}>{part.text}</code>
        // A start action is text to press, never an address to follow; with no handler it is plain text.
        if (part.kind === 'link' && part.href.startsWith(ACTION_SCHEME))
          return onAction ? (
            <button key={i} type="button" className="tv-help-action" onClick={() => onAction(part.href)}>
              {part.text}
            </button>
          ) : (
            <span key={i}>{part.text}</span>
          )
        if (part.kind === 'link')
          return (
            <a
              key={i}
              href={part.href}
              {...(/^https?:/.test(part.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {part.text}
            </a>
          )
        return <span key={i}>{part.text}</span>
      })}
    </>
  )
}

/**
 * A block of text meant to be copied: plain text with one Copy button on the same row, nothing else. Lines are
 * kept as written and a long one scrolls sideways inside the box, so a one-line sample stays one line.
 */
function CopyBlock({ text, t }: { text: string; t: Translate }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    // Clipboard access can be refused (no permission, insecure page); then nothing changes on screen.
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => {})
  }
  return (
    <div className="tv-help-copy">
      <pre>{text}</pre>
      <button type="button" className="tv-help-copy-button" onClick={copy}>
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        {t(copied ? 'action.copied' : 'action.copy')}
      </button>
    </div>
  )
}

function Answer({
  text,
  links,
  t,
  onAction
}: {
  text: string
  links: NavLink[]
  t: Translate
  onAction?: OnAction
}) {
  const allowed = new Set(links.map((l) => l.href))
  const blocks: Block[] = blocksOf(text, allowed)
  return (
    <>
      {blocks.map((block, i): ReactNode => {
        if (block.kind === 'copy') return <CopyBlock key={i} text={block.text} t={t} />
        if (block.kind === 'paragraph')
          return (
            <p key={i}>
              <InlineView inline={block.inline} onAction={onAction} />
            </p>
          )
        const items = block.items.map((item, j) => (
          <li key={j}>
            <InlineView inline={item} onAction={onAction} />
          </li>
        ))
        return block.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>
      })}
    </>
  )
}

function Discord({ t }: { t: Translate }) {
  return (
    <a className="tv-help-discord" href={DISCORD} target="_blank" rel="noopener noreferrer">
      {t('discord.label')}
    </a>
  )
}

/** The props of dsh's `ctx.chatLocal.AnswerActions` this row passes (fork tracy.42). */
export interface AnswerActionsProps {
  sessionId: string
  text: string
  time?: number
  branchAt?: number
  feedback?: {
    rating: 'positive' | 'negative' | null
    rate: (rating: 'positive' | 'negative') => void
    labels: { like: string; likeActive: string; dislike: string; dislikeActive: string }
  }
}

/** The names dsh gives the thumbs of an agent reply (its `feedback` namespace). */
export type FeedbackLabels = NonNullable<AnswerActionsProps['feedback']>['labels']

/** What an answer row needs beyond the slot's props; `index.tsx` supplies it. */
export interface HelpRowDeps {
  /** dsh's action row; absent on a dsh without it (before fork tracy.42): no row then. */
  Actions?: ComponentType<AnswerActionsProps>
  /** The thumbs' names, read when drawn so they follow the interface language. */
  feedbackLabels?: () => FeedbackLabels
  /** False where the session has no transcript yet (the start screen): nothing to branch. */
  branchable?: boolean
  /**
   * The creation workspace (/new/): Help is the page's own conversation, so no slash-command tip and
   * no command mark. Its start doors live in one row above the composer, never under an answer.
   */
  onboarding?: boolean
  /** Presses a start action of an answer (the creation workspace); absent, such links are plain text. */
  onAction?: OnAction
}

/** Props the slot hands a `conversation.chat.node` renderer: the row, and the translator of `NS`. */
export function HelpNode({
  node,
  t,
  Actions,
  feedbackLabels,
  branchable = true,
  onboarding = false,
  onAction
}: { node: { data: HelpData; anchorSeq?: number }; t: Translate } & HelpRowDeps) {
  const d = node.data
  const control = controllerOf(d.sessionId)
  const copyText = answerTextOf(d, t)

  if (d.variant === 'tip' && onboarding) return null
  if (d.variant === 'tip')
    return (
      <div className="tv-help tv-help-tip" role="note">
        <Sparkles size={14} aria-hidden="true" />
        <span>{t('tip.text')}</span>
        <button
          type="button"
          className="tv-help-icon"
          aria-label={t('action.dismiss')}
          title={t('action.dismiss')}
          onClick={() => control?.remove(d.rowId)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    )

  const busy = d.status === 'streaming'
  return (
    // One Tracy to the person: the question reads as their own message and the answer as Tracy's,
    // with no frame or label of a second assistant. The name is only for screen readers.
    <section className="tv-help" aria-label={t('node.label')}>
      {d.variant === 'turn' && d.question !== '' && (
        <div className="tv-help-me">
          {/* The command is marked like a command, so it is plain that Help is being used. */}
          {onboarding ? (
            d.question
          ) : (
            <>
              <span className="tv-help-cmd">{COMMAND}</span> {d.question}
            </>
          )}
        </div>
      )}
      {/* The files the question carried, under it: each opens or downloads from the owner-only door. */}
      {d.variant === 'turn' && d.files && d.files.length > 0 && <SentChips files={d.files} t={t} />}
      {/* A bare /help once the chat has begun: the person's own /help, answered by one sentence. */}
      {d.variant === 'askBack' && (
        <div className="tv-help-me">
          <span className="tv-help-cmd">{COMMAND}</span>
        </div>
      )}
      <div className="tv-help-answer" aria-live="polite">
        {/* A bare /help: only the questions to press and the way to a person. No sentence about Tracy and none
            on how to type /help: the chat box's own hint already says it (David, 08/10/2026). */}
        {d.variant === 'greeting' && (
          <>
            <div className="tv-help-chips">
              {CHIPS.map((key) => (
                <button key={key} type="button" className="tv-help-chip" onClick={() => control?.ask(t(key))}>
                  {t(key)}
                </button>
              ))}
            </div>
            <Discord t={t} />
          </>
        )}
        {d.variant === 'askBack' && <p>{t('askBack.text')}</p>}
        {d.variant === 'turn' && d.answer !== '' && (
          <Answer text={d.answer} links={d.links} t={t} onAction={onAction} />
        )}
        {d.status === 'queued' && <p className="tv-help-note">{t('status.queued')}</p>}
        {busy && d.answer === '' && <p className="tv-help-note">{t('status.thinking')}</p>}
        {d.report && (
          <>
            <p className="tv-help-hint">{t('report.intro')}</p>
            <CopyBlock text={d.report} t={t} />
            <Discord t={t} />
          </>
        )}
        {d.error && (
          <p className="tv-help-error">
            {t(d.error)}
            {d.variant === 'turn' && d.error !== 'error.tooLong' && d.error !== 'error.queueFull' && (
              <>
                {' '}
                <button type="button" className="tv-help-link" onClick={() => control?.retry(d.rowId)}>
                  {t('action.retry')}
                </button>
              </>
            )}
          </p>
        )}
        {d.error &&
          d.error !== 'error.limit' &&
          d.error !== 'error.limitDay' &&
          d.error !== 'error.signin' && <Discord t={t} />}
      </div>
      {/* A finished answer: dsh's own row. Only an answer the server stored can be rated. */}
      {copyText !== null && Actions && (
        <Actions
          sessionId={d.sessionId}
          text={copyText}
          {...(d.at !== undefined ? { time: d.at } : {})}
          {...(branchable && typeof node.anchorSeq === 'number' ? { branchAt: node.anchorSeq } : {})}
          {...(d.answerId && feedbackLabels
            ? {
                feedback: {
                  rating: d.rating === 1 ? 'positive' : d.rating === -1 ? 'negative' : null,
                  rate: (value: 'positive' | 'negative') =>
                    control?.rate(d.rowId, value === 'positive' ? 1 : -1),
                  labels: feedbackLabels()
                }
              }
            : {})}
        />
      )}
      {/* Stopping is the chat box's own button (HelpStop.tsx). */}
      {d.status === 'queued' && (
        <div className="tv-help-actions">
          <button
            type="button"
            className="tv-help-icon"
            aria-label={t('action.remove')}
            title={t('action.remove')}
            onClick={() => control?.remove(d.rowId)}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  )
}
