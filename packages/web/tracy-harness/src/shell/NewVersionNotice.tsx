import { Button } from '@tracy/ui'
import { useEffect, useRef, useState } from 'react'

import { useT } from '../i18n'
import { fetchOpsPage, loadedEntryScript, watchBundle } from './bundle-freshness'

/**
 * Whether a newer /ops bundle than this tab's is being served (`bundle-freshness.ts` says why).
 * `staleRef` is for the router: once it is true, the next accepted in-app navigation loads the
 * page fresh instead of swapping screens inside old code.
 */
export function useNewBundle() {
  const [stale, setStale] = useState(false)
  const staleRef = useRef(false)
  useEffect(
    () =>
      watchBundle({
        win: window,
        current: loadedEntryScript(document),
        fetchPage: fetchOpsPage,
        onStale: () => {
          staleRef.current = true
          setStale(true)
        }
      }),
    []
  )
  return { stale, staleRef }
}

/**
 * A small fixed notice that a new version of /ops is out, with the reload one press away. It never
 * reloads by itself: a person may be halfway through an edit, and the router only reloads on a
 * navigation the screen already allowed (an unsaved screen refuses those).
 */
export function NewVersionNotice({ stale }: { stale: boolean }) {
  const t = useT()
  if (!stale) return null
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm shadow-lg"
    >
      <span>{t('shell.update.notice')}</span>
      <Button size="sm" onClick={() => window.location.reload()}>
        {t('shell.update.reload')}
      </Button>
    </div>
  )
}
