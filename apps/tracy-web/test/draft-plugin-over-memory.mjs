// Test-only (#597): an invented Claude Cowork plugin over the blank site in memory (`write-order-memory-doors.mjs`),
// answering the plugin operations the REAL door client sends (`siteDoors`, website-opportunities/domain/site-doors.mjs):
// `content.get`, `content.update`, `content.list`, `content.contract` (inspect, apply), `media.upload`,
// `site.identity` (set, read). Any other operation is refused `NOT_FAKED`. It sits behind a recording `applyAs(email,
// call, {setupRun})` and `applyFor` as `app.js` builds them, so the write step runs on the real wiring, the real
// transport and the real door client, and every call is recorded with its person and setup run. The answer shapes are
// the ones the door client reads; they are not measured on a real plugin here.

/** The plugin's answer of one operation, from the memory site. */
async function answerOf(memory, action, params) {
  const { doors, site } = memory
  switch (action) {
    case 'content.get':
      return { item: await doors.get({ kind: params.kind, id: params.id }) }
    case 'content.update': {
      const { id } = await doors.update({
        applyId: params.apply_id,
        kind: params.kind,
        id: params.id,
        fields: params.fields
      })
      return { id, created: Number(params.id) === 0 }
    }
    case 'content.list': {
      const rows = [...(site.records[params.kind]?.values() ?? [])]
      return { items: structuredClone(rows.slice(params.offset, params.offset + params.limit)) }
    }
    case 'content.contract':
      if (params.operation === 'inspect') {
        const slots = [...site.slots.values()]
        return {
          revision: (await doors.inspect()).revision,
          slots: slots.map((s) => ({ key: s.key, current: s.current })),
          removedSlots: Object.fromEntries(slots.filter((s) => s.removed).map((s) => [s.key, true]))
        }
      }
      if (params.operation === 'apply')
        return doors.contract({
          applyId: params.apply_id,
          requestId: params.request_id,
          expectedRevision: params.expected_revision,
          changes: params.changes,
          removes: []
        })
      return null
    case 'media.upload':
      return doors.upload({
        applyId: params.apply_id,
        path: params.path,
        bytes: Buffer.from(params.content_b64, 'base64')
      })
    case 'site.identity':
      if (params.operation === 'read') return { fields: await doors.readIdentity() }
      return doors.identity({ applyId: params.apply_id, fields: params.fields })
    default:
      return null
  }
}

/**
 * @param {object} memory the memory site (`blankSite()`)
 * @param {{onCall?: (call: object, n: number) => void}} [opts] `onCall`: called with every call before it is answered
 * @returns {{calls: object[], applyAs: Function, applyFor: Function, publicFile: Function}}
 */
export function pluginOverMemory(memory, { onCall } = {}) {
  const calls = []
  const applyAs = async (email, call, { setupRun = null } = {}) => {
    calls.push(structuredClone({ email, setupRun, ...call }))
    onCall?.(call, calls.length)
    try {
      const answer = await answerOf(memory, call.action, call.params ?? {})
      if (!answer) return { ok: false, code: 'NOT_FAKED', message: call.action }
      return { ...answer, ok: true }
    } catch (error) {
      if (error?.fatal) throw error
      return { ok: false, code: error?.code ?? 'failed', message: error?.message ?? String(error) }
    }
  }
  const applyFor = (email, setupRun) => (call) => applyAs(email, call, { setupRun })
  const publicFile = async (_siteKey, path) => memory.site.uploads.get(path) ?? null
  return { calls, applyAs, applyFor, publicFile }
}
