/**
 * Social pages of the Business facts sub-page (#537 R15): the pages research found or the seller pasted (sources), then
 * the links the owner typed for the site, each a linked chip with its network's glyph, in one row. Once research made
 * the saved profile (#537 R18) the row is its links (the owner's among them), each with its switch and its counts
 * (followers, posts) beside it (`facts-group-band.tsx SavedSocialRow`). Add more opens one
 * row inside the band (`facts-social-add.tsx`); Edit lists the owner's links, each with Remove. The pages research
 * found are sources of the research, so they are not removed here.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@tracy/ui'

import { FactsBand } from './business-facts-band.tsx'
import { Missing } from './business-facts-bands.tsx'
import type { BusinessFactsView } from './business-facts-model.ts'
import { sourceLabel } from './cms-label.ts'
import { type BandSwitchView, EditFooter } from './facts-band-actions.tsx'
import type { SetFactOn } from './facts-generic-row.tsx'
import { SavedSocialRow } from './facts-social-row.tsx'
import { SocialAddRow, socialErrorText } from './facts-social-add.tsx'
import type { OwnerDoors, SiteSocialView } from './owner-edits-model.ts'
import { sourceLogoKey } from './source-logo.ts'
import { SourceGlyph } from './source-logo.tsx'
import type { Translate } from './strings.ts'

const Chip = ({ url, logo, name }: { url: string; logo: ReactNode; name: string }): JSX.Element => (
  <li className="tracy-wo-facts-pill">
    <a href={url} target="_blank" rel="noreferrer" title={url}>
      {logo}
      <span className="tracy-wo-facts-ell">{name}</span>
    </a>
  </li>
)

/** The name of an owner's link: the network's own name, or the label of an `other` link. */
const linkName = (owner: Pick<OwnerDoors, 'networks'>, link: SiteSocialView): string =>
  link.label ?? owner.networks.find((n) => n.id === link.network)?.label ?? link.network

/** Edit: the owner's links, each with Remove; the research pages are named as sources that stay. */
function SocialEdit({
  t,
  owner,
  close
}: {
  t: Translate
  owner: Pick<OwnerDoors, 'networks' | 'socials' | 'setSocial'>
  close: () => void
}): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const remove = async (network: string): Promise<void> => {
    if (busy !== null) return
    setBusy(network)
    setError(null)
    const code = await owner.setSocial({ network, action: 'remove' })
    setBusy(null)
    if (code !== null) setError(code)
  }
  return (
    <>
      <ul className="tracy-wo-facts-social-ed">
        {owner.socials.map((link) => (
          <li key={link.network}>
            <SourceGlyph logo={sourceLogoKey(link.network, link.url)} size={14} />
            <span className="tracy-wo-facts-ell">{linkName(owner, link)}</span>
            <span className="tracy-wo-facts-ell tracy-wo-facts-dim" title={link.url}>
              {link.url}
            </span>
            <Button
              type="button"
              size="xs"
              variant="link"
              disabled={busy !== null}
              aria-label={t('social.removeLabel', { name: linkName(owner, link) })}
              onClick={() => void remove(link.network)}
            >
              {t('social.remove')}
            </Button>
          </li>
        ))}
      </ul>
      <EditFooter
        t={t}
        onCancel={close}
        note={
          error === null ? (
            t('social.found')
          ) : (
            <span className="tracy-wo-error" role="alert">
              {socialErrorText(t, error)}
            </span>
          )
        }
      />
    </>
  )
}

export function SocialBand({
  t,
  locale = 'en',
  view,
  onSite,
  owner,
  setOn = null
}: {
  t: Translate
  locale?: string
  view: BusinessFactsView
  onSite: BandSwitchView
  owner: Pick<OwnerDoors, 'networks' | 'socials' | 'setSocial'>
  setOn?: SetFactOn | null
}): JSX.Element {
  const [adding, setAdding] = useState(false)
  const card = view.cards.find((c) => c.id === 'social')
  const empty = view.social.length === 0 && owner.socials.length === 0
  return (
    <FactsBand
      t={t}
      id="social"
      label={t('facts.social.title')}
      title={t('facts.social.title')}
      add={
        <button
          type="button"
          className="tracy-wo-facts-act"
          disabled={adding || owner.networks.length === 0}
          aria-expanded={adding}
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden="true" />
          {t('media.add')}
        </button>
      }
      onSite={onSite}
      edit={
        owner.socials.length === 0
          ? { why: t('facts.edit.social') }
          : { form: (close) => <SocialEdit t={t} owner={owner} close={close} /> }
      }
      open={
        adding ? (
          <SocialAddRow
            t={t}
            networks={owner.networks}
            onSave={owner.setSocial}
            onClose={() => setAdding(false)}
          />
        ) : null
      }
    >
      {view.saved !== null && view.saved.links.length + view.saved.statistics.length > 0 ? (
        <SavedSocialRow t={t} locale={locale} view={view} setOn={setOn} networks={owner.networks} />
      ) : empty ? (
        <Missing t={t} card={card} />
      ) : (
        <ul className="tracy-wo-facts-chiprow tracy-wo-facts-row">
          {view.social.map((p) => (
            <Chip
              key={p.url}
              url={p.url}
              logo={<SourceGlyph logo={p.logo} size={12} />}
              name={sourceLabel(t, p.source, p.url)}
            />
          ))}
          {owner.socials.map((link) => (
            <Chip
              key={`owner-${link.network}`}
              url={link.url}
              logo={<SourceGlyph logo={sourceLogoKey(link.network, link.url)} size={12} />}
              name={linkName(owner, link)}
            />
          ))}
        </ul>
      )}
    </FactsBand>
  )
}
