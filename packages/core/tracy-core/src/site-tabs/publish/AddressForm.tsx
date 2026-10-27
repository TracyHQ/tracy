/**
 * The name field of the address door: the site's Tracy address (Change address) or a domain of the
 * Owner's own. The same field, words and refusals the Domains section always drew; only where its
 * buttons sit changed. `inline` keeps Check / Save / Cancel in the form (the address step, where
 * the form is a side door); without it the field row carries Check and the step's footer carries
 * Save, through the form's id.
 */
import { type JSX, useId } from 'react'
import { Button, Input } from '@tracy/ui'
import { CircleCheck, CircleX } from 'lucide-react'
import type { Translate } from '../../team/translate'
import { hostOf, type Snapshot } from '../settings-rows'
import type { AddressDoor } from './address-door'

export function AddressForm({
  door,
  snapshot,
  formId,
  inline,
  t
}: {
  door: AddressDoor
  snapshot: Snapshot
  /** The form's id, so a button outside it (the footer's Save) submits it. */
  formId: string
  inline: boolean
  t: Translate
}): JSX.Element | null {
  const id = useId()
  const { editing, name, checked, busy, error } = door
  if (editing === null) return null
  const typed = name.trim()
  const check = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-action="check-name"
      disabled={busy !== null || !typed}
      onClick={() => door.act('check')}
    >
      {t(
        busy === 'check'
          ? 'settings.url.checking'
          : editing === 'domain'
            ? 'flow.domain.check'
            : 'settings.url.check'
      )}
    </Button>
  )
  return (
    <form
      id={formId}
      data-form={editing}
      className="tv-site-address-form tv-pub-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy !== null || !typed) return
        door.act(checked?.name === typed ? 'save' : 'check')
      }}
    >
      <label htmlFor={`${id}-input`}>{t(editing === 'domain' ? 'domains.name' : 'settings.url.name')}</label>
      <div className="tv-pub-field-row">
        <Input
          id={`${id}-input`}
          value={name}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={busy !== null}
          aria-describedby={`${id}-help`}
          aria-invalid={error !== null}
          onChange={(event) => door.type(event.target.value)}
        />
        {inline ? null : check}
      </div>
      <p id={`${id}-help`} className="tv-site-address-help">
        {/* The domain step's own line already says the Tracy address keeps answering. */}
        {editing === 'domain'
          ? inline
            ? `${t('domains.help')} ${t('domains.remains', { address: hostOf(snapshot.siteUrl) ?? '' })}`
            : t('domains.help')
          : t('settings.url.help', { domain: snapshot.addressChange?.managedDomain ?? '' })}
      </p>
      {/* A refusal of what was typed is said under the field it is about. */}
      {error && (
        <p
          role="alert"
          className="tv-pub-strip tv-site-address-error"
          data-severity="error"
          data-line="field-error"
        >
          <CircleX aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {checked && (
        <p role="status" className="tv-pub-strip" data-severity="success" data-line="name-free">
          <CircleCheck aria-hidden="true" />
          <span>
            {t(checked.kind === 'custom' ? 'settings.url.customAvailable' : 'settings.url.available')}
          </span>
        </p>
      )}
      {inline && (
        <div className="tv-site-address-actions">
          {check}
          {/* Save only once the door said the typed name is free: hidden until then, not greyed. */}
          {checked && checked.name === typed && (
            <Button type="submit" size="sm" data-action="save-name" disabled={busy !== null}>
              {t(busy === 'save' ? 'settings.url.saving' : 'settings.url.save')}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={door.close}>
            {t('action.cancel')}
          </Button>
        </div>
      )}
    </form>
  )
}
