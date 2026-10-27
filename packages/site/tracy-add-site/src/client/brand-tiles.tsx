/**
 * The logo and favicon questions of the "Customize your site" sheet (U5, U6, U7 of TracyHQ/tch#1013; approved canvas
 * `11-sheet-review-canvas.html`, `fLogo` and `fFav`).
 *
 * Logo: one tile per tile the design shows (`variants`: Light theme + Dark theme, Dark theme alone, or one Logo), the
 * label above it. The tile IS the preview, on a fixed white or near-black ground whatever the template's colours: the
 * customer sees at once whether the logo reads. Empty, it shows the business name as text, as the site will. The
 * actions are icons centred over the preview, which dims and blurs while the pointer is on the tile or focus is in it;
 * on a touch screen they always show. A refused file is said under the tiles; a logo that blends into a tile is a
 * warning there, never a refusal.
 *
 * Favicon: a 72px square tile on a checkerboard with the same actions, beside a browser tab showing the icon and the
 * business name. Empty, the tab shows a placeholder: the site keeps the template's own icon (nothing is generated).
 *
 * CSS: `BRAND_TILES_CSS` (`brand-tiles-css.ts`).
 */

import { Button } from '@tracy/ui'
import { Image as ImageIcon, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react'
import { type ChangeEvent, type JSX, type ReactNode, useRef, useState, useSyncExternalStore } from 'react'

import { tileWarnings } from './brand-picture.mjs'
import {
  CHAT_FILES_EVENT,
  CHAT_FILES_KEY,
  type ChatFile,
  fetchChatFile,
  logoCandidates,
  otherPictures,
  readChatFiles
} from './chat-logo.mjs'
import { previewOf } from './brand-previews'
import { type BrandTile, type TileRefusal, useBrandUpload } from './brand-upload'
import type { Translate } from './strings'

/** A string with `{name}` filled by a node, so a file name can be bold inside a translated sentence. */
function withNode(text: string, name: string, node: ReactNode): ReactNode {
  const [before, after = ''] = text.split(`{${name}}`)
  return (
    <>
      {before}
      {node}
      {after}
    </>
  )
}

/** One line under the tiles: a refusal (it was not added) or a warning (it was added). */
function Note({ tone, children }: { tone: 'error' | 'warn'; children: ReactNode }): JSX.Element {
  return (
    <div className="tas-brand-msg" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="tas-brand-msg-ic" aria-hidden="true">
        {tone === 'error' ? '✕' : '!'}
      </span>
      <span>{children}</span>
    </div>
  )
}

function Refusal({ refusal, t }: { refusal: TileRefusal; t: Translate }): JSX.Element {
  return (
    <Note tone="error">
      {withNode(t('brand_not_added'), 'file', <b>{refusal.file}</b>)} {t(refusal.key, refusal.params)}
    </Note>
  )
}

/** The chat's published files (`chat-logo.mjs`): the global itself is the snapshot, stable until republished. */
const subscribeChat = (listener: () => void) => {
  window.addEventListener(CHAT_FILES_EVENT, listener)
  return () => window.removeEventListener(CHAT_FILES_EVENT, listener)
}
const chatEntry = () => (window as unknown as Record<string, unknown>)[CHAT_FILES_KEY]
const noChatEntry = () => undefined

/**
 * The logo pictures the customer sent in the creation screen's chat, under the tiles. Every PNG is offered to press, which puts it in
 * the first empty tile (else the first). Each one goes through the tile's own upload, rules and warnings included.
 */
function ChatLogo(props: {
  tiles: BrandTile[]
  picked: Record<string, string>
  pick: (tile: BrandTile, file: File) => Promise<void>
  disabled: boolean
  t: Translate
}): JSX.Element | null {
  const { tiles, picked, pick, disabled, t } = props
  const [reading, setReading] = useState(false)
  const [failed, setFailed] = useState(false)
  const entry = useSyncExternalStore(subscribeChat, chatEntry, noChatEntry)
  const files: ChatFile[] = entry === undefined ? [] : readChatFiles()
  const candidates = logoCandidates(files)
  const target = tiles.find((tile) => picked[tile] === undefined) ?? tiles[0]!
  const use = async (file: ChatFile) => {
    setReading(true)
    setFailed(false)
    try {
      const got = await fetchChatFile(file)
      if (got) await pick(target, got)
      else setFailed(true)
    } finally {
      setReading(false)
    }
  }
  if (disabled) return null
  if (candidates.length === 0)
    return otherPictures(files).length > 0 ? <Note tone="warn">{t('brand_chat_not_png')}</Note> : null
  return (
    <div className="tas-chatlogo" role="group" aria-label={t('brand_chat_title')}>
      <span className="tas-chatlogo-k">{t('brand_chat_title')}</span>
      {candidates.map((file) => (
        <button
          key={file.id}
          type="button"
          className="tas-chatlogo-pick"
          title={t('brand_chat_use', { file: file.name })}
          aria-label={t('brand_chat_use', { file: file.name })}
          disabled={reading}
          onClick={() => void use(file)}
        >
          <img alt="" src={file.url} />
          <span>{file.name}</span>
        </button>
      ))}
      {failed ? <Note tone="error">{t('brand_upload_failed')}</Note> : null}
    </div>
  )
}

/** The icon buttons over a tile: upload (or replace), and remove once there is a picture. */
function TileActions(props: {
  tile: BrandTile
  filled: boolean
  busy: boolean
  /** The /ops preview: the file box takes nothing, so no picture is read or sent. */
  preview: boolean
  onFile: (file: File) => void
  onRemove: () => void
  t: Translate
}): JSX.Element {
  const { filled, busy, t } = props
  const upload = t(filled ? 'brand_replace' : 'brand_upload')
  const Icon = busy ? Loader2 : filled ? RefreshCw : Upload
  return (
    <div className="tas-tile-a">
      <label className="tas-ib" title={busy ? t('brand_uploading') : upload} data-busy={busy ? '1' : '0'}>
        <Icon aria-hidden="true" className={busy ? 'animate-spin' : undefined} />
        <input
          type="file"
          accept="image/png"
          aria-label={busy ? t('brand_uploading') : upload}
          disabled={busy || props.preview}
          data-brand-file={props.tile}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            // Cleared at once, so picking the same file again after a refusal is a change too.
            event.target.value = ''
            if (file) props.onFile(file)
          }}
        />
      </label>
      {filled ? (
        <button
          type="button"
          className="tas-ib"
          title={t('brand_remove')}
          aria-label={t('brand_remove')}
          disabled={busy}
          onClick={props.onRemove}
        >
          <Trash2 aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

export interface BrandFieldProps {
  /** The answer by tile: upload ids. */
  picked: Record<string, string>
  onPicked: (next: Record<string, string>) => void
  /** The business name as typed so far, or '' (the tiles then say "Your business"). */
  businessName: string
  /** The id of the card title naming this question. */
  labelId: string
  /** The /ops preview (`QuestionsSheet` `preview`): no file can be picked. */
  preview?: boolean
  /** Full-page wizard: upload rows with the same upload validation and warnings. */
  compact?: boolean
  t: Translate
}

/** The logo tiles, one per `variants` entry the server served (`single` when it served none). */
export function LogoField({ variants, ...props }: BrandFieldProps & { variants: string[] }): JSX.Element {
  const { picked, t } = props
  const { busy, refused, pick, remove } = useBrandUpload('logo', picked, props.onPicked)
  const tiles = (variants.length > 0 ? variants : ['single']) as BrandTile[]
  const name = props.businessName || t('brand_your_business')
  if (props.compact)
    return (
      <div
        className="tas-brand tas-customize-brand"
        role="group"
        aria-labelledby={props.labelId}
        data-brand="logo"
      >
        {tiles.map((tile) => (
          <CompactUpload
            key={tile}
            tile={tile}
            picked={picked[tile]}
            title={t(`brand_tile_${tile}`)}
            rule={t('customize_logo_rule')}
            busy={busy[tile] === true}
            preview={props.preview === true}
            onFile={(file) => void pick(tile, file)}
            onRemove={() => remove(tile)}
            t={t}
          />
        ))}
        <ChatLogo tiles={tiles} picked={picked} pick={pick} disabled={props.preview === true} t={t} />
        {tiles.map((tile) => (refused[tile] ? <Refusal key={tile} refusal={refused[tile]} t={t} /> : null))}
        {tiles.flatMap((tile) =>
          tileWarnings(tile, previewOf(picked[tile])?.blend).map((key) => (
            <Note key={`${tile}-${key}`} tone="warn">
              {t(key)}
            </Note>
          ))
        )}
      </div>
    )
  return (
    <div className="tas-brand" role="group" aria-labelledby={props.labelId} data-brand="logo">
      <div className="tas-tiles" data-count={tiles.length}>
        {tiles.map((tile) => {
          const preview = previewOf(picked[tile])
          const filled = picked[tile] !== undefined
          const label = t(`brand_tile_${tile}`)
          return (
            <div key={tile} className="tas-tilewrap">
              <div className="tas-tile-k" id={`${props.labelId}-${tile}`}>
                {label}
              </div>
              <div
                className="tas-tile"
                role="group"
                aria-labelledby={`${props.labelId}-${tile}`}
                data-tile={tile}
                data-ground={tile === 'dark' ? 'dark' : 'light'}
                data-filled={filled ? '1' : '0'}
                data-bad={refused[tile] ? '1' : '0'}
              >
                <div className="tas-tile-v">
                  {preview ? (
                    <img
                      alt={label}
                      src={preview.src}
                      title={`${preview.name} · ${preview.width} × ${preview.height} px`}
                    />
                  ) : (
                    <span className="tas-tile-nm" data-brand-name="1">
                      {name}
                    </span>
                  )}
                </div>
                <TileActions
                  tile={tile}
                  filled={filled}
                  busy={busy[tile] === true}
                  preview={props.preview === true}
                  onFile={(file) => void pick(tile, file)}
                  onRemove={() => remove(tile)}
                  t={t}
                />
              </div>
            </div>
          )
        })}
      </div>
      <ChatLogo tiles={tiles} picked={picked} pick={pick} disabled={props.preview === true} t={t} />
      {tiles.map((tile) => {
        const refusal = refused[tile]
        return refusal ? <Refusal key={tile} refusal={refusal} t={t} /> : null
      })}
      {tiles.flatMap((tile) =>
        tileWarnings(tile, previewOf(picked[tile])?.blend).map((key) => (
          <Note key={`${tile}-${key}`} tone="warn">
            {t(key)}
          </Note>
        ))
      )}
      <div className="tas-fhint">{t('brand_logo_file')}</div>
      <div className="tas-fhint">{t('brand_logo_empty')}</div>
    </div>
  )
}

/** The favicon tile and the browser tab that previews it. */
export function FaviconField(props: BrandFieldProps): JSX.Element {
  const { picked, t } = props
  const { busy, refused, pick, remove } = useBrandUpload('favicon', picked, props.onPicked)
  const preview = previewOf(picked.favicon)
  const filled = picked.favicon !== undefined
  if (props.compact)
    return (
      <div
        className="tas-brand tas-customize-brand"
        role="group"
        aria-labelledby={props.labelId}
        data-brand="favicon"
      >
        <CompactUpload
          tile="favicon"
          picked={picked.favicon}
          title={t('customize_favicon')}
          rule={t('customize_favicon_rule')}
          busy={busy.favicon === true}
          preview={props.preview === true}
          onFile={(file) => void pick('favicon', file)}
          onRemove={() => remove('favicon')}
          t={t}
        />
        {refused.favicon ? <Refusal refusal={refused.favicon} t={t} /> : null}
      </div>
    )
  return (
    <div className="tas-brand" role="group" aria-labelledby={props.labelId} data-brand="favicon">
      <div className="tas-favrow">
        <div
          className="tas-tile tas-tile-fv"
          data-tile="favicon"
          data-filled={filled ? '1' : '0'}
          data-bad={refused.favicon ? '1' : '0'}
        >
          <div className="tas-tile-v">
            {preview ? (
              <img alt={t('brand_favicon_alt')} src={preview.src} />
            ) : (
              <span className="tas-fvempty" aria-hidden="true" />
            )}
          </div>
          <TileActions
            tile="favicon"
            filled={filled}
            busy={busy.favicon === true}
            preview={props.preview === true}
            onFile={(file) => void pick('favicon', file)}
            onRemove={() => remove('favicon')}
            t={t}
          />
        </div>
        <div className="tas-tabpv" role="img" aria-label={t('brand_tab_preview')} data-tab-preview="1">
          <span className="tas-tabpv-tab">
            {preview ? (
              <img alt="" src={preview.src} />
            ) : (
              <span className="tas-tabpv-ic" data-placeholder="1" />
            )}
            <span className="tas-tabpv-nm">{props.businessName || t('brand_your_business')}</span>
          </span>
        </div>
      </div>
      {refused.favicon ? <Refusal refusal={refused.favicon} t={t} /> : null}
      <div className="tas-fhint">{t('brand_favicon_file')}</div>
      <div className="tas-fhint">{t('brand_favicon_empty')}</div>
    </div>
  )
}

/** A compact upload uses the same upload hook as the original tiles, including every refusal and blend warning. */
function CompactUpload(props: {
  tile: BrandTile
  picked?: string
  title: string
  rule: string
  busy: boolean
  preview: boolean
  onFile: (file: File) => void
  onRemove: () => void
  t: Translate
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const preview = previewOf(props.picked)
  const label = props.t(props.busy ? 'brand_uploading' : props.picked ? 'brand_replace' : 'brand_upload')
  return (
    <div className="tas-customize-upload" data-tile={props.tile} data-filled={props.picked ? '1' : '0'}>
      <span className="tas-customize-upload-preview">
        {preview ? (
          <img
            alt={props.title}
            src={preview.src}
            title={`${preview.name} · ${preview.width} × ${preview.height} px`}
          />
        ) : props.tile === 'favicon' ? (
          <span aria-hidden="true">◐</span>
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
        )}
      </span>
      <div className="tas-customize-upload-copy">
        <span>{props.title}</span>
        <small title={props.rule}>{props.rule}</small>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png"
        hidden
        data-brand-file={props.tile}
        aria-label={label}
        disabled={props.busy || props.preview}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) props.onFile(file)
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="tas-customize-upload-button"
        disabled={props.busy || props.preview}
        onClick={() => input.current?.click()}
      >
        {props.busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {props.picked || props.busy ? label : props.t('customize_upload')}
      </Button>
      {props.picked ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title={props.t('brand_remove')}
          aria-label={props.t('brand_remove')}
          disabled={props.busy}
          onClick={props.onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
