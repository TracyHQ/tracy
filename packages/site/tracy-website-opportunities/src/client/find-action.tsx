/** Find's next step, drawn identically in the table, cards and map. */
import { Button } from '@tracy/ui'
import type { PlaceRow } from '@tracy/wo-views'
import type { Translate } from './strings.ts'

export function FindActionButton({
  row,
  t,
  busy = false,
  onAction
}: {
  row: PlaceRow
  t: Translate
  busy?: boolean
  onAction(row: PlaceRow): void
}) {
  const kind = row.findAction?.kind
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      disabled={busy || !kind || kind === 'building'}
      onClick={() => onAction(row)}
    >
      {t(
        kind === 'view'
          ? 'find.action.view'
          : kind === 'build'
            ? 'v3.buildDemo'
            : kind === 'building'
              ? 'v3.building'
              : 'job.start'
      )}
    </Button>
  )
}
