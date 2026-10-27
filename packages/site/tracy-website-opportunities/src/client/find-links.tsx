/**
 * The Find box in links mode: several links of one business become one opportunity (`sendLinks`). The rows are
 * `@tracy/wo-views/link-rows`; this file adds the button, the picker of an ambiguous Google link and the refusals.
 */
import { type JSX, useEffect, useRef, useState } from 'react'
import { Globe } from 'lucide-react'
import { Button, RadioGroup, RadioGroupItem, Spinner } from '@tracy/ui'
import { LinkRows, type LinkRowsCopy } from '@tracy/wo-views/link-rows'
import {
  type LeftOutLink,
  type ServerLink,
  judgeRows,
  leftOutOf,
  linksOf,
  rowsOf,
  summaryOf
} from '@tracy/wo-views/link-rows-model'

import { type Api, type LinkCandidate, sendLinks } from './api.ts'
import type { RequestIds } from './request-ids.ts'
import { interfaceLocale } from '@tracy/core/interface-languages'
import type { Translate } from './strings.ts'

/** One line under a candidate: its address, rating and category. */
export function candidateLine(place: LinkCandidate): string {
  const rating = typeof place.rating === 'number' ? `★ ${place.rating.toFixed(1)}` : ''
  return [place.address, rating, place.category]
    .filter((part) => typeof part === 'string' && part)
    .join(' · ')
}

export function FindLinks({
  t,
  api,
  ids,
  rows,
  onRows,
  name,
  onName,
  onDone,
  autoSubmit = false
}: {
  t: Translate
  api: Api
  ids: RequestIds
  rows: string[]
  onRows(rows: string[]): void
  name: string
  onName(name: string): void
  /** The business was added and its research started. */
  onDone(): void
  /** Send the rows once on the first draw: a link submitted from the search field lands here. */
  autoSubmit?: boolean
}): JSX.Element {
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [server, setServer] = useState<ServerLink[] | undefined>(undefined)
  const [candidates, setCandidates] = useState<LinkCandidate[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  /** Added, with links the server left out: said here before moving on, or the person never learns of them. */
  const [leftOut, setLeftOut] = useState<LeftOutLink[] | null>(null)
  const copy: LinkRowsCopy = (key, params) => t(`links.${key}`, params)
  const used = summaryOf(judgeRows(rows, server)).used

  /** Edits make the server's last word and the picker stale. */
  const edit = (next: string[]): void => {
    onRows(next)
    setServer(undefined)
    setCandidates(null)
    setFailed(false)
    setLeftOut(null)
  }

  const submit = async (place?: LinkCandidate): Promise<void> => {
    if (sending || used === 0) return
    setSending(true)
    setFailed(false)
    const answer = await sendLinks(api, { links: linksOf(rows), name, ...(place ? { place } : {}) }, ids)
    setSending(false)
    if (answer.ok) {
      setServer(undefined)
      setCandidates(null)
      const out = leftOutOf(answer.body?.links)
      if (out.length === 0) return onDone()
      // The business is added and its research runs; the rows empty, and the notice says what was not used.
      onRows(rowsOf())
      onName('')
      setLeftOut(out)
      return
    }
    setServer(answer.links)
    if (answer.code === 'GOOGLE_LINK_AMBIGUOUS' && answer.candidates?.length) {
      setCandidates(answer.candidates)
      setPicked(answer.candidates[0]?.providerId ?? null)
      return
    }
    setCandidates(null)
    // NO_USABLE_LINKS speaks through the rows (each one's reason) and the summary line; anything else is a failure.
    if (answer.code !== 'NO_USABLE_LINKS') setFailed(true)
  }

  const autoSent = useRef(false)
  useEffect(() => {
    if (!autoSubmit || autoSent.current) return
    autoSent.current = true
    void submit()
    // Once, on the first draw.
  }, [])

  const chosen = candidates?.find((place) => place.providerId === picked) ?? null
  if (leftOut !== null) return <LeftOutNotice t={t} leftOut={leftOut} onOpen={onDone} />
  return (
    <div className="tracy-wo-stack" data-find-links="">
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <LinkRows
          copy={copy}
          rows={rows}
          onRows={edit}
          onName={onName}
          server={server}
          disabled={sending || candidates !== null}
        />
        <div>
          <Button type="submit" disabled={sending || used === 0 || candidates !== null}>
            {sending ? <Spinner label={t('find.sending')} /> : <Globe aria-hidden="true" />}
            {used > 1 ? t('links.addMany') : t('find.addLink')}
          </Button>
        </div>
      </form>
      {candidates !== null && (
        <div className="grid gap-2 rounded-lg border p-3" data-find-links-pick={candidates.length}>
          <p className="font-medium text-sm">{t('links.pick.title')}</p>
          <p className="text-muted-foreground text-xs">{t('links.pick.note')}</p>
          <RadioGroup value={picked ?? undefined} onValueChange={(value) => setPicked(String(value))}>
            {candidates.map((place) => (
              <label key={place.providerId} className="flex items-start gap-2 text-sm">
                <RadioGroupItem value={place.providerId} className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="font-medium">{place.name}</span>
                  <span className="text-muted-foreground text-xs">{candidateLine(place)}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!chosen || sending} onClick={() => chosen && void submit(chosen)}>
              {sending ? <Spinner label={t('find.sending')} /> : null}
              {t('links.pick.use')}
            </Button>
            <Button type="button" variant="outline" disabled={sending} onClick={() => setCandidates(null)}>
              {t('links.pick.cancel')}
            </Button>
          </div>
        </div>
      )}
      {failed && (
        <p className="tracy-wo-error" role="alert">
          {t('action.failed')}
        </p>
      )}
    </div>
  )
}

/** After an add that left links out: which ones and why, then on to My opportunities. */
export function LeftOutNotice({
  t,
  leftOut,
  onOpen
}: {
  t: Translate
  leftOut: readonly LeftOutLink[]
  onOpen(): void
}): JSX.Element {
  const one = new Intl.PluralRules(interfaceLocale()).select(leftOut.length) === 'one'
  return (
    <div className="grid gap-2 rounded-lg border p-3" role="status" data-find-links-left-out={leftOut.length}>
      <p className="font-medium text-sm">
        {t(one ? 'links.added.one' : 'links.added.other', { count: leftOut.length })}
      </p>
      <ul className="grid gap-1">
        {leftOut.map((link) => (
          <li key={link.url} className="grid min-w-0 gap-0.5 text-xs">
            <span className="truncate" title={link.url}>
              {link.url}
            </span>
            <span className="text-muted-foreground italic">{t(`links.reason.${link.reason}`)}</span>
          </li>
        ))}
      </ul>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onOpen}>
          {t('links.added.open')}
        </Button>
      </div>
    </div>
  )
}
