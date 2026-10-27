/**
 * The Browser toolbar's Publish and "More" (⋯) buttons, right of Comments (TCH `fix/ds-templates-local`,
 * Akemi 15/10/2026). Tracy says whether each shows and its words (`site-toolbar.ts`); a press tells
 * Tracy, which opens the site's Publish tab or its site menu.
 *
 * Publish wears the Comments button's own classes (a ghost button, icon + word; compact: the icon
 * alone), More the bar's ghost square (`iconButton`, as Back and Refresh), so both follow the bar in
 * light and dark with no colour of their own.
 */
import type { ReactElement } from 'react'
import { LuEllipsis, LuGlobe } from 'react-icons/lu'
import css from './sidebar.module.css'
import { pressSiteToolbar, useSiteToolbarState, type SiteToolbarAction, type SiteToolbarStore } from './site-toolbar.ts'

const cx = (...names: Array<string | false | null | undefined>): string => names.filter(Boolean).join(' ')

export interface SiteToolbarButtonsProps {
  /** The site workspace of this page (`<base href="/<siteKey>/">`). */
  siteKey: string | null
  /** The tab's conversation, sent with the press. */
  sessionId: string
  /** The narrow toolbar: Publish draws its icon alone. */
  compact: boolean
  /** Runs before a press (the Browser tab leaves fullscreen so the tab or the menu can show). */
  onPress?: () => void
  store?: SiteToolbarStore | null
  target?: EventTarget
}

export function SiteToolbarButtons(props: SiteToolbarButtonsProps): ReactElement | null {
  const { siteKey, sessionId, compact, onPress, target } = props
  const detail = useSiteToolbarState(siteKey, props.store)
  if (detail === null || !siteKey || (detail.publish === null && detail.more === null)) return null
  const press = (action: SiteToolbarAction, anchor: HTMLElement): void => {
    onPress?.()
    pressSiteToolbar(siteKey, sessionId, action, anchor, target)
  }
  return (
    <>
      {detail.publish !== null && (
        <button
          type="button"
          className={cx(css.commentsButton, compact && css.commentsButtonIcon)}
          data-site-toolbar="publish"
          aria-label={compact ? detail.publish : undefined}
          title={detail.publish}
          onClick={event => { press('publish', event.currentTarget) }}
        >
          <LuGlobe size={14} aria-hidden />
          {!compact && <span>{detail.publish}</span>}
        </button>
      )}
      {detail.more !== null && (
        <button
          type="button"
          className={css.iconButton}
          data-site-toolbar="more"
          aria-haspopup="menu"
          aria-label={detail.more}
          title={detail.more}
          onClick={event => { press('more', event.currentTarget) }}
        >
          <LuEllipsis size={14} aria-hidden />
        </button>
      )}
    </>
  )
}
