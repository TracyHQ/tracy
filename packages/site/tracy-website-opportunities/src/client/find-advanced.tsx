/**
 * Advanced search: what is sent to Google with the search (depth, cuisine, rating, price, open now)
 * and what filters the rows already found. Edits stay a draft until Apply; Google-side changes run a
 * new search, result filters apply at once (tasks/mockups/wo-find-v2.html, state 2).
 */
import { type JSX, type ReactNode, useId, useState } from 'react'
import { Code, Mail, Phone } from 'lucide-react'
import {
  Button,
  Checkbox,
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  Input,
  NativeSelect,
  NativeSelectOption,
  Spinner,
  ToggleGroup,
  ToggleGroupItem,
  useComboboxAnchor
} from '@tracy/ui'
import { BloggerIcon } from '@tracy/ui/icons/platforms/blogger'
import { FacebookIcon } from '@tracy/ui/icons/platforms/facebook'
import { InstagramIcon } from '@tracy/ui/icons/platforms/instagram'
import { JoomlaIcon } from '@tracy/ui/icons/platforms/joomla'
import { ShopifyIcon } from '@tracy/ui/icons/platforms/shopify'
import { SquarespaceIcon } from '@tracy/ui/icons/platforms/squarespace'
import { TiktokIcon } from '@tracy/ui/icons/platforms/tiktok'
import { WebflowIcon } from '@tracy/ui/icons/platforms/webflow'
import { WixIcon } from '@tracy/ui/icons/platforms/wix'
import { WordpressIcon } from '@tracy/ui/icons/platforms/wordpress'
import { YoutubeIcon } from '@tracy/ui/icons/platforms/youtube'
import { interfaceLocale } from '@tracy/core/interface-languages'

import { sourceLabel } from './cms-label.ts'
import {
  type AdvancedOptions,
  type Depth,
  type HasChannel,
  type ResultFilters,
  type WebsiteState,
  NAMED_CMS,
  nextCuisines
} from './find-input.ts'
import type { Translate } from './strings.ts'

export const DEFAULT_ADVANCED: AdvancedOptions = { depth: 'auto', includeChains: false }
export const DEFAULT_FILTERS: ResultFilters = { hideResearched: false, hideClosed: true }

const GRADES = ['A', 'B', 'C'] as const
const WEBSITE_STATES: readonly WebsiteState[] = ['none', 'social', 'down', 'slow', 'fine']
const RATINGS = [3.5, 4, 4.5]
const PRICES = [1, 2, 3, 4]
const SOCIAL_DAYS = [7, 30, 90]

const HAS_ICON: Readonly<Record<HasChannel, ReactNode>> = {
  phone: <Phone aria-hidden="true" />,
  email: <Mail aria-hidden="true" />,
  facebook: <FacebookIcon aria-hidden="true" />,
  instagram: <InstagramIcon aria-hidden="true" />,
  tiktok: <TiktokIcon aria-hidden="true" />,
  youtube: <YoutubeIcon aria-hidden="true" />
}
const HAS: readonly HasChannel[] = ['phone', 'email', 'facebook', 'instagram', 'tiktok', 'youtube']
/** The public Find runs no site check: only what Google's row itself says. */
const PUBLIC_WEBSITE_STATES: readonly WebsiteState[] = ['none', 'social']
const PUBLIC_HAS: readonly HasChannel[] = ['phone', 'facebook', 'instagram', 'tiktok', 'youtube']

const CMS_ICON: Readonly<Record<string, ReactNode>> = {
  WordPress: <WordpressIcon aria-hidden="true" />,
  Wix: <WixIcon aria-hidden="true" />,
  Joomla: <JoomlaIcon aria-hidden="true" />,
  Squarespace: <SquarespaceIcon aria-hidden="true" />,
  Blogger: <BloggerIcon aria-hidden="true" />,
  Webflow: <WebflowIcon aria-hidden="true" />,
  Shopify: <ShopifyIcon aria-hidden="true" />,
  Other: <Code aria-hidden="true" />
}
const CMS_CHOICES: readonly string[] = [...NAMED_CMS, 'Other']

const number = (value: number): string => new Intl.NumberFormat(interfaceLocale()).format(value)

/** A whole number from a text field; blank or junk is "no filter". */
function wholeOrUndefined(text: string): number | undefined {
  const n = Number(text.replace(/[\s,.]/g, ''))
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined
}

function Field({
  label,
  htmlFor,
  wide,
  children
}: {
  label: string
  htmlFor?: string
  wide?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <div className={wide ? 'tracy-wo-field tracy-wo-wide' : 'tracy-wo-field'}>
      {htmlFor === undefined ? (
        <span className="tracy-wo-label">{label}</span>
      ) : (
        <label className="tracy-wo-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
    </div>
  )
}

function CheckField({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange(next: boolean): void
}): JSX.Element {
  return (
    <label className="tracy-wo-check">
      <Checkbox checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      {label}
    </label>
  )
}

/** A multi-pick row of toggles over string ids. */
function Chips<T extends string>({
  label,
  values,
  value,
  onChange,
  render,
  disabled,
  joined
}: {
  label: string
  values: readonly T[]
  value: readonly T[] | undefined
  onChange(next: T[]): void
  render(v: T): ReactNode
  disabled?: boolean
  joined?: boolean
}): JSX.Element {
  return (
    <ToggleGroup
      multiple
      variant="outline"
      size="sm"
      spacing={joined ? 0 : 1}
      className="tracy-wo-wrap"
      aria-label={label}
      value={[...(value ?? [])]}
      disabled={disabled}
      onValueChange={(next: unknown[]) => onChange(values.filter((v) => next.includes(v)))}
    >
      {values.map((v) => (
        <ToggleGroupItem key={v} value={v}>
          {render(v)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function AdvancedPanel({
  t,
  id,
  advanced,
  filters,
  cuisines,
  depthLimits,
  autoDepth,
  quickUpTo,
  checking,
  onApply,
  publicMode = false
}: {
  t: Translate
  id: string
  advanced: AdvancedOptions
  filters: ResultFilters
  cuisines: readonly string[]
  depthLimits: Readonly<Record<Depth, number>>
  /** The depth Auto picks for the radius chosen now. */
  autoDepth: Depth
  /** "3 km", already formatted. */
  quickUpTo: string
  checking: { done: number; total: number } | null
  onApply(next: { advanced: AdvancedOptions; filters: ResultFilters }): void
  /** The public Find: no Google-side filter, and only filters its rows carry data for. */
  publicMode?: boolean
}): JSX.Element {
  const [draft, setDraft] = useState(advanced)
  const [draftFilters, setDraftFilters] = useState(filters)
  const [reviewsMin, setReviewsMin] = useState(
    filters.reviewsMin === undefined ? '' : String(filters.reviewsMin)
  )
  const [reviewsMax, setReviewsMax] = useState(
    filters.reviewsMax === undefined ? '' : String(filters.reviewsMax)
  )
  const [copyright, setCopyright] = useState(
    filters.copyrightBefore === undefined ? '' : String(filters.copyrightBefore)
  )
  const anchor = useComboboxAnchor()
  const ratingId = useId()
  const fromId = useId()
  const toId = useId()
  const socialId = useId()
  const followersId = useId()
  const copyrightId = useId()
  const set = (patch: Partial<AdvancedOptions>): void => setDraft((d) => ({ ...d, ...patch }))
  const setF = (patch: Partial<ResultFilters>): void => setDraftFilters((f) => ({ ...f, ...patch }))
  const depth = draft.depth === undefined || draft.depth === 'auto' ? autoDepth : draft.depth

  const reset = (): void => {
    setDraft(DEFAULT_ADVANCED)
    setDraftFilters(DEFAULT_FILTERS)
    setReviewsMin('')
    setReviewsMax('')
    setCopyright('')
  }

  const apply = (): void =>
    onApply({
      advanced: draft,
      filters: {
        ...draftFilters,
        reviewsMin: wholeOrUndefined(reviewsMin),
        reviewsMax: wholeOrUndefined(reviewsMax),
        copyrightBefore: wholeOrUndefined(copyright)
      }
    })

  return (
    <div className="tracy-wo-adv" id={id} role="region" aria-label={t('find.advanced')}>
      {!publicMode && (
        <section className="tracy-wo-adv-group">
          <div className="tracy-wo-adv-head">
            <h3 className="tracy-wo-h3">{t('advanced.google.title')}</h3>
            <p className="tracy-wo-note">{t('advanced.google.note')}</p>
          </div>
          <div className="tracy-wo-adv-grid">
            <Field label={t('advanced.depth')} wide>
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                aria-label={t('advanced.depth')}
                value={[depth]}
                onValueChange={(next: unknown[]) => {
                  const picked = next.find((v): v is Depth => v === 'quick' || v === 'standard')
                  if (picked !== undefined) set({ depth: picked })
                }}
              >
                {(['quick', 'standard'] as const).map((d) => (
                  <ToggleGroupItem key={d} value={d}>
                    {t(`advanced.depth.${d}`)}
                    <span className="tracy-wo-muted">
                      {t('advanced.depth.upTo', { count: depthLimits[d] })}
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="tracy-wo-note">{t('advanced.depth.auto', { radius: quickUpTo })}</p>
            </Field>

            <Field label={t('advanced.cuisine')}>
              <Combobox
                multiple
                items={[...cuisines]}
                itemToStringLabel={(c: string) => t(`cuisine.${c}`)}
                value={draft.cuisines ?? []}
                onValueChange={(next: string[], details: { reason?: string }) =>
                  set({ cuisines: nextCuisines(draft.cuisines ?? [], next, details.reason) })
                }
              >
                {/* The anchor ref sits on a plain div: dsh's React 18 drops a ref given to a @tracy/ui function component. */}
                <div ref={anchor}>
                  <ComboboxChips>
                    <ComboboxValue>
                      {(value: string[]) =>
                        value.map((c) => (
                          <ComboboxChip key={c} aria-label={t(`cuisine.${c}`)}>
                            {t(`cuisine.${c}`)}
                          </ComboboxChip>
                        ))
                      }
                    </ComboboxValue>
                    <ComboboxChipsInput
                      placeholder={t('advanced.cuisine.placeholder')}
                      aria-label={t('advanced.cuisine')}
                    />
                  </ComboboxChips>
                </div>
                <ComboboxContent anchor={anchor}>
                  <ComboboxEmpty>{t('advanced.cuisine.empty')}</ComboboxEmpty>
                  <ComboboxList>
                    {(c: string) => (
                      <ComboboxItem key={c} value={c}>
                        {t(`cuisine.${c}`)}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <span className="tracy-wo-small tracy-wo-muted">{t('advanced.cuisine.note')}</span>
            </Field>

            <Field label={t('advanced.rating')} htmlFor={ratingId}>
              <NativeSelect
                id={ratingId}
                size="sm"
                value={String(draft.minRating ?? 0)}
                onChange={(event) => set({ minRating: Number(event.target.value) || undefined })}
              >
                <NativeSelectOption value="0">{t('advanced.rating.any')}</NativeSelectOption>
                {RATINGS.map((r) => (
                  <NativeSelectOption key={r} value={String(r)}>
                    {t('advanced.rating.from', {
                      rating: new Intl.NumberFormat(interfaceLocale(), { minimumFractionDigits: 1 }).format(r)
                    })}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field label={t('advanced.price')}>
              <Chips
                joined
                label={t('advanced.price')}
                values={PRICES.map(String)}
                value={draft.priceLevels?.map(String)}
                onChange={(next) => set({ priceLevels: next.map(Number) })}
                render={(p) => '$'.repeat(Number(p))}
              />
            </Field>

            <Field label={t('advanced.hours')}>
              <CheckField
                label={t('advanced.openNow')}
                checked={draft.openNow === true}
                onChange={(v) => set({ openNow: v })}
              />
            </Field>
          </div>
        </section>
      )}

      <section className="tracy-wo-adv-group">
        <div className="tracy-wo-adv-head">
          <h3 className="tracy-wo-h3">{t('advanced.results.title')}</h3>
          <p className="tracy-wo-note">
            {checking !== null && checking.done < checking.total ? (
              <Spinner label={t('advanced.results.title')} />
            ) : null}
            {t('advanced.results.note')}
            {checking !== null && checking.done < checking.total
              ? ` ${t('advanced.results.pending', { count: checking.total - checking.done, total: checking.total })}`
              : null}
          </p>
        </div>
        <div className="tracy-wo-adv-grid">
          {!publicMode && (
            <Field label={t('advanced.grade')}>
              <Chips
                label={t('advanced.grade')}
                values={GRADES}
                value={draftFilters.grades}
                onChange={(g) => setF({ grades: g })}
                render={(g) => g}
              />
            </Field>
          )}
          <Field label={t('advanced.website')} wide>
            <Chips
              label={t('advanced.website')}
              values={publicMode ? PUBLIC_WEBSITE_STATES : WEBSITE_STATES}
              value={draftFilters.website}
              onChange={(w) => setF({ website: w })}
              render={(w) => t(`advanced.website.${w}`)}
            />
          </Field>
          <Field label={t('advanced.reviews')}>
            <div className="tracy-wo-range">
              <Input
                id={fromId}
                inputMode="numeric"
                placeholder={t('advanced.reviews.from')}
                aria-label={t('advanced.reviews.fromLabel')}
                value={reviewsMin}
                onChange={(event) => setReviewsMin(event.target.value)}
              />
              <span className="tracy-wo-muted" aria-hidden="true">
                –
              </span>
              <Input
                id={toId}
                inputMode="numeric"
                placeholder={t('advanced.reviews.to')}
                aria-label={t('advanced.reviews.toLabel')}
                value={reviewsMax}
                onChange={(event) => setReviewsMax(event.target.value)}
              />
            </div>
          </Field>
          <Field label={t('advanced.has')} wide>
            <Chips
              label={t('advanced.has')}
              values={publicMode ? PUBLIC_HAS : HAS}
              value={draftFilters.has}
              onChange={(h) => setF({ has: h })}
              render={(h) => (
                <>
                  {HAS_ICON[h]}
                  {h === 'phone' || h === 'email' ? t(`advanced.has.${h}`) : sourceLabel(t, h)}
                </>
              )}
            />
          </Field>
          {/* Social stats, CMS and copyright need checks the public Find does not run. */}
          {!publicMode && (
            <>
              {/* Social stats are not collected yet (a later line): drawn, but not usable. */}
              <Field label={t('advanced.socialActive')} htmlFor={socialId}>
                <NativeSelect
                  id={socialId}
                  size="sm"
                  disabled
                  title={t('advanced.needsSocialStats')}
                  value=""
                >
                  <NativeSelectOption value="">{t('advanced.socialActive.any')}</NativeSelectOption>
                  {SOCIAL_DAYS.map((d) => (
                    <NativeSelectOption key={d} value={String(d)}>
                      {t('advanced.socialActive.days', { count: d })}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t('advanced.followers')} htmlFor={followersId}>
                <Input
                  id={followersId}
                  inputMode="numeric"
                  disabled
                  title={t('advanced.needsSocialStats')}
                  placeholder={t('advanced.example', { value: number(1000) })}
                />
              </Field>
              <Field label={t('advanced.cms')} wide>
                <Chips
                  label={t('advanced.cms')}
                  values={CMS_CHOICES}
                  value={draftFilters.cms}
                  onChange={(c) => setF({ cms: c })}
                  render={(c) => (
                    <>
                      {CMS_ICON[c]}
                      {c === 'Other' ? t('advanced.cms.other') : c}
                    </>
                  )}
                />
              </Field>
              <Field label={t('advanced.copyright')} htmlFor={copyrightId}>
                <Input
                  id={copyrightId}
                  inputMode="numeric"
                  placeholder={t('advanced.example', { value: '2020' })}
                  value={copyright}
                  onChange={(event) => setCopyright(event.target.value)}
                />
              </Field>
            </>
          )}
          <div className="tracy-wo-checks tracy-wo-wide">
            {!publicMode && (
              <>
                <CheckField
                  label={t('advanced.includeChains')}
                  checked={draft.includeChains === true}
                  onChange={(v) => set({ includeChains: v })}
                />
                <CheckField
                  label={t('advanced.hideResearched')}
                  checked={draftFilters.hideResearched === true}
                  onChange={(v) => setF({ hideResearched: v })}
                />
              </>
            )}
            <CheckField
              label={t('advanced.hideClosed')}
              checked={draftFilters.hideClosed !== false}
              onChange={(v) => setF({ hideClosed: v })}
            />
          </div>
        </div>
      </section>

      <div className="tracy-wo-adv-foot">
        <Button type="button" size="sm" variant="ghost" onClick={reset}>
          {t('advanced.reset')}
        </Button>
        <div className="tracy-wo-row">
          <span className="tracy-wo-small tracy-wo-muted">{t('advanced.applyNote')}</span>
          <Button type="button" size="sm" onClick={apply}>
            {t('advanced.apply')}
          </Button>
        </div>
      </div>
    </div>
  )
}
