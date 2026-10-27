/** Follow only the demo explicitly accepted by this press, using the server's real session link. */
import { useEffect, useRef } from 'react'
import type { Api } from './api.ts'
import type { DemoAction } from './outreach-model.ts'
import { startPoll } from './poll.ts'
import { CLIENT_CHAT_MODE, startClientDemoChat } from './client-demo-chat.ts'

export function acceptedDemoAction(actions: DemoAction[]): DemoAction | undefined {
  return actions.find((item) => item.workflow === 'agent-demo/1')
}

export function demoChatHref(action: DemoAction): string | null {
  if (action.workflow !== 'agent-demo/1' || !action.chat?.siteKey || !action.chat.sessionId) return null
  const expected = `/${encodeURIComponent(action.chat.siteKey)}/s/${encodeURIComponent(action.chat.sessionId)}`
  try {
    const url = new URL(action.chat.href, 'https://workspace.invalid')
    return url.origin === 'https://workspace.invalid' && url.pathname === expected
      ? url.pathname + url.search + url.hash
      : null
  } catch {
    return null
  }
}

export function followDemoChat({
  action,
  read,
  current,
  open,
  poll = startPoll
}: {
  action: DemoAction
  read: (id: string) => Promise<DemoAction | null>
  current: () => boolean
  open: (href: string) => void
  poll?: typeof startPoll
}): () => void {
  let stopped = false
  let stopPoll = () => {}
  const stop = () => {
    stopped = true
    stopPoll()
  }
  const inspect = (next: DemoAction) => {
    if (stopped || !current()) {
      stop()
      return
    }
    if (next.id !== action.id || next.workflow !== 'agent-demo/1') {
      stop()
      return
    }
    const href = demoChatHref(next)
    if (href) {
      stop()
      open(href)
    } else if (['failed', 'cancelled', 'completed'].includes(next.state)) stop()
  }
  inspect(action)
  if (!stopped && action.workflow === 'agent-demo/1')
    stopPoll = poll(async () => {
      if (stopped || !current()) {
        stop()
        return
      }
      const next = await read(action.id)
      if (next) inspect(next)
    }, 3000)
  return stop
}

/** A later navigation, tab choice, hidden page or unmount revokes this press's navigation intent. */
/** `enabled` false (the public Find): no listener is added and nothing navigates. */
/** `onLogoWait` hears while a press's demo brief waits for its logo research (`prepareWhenReady`). */
export function useDemoChatNavigation(
  api: Pick<Api, 'demoAction' | 'prepareDemoChat'>,
  enabled = true,
  onLogoWait?: (waiting: boolean) => void
): () => (actions: DemoAction[]) => Promise<boolean> {
  const pending = useRef<() => void>(() => {})
  const generation = useRef(0)
  const watching = useRef(false)
  useEffect(() => {
    if (!enabled) return
    const cancel = () => {
      generation.current++
      watching.current = false
      pending.current()
    }
    const click = (event: MouseEvent) => {
      const target = event.target
      if (
        watching.current &&
        target instanceof Element &&
        target.closest('a[href], [role="tab"], [role="menuitem"]')
      )
        cancel()
    }
    const hidden = () => {
      if (document.visibilityState === 'hidden') cancel()
    }
    window.addEventListener('popstate', cancel)
    window.addEventListener('hashchange', cancel)
    window.addEventListener('pagehide', cancel)
    document.addEventListener('click', click, true)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      cancel()
      window.removeEventListener('popstate', cancel)
      window.removeEventListener('hashchange', cancel)
      window.removeEventListener('pagehide', cancel)
      document.removeEventListener('click', click, true)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [enabled])
  return () => {
    pending.current()
    watching.current = false
    const token = ++generation.current,
      source = window.location.href
    return async (actions) => {
      if (generation.current !== token || window.location.href !== source) return false
      if (actions.some((action) => action.chatMode === CLIENT_CHAT_MODE)) {
        try {
          return await startClientDemoChat(actions, {
            api,
            storage: window.sessionStorage,
            current: () => generation.current === token && window.location.href === source,
            open: (href) => window.location.assign(href),
            onLogoWait
          })
        } catch {
          return false
        }
      }
      const action = acceptedDemoAction(actions)
      if (!action) return true
      watching.current = true
      pending.current = followDemoChat({
        action,
        read: async (id) => {
          const answer = await api.demoAction(id)
          return answer.ok ? answer.body.action : null
        },
        current: () =>
          generation.current === token &&
          window.location.href === source &&
          document.visibilityState !== 'hidden',
        open: (href) => window.location.assign(href)
      })
      return true
    }
  }
}
