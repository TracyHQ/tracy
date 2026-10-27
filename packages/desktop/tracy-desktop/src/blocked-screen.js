/**
 * The blocked screen (tasks/todo-desktop-update-policy.md C7): a copy below the minimum version shows
 * a local page of the shell (src/blocked.html) with one way forward — Update — instead of the product.
 * Pure: `blockedView` decides what the page says and offers; `createBlockGate` is the ONE place that
 * decides whether a product window may open (start, Dock, File › New Window, a Cmd+click, a second
 * launch), so no way in forgets the rule.
 *
 * The way out is always visible and never a loop (council §2): Update tries once per press; a target
 * this copy cannot install (none for this system or arch, Squirrel refusing it) says why and offers
 * the download link and Retry; offline says offline and offers Retry; a newer policy lowering the
 * minimum lets the product back in by itself.
 */

/**
 * @param {{
 *   t: (key: string, params?: Record<string, string>) => string,
 *   app: string, running: string,
 *   verdict: { level: string, minimumVersion: string | null, offline: boolean },
 *   installMode: 'quit' | 'restart' | 'manual',
 *   attempt: null | { phase: 'working' } | { outcome: 'installing' | 'link' | 'unavailable', version: string | null } | { outcome: 'failed', reason: string }
 * }} input
 * @returns {{ title: string, body: string, status: { tone: 'busy' | 'warn' | 'error' | 'ok', text: string } | null,
 *   buttons: { action: 'update' | 'retry' | 'download', label: string, primary: boolean }[] }}
 */
function blockedView({ t, app, running, verdict, installMode, attempt }) {
  const minimum = verdict.minimumVersion ?? ''
  const manual = installMode === 'manual'
  const title = t('blocked.title')
  const body = t(manual ? 'blocked.bodyManual' : 'blocked.body', { app, running, minimum })
  const button = (action, primary) => ({ action, label: t(`blocked.${action}`), primary })
  const main = manual ? button('download', true) : button('update', true)
  const view = (status, buttons) => ({ title, body, status, buttons })

  if (attempt && 'phase' in attempt) return view({ tone: 'busy', text: t('blocked.working') }, [])
  switch (attempt?.outcome) {
    case 'installing':
      return view(
        { tone: 'busy', text: t('blocked.installing', { app, version: attempt.version ?? minimum }) },
        []
      )
    case 'link':
      return view({ tone: 'ok', text: t('blocked.opened', { app }) }, [
        button('retry', false),
        button('download', true)
      ])
    case 'unavailable':
      return view({ tone: 'error', text: t('blocked.unavailable') }, [
        button('retry', false),
        button('download', true)
      ])
    case 'failed':
      return view({ tone: 'error', text: t('blocked.failed', { reason: attempt.reason }) }, [
        button('retry', false),
        button('download', true)
      ])
    default:
      if (verdict.offline)
        return view({ tone: 'warn', text: t('blocked.offline', { app }) }, [button('retry', false), main])
      return view(null, [main])
  }
}

/**
 * @param {{
 *   showBlocked: () => void, closeBlocked: () => void,
 *   closeProducts: () => void, openProduct: () => void,
 *   productCount: () => number, log: (line: string) => void
 * }} deps - `showBlocked` opens the blocked window or brings the open one forward.
 */
function createBlockGate(deps) {
  let blocked = false
  return {
    isBlocked: () => blocked,
    /** The verdict moved: blocked → show the screen, close the product; no longer → the reverse. */
    set(next) {
      if (next === blocked) return
      blocked = next
      if (blocked) {
        deps.log('blocked: below the minimum version; product windows close')
        deps.showBlocked()
        deps.closeProducts()
        return
      }
      deps.log('blocked: lifted; the product opens again')
      deps.closeBlocked()
      if (deps.productCount() <= 0) deps.openProduct()
    },
    /**
     * May a product window open now? When blocked, the blocked screen comes forward instead.
     * @param {'start' | 'dock' | 'new-window' | 'link' | 'second-launch'} how
     */
    admit(how) {
      if (!blocked) return true
      deps.log(`blocked: ${how} shows the blocked screen`)
      deps.showBlocked()
      return false
    }
  }
}

module.exports = { blockedView, createBlockGate }
