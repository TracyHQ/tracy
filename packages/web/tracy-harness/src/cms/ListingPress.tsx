/**
 * The press for ONE release's listing, on the right of its Listing status strip (Akemi,
 * 10/10/2026). The header press acts on the whole template; this one acts on the selected release
 * only, through the same doors (`card-press.ts`):
 *   - Listed: a red outline "Unpublish <name>", two presses (the second reads as a question).
 *   - Hidden: a green "Publish <name>", off while `blockers` (EVERY road step this release still
 *     needs, `releasePublishNeeds`) is not empty: "Needs: …" on hover only, since the Road to live
 *     right below already lists those steps (Akemi, 11/10/2026).
 *   - No listing yet: no Publish at all (Akemi, 11/10/2026: never a dead button); the strip says
 *     "Not listed yet." and the Road to live holds the next step.
 * Off, the button wears the muted surface (`publishTone`), never a faded green that reads as live.
 * `<name>` is the release's chip name (`releaseNames`). The last answer (`note`) is kept by the page,
 * so it survives the reload a landed press starts.
 */
import { Button, cn } from '@tracy/ui'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

import { useT } from '../i18n'
import { pressCard } from './card-press'
import { type ChipStatus, NO_LISTING, needsText, type PublishNeed } from './templates-model'

/** What the last press on one release answered: its own success line or the door's refusal. */
export type ListingPressNote = { tag: string; ok: boolean; text: string }

/**
 * The Publish button's colours: emerald when it can be pressed, the muted surface when it cannot.
 * The shared button only fades a disabled one to half, and half an emerald still reads as a press.
 */
export function publishTone(disabled: boolean): string {
  return disabled
    ? 'border-border bg-muted text-muted-foreground disabled:opacity-100 dark:bg-muted'
    : 'bg-emerald-600 text-white hover:bg-emerald-600/85 dark:bg-emerald-600 dark:hover:bg-emerald-600/85'
}

export function ListingPress({
  tag,
  name,
  card,
  blockers,
  writable,
  note,
  onNote,
  onChanged
}: {
  tag: string
  name: string
  card: ChipStatus['card']
  /** Every step Publish still needs for this release (`releasePublishNeeds`). */
  blockers: PublishNeed[]
  writable: boolean
  note: ListingPressNote | null
  onNote: (note: ListingPressNote | null) => void
  onChanged: () => void
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const action = card === 'Listed' ? 'unpublish' : 'publish'

  const press = async () => {
    if (busy) return
    setBusy(true)
    onNote(null)
    try {
      const done = await pressCard(tag, action)
      onNote(
        done.ok
          ? {
              tag,
              ok: true,
              text: [
                t(
                  action === 'publish' ? 'cms-templates.press.published' : 'cms-templates.press.unpublished',
                  { name }
                ),
                ...done.warnings
              ].join(' · ')
            }
          : { tag, ok: false, text: done.error }
      )
      if (done.ok) onChanged()
    } finally {
      setBusy(false)
    }
  }

  // Nothing saved yet: nothing to publish, so no button (it would only ever be dead).
  if (card === NO_LISTING) return null
  const held = card === 'Hidden' ? blockers.length : 0
  const why = card === 'Hidden' ? needsText(blockers) : ''
  const button =
    card === 'Listed' ? (
      <Button
        size="sm"
        variant="outline"
        className={cn(
          'border-destructive/50 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/60 dark:bg-transparent dark:text-red-300 dark:hover:bg-destructive/20',
          armed && 'outline outline-1 outline-offset-2 outline-destructive'
        )}
        disabled={!writable || busy}
        data-listing-unpublish={tag}
        title={
          armed
            ? t('cms-templates.press.unpublishArmedTitle', { name })
            : t('cms-templates.press.unpublishTitle', { name })
        }
        onClick={() => {
          if (!armed) {
            setArmed(true)
            return
          }
          setArmed(false)
          void press()
        }}
        onBlur={() => setArmed(false)}
      >
        <EyeOff />
        {armed
          ? t('cms-templates.press.unpublishArmed', { name })
          : t('cms-templates.press.unpublish', { name })}
      </Button>
    ) : (
      <Button
        size="sm"
        className={publishTone(!writable || busy || held > 0)}
        disabled={!writable || busy || held > 0}
        data-listing-publish={tag}
        data-road-control="listing-publish"
        title={why || t('cms-templates.press.publishTitle', { name })}
        onClick={() => void press()}
      >
        <Eye />
        {t('cms-templates.press.publish', { name })}
      </Button>
    )

  return (
    <div className="flex max-w-xs shrink-0 flex-col items-end gap-1 text-end" data-listing-press={tag}>
      {/* A disabled button takes no pointer, so its reason hangs on this wrapper. */}
      <span title={why || undefined} className="inline-flex">
        {button}
      </span>
      {note && note.tag === tag ? (
        <p
          className={cn('text-xs', note.ok ? 'text-muted-foreground' : 'text-destructive')}
          data-listing-note={note.ok ? 'ok' : 'refused'}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  )
}
