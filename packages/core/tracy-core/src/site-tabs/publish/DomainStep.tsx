/**
 * The Owner's own domain, an optional step after the site is live. With no domain yet the name
 * field is open at once (Check availability beside it, Save in the footer once the door says the
 * name is free); with a domain, its card: the records to add, what the last lookup found, Check
 * again and Remove. The same doors and answers the Domains section always had. While a publish or
 * a move back to draft runs, the field and Save are not drawn (the old Connect button could not be
 * pressed then): the working line says what is under way.
 */
import { type JSX, useEffect } from 'react'
import { Spinner } from '@tracy/ui'
import { CircleX } from 'lucide-react'
import type { Translate } from '../../team/translate'
import { hostOf, publishWork, type Snapshot } from '../settings-rows'
import { OwnDomainCard, type PublishingControl } from '../SiteDomains'
import type { AddressDoor } from './address-door'
import { AddressForm } from './AddressForm'
import { type PageFooter, StepPage } from './page'

export function DomainStep({
  snapshot,
  control,
  door,
  entry,
  onBack,
  onSkip,
  last,
  t
}: {
  snapshot: Snapshot
  control: PublishingControl
  door: AddressDoor
  /** A new domain may be connected here (`site-connect-domain` on, and no domain yet). */
  entry: boolean
  onBack?: () => void
  /** On without a domain; absent on the flow's last step, where there is nothing to skip to. */
  onSkip?: () => void
  last?: JSX.Element | null
  t: Translate
}): JSX.Element {
  const none = door.domains.length === 0
  // The field is the step: open it on arrival, and close what the address step left open.
  const { editing, open } = door
  useEffect(() => {
    if (entry && none && editing !== 'domain') open('domain')
  }, [entry, none, editing, open])
  const typed = door.name.trim()
  const publishing = control.publishing
  const work = publishing ? publishWork(publishing, control.pressed) : control.pressed
  const running = door.busy !== null || work !== null
  const unconfirmed = publishing?.operation?.state === 'running' && publishing.operation.confirmed === false
  // A domain being removed says so on its own card; a publish or a move to draft, here.
  const workWords =
    work === null || work === 'drop-domain'
      ? null
      : t(unconfirmed ? 'publish.working.unconfirmed' : `publish.working.${work}`)
  const entryShown = editing === 'domain' && work === null
  const footer: PageFooter = { onBack }
  if (none && onSkip) footer.onSkip = onSkip
  if (entryShown && door.checked && door.checked.name === typed) {
    footer.primary = {
      label: t(door.busy === 'save' ? 'settings.url.saving' : 'settings.url.save'),
      onPress: () => door.act('save'),
      busy: door.busy === 'save',
      disabled: running,
      attrs: { 'data-action': 'save-domain' }
    }
  }
  return (
    <StepPage
      step="domain"
      title={t('flow.domain.title')}
      desc={t('flow.domain.desc', { address: hostOf(snapshot.siteUrl) ?? '' })}
      footer={footer}
      t={t}
    >
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
      {entryShown && (
        <div className="tv-own-domain-entry" data-own-domain-entry>
          <AddressForm door={door} snapshot={snapshot} formId="tv-pub-domain-form" inline={false} t={t} />
        </div>
      )}
      {door.domains.map((domain) => (
        <OwnDomainCard
          key={domain.name}
          domain={domain}
          owner={snapshot.addressChange?.allowed === true}
          control={control}
          busy={
            door.busy === 'verify' || door.busy === 'remove' || door.busy === 'reserve' ? door.busy : null
          }
          onCheck={() => door.act('verify', domain.name)}
          onRemove={() => door.act('remove', domain.name)}
          onReserve={() => door.act('reserve', domain.name)}
          t={t}
        />
      ))}
      {door.error && editing !== 'domain' && (
        <p role="alert" className="tv-pub-strip tv-site-address-error" data-severity="error">
          <CircleX aria-hidden="true" />
          <span>{door.error}</span>
        </p>
      )}
      {last}
    </StepPage>
  )
}
