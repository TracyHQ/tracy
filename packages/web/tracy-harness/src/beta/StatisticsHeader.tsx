import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import './statistics-header.css'

/** One page identity for the four statistics screens, using their sidebar icons. */
export function StatisticsHeader({
  title,
  description,
  icon: Icon,
  tone,
  children
}: {
  title: string
  description: string
  icon: LucideIcon
  tone: 'growth' | 'desktop' | 'stuck' | 'usage'
  children?: ReactNode
}) {
  return (
    <header className="signals-heading statistics-heading" data-statistics-tone={tone}>
      <span className="statistics-heading-icon" aria-hidden="true">
        <Icon size={22} strokeWidth={1.75} />
      </span>
      <div className="statistics-heading-copy">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="statistics-heading-actions">{children}</div>}
    </header>
  )
}
