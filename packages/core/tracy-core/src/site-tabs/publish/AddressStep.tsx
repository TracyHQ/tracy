/**
 * The site on its Tracy address: Draft, Publishing, or Live. The card says the address, its state
 * chip and the one line it may have to say; Publish (or Try again) is the step's footer press while
 * the site is a draft, Continue once it is live and a next step exists. Change address and Back to
 * draft are side doors in the card. Every press is the one the Domains section always made.
 */
import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@tracy/ui'
import { CircleX, Globe, Info, Lock, Pencil } from 'lucide-react'
import type { Translate } from '../../team/translate'
import { hostOf, publishFailure, publishWork, siteStatus, type Snapshot } from '../settings-rows'
import {
  BackToDraftDialog,
  CopyButton,
  Dotted,
  FailedLine,
  type PublishingControl,
  StatusChip,
  when
} from '../SiteDomains'
import type { AddressDoor } from './address-door'
import { AddressForm } from './AddressForm'
import { type PageFooter, StepPage } from './page'

export function AddressStep({
  snapshot,
  siteName,
  control,
  door,
  onBack,
  onNext,
  last,
  ownDomainHint,
  ownDomainEditorNote,
  t
}: {
  snapshot: Snapshot
  siteName: string
  control: PublishingControl
  door: AddressDoor
  onBack?: () => void
  /** The next step, when there is one. */
  onNext?: () => void
  /** Drawn at the end of the step when it is the flow's last (the imported WordPress line). */
  last?: JSX.Element | null
  /** The viewer can connect a domain of their own in the next step: only then is it hinted at. */
  ownDomainHint?: boolean
  /** A seat that may edit but is not the Owner: told why there is no domain step for it. */
  ownDomainEditorNote?: boolean
  t: Translate
}): JSX.Element {
  const { publishing } = control
  const [copyRefused, setCopyRefused] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const draftButton = useCallback(
    () => cardRef.current?.querySelector<HTMLElement>('[data-action="draft"]') ?? null,
    []
  )
  const address = hostOf(snapshot.siteUrl)
  const parts = addressParts(snapshot, address)
  const work = publishing ? publishWork(publishing, control.pressed) : null
  const live = publishing?.publish === 'published'
  const since = publishing ? when(publishing.liveSince) : null
  const lead = !publishing
    ? null
    : publishing.publish === 'draft'
      ? t('publish.lead.draft')
      : since !== null
        ? t('publish.lead.live', { when: since })
        : null
  // The keyboard follows a press that replaced its own button with the working line.
  const [moved, setMoved] = useState(0)
  const worked = useRef(work)
  useEffect(() => {
    if (work !== null && worked.current === null) setMoved((n) => n + 1)
    worked.current = work
  }, [work])
  const unconfirmed = publishing?.operation?.state === 'running' && publishing.operation.confirmed === false
  const workWords =
    work === null
      ? null
      : t(
          unconfirmed
            ? 'publish.working.unconfirmed'
            : work === 'drop-domain'
              ? 'domains.removing'
              : `publish.working.${work}`
        )
  const title = t(
    work === 'live' ? 'flow.address.titleGoing' : live ? 'flow.address.titleLive' : 'flow.address.titleDraft'
  )
  const desc = t(live ? 'flow.address.descLive' : 'flow.address.descDraft')
  const connected = door.domains.filter((d) => d.state === 'connected').map((d) => d.name)
  const footer: PageFooter = { onBack }
  const publishable = publishing?.mayPublish === true && work === null && !live
  if (publishable) {
    footer.primary = {
      label: t(publishFailure(publishing)?.kind === 'publish' ? 'action.retry' : 'publish.publish'),
      onPress: () => control.press('live'),
      attrs: { 'data-action': 'live' }
    }
  } else if (onNext && door.editing === null && ((live && work === null) || door.domains.length > 0)) {
    // Live: on to the domain step. A seat that cannot publish a draft, or a draft whose publish is
    // running, still reaches the domain it already has.
    footer.primary = { label: t('flow.continue'), onPress: onNext, attrs: { 'data-publish-next': '1' } }
  }
  const status = publishing ? siteStatus(publishing) : null
  // A draft that already has a domain of its own: the footer says Publish, its card is one step on.
  const toDomain = publishable && door.editing === null && door.domains.length > 0 ? onNext : undefined
  const changeShown = work === null && door.editing === null && snapshot.addressChange?.allowed === true
  const draftShown = work === null && live && publishing?.mayPublish === true
  // A small muted text button on the status line; the red stays inside the confirmation dialog.
  const backToDraft = (
    <button type="button" className="tv-pub-back-draft" data-action="draft" onClick={() => setConfirm(true)}>
      {t('publish.backToDraft')}
    </button>
  )
  return (
    <StepPage step="address" title={title} desc={desc} footer={footer} focusKey={String(moved)} t={t}>
      <div ref={cardRef} className="tv-pub-addr" data-card="primary">
        <div className="tv-pub-card-head">
          <h3>{t('publish.primary')}</h3>
          {status !== null && (
            <span className="tv-site-head-status" role="status" data-site-status={status}>
              <StatusChip status={status} t={t} />
            </span>
          )}
        </div>
        <div className="tv-pub-bar">
          <span className="tv-pub-bar-lk">
            <Lock aria-hidden="true" />
            <span className="tv-pub-url">
              {address !== null && <span className="tv-pub-sfx tv-mono">{parts.scheme}</span>}
              <span className="tv-host tv-mono" data-address data-host>
                {address === null ? (
                  t('settings.unavailable')
                ) : parts.name !== null ? (
                  <>
                    <span className="tv-pub-name">{parts.name}</span>
                    <span className="tv-pub-sfx">{parts.suffix}</span>
                  </>
                ) : (
                  <Dotted text={address} />
                )}
              </span>
            </span>
            {snapshot.siteUrl !== null && (
              <CopyButton
                key={snapshot.siteUrl}
                text={snapshot.siteUrl}
                label={t('publish.copyAddress')}
                onRefused={setCopyRefused}
                t={t}
              />
            )}
          </span>
          {changeShown && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="tv-pub-change"
              data-action="change-address"
              aria-label={t('flow.address.changeLabel')}
              onClick={() => door.open('address')}
            >
              <Pencil aria-hidden="true" />
              {t('flow.address.change')}
            </Button>
          )}
        </div>
        {lead !== null && (
          <p className="tv-domain-lead" data-lead>
            {lead}
            {draftShown && (
              <>
                <span className="tv-pub-lead-sep" aria-hidden="true">
                  {' \u00b7 '}
                </span>
                {backToDraft}
              </>
            )}
          </p>
        )}
        {workWords !== null && (
          <p
            className="tv-pub-strip tv-domain-working"
            data-severity="waiting"
            data-working={work ?? undefined}
            data-confirmed={unconfirmed ? 'false' : 'true'}
          >
            <Spinner label={workWords} className="tv-spinner" />
            {workWords}
          </p>
        )}
        {copyRefused && (
          <p role="alert" className="tv-domain-note tv-domain-note-alert" data-line="copy-refused">
            {t('publish.copyRefused')}
          </p>
        )}
        {publishing && work === null && !publishing.mayPublish && (
          <p className="tv-domain-note" data-line="role">
            {t('publish.adminOnly')}
          </p>
        )}
        {publishing && work === null && <FailedLine publishing={publishing} control={control} t={t} />}
        {control.notice !== null && work === null && (
          <p
            role={control.notice.tone === 'alert' ? 'alert' : 'status'}
            className={
              control.notice.tone === 'alert'
                ? 'tv-pub-strip tv-domain-note tv-domain-note-alert'
                : 'tv-pub-strip tv-domain-note'
            }
            data-severity={control.notice.tone === 'alert' ? 'error' : 'info'}
            data-line="notice"
            data-notice={control.notice.key}
          >
            {control.notice.tone === 'alert' ? <CircleX aria-hidden="true" /> : <Info aria-hidden="true" />}
            <span>{t(control.notice.key)}</span>
          </p>
        )}
        {/* Said while the work runs too: the second tab is told why its press started nothing. */}
        {control.notice?.key === 'publish.busy' && work !== null && (
          <p
            role="status"
            className="tv-pub-strip tv-domain-note"
            data-severity="info"
            data-line="notice"
            data-notice="publish.busy"
          >
            <Info aria-hidden="true" />
            <span>{t('publish.busy')}</span>
          </p>
        )}
        {(toDomain || (draftShown && lead === null)) && (
          <div className="tv-domain-actions tv-pub-side" data-actions>
            {toDomain && (
              <Button type="button" variant="outline" size="sm" data-action="to-domain" onClick={toDomain}>
                {t('flow.step.domain')}
              </Button>
            )}
            {draftShown && lead === null && backToDraft}
          </div>
        )}
        {(ownDomainHint || ownDomainEditorNote) && door.editing === null && (
          <div
            className="tv-pub-callout"
            data-own-domain-hint={ownDomainHint ? '' : undefined}
            data-own-domain-editor={ownDomainHint ? undefined : ''}
          >
            <Globe aria-hidden="true" />
            <div>
              <b>{t('flow.address.ownDomain')}</b>
              <span>
                {t(
                  ownDomainHint
                    ? live
                      ? 'flow.address.ownDomainLive'
                      : 'flow.address.ownDomainDraft'
                    : 'flow.address.ownDomainEditor'
                )}
              </span>
            </div>
          </div>
        )}
      </div>
      {door.editing === 'address' && (
        <AddressForm door={door} snapshot={snapshot} formId="tv-pub-address-form" inline t={t} />
      )}
      {door.error && door.editing === null && (
        <p role="alert" className="tv-pub-strip tv-site-address-error" data-severity="error">
          <CircleX aria-hidden="true" />
          <span>{door.error}</span>
        </p>
      )}
      {last}
      <BackToDraftDialog
        siteName={siteName}
        domains={connected}
        open={confirm && live && work === null}
        onOpenChange={setConfirm}
        onConfirm={() => {
          setConfirm(false)
          control.press('draft')
        }}
        returnTo={draftButton}
        t={t}
      />
    </StepPage>
  )
}

/** The address as the bar draws it: the scheme, the name the person can change, the Tracy suffix. */
function addressParts(
  snapshot: Snapshot,
  address: string | null
): { scheme: string; name: string | null; suffix: string } {
  const scheme = /^https?:\/\//.exec(snapshot.siteUrl ?? '')?.[0] ?? 'https://'
  const managed = snapshot.addressChange?.managedDomain
  if (address !== null && managed && address.endsWith(`.${managed}`) && address.length > managed.length + 1) {
    return { scheme, name: address.slice(0, -(managed.length + 1)), suffix: `.${managed}` }
  }
  // Not under the Tracy suffix (a connected domain, an older address): shown whole.
  return { scheme, name: null, suffix: '' }
}
