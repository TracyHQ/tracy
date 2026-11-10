/**
 * Add more of the Social pages band (#537 R15): one row opened inside the band, never a popover elsewhere. The network
 * comes from the server's preset list (`socialNetworks`), its placeholder shows what to type: a link, a handle, or the
 * number for WhatsApp; `other` asks for the link's name too. Save sends it through `PUT …/:id/socials`; a refusal shows
 * under the row in words, per code, and the row stays open with what was typed.
 */
import { type JSX, useId, useState } from 'react'
import { Button, Input, NativeSelect, NativeSelectOption } from '@tracy/ui'

import { type SocialEditBody, type SocialNetworkView, socialSetBody } from './owner-edits-model.ts'
import { en, type Translate } from './strings.ts'

const known = (key: string): boolean => Object.prototype.hasOwnProperty.call(en, key)

/** The words of a refusal of the socials door, or the plain fallback. */
export const socialErrorText = (t: Translate, code: string): string =>
  t(known(`social.error.${code}`) ? `social.error.${code}` : 'social.error.other')

export function SocialAddRow({
  t,
  networks,
  onSave,
  onClose
}: {
  t: Translate
  networks: readonly SocialNetworkView[]
  /** Saves the link; answers the refusal code, or null once saved. */
  onSave: (body: SocialEditBody) => Promise<string | null>
  onClose: () => void
}): JSX.Element {
  const ids = useId()
  const [network, setNetwork] = useState(networks[0]?.id ?? '')
  const [typed, setTyped] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = networks.find((n) => n.id === network)
  const whatsapp = network === 'whatsapp'
  const other = network === 'other'
  const ready = network !== '' && typed.trim() !== '' && (!other || label.trim() !== '')
  const save = async (): Promise<void> => {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    const code = await onSave(socialSetBody(network, typed, label))
    setBusy(false)
    if (code === null) onClose()
    else setError(code)
  }
  return (
    <>
      <div className="tracy-wo-facts-ef tracy-wo-facts-social-add">
        <label className="tracy-wo-facts-fld" htmlFor={`${ids}-n`}>
          <span className="tracy-wo-facts-ck">{t('social.add.network')}</span>
          <NativeSelect
            id={`${ids}-n`}
            value={network}
            disabled={busy}
            onChange={(e) => {
              setNetwork(e.target.value)
              setError(null)
            }}
          >
            {networks.map((n) => (
              <NativeSelectOption key={n.id} value={n.id}>
                {n.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        {other ? (
          <label className="tracy-wo-facts-fld">
            <span className="tracy-wo-facts-ck">{t('social.add.label')}</span>
            <Input
              value={label}
              maxLength={40}
              autoComplete="off"
              disabled={busy}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
        ) : null}
        <label className="tracy-wo-facts-fld" data-wide={other ? undefined : ''}>
          <span className="tracy-wo-facts-ck">{t(whatsapp ? 'social.add.number' : 'social.add.link')}</span>
          <Input
            value={typed}
            maxLength={2000}
            autoComplete="off"
            autoFocus
            disabled={busy}
            inputMode={whatsapp ? 'tel' : 'url'}
            placeholder={chosen?.placeholder ?? ''}
            aria-invalid={error === null ? undefined : true}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
          />
        </label>
      </div>
      <div className="tracy-wo-facts-bf">
        <span className="tracy-wo-facts-bf-note">
          {error === null ? null : (
            <span className="tracy-wo-error" role="alert">
              {socialErrorText(t, error)}
            </span>
          )}
        </span>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClose}>
          {t('profile.edit.cancel')}
        </Button>
        <Button type="button" size="sm" disabled={busy || !ready} onClick={() => void save()}>
          {t('profile.edit.save')}
        </Button>
      </div>
    </>
  )
}
