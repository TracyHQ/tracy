/**
 * The Media row of a place's profile: Brand (logo, colours), Photos and files, Video. Every part has one of three states:
 * data, searched and not there (grey), not collected yet (amber; the logo has a Retry that runs the logo search alone).
 * Video hides when there is none. Layout and wording: the approved draft `2026-10-23-wo-place-profile`.
 */
import { ExternalLink, FileText } from 'lucide-react'
import { type JSX, useState } from 'react'

import { Badge, Button } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import { sourceLabel } from './cms-label.ts'
import type { FileTile, LogoView, MediaRowView, MediaTile } from './detail-model.ts'
import { Section } from './inspector.tsx'
import { MenuPhotoLine } from './menu-block.tsx'
import type { Menu } from './menu-model.ts'
import type { Translate } from './strings.ts'

/** A part that was searched for and is not there: grey. `note` says what follows from it. */
function None({ t, note }: { t: Translate; note?: string }): JSX.Element {
  return (
    <span className="tracy-wo-stack">
      <span className="tracy-wo-muted">{t('reason.not_found')}</span>
      {note !== undefined ? <span className="tracy-wo-muted tracy-wo-small">{note}</span> : null}
    </span>
  )
}

/** A part never collected (or whose collection failed): amber, with a Retry where one exists. */
function NotCollected({
  t,
  retry
}: {
  t: Translate
  retry?: { label: string; busy: boolean; failed: boolean; onPress: () => void }
}): JSX.Element {
  return (
    <span className="tracy-wo-stack">
      <span className="tracy-wo-warn">{t('score.notCollected')}</span>
      {retry !== undefined ? (
        <span className="tracy-wo-row tracy-wo-wrap">
          <Button type="button" size="sm" variant="outline" disabled={retry.busy} onClick={retry.onPress}>
            {retry.label}
          </Button>
          {retry.failed ? (
            <span className="tracy-wo-error" role="alert">
              {t('media.retryFailed')}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  )
}

function LogoField({
  t,
  logo,
  retry,
  food
}: {
  t: Translate
  logo: LogoView
  retry: { busy: boolean; failed: boolean; onPress: () => void }
  /** A food business: the note says the restaurant name; any other trade, the business name. */
  food: boolean
}): JSX.Element {
  const retryLogo = { label: t('media.logo.retry'), ...retry }
  if (logo.state === 'notCollected') return <NotCollected t={t} retry={retryLogo} />
  if (logo.state === 'none')
    return (
      <span className="tracy-wo-stack">
        <None t={t} note={t(food ? 'media.logo.noneNote' : 'media.logo.noneNote.any')} />
        <span className="tracy-wo-row tracy-wo-wrap">
          <Button type="button" size="sm" variant="outline" disabled={retry.busy} onClick={retry.onPress}>
            {retryLogo.label}
          </Button>
          {retry.failed ? (
            <span className="tracy-wo-error" role="alert">
              {t('media.retryFailed')}
            </span>
          ) : null}
        </span>
      </span>
    )
  const source = logo.source === null ? '' : sourceLabel(t, logo.source)
  return (
    <span className="tracy-wo-stack">
      <span className="tracy-wo-row tracy-wo-wrap">
        <span className="tracy-wo-logo">
          <img src={mediaUrl(logo.mediaId)} alt={t('media.logo')} decoding="async" />
        </span>
        <Badge variant="outline">{t(logo.viaKey, { source })}</Badge>
        {logo.recognised !== null ? (
          <Badge variant="secondary">{t(`media.logo.recognised.${logo.recognised}`)}</Badge>
        ) : null}
      </span>
      {logo.width !== null && logo.height !== null ? (
        <span className="tracy-wo-muted tracy-wo-small">
          {t(logo.small ? 'media.logo.smallNote' : 'media.logo.sizeNote', {
            width: logo.width,
            height: logo.height
          })}
          {logo.transparent ? ` ${t('media.logo.transparent')}` : ''}
        </span>
      ) : null}
    </span>
  )
}

function Photo({ t, tile, menu }: { t: Translate; tile: MediaTile; menu: Menu | null }): JSX.Element {
  const source = tile.source === null ? '' : sourceLabel(t, tile.source)
  const label = t('media.item', { category: t(`media.category.${tile.category}`), source })
  const caption = [source, tile.credit].filter((x): x is string => x !== null && x !== '').join(' · ')
  return (
    <li className="tracy-wo-photo">
      {tile.stored ? (
        <span className="tracy-wo-tile">
          <img src={mediaUrl(tile.id)} alt={label} loading="lazy" decoding="async" />
        </span>
      ) : (
        <span className="tracy-wo-tile tracy-wo-stack">
          <span className="tracy-wo-small">{label}</span>
          {tile.reasonKey !== null ? (
            <span className="tracy-wo-muted tracy-wo-small">{t(tile.reasonKey)}</span>
          ) : null}
          {tile.sourceUrl !== null ? (
            <a
              className="tracy-wo-action-link tracy-wo-small"
              href={tile.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('media.openOriginal')}
              <ExternalLink aria-hidden="true" className="tracy-wo-icon" />
            </a>
          ) : null}
        </span>
      )}
      {caption !== '' ? <span className="tracy-wo-muted tracy-wo-small">{caption}</span> : null}
      <MenuPhotoLine t={t} menu={menu} mediaId={tile.id} />
    </li>
  )
}

function File({ t, file }: { t: Translate; file: FileTile }): JSX.Element {
  return (
    <li className="tracy-wo-photo">
      <a className="tracy-wo-tile tracy-wo-file" href={file.url} target="_blank" rel="noopener noreferrer">
        <FileText aria-hidden="true" className="tracy-wo-icon" />
        <span className="tracy-wo-small">{file.name}</span>
      </a>
      <span className="tracy-wo-muted tracy-wo-small">
        {[
          sourceLabel(t, file.source),
          t('media.file.pdf'),
          file.items !== null ? t('media.file.read', { count: file.items }) : null
        ]
          .filter((x): x is string => x !== null)
          .join(' · ')}
      </span>
    </li>
  )
}

/** The pictures kept but not shown as photographs (icons, maps, spacers, rows that did not download), on demand. */
function HiddenPictures({ t, tiles }: { t: Translate; tiles: MediaTile[] }): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (tiles.length === 0) return null
  return (
    <div className="tracy-wo-stack">
      <span className="tracy-wo-row tracy-wo-wrap">
        <span className="tracy-wo-muted tracy-wo-small">
          {t('media.hiddenLine', { count: tiles.length })}
        </span>
        <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {t(open ? 'media.hideHidden' : 'media.showHidden')}
        </Button>
      </span>
      {open ? (
        <ul className="tracy-wo-media">
          {tiles.map((tile) => (
            <li key={tile.id} className="tracy-wo-photo">
              <span className="tracy-wo-tile">
                {tile.stored ? (
                  <img
                    src={mediaUrl(tile.id)}
                    alt={t(`media.hidden.${tile.hidden}`)}
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
              </span>
              <span className="tracy-wo-muted tracy-wo-small">
                {[t(`media.hidden.${tile.hidden}`), tile.source === null ? null : sourceLabel(t, tile.source)]
                  .filter((x): x is string => x !== null)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function MediaRow({
  t,
  view,
  retryLogo,
  menu = null,
  food = false
}: {
  t: Translate
  view: MediaRowView
  retryLogo: { busy: boolean; failed: boolean; onPress: () => void }
  /** The profile's trade is food (`profile.trade`). */
  food?: boolean
  /** The Menu field: each menu photo gets its number and reading result. */
  menu?: Menu | null
}): JSX.Element {
  const { colors, photos, files, videos } = view
  return (
    <Section title={t('media.title')}>
      <h4 className="tracy-wo-h3">{t('media.brand')}</h4>
      <dl className="tracy-wo-fields">
        <div className="tracy-wo-field">
          <dt className="tracy-wo-label">{t('media.logo')}</dt>
          <dd>
            <LogoField t={t} logo={view.logo} retry={retryLogo} food={food} />
          </dd>
        </div>
        <div className="tracy-wo-field">
          <dt className="tracy-wo-label">{t('detail.colors')}</dt>
          <dd>
            {colors.state === 'found' ? (
              <>
                <ul className="tracy-wo-swatches">
                  {colors.colors.map((c, i) => (
                    <li key={`${c.hex}-${i}`} className="tracy-wo-swatch">
                      <span className="tracy-wo-chip" style={{ backgroundColor: c.hex }} aria-hidden="true" />
                      <span className="tracy-wo-small">{c.hex}</span>
                    </li>
                  ))}
                </ul>
                {colors.observedOnly ? (
                  <span className="tracy-wo-muted tracy-wo-small">
                    {t(
                      colors.origin === 'website'
                        ? 'detail.colorsObserved.website'
                        : 'detail.colorsObserved.social'
                    )}
                  </span>
                ) : null}
              </>
            ) : colors.state === 'none' ? (
              <None t={t} />
            ) : (
              <NotCollected t={t} />
            )}
          </dd>
        </div>
      </dl>

      <h4 className="tracy-wo-h3">{t('media.photosAndFiles')}</h4>
      {photos.found > 0 ? (
        <span className="tracy-wo-muted tracy-wo-small">
          {t('media.counts', { found: photos.found, shown: photos.shown })}
        </span>
      ) : null}
      {photos.state === 'none' && files.length === 0 ? (
        <None t={t} />
      ) : (
        <>
          {photos.groups.map((group) => (
            <div key={group.category} className="tracy-wo-stack">
              <span className="tracy-wo-label">{t(`media.category.${group.category}`)}</span>
              <ul className="tracy-wo-media">
                {group.tiles.map((tile) => (
                  <Photo key={tile.id} t={t} tile={tile} menu={menu} />
                ))}
              </ul>
            </div>
          ))}
          {files.length > 0 ? (
            <div className="tracy-wo-stack">
              <span className="tracy-wo-label">{t('media.files')}</span>
              <ul className="tracy-wo-media">
                {files.map((file) => (
                  <File key={file.url} t={t} file={file} />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <HiddenPictures t={t} tiles={photos.hidden} />

      {videos.state !== 'hidden' ? (
        <>
          <h4 className="tracy-wo-h3">{t('media.video')}</h4>
          {videos.state === 'notCollected' ? (
            <NotCollected t={t} />
          ) : (
            <ul className="tracy-wo-media">
              {videos.tiles.map((tile) => (
                <li key={tile.id} className="tracy-wo-photo">
                  <span className="tracy-wo-tile">
                    {tile.stored ? (
                      <video
                        src={mediaUrl(tile.id)}
                        preload="metadata"
                        muted
                        playsInline
                        controls
                        aria-label={t('media.item', {
                          category: t('media.video'),
                          source: tile.source === null ? '' : sourceLabel(t, tile.source)
                        })}
                      />
                    ) : tile.sourceUrl !== null ? (
                      <a
                        className="tracy-wo-action-link tracy-wo-small"
                        href={tile.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('media.openOriginal')}
                        <ExternalLink aria-hidden="true" className="tracy-wo-icon" />
                      </a>
                    ) : null}
                  </span>
                  {tile.source !== null ? (
                    <span className="tracy-wo-muted tracy-wo-small">{sourceLabel(t, tile.source)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </Section>
  )
}
