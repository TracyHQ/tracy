/**
 * The Browser toolbar's Design system button (TCH `feat/design-system-button`): the entry into the flow
 * that puts a design system on the running site. Tracy says whether it shows and its words
 * (`design-system-toolbar.ts`); a click tells Tracy, which opens the site's design-system panel.
 *
 * - `ready`: a click sends the press.
 * - `off`: dimmed and inert through `aria-disabled`, so the tooltip that says why still shows.
 */
import type { ReactElement } from 'react'
import { LuPalette } from 'react-icons/lu'
import css from './sidebar.module.css'
import { pressDesignSystemToolbar, useDesignSystemToolbarState, type DesignSystemToolbarStore } from './design-system-toolbar.ts'

const cx = (...names: Array<string | false | null | undefined>): string => names.filter(Boolean).join(' ')

export interface DesignSystemToolbarButtonProps {
  /** The site workspace of this page (`<base href="/<siteKey>/">`). */
  siteKey: string | null
  /** The tab's conversation, sent with the press. */
  sessionId: string
  /** The narrow toolbar: the icon alone. */
  compact: boolean
  /** Runs before a press (the Browser tab leaves fullscreen so the panel can show). */
  onPress?: () => void
  store?: DesignSystemToolbarStore | null
  target?: EventTarget
}

export function DesignSystemToolbarButton(props: DesignSystemToolbarButtonProps): ReactElement | null {
  const { siteKey, sessionId, compact, onPress, target } = props
  const detail = useDesignSystemToolbarState(siteKey, props.store)
  if (detail === null || !siteKey) return null
  const off = detail.state === 'off'
  return (
    <button
      type="button"
      className={cx(css.undoButton, compact && css.undoButtonIcon)}
      data-design-system={detail.state}
      aria-disabled={off ? 'true' : undefined}
      aria-label={compact ? detail.text.label : undefined}
      title={detail.text.tooltip || detail.text.label}
      onClick={() => {
        if (off) return
        onPress?.()
        pressDesignSystemToolbar(siteKey, sessionId, target)
      }}
    >
      <LuPalette size={14} aria-hidden />
      {!compact && <span>{detail.text.label}</span>}
    </button>
  )
}
