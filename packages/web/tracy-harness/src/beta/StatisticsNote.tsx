import { Card, cn } from '@tracy/ui'
import { Info } from 'lucide-react'
import type { HTMLAttributes } from 'react'

/** Informational copy shares one quiet style and the same inset as card content. */
export function StatisticsNote({
  children,
  className,
  standalone = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { standalone?: boolean }) {
  const note = (
    <div className={cn('statistics-note signals-alert-note', className)} role="note" {...props}>
      <Info size={14} aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
  return standalone ? <Card className="statistics-note-card">{note}</Card> : note
}
