/**
 * The pieces of the site's Publish tab that are about publishing itself, shared by its steps
 * (`publish/`): the state chip, the address with its copy button, the publishing state kept current
 * (`usePublishing`), the failed line, Back to draft, and the card of one of the Owner's own domains
 * (`OwnDomainCard`): the DNS records to create, what the last lookup returned for each, and the way
 * out.
 *
 * Everything shown about publishing is what the server read back (`GET /api/sites/:key/state`): a
 * press is never taken as its own result, and an answer that arrives after a newer one is dropped.
 *
 * Classes are styled by `site-tabs-rules.css` (mode B: plain CSS, `tv-` prefix, tokens only).
 */
import { Fragment, type JSX, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, CircleCheck, CircleDashed, CircleX, Copy } from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner
} from '@tracy/ui'
import { interfaceLocale } from '../interface-languages/index.mjs'
import type { Translate } from '../team/translate'
import {
  type DomainCheck,
  type DomainState,
  domainState,
  type OwnDomain,
  publishFailure,
  type Publishing,
  publishReasonKey,
  publishRefusalKey,
  publishWork,
  readPublishing,
  SITE_PUBLISH_EVENT,
  type SiteStatus,
  unreachableReasonKey
} from './settings-rows'

/** How often a running publish is asked about. The host's job takes seconds to about a minute. */
export const PUBLISH_POLL_MS = 2500
/** How long `Copied` stays beside a copy button. */
const COPIED_MS = 1600

/** Dot + word. The word carries the state; the colour only repeats it. */
export function StatusChip({ status, t }: { status: SiteStatus; t: Translate }): JSX.Element {
  return (
    <Badge variant="outline" className="tv-status-chip" data-status={status}>
      <span className="tv-status-dot" aria-hidden="true" />
      {t(`publish.status.${status}`)}
    </Badge>
  )
}

/**
 * A host name or a record value that breaks only after a dot: each piece between dots is one
 * unbreakable box, so nothing is ever broken in the middle of a word.
 */
export function Dotted({ text }: { text: string }): JSX.Element {
  const pieces: { at: number; piece: string }[] = []
  let at = 0
  for (const label of text.split('.')) {
    pieces.push({ at, piece: at + label.length < text.length ? `${label}.` : label })
    at += label.length + 1
  }
  return (
    <>
      {pieces.map(({ at: offset, piece }) => (
        <Fragment key={offset}>
          {offset > 0 && <wbr />}
          <span className="tv-nowrap">{piece}</span>
        </Fragment>
      ))}
    </>
  )
}

/**
 * A small icon button that writes to the clipboard, says `Copied` beside itself for a moment, and
 * reports a refusal as a refusal. Only the latest press may speak: an answer that arrives after a
 * newer press, or after the button is gone, is dropped.
 */
export function CopyButton({
  text,
  label,
  onRefused,
  t
}: {
  text: string
  label: string
  /** Told `true` when the browser refused, `false` when a later press went through. */
  onRefused: (refused: boolean) => void
  t: Translate
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const turn = useRef(0)
  useEffect(
    () => () => {
      turn.current += 1
    },
    []
  )
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const press = async (): Promise<void> => {
    turn.current += 1
    const mine = turn.current
    setCopied(false)
    let done = false
    try {
      await navigator.clipboard.writeText(text)
      done = true
    } catch {
      // No clipboard, or the browser refused: said by the caller, never as "Copied".
    }
    if (turn.current !== mine) return
    setCopied(done)
    onRefused(!done)
  }

  return (
    <span className="tv-copy" data-copy>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="tv-copy-button"
        aria-label={label}
        onClick={() => void press()}
      >
        {copied ? <Check className="tv-copy-done" aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
      {/* Floats above the icon: it reserves no width, so saying it moves nothing. */}
      <span role="status" className="tv-copy-said" data-copied>
        {copied ? t('publish.copied') : ''}
      </span>
    </span>
  )
}

/** What a press said that the state read back does not: a refusal that started nothing. */
interface Notice {
  key: string
  /** `status`: said calmly (somebody else is already publishing). `alert`: the press did not work. */
  tone: 'status' | 'alert'
}

export interface PublishingControl {
  /** The server's last answer, or null when it never gave one this screen could read. */
  publishing: Publishing | null
  /** The direction of a press whose answer has not been read back yet. */
  pressed: 'live' | 'draft' | null
  notice: Notice | null
  press: (op: 'live' | 'draft') => void
  read: () => void
}

/**
 * The site's publishing as the server tells it, kept current: read again while an operation runs,
 * when the window is looked at again, and after every press whatever the press answered.
 */
export function usePublishing(
  siteKey: string,
  initial: Publishing | null,
  pollMs: number = PUBLISH_POLL_MS
): PublishingControl {
  const [publishing, setPublishing] = useState(initial)
  const [pressed, setPressed] = useState<'live' | 'draft' | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  // A press that was answered while the state after it could not be read: what the door said, kept
  // until a read of the state gets through.
  const [unread, setUnread] = useState<{ op: 'live' | 'draft'; said: string | null } | null>(null)
  // Every answer is numbered when it is ASKED for; only the latest asked may be written.
  const asked = useRef(0)
  const busy = useRef(false)
  const alive = useRef(true)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    abort.current = controller
    return () => {
      alive.current = false
      controller.abort()
    }
  }, [])
  const base = `/api/sites/${encodeURIComponent(siteKey)}`

  const ask = useCallback(async (): Promise<Publishing | null> => {
    asked.current += 1
    const mine = asked.current
    try {
      const response = await fetch(`${base}/state`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: abort.current?.signal
      })
      if (!response.ok) return null
      const next = readPublishing(await response.json().catch(() => null))
      if (!alive.current || mine !== asked.current || next === null) return null
      setPublishing(next)
      return next
    } catch {
      return null
    }
  }, [base])

  const read = useCallback((): void => {
    // A press reads the state itself once it is answered; a read in between would only race it.
    if (!busy.current) void ask()
  }, [ask])

  /** A press is over: the state after it was read. Says what the reading does not. */
  const settle = useCallback((op: 'live' | 'draft', said: string | null, fresh: Publishing): void => {
    // What the press asked for is neither under way nor done, and no reason was named: an
    // answer this screen cannot read (a 207, a page from something in between). Said as that.
    const wanted = op === 'live' ? 'published' : 'draft'
    const explained = fresh.operation !== null || fresh.publish === wanted
    const key = said ?? (explained ? null : 'publish.unknown')
    setNotice(key === null ? null : { key, tone: key === 'publish.busy' ? 'status' : 'alert' })
    busy.current = false
    setUnread(null)
    setPressed(null)
  }, [])

  // The state after a press could not be read: ask until it can, and only then let go of the press.
  useEffect(() => {
    if (unread === null) return
    let asking = false
    const timer = setInterval(() => {
      if (asking) return
      asking = true
      void ask().then((fresh) => {
        asking = false
        if (alive.current && fresh !== null) settle(unread.op, unread.said, fresh)
      })
    }, pollMs)
    return () => clearInterval(timer)
  }, [unread, ask, settle, pollMs])

  const press = useCallback(
    (op: 'live' | 'draft'): void => {
      // A ref, not state: a double click sends its second press before any render.
      if (busy.current) return
      busy.current = true
      setPressed(op)
      setNotice(null)
      void (async () => {
        let status = 0
        let body: unknown = null
        try {
          const response = await fetch(`${base}/go-live`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ op }),
            signal: abort.current?.signal
          })
          status = response.status
          body = await response.json().catch(() => null)
        } catch {
          // No answer at all: status stays 0.
        }
        if (!alive.current) return
        const code = (body as { code?: unknown } | null)?.code
        const said = status === 0 ? 'publish.offline' : publishRefusalKey(status, code)
        // Whatever the door said, the state is asked for: the press is never its own result.
        const fresh = await ask()
        if (!alive.current) return
        // 🔒 NO READING, NO BUTTON. The door may have taken the press (a job is running on the
        // server) while the read after it failed. Showing the earlier snapshot again would offer
        // "Publish" on a site that is being published, with nothing left asking. The press stays
        // held — the button waits — and the state is asked for until an answer comes.
        if (fresh === null) {
          setUnread({ op, said })
          return
        }
        settle(op, said, fresh)
      })()
    },
    [ask, base, settle]
  )

  // 🔒 THE REST OF THE PAGE IS TOLD WHEN THE OPERATION MOVES, NOT ONLY WHEN THE FLAG DOES. My Sites
  // in another mounted view writes "Publishing…" on the row and withholds the menu's Publish while
  // an operation runs; it reads its list again on this event. Told only when the flag changed, it
  // heard nothing at the START of a publish (the flag stays `draft` until the host is done), nor
  // when one failed (the flag never moved), and went on showing the row as it was until the window
  // was focused again. What is compared is what the row shows: the flag, and which operation is
  // under way and how it stands. The first reading of a site tells nobody — nothing changed.
  const operation = publishing?.operation ?? null
  const standing =
    publishing === null
      ? null
      : [
          publishing.publish,
          operation === null ? '' : `${operation.op}:${operation.state}:${operation.startedAt ?? ''}`
        ].join('|')
  const told = useRef<{ siteKey: string; standing: string | null }>({ siteKey, standing })
  useEffect(() => {
    const before = told.current
    if (standing === null || (before.siteKey === siteKey && before.standing === standing)) return
    // Another site picked, or this site's first reading: remembered, not announced.
    const moved = before.siteKey === siteKey && before.standing !== null
    told.current = { siteKey, standing }
    if (moved) window.dispatchEvent(new CustomEvent(SITE_PUBLISH_EVENT, { detail: { siteKey } }))
  }, [standing, siteKey])

  const running = publishing?.operation?.state === 'running'
  useEffect(() => {
    if (!running) return
    const timer = setInterval(read, pollMs)
    return () => {
      clearInterval(timer)
      // "Already publishing" was about the operation that just ended.
      setNotice((said) => (said?.key === 'publish.busy' ? null : said))
    }
  }, [running, read, pollMs])

  // A second tab, or this one left open: what it shows is asked for again when it is looked at.
  useEffect(() => {
    const looked = (): void => {
      if (document.visibilityState !== 'hidden') read()
    }
    window.addEventListener('focus', looked)
    document.addEventListener('visibilitychange', looked)
    return () => {
      window.removeEventListener('focus', looked)
      document.removeEventListener('visibilitychange', looked)
    }
  }, [read])

  return { publishing, pressed, notice, press, read }
}

/** A point in time in the reader's language, or null when it is not one. */
export function when(iso: string | undefined): string | null {
  if (iso === undefined) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleString(interfaceLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

/** The failed operation: one line, and its reason and reference behind `Details`. */
export function FailedLine({
  publishing,
  control,
  t
}: {
  publishing: Publishing
  control: PublishingControl
  t: Translate
}): JSX.Element | null {
  const id = useId()
  const [open, setOpen] = useState(false)
  const failure = publishFailure(publishing)
  // A failure that is about an own domain is said on that domain's card, beside what to do about it.
  if (failure === null || failure.kind === 'domain' || failure.kind === 'removal') return null
  const { operation } = failure
  const ended = when(operation.endedAt ?? operation.startedAt)
  const reference =
    operation.jobId !== null && ended !== null
      ? t('publish.reference.job', { job: operation.jobId, when: ended })
      : ended
  return (
    <div
      className="tv-pub-strip tv-domain-failed"
      data-severity="error"
      data-line="failed"
      data-failure={failure.kind}
    >
      <CircleX aria-hidden="true" />
      <div className="tv-pub-strip-body">
        <div className="tv-domain-failed-line">
          <p role="alert">{t(`publish.failed.${failure.kind}`)}</p>
          {/* A publish is retried by the card's own button. Going back to draft has none while the
            site reads draft, so its retry sits here. */}
          {failure.kind === 'draft' && publishing.mayPublish && (
            <Button
              type="button"
              variant="link"
              className="tv-link"
              disabled={control.pressed !== null}
              onClick={() => control.press('draft')}
            >
              {t('action.retry')}
            </Button>
          )}
          <Button
            type="button"
            variant="link"
            className="tv-link tv-link-quiet"
            aria-expanded={open}
            aria-controls={open ? `${id}-details` : undefined}
            onClick={() => setOpen(!open)}
          >
            {t('publish.details')}
          </Button>
        </div>
        {open && (
          <div id={`${id}-details`} className="tv-domain-details" data-details data-code={operation.code}>
            <p>{t(publishReasonKey(operation.code))}</p>
            {reference !== null && <p>{reference}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Gives the keyboard back to `target` when the dialog closes. The dialog has no trigger element of
 * its own (it opens from state), and in a browser its closing leaves the focus on `<body>`: the next
 * Tab would start from the top of the page. Waits until the popup has left the page (its closing
 * animation), and steps aside when the focus already went somewhere on purpose, or when the button
 * is gone (a confirmed press replaced it — the section's heading has the keyboard then).
 */
export function useFocusBack(open: boolean, target: () => HTMLElement | null): void {
  const was = useRef(open)
  useEffect(() => {
    const closed = was.current && !open
    was.current = open
    if (!closed) return
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const step = (): void => {
      if (document.querySelector('.tv-domain-dialog') !== null && tries++ < 60) {
        timer = setTimeout(step, 25)
        return
      }
      const active = document.activeElement
      if (active === null || active === document.body) target()?.focus()
    }
    timer = setTimeout(step, 0)
    return () => clearTimeout(timer)
  }, [open, target])
}

/** Says what stops before the button that stops it. */
export function BackToDraftDialog({
  siteName,
  domains,
  open,
  onOpenChange,
  onConfirm,
  returnTo,
  t
}: {
  siteName: string
  /** The own domains that are connected: each stops opening the site, and is said to. */
  domains: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  /** Where the keyboard goes when the dialog closes and the button that opened it is still there. */
  returnTo: () => HTMLElement | null
  t: Translate
}): JSX.Element {
  useFocusBack(open, returnTo)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role="alertdialog"
        closeLabel={t('action.close')}
        className="tracy-mysites tracy-site-tabs tv-domain-dialog sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{t('publish.draftTitle', { site: siteName })}</DialogTitle>
          <DialogDescription>{t('publish.draftBody')}</DialogDescription>
          {domains.map((domain) => (
            <p key={domain} className="tv-domain-note tv-domain-note-alert" data-line="draft-domain">
              {t('domains.draftStops', { domain })}
            </p>
          ))}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" autoFocus onClick={() => onOpenChange(false)}>
            {t('action.cancel')}
          </Button>
          <Button type="button" variant="destructive" size="sm" data-confirm="draft" onClick={onConfirm}>
            {t('publish.backToDraft')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * What the last lookup returned for one record, in the reader's words. Never more than it returned.
 * `opens`: the domain itself answered as this site — a routing record that is not the one Tracy
 * names is then another way there, not something to fix.
 */
function foundWords(check: DomainCheck, opens: boolean, t: Translate): string {
  const found = check.observed.join(', ')
  // Asked for by the certificate, and read by whoever issues it — never by Tracy.
  if (check.record === 'validation') return t('domains.found.validation')
  if (opens && check.record === 'routing') {
    if (check.status === 'wrong') return t('domains.found.otherRoute', { found })
    if (check.status === 'missing') return t('domains.found.otherRouteMissing', { name: check.name })
  }
  switch (check.status) {
    case 'ok':
      return t('domains.found.ok')
    case 'wrong':
      return t(check.error === 'LOOP' ? 'domains.found.loop' : 'domains.found.wrong', { found })
    case 'missing':
      return check.record === 'routing'
        ? t('domains.found.missingRouting', { name: check.name })
        : t('domains.found.missing', { type: check.type, name: check.name })
    case 'unknown':
      if (check.error === 'TARGET_CHANGED') return t('domains.found.targetChanged')
      if (check.error === 'NO_TARGET') return t('domains.noRouting')
      return t('domains.found.unknown', { reason: check.error ?? '' })
    default:
      return t('domains.found.unchecked')
  }
}

/** One DNS record of an own domain: what to create, and what the last lookup found there. */
function DomainRecord({
  check,
  opens,
  onCopyRefused,
  t
}: {
  check: DomainCheck
  /** The domain, asked over HTTPS, answered as this site. */
  opens: boolean
  onCopyRefused: (refused: boolean) => void
  t: Translate
}): JSX.Element {
  return (
    <div className="tv-domain-record" data-record={check.record} data-check={check.status}>
      <p className="tv-domain-record-title">{t(`domains.record.${check.record}`)}</p>
      {/* Every row is a label and its value on one baseline; a value typed into the DNS provider —
          the name and the value, not the type — has its copy button right after it. */}
      <dl>
        <dt>{t('settings.url.dnsType')}</dt>
        <dd className="tv-domain-record-plain" data-record-type>
          {check.type}
        </dd>
        <dt>{t('settings.url.dnsName')}</dt>
        <dd className="tv-domain-record-value tv-pub-value">
          <code className="tv-mono" data-record-name>
            <Dotted text={check.name} />
          </code>
          <CopyButton
            key={check.name}
            text={check.name}
            label={t('domains.copyRecordName', { type: check.type })}
            onRefused={onCopyRefused}
            t={t}
          />
        </dd>
        {/* Left out for a seat that is not sent the value (the proof of ownership is the Owner's). */}
        {check.expected !== undefined && (
          <>
            <dt>{t('settings.url.dnsValue')}</dt>
            <dd
              className={
                check.expected === null ? 'tv-domain-record-plain' : 'tv-domain-record-value tv-pub-value'
              }
            >
              {check.expected === null ? (
                <span data-record-value>{t('settings.unavailable')}</span>
              ) : (
                <>
                  <code className="tv-mono" data-record-value>
                    {check.expected}
                  </code>
                  <CopyButton
                    key={check.expected}
                    text={check.expected}
                    label={t('domains.copyRecord', { type: check.type })}
                    onRefused={onCopyRefused}
                    t={t}
                  />
                </>
              )}
            </dd>
          </>
        )}
      </dl>
      <p className="tv-domain-found" data-found={check.status} data-error={check.error}>
        {check.status === 'ok' ? (
          <CircleCheck aria-hidden="true" />
        ) : check.status === 'wrong' ? (
          <CircleX aria-hidden="true" />
        ) : (
          <CircleDashed aria-hidden="true" />
        )}
        <span>{foundWords(check, opens, t)}</span>
      </p>
    </div>
  )
}

/** Asks before a domain is taken away: it stops opening the site the moment the host has done it. */
function RemoveDomainDialog({
  domain,
  open,
  onOpenChange,
  onConfirm,
  returnTo,
  t
}: {
  domain: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  returnTo: () => HTMLElement | null
  t: Translate
}): JSX.Element {
  useFocusBack(open, returnTo)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role="alertdialog"
        closeLabel={t('action.close')}
        className="tracy-mysites tracy-site-tabs tv-domain-dialog sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{t('domains.removeTitle', { domain })}</DialogTitle>
          <DialogDescription>{t('domains.removeBody', { domain })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" autoFocus onClick={() => onOpenChange(false)}>
            {t('action.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            data-confirm="remove-domain"
            onClick={onConfirm}
          >
            {t('domains.remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * One domain of the customer's own: its state in one word, the records to create with what the last
 * lookup found for each and when, and the actions this seat may take.
 *
 * 🔒 NOTHING HERE IS WORKED OUT. The chip, the lines and the buttons all follow `domainState`, which
 * reads the server's answer: a record is "found" because a lookup returned it, at the time written
 * under the records; a lookup that failed reads as one that failed; a domain is "Live" because the
 * server says the host connected it. A press is never taken as its own result.
 */
export function OwnDomainCard({
  domain,
  owner,
  control,
  busy,
  onCheck,
  onRemove,
  onReserve,
  t
}: {
  domain: OwnDomain
  /** Whether this seat may connect, check and remove (the site's Owner). */
  owner: boolean
  control: PublishingControl
  /** The address door is being asked something for this domain right now. */
  busy: 'verify' | 'remove' | 'reserve' | null
  onCheck: () => void
  onRemove: () => void
  /** Reserve a lapsed domain again: a new reservation, with a new record to add. */
  onReserve: () => void
  t: Translate
}): JSX.Element {
  const { publishing } = control
  const [copyRefused, setCopyRefused] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const removeButton = useCallback(
    () => cardRef.current?.querySelector<HTMLElement>('[data-action="remove-domain"]') ?? null,
    []
  )
  const state: DomainState = domainState(domain, publishing)
  const work = publishing ? publishWork(publishing, control.pressed) : control.pressed
  const waiting = state === 'removing' || state === 'connecting'
  const idle = work === null && busy === null
  const checkedAt = when(domain.checkedAt)
  const connection = domain.connection
  // When the domain itself was last asked: the time that matters once it is the domain, not DNS,
  // that does not answer.
  const probedAt = state === 'unreachable' ? when(connection?.checkedAt) : null
  const holdUntil = when(domain.holdUntil)
  // Lapsed, or never connectable as it is: there are no records to add, only a way out.
  const gone = state === 'lapsed' || state === 'unsupported'
  const operation = publishing?.operation ?? null
  // The words under the name: what to do next, for the state the server read back.
  const lead: Partial<Record<DomainState, string>> = {
    waiting: t('domains.addRecords'),
    opening: t('domains.lead.opening', { domain: domain.name }),
    wrong: t('domains.lead.wrong'),
    unknown: t('domains.lead.unknown'),
    verified: t(publishing?.publish === 'published' ? 'domains.verifiedLive' : 'domains.verifiedDraft', {
      domain: domain.name
    }),
    live: t('domains.lead.live'),
    lapsed: t('domains.lead.lapsed', { domain: domain.name }),
    // A bare domain names the subdomain to use instead; any other name the server refuses cannot be
    // fixed by adding a label to it, so nothing is suggested.
    unsupported:
      domain.problem === 'DOMAIN_APEX_UNSUPPORTED'
        ? t('domains.lead.unsupported', {
            domain: domain.name,
            suggestion: domain.suggestion ?? `www.${domain.name}`
          })
        : t('domains.lead.unconnectable', { domain: domain.name })
  }
  return (
    <div
      ref={cardRef}
      className="tv-domain-card tv-own-domain"
      data-card="own-domain"
      data-domain={domain.name}
      data-domain-state={state}
    >
      <div className="tv-domain-card-body">
        <div className="tv-own-domain-head">
          <h3 className="tv-host tv-mono" data-domain-name>
            <Dotted text={domain.name} />
          </h3>
          <Badge variant="outline" className="tv-status-chip tv-domain-chip" data-domain-chip={state}>
            <span className="tv-status-dot" aria-hidden="true" />
            {t(`domains.state.${state}`)}
          </Badge>
        </div>
        {waiting ? (
          <p className="tv-pub-strip tv-domain-working" data-severity="waiting" data-working-domain={state}>
            <Spinner
              label={t(state === 'removing' ? 'domains.removing' : 'domains.connecting')}
              className="tv-spinner"
            />
            {t(state === 'removing' ? 'domains.removing' : 'domains.connecting')}
          </p>
        ) : (
          lead[state] !== undefined && (
            <p className="tv-domain-lead" data-line="domain-lead">
              {lead[state]}
            </p>
          )
        )}
        {(state === 'failed' || state === 'cleanup') && (
          <p
            role="alert"
            className="tv-pub-strip tv-domain-note tv-domain-note-alert"
            data-severity="error"
            data-line="domain-failed"
            data-code={operation?.code}
          >
            <CircleX aria-hidden="true" />
            <span>
              {state === 'failed'
                ? t('domains.failed.connect', { domain: domain.name })
                : t('settings.url.removeFailed')}{' '}
              {state === 'failed' && t(publishReasonKey(operation?.code))}
            </span>
          </p>
        )}
        {/* The host has the domain's route; the domain itself, asked over HTTPS, is not this site. */}
        {state === 'unreachable' && (
          <p
            role="alert"
            className="tv-pub-strip tv-domain-note tv-domain-note-alert"
            data-severity="error"
            data-line="domain-unreachable"
            data-code={connection?.error}
          >
            <CircleX aria-hidden="true" />
            <span>
              {t('domains.unreachable.line', { domain: domain.name })}{' '}
              {t(unreachableReasonKey(connection?.error))} {t('domains.unreachable.keeps')}
            </span>
          </p>
        )}
        {!gone && (
          <div className="tv-domain-records" role="group" aria-label={t('domains.records')}>
            {domain.checks.map((check) => (
              <DomainRecord
                // A validation record may come more than once; each is its own line.
                key={`${check.record} ${check.type} ${check.name} ${check.expected ?? ''}`}
                check={check}
                opens={connection?.status === 'ok'}
                onCopyRefused={setCopyRefused}
                t={t}
              />
            ))}
          </div>
        )}
        {!gone && (
          <div className="tv-domain-notes" data-notes>
            {!gone && probedAt !== null && (
              <p className="tv-domain-note" data-line="checked-at" data-checked-at={connection?.checkedAt}>
                {t('domains.probedAt', { when: probedAt })}
              </p>
            )}
            {!gone && probedAt === null && (
              <p className="tv-domain-note" data-line="checked-at" data-checked-at={domain.checkedAt}>
                {checkedAt !== null
                  ? t('domains.checkedAt', { when: checkedAt })
                  : t('domains.found.unchecked')}
                {state === 'waiting' && ` ${t('domains.dnsWait')}`}
              </p>
            )}
            {!gone && (
              <p className="tv-domain-note" data-line="dns-only">
                {t('domains.dnsOnly')}
              </p>
            )}
            {/* Only the name with `www.` is connected; the name without it opens nothing until its
            owner forwards it at the DNS provider. */}
            {!gone && domain.name.startsWith('www.') && (
              <p className="tv-domain-note" data-line="bare-name">
                {t('domains.bareName', { bare: domain.name.slice(4), domain: domain.name })}
              </p>
            )}
            {!gone && holdUntil !== null && (
              <p className="tv-domain-note" data-line="hold-until" data-hold-until={domain.holdUntil}>
                {t('domains.holdUntil', { when: holdUntil })}
              </p>
            )}
          </div>
        )}
        {copyRefused && (
          <p role="alert" className="tv-domain-note tv-domain-note-alert" data-line="copy-refused">
            {t('publish.copyRefused')}
          </p>
        )}
        {!owner && (
          <p className="tv-domain-note" data-line="domain-role">
            {t('domains.ownerOnly')}
          </p>
        )}
        {!waiting && (owner || publishing?.mayPublish) && (
          <div className="tv-own-domain-actions" data-actions>
            {owner && state !== 'cleanup' && !gone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-action="check-dns"
                disabled={!idle}
                onClick={onCheck}
              >
                {t(busy === 'verify' ? 'domains.checking' : 'domains.check')}
              </Button>
            )}
            {owner && state === 'lapsed' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-action="reserve-again"
                disabled={!idle}
                onClick={onReserve}
              >
                {t(busy === 'reserve' ? 'settings.url.saving' : 'domains.reserveAgain')}
              </Button>
            )}
            {/* The site is live already: connecting is one more publish, which reads DNS again. Not
                offered while the domain is being asked or did not answer (`opening`, `unreachable`):
                its route is on the host already, and the server asks the domain again by itself. */}
            {(state === 'verified' || state === 'failed') &&
              publishing?.publish === 'published' &&
              publishing.mayPublish && (
                <Button
                  type="button"
                  size="sm"
                  data-action="connect-live"
                  disabled={!idle}
                  onClick={() => control.press('live')}
                >
                  {t('domains.publishOn', { domain: domain.name })}
                </Button>
              )}
            {owner && state === 'cleanup' && operation?.op === 'drop-domain' && (
              <Button type="button" size="sm" data-action="retry-remove" disabled={!idle} onClick={onRemove}>
                {t('action.retry')}
              </Button>
            )}
            {owner && state !== 'cleanup' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="tv-domain-draft"
                data-action="remove-domain"
                disabled={!idle}
                // Lapsed, or never connectable: it never opened the site, so there is nothing to warn of.
                onClick={() => (gone ? onRemove() : setConfirm(true))}
              >
                {t(busy === 'remove' ? 'domains.removing' : 'domains.remove')}
              </Button>
            )}
          </div>
        )}
      </div>
      <RemoveDomainDialog
        domain={domain.name}
        open={confirm && idle}
        onOpenChange={setConfirm}
        onConfirm={() => {
          setConfirm(false)
          onRemove()
        }}
        returnTo={removeButton}
        t={t}
      />
    </div>
  )
}
