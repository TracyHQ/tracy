import { Badge } from '@tracy/ui'
import { CheckIcon } from 'lucide-react'

import type { PlaceRow, PlaceStatus, Translate } from '../types.ts'

const VARIANT: Record<PlaceStatus, 'outline' | 'secondary'> = {
  new: 'outline',
  seen: 'secondary',
  researched: 'secondary',
  demo: 'secondary'
}

export function StatusBadge({
  t,
  status,
  research,
  locale = 'en'
}: {
  t: Translate
  status: PlaceStatus
  research?: PlaceRow['research']
  locale?: string
}) {
  const at = research?.researchedAt ? Date.parse(research.researchedAt) : Number.NaN
  const minutes = Math.max(1, Math.floor((Date.now() - at) / 60_000))
  const unit = minutes < 60 ? 'minute' : minutes < 1440 ? 'hour' : 'day'
  const value =
    unit === 'minute' ? minutes : unit === 'hour' ? Math.floor(minutes / 60) : Math.floor(minutes / 1440)
  const ago = Number.isFinite(value)
    ? new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-value, unit)
    : null

  return (
    <Badge variant={VARIANT[status]}>
      {status === 'researched' || status === 'demo' ? <CheckIcon aria-hidden /> : null}
      {ago ? t('cell.status.researchedAgo', { ago }) : t(`cell.status.${status}`)}
    </Badge>
  )
}
