import { AsyncLocalStorage } from 'node:async_hooks'
import { channel } from 'node:diagnostics_channel'

const scope = new AsyncLocalStorage()
const pictureCalls = channel('tracy.picture-model-call')
const violation =
  'A picture model call ran during Apply. Drawing and vision must finish before the write clock starts.'

/** Per-build observation, including provider calls still running when the apply timeout returns. */
export function createEnginePictureClock({ now = Date.now, onViolation = () => {} } = {}) {
  const identity = {}
  const calls = new Map()
  let applyStart = null
  let applyEnd = null
  let closed = false
  let found = false
  const overlap = (call) => {
    call.overlaps = true
    if (found) return
    found = true
    try {
      onViolation(violation)
    } catch {
      // Receipt observation cannot change the model request or the site's writes.
    }
  }
  const observe = ({ phase, kind, token }) => {
    if (closed || scope.getStore() !== identity || !['drawing', 'vision'].includes(kind)) return
    if (phase === 'start') {
      const call = { kind, start: now(), end: null, overlaps: false }
      calls.set(token, call)
      if (applyStart !== null && applyEnd === null) overlap(call)
    } else if (phase === 'end') {
      const call = calls.get(token)
      if (call) call.end = now()
    }
  }
  pictureCalls.subscribe(observe)
  const endApply = () => {
    if (applyStart !== null && applyEnd === null) applyEnd = now()
  }
  return {
    run: (work) => scope.run(identity, work),
    startApply() {
      if (closed || applyStart !== null) return
      applyStart = now()
      for (const call of calls.values()) if (call.end === null) overlap(call)
    },
    endApply,
    report() {
      if (applyStart === null) return {}
      const end = applyEnd ?? now()
      const during = [...calls.values()].filter((call) => call.overlaps)
      const duration = (kind) => {
        const intervals = during
          .filter((call) => call.kind === kind)
          .map((call) => [Math.max(applyStart, call.start), Math.min(end, call.end ?? end)])
          .sort((a, b) => a[0] - b[0])
        let total = 0
        let until = applyStart
        for (const [start, stop] of intervals) {
          total += Math.max(0, stop - Math.max(start, until))
          until = Math.max(until, stop)
        }
        return total
      }
      return {
        drawingDuringApplyMs: duration('drawing'),
        visionDuringApplyMs: duration('vision'),
        pictureCallsDuringApply: during.length,
        findings: found ? [{ code: 'PICTURE_MODEL_DURING_APPLY', severity: 'error', message: violation }] : []
      }
    },
    close() {
      endApply()
      closed = true
      pictureCalls.unsubscribe(observe)
    }
  }
}
