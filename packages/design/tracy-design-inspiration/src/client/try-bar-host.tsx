/**
 * The plugin's own root for the try's bar (`TryBar.tsx`), mounted once on the page as the plugin applies
 * and taken down when it is disposed. The bar draws the try the plugin module holds (`try-store.mjs`),
 * so it stays on the page after the host brings the Browser tab in front and the Design system tab
 * unmounts with it (13/10/2026). Undo presses the undo door through the store and reloads the Browser
 * tab (`onChanged`); Keep only forgets the try (the system stays).
 */
import { type JSX, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'

import type { Translate } from './strings'
import { clearTry, onTry, tryState, undoTry } from './try-store.mjs'
import { TryBar } from './TryBar'

export function TryBarHost({ t, onChanged }: { t: Translate; onChanged?: () => void }): JSX.Element | null {
  const at = useSyncExternalStore(onTry, tryState, tryState)
  if (!at) return null
  return (
    <TryBar
      name={at.trial.current.name}
      busy={at.undoing ? 'undo' : null}
      canUndo={at.trial.applyId != null && at.canUndo}
      onUndo={() => {
        void undoTry().then((r) => {
          if (r?.ok) onChanged?.()
        })
      }}
      onKeep={clearTry}
      t={t}
    />
  )
}

/**
 * Mount the bar's root on the page. Returns the way to take it down (the plugin's disposer).
 * @param onChanged called after an Undo went through: the Browser tab shows the site afresh.
 */
export function mountTryBar({ t, onChanged }: { t: Translate; onChanged?: () => void }): () => void {
  if (typeof document === 'undefined') return () => {}
  const host = document.createElement('div')
  host.dataset.tracyTryBarHost = ''
  document.body.append(host)
  const root = createRoot(host)
  root.render(<TryBarHost t={t} onChanged={onChanged} />)
  return () => {
    root.unmount()
    host.remove()
  }
}
