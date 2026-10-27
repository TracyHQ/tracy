// Reading is a dwell heuristic, never a claim that the user understood a PR.
import { useEffect, useRef, type RefObject } from 'react'

export function useCiAutoRead(
  table: RefObject<HTMLDivElement | null>,
  unreadIds: string,
  markRead: (numbers: number[]) => Promise<void>
) {
  const save = useRef(markRead)
  save.current = markRead
  useEffect(() => {
    const root = table.current
    if (!root || !unreadIds) return
    const visibleSince = new Map<number, number>()
    const engagedSince = new Map<number, number>()
    const saving = new Set<number>()
    let retryAfter = 0
    let disposed = false
    const reset = () => {
      visibleSince.clear()
      engagedSince.clear()
    }
    const active = () => document.visibilityState === 'visible' && document.hasFocus()
    const sample = () => {
      if (!active()) {
        reset()
        return
      }
      const now = performance.now()
      const numbers: number[] = []
      const hovered = root.querySelector('[data-read-state="unread"]:hover')
      for (const row of root.querySelectorAll<HTMLElement>('[data-read-state="unread"]')) {
        const id = Number(row.dataset.pr)
        const rect = row.getBoundingClientRect()
        // The table scrolls horizontally; reading only the Brief still counts.
        const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
        const visible =
          rect.height > 0 && height / rect.height >= 0.75 && rect.right > 0 && rect.left < window.innerWidth
        if (!visible) {
          visibleSince.delete(id)
          engagedSince.delete(id)
          continue
        }
        if (!visibleSince.has(id)) visibleSince.set(id, now)
        const engaged = hovered === row || row.contains(document.activeElement)
        if (engaged && !engagedSince.has(id)) engagedSince.set(id, now)
        if (!engaged) engagedSince.delete(id)
        if (
          !saving.has(id) &&
          now >= retryAfter &&
          (now - visibleSince.get(id)! >= 3000 || now - (engagedSince.get(id) ?? now) >= 2000)
        ) {
          saving.add(id)
          numbers.push(id)
        }
      }
      if (numbers.length)
        void save.current(numbers).catch(() => {
          if (!disposed) {
            retryAfter = performance.now() + 30000
            reset()
            for (const id of numbers) saving.delete(id)
          }
        })
    }
    const visibility = () => {
      reset()
      sample()
    }
    const scroll = () => {
      reset()
      sample()
    }
    const engagement = () => {
      engagedSince.clear()
      sample()
    }
    sample()
    const interval = window.setInterval(sample, 250)
    window.addEventListener('blur', reset)
    window.addEventListener('focus', visibility)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    root.addEventListener('pointerover', engagement)
    root.addEventListener('pointerout', engagement)
    root.addEventListener('focusin', engagement)
    root.addEventListener('focusout', engagement)
    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener('blur', reset)
      window.removeEventListener('focus', visibility)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
      root.removeEventListener('pointerover', engagement)
      root.removeEventListener('pointerout', engagement)
      root.removeEventListener('focusin', engagement)
      root.removeEventListener('focusout', engagement)
    }
  }, [table, unreadIds])
}
