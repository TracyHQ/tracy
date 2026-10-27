/**
 * The Edit listing side of the Listing section (`DemoCardEditor`): what customers read and the Design
 * inspiration filters. No Thumbnail group (Akemi, 10/10/2026): the card's picture is the home page's
 * own shot, set by `DesignInspirationBody` on every Create, Regenerate and Save. Long help sits behind an (i) tooltip so the
 * form stays compact.
 */
import {
  NativeSelect,
  NativeSelectOption,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@tracy/ui'
import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

import { useT } from '../i18n'
import type { DemoCardModel } from './DemoCardEditor'
import { HERO_LABEL, type Hero, NAV_LABEL, type Nav, PROVIDERS, type Provider } from './DesignInspiration'

/** The blurb's example, as a dictionary key (render `t(BLURB_PLACEHOLDER)`): neutral, so it suits any template. */
export const BLURB_PLACEHOLDER = 'cms-demos.fields.blurbPlaceholder'

/** The sentences the old form printed under each field, now in tooltips (dictionary keys). */
const HINT = {
  provider: 'cms-demos.fields.hint.provider',
  category: 'cms-demos.fields.hint.category',
  blurb: 'cms-demos.fields.hint.blurb',
  traits: 'cms-demos.fields.hint.traits'
}

/** An (i) that explains a field on hover or keyboard focus. */
export function Hint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={text}
            className="inline-grid size-4 place-items-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
          />
        }
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  )
}

function Labelled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs">
      <span className="flex items-center gap-1 font-medium text-muted-foreground">
        {label}
        {hint ? <Hint text={hint} /> : null}
      </span>
      {children}
    </div>
  )
}

/** A group's title in the Edit listing column; `id` lets a section name itself by it. */
export function GroupTitle({ title, hint, id }: { title: string; hint?: string; id?: string }) {
  return (
    <span id={id} className="flex items-center gap-1 font-medium text-xs">
      {title}
      {hint ? <Hint text={hint} /> : null}
    </span>
  )
}

export function CardFields({ m }: { m: DemoCardModel }) {
  const t = useT()
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled label={t('cms-demos.fields.category')} hint={t(HINT.category)}>
            <NativeSelect
              size="sm"
              aria-label={t('cms-demos.fields.category')}
              disabled={!m.writable}
              value={m.card.category}
              onChange={(e) => m.edit({ category: e.target.value })}
            >
              <NativeSelectOption value="">{t('cms-demos.fields.pickCategory')}</NativeSelectOption>
              {m.categories.map((cat) => (
                <NativeSelectOption key={cat} value={cat}>
                  {cat}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Labelled>
          <Labelled label={t('cms-demos.fields.provider')} hint={t(HINT.provider)}>
            <NativeSelect
              size="sm"
              aria-label={t('cms-demos.fields.provider')}
              disabled={!m.writable}
              value={m.card.provider}
              onChange={(e) => m.edit({ provider: e.target.value as Provider })}
            >
              {PROVIDERS.map((p) => (
                <NativeSelectOption key={p} value={p}>
                  {p}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Labelled>
        </div>
        <Labelled label={t('cms-demos.fields.blurb')} hint={t(HINT.blurb)}>
          <Textarea
            aria-label={t('cms-demos.fields.blurb')}
            rows={2}
            className="min-h-0"
            disabled={!m.writable}
            value={m.card.blurb}
            onChange={(e) => m.edit({ blurb: e.target.value })}
            placeholder={t(BLURB_PLACEHOLDER)}
          />
        </Labelled>
      </div>
      <div className="flex flex-col gap-2">
        <GroupTitle title={t('cms-demos.fields.filters')} hint={t(HINT.traits)} />
        <div className="flex flex-wrap items-end gap-3">
          <Labelled label={t('cms-demos.fields.navigation')}>
            <NativeSelect
              size="sm"
              aria-label={t('cms-demos.fields.navigation')}
              disabled={!m.writable}
              value={m.card.nav ?? 'top-left'}
              onChange={(e) => m.edit({ nav: e.target.value as Nav })}
            >
              {(Object.keys(NAV_LABEL) as Nav[]).map((n) => (
                <NativeSelectOption key={n} value={n}>
                  {t(NAV_LABEL[n])}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Labelled>
          <Labelled label={t('cms-demos.fields.hero')}>
            <NativeSelect
              size="sm"
              aria-label={t('cms-demos.fields.hero')}
              disabled={!m.writable}
              value={m.card.hero ?? 'split'}
              onChange={(e) => m.edit({ hero: e.target.value as Hero })}
            >
              {(Object.keys(HERO_LABEL) as Hero[]).map((h) => (
                <NativeSelectOption key={h} value={h}>
                  {t(HERO_LABEL[h])}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Labelled>
          <label className="flex h-8 items-center gap-2 text-sm">
            <Switch
              checked={m.card.dark ?? false}
              disabled={!m.writable}
              onCheckedChange={(v: boolean) => m.edit({ dark: v })}
              aria-label={t('cms-demos.fields.dark')}
            />
            {t('cms-demos.fields.dark')}
          </label>
          <Labelled label={t('cms-demos.fields.opensIn')}>
            <NativeSelect
              size="sm"
              aria-label={t('cms-demos.fields.opensIn')}
              disabled={!m.writable || !m.card.dark}
              value={m.card.defaultTheme ?? 'light'}
              onChange={(e) => m.edit({ defaultTheme: e.target.value as 'light' | 'dark' })}
            >
              <NativeSelectOption value="light">{t('cms-demos.fields.light')}</NativeSelectOption>
              <NativeSelectOption value="dark">{t('cms-demos.fields.darkTheme')}</NativeSelectOption>
            </NativeSelect>
          </Labelled>
        </div>
      </div>
    </>
  )
}
