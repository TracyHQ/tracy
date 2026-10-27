import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { columnRows, hasDestination, isCurrent, isHeading, isItemActive, type NavLink } from './nav'

export interface MegaMenuProps {
  items: NavLink[]
  currentPath: string
  /** Accessible name of the navigation, in the site's language (server-side `src/lib/ui.ts`). */
  label?: string
}

// Delay before a hover-opened panel closes: covers the pointer's trip from trigger to panel.
const CLOSE_DELAY = 160

/**
 * Desktop primary navigation. Items with children open a panel on hover or on Enter/Space;
 * Escape closes and returns focus to the trigger, a click or focus outside closes it.
 * A group's children are column headings (with links) and, after them, plain links.
 */
export default function MegaMenu({ items, currentPath, label = 'Primary' }: MegaMenuProps) {
  const [open, setOpen] = useState<number | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const triggers = useRef<(HTMLButtonElement | null)[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const baseId = useId()

  const cancelClose = () => clearTimeout(timer.current)
  const scheduleClose = () => {
    cancelClose()
    timer.current = setTimeout(() => setOpen(null), CLOSE_DELAY)
  }
  const close = useCallback((returnFocus: boolean) => {
    setOpen((current) => {
      if (returnFocus && current !== null) triggers.current[current]?.focus()
      return null
    })
  }, [])

  useEffect(() => {
    if (open === null) return
    const onPointer = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) close(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  useEffect(() => () => clearTimeout(timer.current), [])

  const linkItem = (link: NavLink, key: string | number) =>
    hasDestination(link.url) ? (
      <li key={key}>
        <a
          href={link.url}
          target={link.target || undefined}
          className={cn('k-mega-link', isCurrent(link.url, currentPath) && 'is-active')}
          aria-current={isCurrent(link.url, currentPath) ? 'page' : undefined}
          onClick={() => setOpen(null)}
        >
          {link.label}
        </a>
      </li>
    ) : (
      <li key={key} className="k-mega-link">
        {link.label}
      </li>
    )

  const panelBody = (item: NavLink, panelId: string) => {
    const columns = item.children.filter(isHeading)
    const plain = item.children.filter((c) => !isHeading(c))
    if (!columns.length) {
      return (
        <ul className="k-mega-grid" style={{ gridTemplateRows: `repeat(${columnRows(plain.length)}, auto)` }}>
          {plain.map(linkItem)}
        </ul>
      )
    }
    return (
      <div className="k-mega-cols">
        {columns.map((col, j) => (
          <div key={j} className="k-mega-col">
            <span id={`${panelId}-col-${j}`} className="k-mega-title">
              {col.label}
            </span>
            <ul className="k-mega-list" aria-labelledby={`${panelId}-col-${j}`}>
              {col.children.map(linkItem)}
            </ul>
          </div>
        ))}
        {plain.length > 0 && (
          <div className="k-mega-col k-mega-col-plain">
            <ul className="k-mega-list">{plain.map(linkItem)}</ul>
          </div>
        )}
      </div>
    )
  }

  return (
    <nav ref={navRef} className="k-mega" aria-label={label}>
      <ul className="flex items-center gap-1">
        {items.map((item, i) => {
          const active = isItemActive(item, currentPath)
          if (!item.children.length) {
            if (!hasDestination(item.url)) return null
            return (
              <li key={i}>
                <a
                  href={item.url}
                  target={item.target || undefined}
                  className={cn('k-nav-link', active && 'is-active')}
                  aria-current={isCurrent(item.url, currentPath) ? 'page' : undefined}
                >
                  {item.label}
                </a>
              </li>
            )
          }
          const isOpen = open === i
          const panelId = `${baseId}-panel-${i}`
          return (
            <li
              key={i}
              className="relative"
              onPointerEnter={(e) => {
                if (e.pointerType === 'touch') return
                cancelClose()
                setOpen(i)
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'touch') return
                scheduleClose()
              }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setOpen((c) => (c === i ? null : c))
              }}
            >
              <button
                ref={(el) => {
                  triggers.current[i] = el
                }}
                type="button"
                className={cn('k-nav-link', active && 'is-active', isOpen && 'is-open')}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                {item.label}
                <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" className="k-nav-caret" />
              </button>
              <div id={panelId} className="k-mega-wrap" hidden={!isOpen}>
                <div className="k-mega-panel">{panelBody(item, panelId)}</div>
              </div>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
