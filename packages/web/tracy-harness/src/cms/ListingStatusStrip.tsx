/**
 * The selected release's listing status at the head of the Design Inspiration tab's "Listing"
 * section (Templates page): a full-width strip with the state word (Listed, Hidden, Not listed yet)
 * and at most one short phrase (`listingWord`, `listingNextStep`; Akemi, 11/10/2026: keep the words
 * short), plus "Needs a content contract (step 3)." when the publish door would refuse the release,
 * a link to that step on the Road to live (`onContract`). When this listing is the one that feeds
 * the customer card (`onInspiration`, the server's `cardSource`), a second strip of the same shape
 * in the brand colour says so directly under it. `press` (the release's own Publish/Unpublish,
 * `ListingPress`) sits on the right of the first strip.
 */
import { cn } from '@tracy/ui'
import { Circle, CircleCheck, EyeOff, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

import { useT } from '../i18n'
import { type ChipStatus, listingNextStep, listingWord, noContractLine } from './templates-model'

/** `sentence` colours the line after the state word. */
type Tone = { border: string; surface: string; text: string; sentence: string }

const NEUTRAL = { surface: 'bg-muted/40', sentence: 'text-muted-foreground' }

/** Emerald for a listing customers can pick; muted for one they cannot. */
const TONE: Record<ChipStatus['card'], Tone> = {
  Listed: {
    border: 'border-l-emerald-600 dark:border-l-emerald-500',
    ...NEUTRAL,
    text: 'text-emerald-700 dark:text-emerald-400'
  },
  Hidden: { border: 'border-l-muted-foreground', ...NEUTRAL, text: 'text-foreground' },
  'No listing yet': {
    border: 'border-l-muted-foreground/50',
    ...NEUTRAL,
    text: 'text-foreground'
  }
}

/** The brand terracotta (`--primary`), for the release whose listing customers see on the card. */
const ON_INSPIRATION: Tone = {
  border: 'border-l-primary dark:border-l-primary',
  surface: 'bg-primary/10 dark:bg-primary/15',
  // Plain primary reads 3.5:1 (dark) and 3.7:1 (light) on the tint; a quarter of the
  // foreground lifts both past 4.5:1 with one rule.
  text: 'text-[color-mix(in_oklab,var(--primary)_75%,var(--foreground))]',
  // Muted grey falls to 4.2:1 on the light tint; most of the foreground keeps it above 4.5:1.
  sentence: 'text-foreground/80'
}

const ICON: Record<ChipStatus['card'], typeof Circle> = {
  Listed: CircleCheck,
  Hidden: EyeOff,
  'No listing yet': Circle
}

/** One strip: a 4px coloured left edge, an icon, the state word, then its sentence. */
function Strip({
  tone,
  icon: Icon,
  word,
  line,
  children,
  aside,
  ...data
}: {
  tone: Tone
  icon: typeof Circle
  word: string
  line: string
  children?: ReactNode
  aside?: ReactNode
} & Record<`data-${string}`, string>) {
  const t = useT()
  return (
    <div
      role="status"
      className={cn(
        'flex gap-2.5 rounded-lg border border-border border-l-4 px-3 py-2.5',
        tone.surface,
        tone.border
      )}
      {...data}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', tone.text)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <p>
          <span className={cn('font-semibold', tone.text)}>{t('cms-templates.listing.word', { word })}</span>
          {line ? <span className={tone.sentence}> {line}</span> : null}
        </p>
        {children}
      </div>
      {aside}
    </div>
  )
}

export function ListingStatusStrip({
  status,
  cms,
  press,
  onContract
}: {
  status: ChipStatus
  cms: string
  press?: ReactNode
  /** Goes to the content contract step on the Road to live. */
  onContract?: () => void
}) {
  // `useT` also re-renders on a language change, so the model's `tr` words follow it.
  const t = useT()
  return (
    <div className="flex flex-col gap-2">
      <Strip
        tone={TONE[status.card]}
        icon={ICON[status.card]}
        word={listingWord(status.card)}
        line={listingNextStep(status.card)}
        data-card-status={status.card}
        aside={press}
      >
        {status.contract ? (
          <p className="text-destructive text-xs" data-card-contract="">
            {onContract ? (
              <button
                type="button"
                className="rounded underline-offset-2 hover:underline focus-visible:outline-1 focus-visible:outline-ring"
                data-card-contract-go=""
                onClick={onContract}
              >
                {noContractLine()}
              </button>
            ) : (
              noContractLine()
            )}
          </p>
        ) : null}
      </Strip>
      {status.onInspiration ? (
        <Strip
          tone={ON_INSPIRATION}
          icon={Sparkles}
          word={t('cms-templates.listing.usedOn')}
          line={t('cms-templates.listing.usedOnLine', { cms })}
          data-card-on-inspiration=""
        />
      ) : null}
    </div>
  )
}
