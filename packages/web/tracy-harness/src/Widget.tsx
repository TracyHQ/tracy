/**
 * Widget — the two badges a site carries, edited by Tracy staff and served without a deploy.
 *
 * `seat` is the pill on a customer's working copy (`/badge.js`); `advert` is the banner a demo
 * carries (`/tracy-badge.js`, `/build-with-tracy-demo.js`). Words, on/off per door, three colours,
 * the corner, the mark and, for the advert, one switch for all of its motion — and nothing freer
 * than that, because the script runs on customers' pages (`apps/tracy-web/src/ops/widget.js` says
 * the same at the door).
 *
 * THE PREVIEW IS THE SCRIPT, NOT A DRAWING OF IT. Every edit is posted to `/api/ops/widget/:id/preview`
 * and the returned script is run in a frame, so what a person sees is what a site will get — a
 * React re-creation of the pill would be a second copy that drifts. The frame is `srcdoc` on this
 * origin without a sandbox on purpose: `sandbox="allow-scripts"` alone is an opaque origin, where
 * the seat pill's own `document.cookie` throws.
 *
 * `/api/ops/widget`, NOT `/api/widget` — same reason as `Team.tsx`: a leading `/` fetch ignores
 * this build's `base: '/ops/'`, so the path names the door itself.
 */
import { Button, Card, Field, FieldLabel, Input, NativeSelect, NativeSelectOption, Switch } from '@tracy/ui'
import { RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { type T, tr, useT } from './i18n'

type Door = { on: boolean; label: string }
type Style = { bg: string; fg: string; accent: string; position: 'right' | 'left'; mark: boolean }
type SeatSetting = {
  /** The whole pill. Off by default (01/10/2026): a site shows nothing until this is switched on. */
  on: boolean
  pillLabel: string
  signedInAs: string
  doors: { home: Door; signIn: Door; team: Door; hide: Door }
  style: Style
}
type AdvertSetting = { doors: { customize: Door; close: Door }; style: Style & { animation: boolean } }
type BadgeId = 'seat' | 'advert'
type Setting<I extends BadgeId> = I extends 'seat' ? SeatSetting : AdvertSetting
type Row<I extends BadgeId> = {
  setting: Setting<I>
  revision: number
  updatedBy: string | null
  updatedAt: string | null
}
type Read = {
  seat: Row<'seat'>
  advert: Row<'advert'>
  defaults: { seat: SeatSetting; advert: AdvertSetting }
  writable: boolean
}

/** Doors with words in `ns/widget.ts`; another door shows its own key. */
const DOORS = new Set(['home', 'signIn', 'team', 'hide', 'customize', 'close'])
const doorLabel = (t: T, key: string) => (DOORS.has(key) ? t(`widget.door.${key}`) : key)

/** What the frame pretends to be for the seat pill: a draft has a menu, a published site a link. */
type SeatVariant = 'draft' | 'managed'

export function Widget() {
  const t = useT()
  const [read, setRead] = useState<Read | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const abort = new AbortController()
    fetch('/api/ops/widget', { signal: abort.signal, credentials: 'same-origin', redirect: 'manual' })
      .then(async (res) => {
        if (res.type === 'opaqueredirect' || res.status === 0) throw new Error(tr('widget.error.signedOut'))
        if (res.status === 403) throw new Error(tr('widget.error.notStaff'))
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json'))
          throw new Error(tr('widget.error.unavailable'))
        const value: Read = await res.json()
        if (!abort.signal.aborted) setRead(value)
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : tr('widget.error.unavailable'))
      })
    return () => abort.abort()
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-8 py-7">
      <div>
        <h1 className="font-semibold text-xl tracking-tight">{t('widget.title')}</h1>
        <p className="mt-1 max-w-xl text-muted-foreground text-sm">{t('widget.lead')}</p>
      </div>
      {error ? (
        <p role="status" className="mt-6 text-sm">
          {error}
        </p>
      ) : !read ? (
        <p className="mt-6 text-muted-foreground text-sm">{t('widget.loading')}</p>
      ) : (
        <div className="mt-6 space-y-6">
          <BadgeEditor id="seat" title={t('widget.seat.title')} sub={t('widget.seat.sub')} read={read} />
          <BadgeEditor
            id="advert"
            title={t('widget.advert.title')}
            sub={t('widget.advert.sub')}
            read={read}
          />
        </div>
      )}
    </div>
  )
}

function BadgeEditor<I extends BadgeId>({
  id,
  title,
  sub,
  read
}: {
  id: I
  title: string
  sub: string
  read: Read
}) {
  const t = useT()
  const [draft, setDraft] = useState<Setting<I>>(() => structuredClone(read[id].setting as Setting<I>))
  const [saved, setSaved] = useState<Setting<I>>(() => structuredClone(read[id].setting as Setting<I>))
  const [revision, setRevision] = useState(read[id].revision)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [variant, setVariant] = useState<SeatVariant>('draft')
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])

  const patch = (fn: (s: Setting<I>) => void) =>
    setDraft((prev) => {
      const next = structuredClone(prev)
      fn(next)
      return next
    })

  async function save() {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch(`/api/ops/widget/${id}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setting: draft, revision })
      })
      const body = await res.json().catch(() => null)
      if (res.status === 409) throw new Error(t('widget.save.conflict'))
      if (res.status === 400 && body?.path)
        throw new Error(t('widget.save.refusedAt', { path: String(body.path) }))
      if (!res.ok) throw new Error(t('widget.save.failed'))
      setSaved(structuredClone(body.setting))
      setDraft(structuredClone(body.setting))
      setRevision(body.revision)
      setMessage(t('widget.saved'))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('widget.save.failed'))
    } finally {
      setBusy(false)
    }
  }

  const s = draft as SeatSetting & AdvertSetting
  const disabled = busy || !read.writable
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-medium text-sm">{title}</h2>
          <p className="mt-0.5 text-muted-foreground text-xs">{sub}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => setDraft(structuredClone(read.defaults[id] as Setting<I>))}
          >
            <RotateCcw /> {t('widget.defaults')}
          </Button>
          <Button size="sm" disabled={disabled || !dirty} onClick={save}>
            {busy ? t('widget.saving') : t('widget.save')}
          </Button>
        </div>
      </div>
      <div className="grid gap-6 border-border border-t px-5 py-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          {id === 'seat' ? (
            <label className="flex items-center gap-2 text-sm">
              <Switch
                aria-label={t('widget.showOnSites.aria')}
                checked={s.on}
                disabled={disabled}
                onCheckedChange={(on) => patch((d) => ((d as SeatSetting).on = on))}
              />
              {t('widget.showOnSites')}
              <span className="text-muted-foreground text-xs">{t('widget.showOnSites.off')}</span>
            </label>
          ) : null}
          {id === 'seat' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id={`${id}-pill`}
                label={t('widget.pillWords')}
                value={s.pillLabel}
                disabled={disabled}
                onChange={(v) => patch((d) => ((d as SeatSetting).pillLabel = v))}
              />
              <TextField
                id={`${id}-who`}
                label={t('widget.signedInAs')}
                value={s.signedInAs}
                disabled={disabled}
                onChange={(v) => patch((d) => ((d as SeatSetting).signedInAs = v))}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <p className="font-medium text-muted-foreground text-xs">{t('widget.doors')}</p>
            {Object.entries(s.doors).map(([key, door]) => (
              <div key={key} className="flex items-center gap-3">
                <Switch
                  aria-label={t('widget.door.on', { door: doorLabel(t, key) })}
                  checked={door.on}
                  disabled={disabled}
                  onCheckedChange={(on) => patch((d) => ((d.doors as Record<string, Door>)[key].on = on))}
                />
                <span className="w-44 flex-none text-sm">{doorLabel(t, key)}</span>
                <Input
                  aria-label={t('widget.door.label', { door: doorLabel(t, key) })}
                  value={door.label}
                  maxLength={40}
                  disabled={disabled || !door.on}
                  onChange={(e) =>
                    patch((d) => ((d.doors as Record<string, Door>)[key].label = e.target.value))
                  }
                />
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['bg', 'fg', 'accent'] as const).map((key) => (
              <ColourField
                key={key}
                id={`${id}-${key}`}
                label={t(`widget.colour.${key}`)}
                value={s.style[key]}
                disabled={disabled}
                onChange={(v) => patch((d) => (d.style[key] = v))}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <Field>
              <FieldLabel htmlFor={`${id}-position`}>{t('widget.corner')}</FieldLabel>
              <NativeSelect
                id={`${id}-position`}
                value={s.style.position}
                disabled={disabled}
                onChange={(e) => patch((d) => (d.style.position = e.target.value as Style['position']))}
              >
                <NativeSelectOption value="right">{t('widget.corner.right')}</NativeSelectOption>
                <NativeSelectOption value="left">{t('widget.corner.left')}</NativeSelectOption>
              </NativeSelect>
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Switch
                checked={s.style.mark}
                disabled={disabled}
                onCheckedChange={(on) => patch((d) => (d.style.mark = on))}
              />
              {t('widget.showMark')}
            </label>
            {id === 'advert' ? (
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Switch
                  checked={s.style.animation}
                  disabled={disabled}
                  onCheckedChange={(on) => patch((d) => ((d as AdvertSetting).style.animation = on))}
                />
                {t('widget.animation')}
              </label>
            ) : null}
          </div>
          {message ? (
            <p role="status" className="text-sm">
              {message}
            </p>
          ) : null}
          {!read.writable ? <p className="text-muted-foreground text-xs">{t('widget.readOnly')}</p> : null}
        </div>
        <Preview
          id={id}
          setting={draft}
          variant={variant}
          onVariant={id === 'seat' ? setVariant : undefined}
        />
      </div>
    </Card>
  )
}

function TextField({
  id,
  label,
  value,
  disabled,
  onChange
}: {
  id: string
  label: string
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        maxLength={40}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

/** A colour picker beside its hex — the picker for the eye, the text for a value from a brand sheet. */
function ColourField({
  id,
  label,
  value,
  disabled,
  onChange
}: {
  id: string
  label: string
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  const t = useT()
  const valid = /^#[0-9a-f]{6}$/i.test(value)
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={t('widget.colour.picker', { label })}
          value={valid ? value : '#000000'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 flex-none cursor-pointer rounded border border-border bg-transparent p-0"
        />
        <Input
          id={id}
          value={value}
          disabled={disabled}
          aria-invalid={!valid}
          onChange={(e) => onChange(e.target.value.trim().toLowerCase())}
          className="font-mono"
        />
      </div>
    </Field>
  )
}

/** Text for the frame's HTML: a translation may hold `<` or `&`. */
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function Preview({
  id,
  setting,
  variant,
  onVariant
}: {
  id: BadgeId
  setting: unknown
  variant: SeatVariant
  onVariant?: (v: SeatVariant) => void
}) {
  const t = useT()
  const [script, setScript] = useState<string | null>(null)
  const [refused, setRefused] = useState('')
  const key = JSON.stringify(setting)
  useEffect(() => {
    const abort = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/ops/widget/${id}/preview`, {
        method: 'POST',
        credentials: 'same-origin',
        signal: abort.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setting })
      })
        .then(async (res) => {
          if (res.status === 400) {
            const body = await res.json().catch(() => null)
            setRefused(
              body?.path
                ? tr('widget.preview.invalidAt', { path: String(body.path) })
                : tr('widget.preview.invalid')
            )
            return
          }
          if (!res.ok) throw new Error()
          setRefused('')
          setScript(await res.text())
        })
        .catch(() => {
          if (!abort.signal.aborted) setRefused(tr('widget.preview.unavailable'))
        })
    }, 350)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
    // `key` is the setting's identity; `setting` itself is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key])

  const tag =
    id === 'seat'
      ? `<script data-variant="${variant}" data-viewer="you@example.com" data-team-href="#team" data-home-href="#home">`
      : '<script data-template="tracy-business" data-origin="#">'
  const srcdoc = script
    ? `<!doctype html><html><head><meta charset="utf-8"><style>html,body{height:100%;margin:0;background:#f4f1ec;font:13px -apple-system,sans-serif;color:#888}p{margin:12px}</style></head><body><p>${escapeHtml(t('widget.preview.page'))}</p>${tag}${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
    : ''
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-medium text-muted-foreground text-xs">{t('widget.preview')}</p>
        {onVariant ? (
          <NativeSelect
            aria-label={t('widget.preview.as')}
            value={variant}
            onChange={(e) => onVariant(e.target.value as SeatVariant)}
            className="h-7 text-xs"
          >
            <NativeSelectOption value="draft">{t('widget.preview.draft')}</NativeSelectOption>
            <NativeSelectOption value="managed">{t('widget.preview.managed')}</NativeSelectOption>
          </NativeSelect>
        ) : null}
      </div>
      <iframe
        title={t(`widget.preview.frameTitle.${id}`)}
        srcDoc={srcdoc}
        className="h-56 w-full rounded-lg border border-border bg-muted"
      />
      {refused ? <p className="text-muted-foreground text-xs">{refused}</p> : null}
    </div>
  )
}
