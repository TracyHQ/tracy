import WebSocket from 'ws'

/** Read the seat-filtered native baseline before prompting a server-created chat. */
export function siteSessionBaseline({ origin, mount, token, label, sessionId, timeoutMs = 5_000 }) {
  return new Promise((resolve) => {
    const url = new URL(`${mount}/api/remote.mux`, origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url, {
      headers: { cookie: `dsh_gateway_token=${token}`, 'x-forwarded-prefix': mount },
      followRedirects: false,
      maxPayload: 4 * 1024 * 1024
    })
    const streamId = crypto.randomUUID()
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      clearTimeout(timer)
      socket.terminate()
      resolve(ok)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    socket.on('error', () => finish(false))
    socket.on('close', () => finish(false))
    socket.on('open', () => {
      socket.send(
        JSON.stringify({ type: 'open', streamId, endpoint: 'workspace/follow', payload: { args: {} } })
      )
    })
    socket.on('message', (data) => {
      let frame
      try {
        frame = JSON.parse(String(data))
      } catch {
        return finish(false)
      }
      if (frame.streamId !== streamId) return
      if (frame.type === 'error' || frame.type === 'end') return finish(false)
      if (frame.type !== 'item' || frame.value?.type !== 'baseline') return
      const items = frame.value.value?.items
      finish(
        Array.isArray(items) &&
          items.some(
            (row) =>
              row?.path === `/site/${label}` &&
              typeof row.workspaceId === 'string' &&
              Array.isArray(row.sessionIds) &&
              row.sessionIds.includes(sessionId)
          )
      )
    })
  })
}
