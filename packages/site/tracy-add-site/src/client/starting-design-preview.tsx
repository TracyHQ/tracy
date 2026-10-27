/**
 * Starting designs use the same popup and device stage as the Design system step.
 *
 * LIGHT | DARK: a template whose demo switches to dark on `?theme=dark` (the card's `dark` flag, measured or set in
 * /ops; a card that never said counts as two-mode, as the Design inspiration gallery reads it) shows the switch beside
 * Desktop | Mobile while its live demo is framed. A press reloads the demo with the other `theme`. A card with
 * `dark: false`, or a preview that fell back to a screenshot, shows no switch: it could only sit on Light.
 */
import { type JSX, type RefObject, useEffect, useState } from 'react'

import { PreviewStage, type StageDevice, type StageTheme } from './design-system-stage'
import { PreviewDialog } from './preview-dialog'
import { previewOf } from './start-template.mjs'
import type { Translate } from './strings'

/** Whether the card's demo has a dark side: its own `dark` flag, true when it says nothing. */
export function demoHasDark(card: any): boolean {
  const dark = card?.card?.dark
  return typeof dark === 'boolean' ? dark : true
}

/** Join the served layout address, as Design inspiration does, preserving Joomla's address rules. */
function demoSource(card: any, theme: StageTheme): string | null {
  const base = card.card?.demo?.url
  if (typeof base !== 'string' || !/^https?:\/\//i.test(base)) return null
  const layouts = card.card?.layouts
  const home = Array.isArray(layouts) ? (layouts.find((row: any) => row?.key === 'home') ?? layouts[0]) : null
  const named = home?.address ?? home?.path ?? '/'
  const where = typeof named === 'string' && named !== '' && !named.includes('…') ? named : '/'
  try {
    const url = new URL(where, base)
    url.searchParams.set('theme', theme)
    return url.href
  } catch {
    return null
  }
}

export function StartingDesignPreview({
  t,
  card,
  returnTo,
  onUse,
  onBack,
  position,
  onStep
}: {
  t: Translate
  card: any
  platform: string
  returnTo: RefObject<HTMLElement | null>
  onUse: () => void
  onBack: () => void
  position?: { index: number; total: number } | null
  onStep?: ((dir: -1 | 1) => void) | null
}): JSX.Element {
  const [device, setDevice] = useState<StageDevice>('desktop')
  const [picked, setPicked] = useState<StageTheme>('light')
  const twoModes = demoHasDark(card)
  const theme: StageTheme = twoModes ? picked : 'light'
  const src = demoSource(card, theme)
  const probe = typeof card.card?.demo?.probe === 'string' ? card.card.demo.probe : null
  const [answer, setAnswer] = useState<{ probe: string; framable: boolean } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    if (!src || !probe) return
    const ac = new AbortController()
    let url: URL
    try {
      url = new URL(probe, window.location.href)
      url.searchParams.set('origin', window.location.origin)
    } catch {
      setAnswer({ probe, framable: false })
      return
    }
    void fetch(url.href, { credentials: 'omit', signal: ac.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!ac.signal.aborted) setAnswer({ probe, framable: response.ok && body?.framable === true })
      })
      .catch(() => {
        if (!ac.signal.aborted) setAnswer({ probe, framable: false })
      })
    return () => ac.abort()
  }, [src, probe])

  const preview = previewOf(card)
  const name = preview?.name ?? card.id
  const checked = !src || !probe || answer?.probe === probe
  const live = src && probe && answer?.probe === probe && answer?.framable && failed !== src ? src : null
  const image = checked && live === null ? (preview?.image ?? null) : null
  const message =
    checked && live === null && image === null ? (
      <p className="m-0">{t('start_preview_unavailable')}</p>
    ) : null
  // Only a framed demo can change side; while its probe is pending the switch already stands, so it does not jump in.
  const themeSwitch = twoModes && src !== null && image === null && message === null

  return (
    <PreviewDialog
      t={t}
      name={name}
      description={card.card?.blurb ?? card.card?.category ?? ''}
      returnTo={returnTo}
      onUse={onUse}
      onBack={onBack}
      position={position}
      onStep={onStep}
      pagerLabels={{ previous: t('start_preview_prev'), next: t('start_preview_next') }}
      attributes={{ 'data-start-template-preview': card.id }}
      actionAttributes={{ 'data-starting-design-use': '1' }}
      device={device}
      onDevice={setDevice}
      theme={themeSwitch ? { value: theme, onTheme: setPicked } : null}
    >
      <PreviewStage
        device={device}
        doc={null}
        src={live}
        image={image}
        onFrameError={() => src && setFailed(src)}
        title={t('start_preview_frame', { name })}
        loadingLabel={t('ds_preview_loading')}
        message={message}
        frameAttrs={{ 'data-starting-design-preview-frame': '1' }}
      />
    </PreviewDialog>
  )
}
