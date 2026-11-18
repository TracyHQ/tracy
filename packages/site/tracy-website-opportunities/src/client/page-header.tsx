/**
 * The header of the two Opportunities sub-tabs (#537, option A): the title at the left of one row, an optional
 * slot at the right end of the same row (the Added businesses toolbar), and under them one muted description line.
 * Under 720px of container width the slot drops under the description.
 */
import type { JSX, ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  children
}: {
  /** The tab's title, already in words. */
  title: string
  /** What the tab is for, already in words. */
  description: string
  /** The row's right end: the toolbar or the selection bar. */
  children?: ReactNode
}): JSX.Element {
  return (
    <header className="tracy-wo-pghead">
      <h2 className="tracy-wo-pghead-title">{title}</h2>
      <p className="tracy-wo-pghead-desc">{description}</p>
      {children ? <div className="tracy-wo-pghead-slot">{children}</div> : null}
    </header>
  )
}
