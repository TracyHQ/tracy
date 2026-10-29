import { AsyncResource } from 'node:async_hooks'
import { channel } from 'node:diagnostics_channel'

const pictureCalls = channel('tracy.picture-model-call')

/** Bridge the child's private metadata pipe into the caller's build scope, including calls killed mid-request. */
export function observeChildPictureCalls(child) {
  const active = new Map()
  const receive = AsyncResource.bind((line) => {
    let row
    try {
      row = JSON.parse(line)
    } catch {
      return
    }
    if (!Number.isSafeInteger(row.id) || !['drawing', 'vision'].includes(row.kind)) return
    if (row.phase === 'start' && !active.has(row.id)) {
      const call = { token: {}, kind: row.kind }
      active.set(row.id, call)
      pictureCalls.publish({ phase: 'start', ...call })
    } else if (row.phase === 'end') {
      const call = active.get(row.id)
      if (call) pictureCalls.publish({ phase: 'end', ...call })
      active.delete(row.id)
    }
  })
  let pending = ''
  child.stdio[3].setEncoding('utf8')
  child.stdio[3].on('data', (chunk) => {
    pending += chunk
    let split
    while ((split = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, split)
      pending = pending.slice(split + 1)
      if (line.length <= 256) receive(line)
    }
    if (pending.length > 256) pending = ''
  })
  child.on(
    'close',
    AsyncResource.bind(() => {
      for (const call of active.values()) pictureCalls.publish({ phase: 'end', ...call })
      active.clear()
    })
  )
}
