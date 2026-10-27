import { EDIT_CONTROL, PICK_BOX } from './tour-edit.ts'

/** Existing, owner-defined handles only. Hidden or missing controls never get a coach. */
export const TARGETS: Record<string, string> = {
  template: '.tv-start-card:has([data-tone="template"])',
  import: '.tv-start-card:has([data-tone="import"])',
  createsite: '.tv-start-card:has([data-tone="create"])',
  preview: '[data-browser-scroll]',
  edit: `.tv-start-card:has([data-tone="edit"]), ${EDIT_CONTROL}`,
  pick: '[data-browser-scroll]',
  change: PICK_BOX,
  designsystem: '.tv-start-card:has([data-tone="design-system"])',
  undo: '[data-browser-tab] [data-undo]',
  changes: '.tv-start-card:has([data-tone="changes"])',
  publish: '[data-browser-tab] [data-site-toolbar="publish"]',
  team: '.tv-start-card:has([data-tone="team"])',
  composer: '[data-slot="conversation.composer.bar"] [data-composer-input="true"]'
}

export const START_STEPS = ['template', 'import', 'createsite']
export const SITE_STEPS = [
  'preview',
  'designsystem',
  'changes',
  'team',
  'undo',
  'publish',
  'edit',
  'pick',
  'change',
  'composer'
]

export function visibleTarget(key: string): HTMLElement | null {
  if ((key === 'pick' || key === 'change') && !visibleTarget('edit')) return null
  // These future controls appear only after the preceding hands-on actions.
  if (key === 'change' && !document.querySelector(PICK_BOX)) return visibleTarget('pick')
  for (const el of document.querySelectorAll<HTMLElement>(TARGETS[key] ?? '[data-tour-missing]')) {
    const r = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    if (
      r.width > 0 &&
      r.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < window.innerHeight &&
      r.left < window.innerWidth
    ) {
      // A responsive pane can cover a control that still has a nonzero layout box.
      // Ignore this tour's masks when asking which real UI is on top of the target.
      const x = Math.max(0, Math.min(window.innerWidth - 1, r.left + r.width / 2))
      const y = Math.max(0, Math.min(window.innerHeight - 1, r.top + r.height / 2))
      const hit =
        typeof document.elementsFromPoint === 'function'
          ? document.elementsFromPoint(x, y).find((node) => !node.closest('.tv-tour'))
          : undefined
      if (hit && !el.contains(hit) && !hit.contains(el)) continue
      return el
    }
  }
  return null
}

/** Right, left, below, above, then clamp when the viewport has no empty side. */
export function coachPosition(
  box: DOMRect,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number
) {
  const gap = 14,
    edge = 8
  const x = (n: number) => Math.max(edge, Math.min(viewportWidth - width - edge, n))
  const y = (n: number) => Math.max(edge, Math.min(viewportHeight - height - edge, n))
  if (box.right + gap + width <= viewportWidth - edge) return { left: box.right + gap, top: y(box.top) }
  if (box.left - gap - width >= edge) return { left: box.left - gap - width, top: y(box.top) }
  if (box.bottom + gap + height <= viewportHeight - edge) return { left: x(box.left), top: box.bottom + gap }
  if (box.top - gap - height >= edge) return { left: x(box.left), top: box.top - gap - height }
  return { left: x(box.left + box.width / 2 - width / 2), top: y(box.top + box.height / 2 - height / 2) }
}

/** Spotlight the whole target. */
export function targetBox(_key: string, element: HTMLElement): DOMRect {
  return element.getBoundingClientRect()
}
