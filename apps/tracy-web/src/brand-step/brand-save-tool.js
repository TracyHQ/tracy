// save_brand_file as the agent calls it (brand step trial bench, #320). The prompt tells the agent to build the brand
// file and call save_brand_file. In the bench the gate is not run inside the call: the call stores the file as the
// round's attempt, and the worker runs the gate on it once the agent has answered (brand-rounds.js), so a rejection
// goes back to the same conversation as the next user turn listing only the rejected fields (fix rounds, at most two).
// The call can be repeated safely: the last file saved in a round is the round's attempt.
import { saveRound } from './brand-round-store.js'

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)

/** The brand file in a save_brand_file call: the `brandFile` argument (an object or JSON text) or the arguments themselves. */
export function brandFileOf(args) {
  const raw = args?.brandFile ?? args?.json ?? (args?.kind === 'brand-file' ? args : undefined)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return isObject(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return isObject(raw) ? raw : null
}

/** The brand file in a final answer that carries one instead of calling the tool: one JSON object, fenced or bare. */
export function brandFileInAnswer(answer) {
  const text = String(answer ?? '')
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return brandFileOf({ brandFile: (fenced ? fenced[1] : text).trim() })
}

export function saveBrandFileTool({ pool, runId, round, leaseToken }) {
  return {
    name: 'save_brand_file',
    description:
      'Save the finished brand file (the whole JSON object of the Output section) for the gate. Every file path in it ' +
      'is relative to the folder of the brand file. The gate checks it after your answer; rejected fields come back as the next message.',
    inputSchema: {
      type: 'object',
      properties: { brandFile: { type: 'object', description: 'The whole brand file, version 10.' } },
      required: ['brandFile']
    },
    adapted: true,
    async run(args) {
      const brandFile = brandFileOf(args)
      if (!brandFile)
        return { error: 'INVALID_BRAND_FILE', reason: 'brandFile must be the brand file as one JSON object' }
      const written = await saveRound(pool, {
        runId,
        round: round(),
        state: 'working',
        attempt: brandFile,
        leaseToken
      })
      if (!written) throw new Error('the run is no longer ours')
      return {
        saved: true,
        note: 'Received. Answer with one short line; the gate checks the file after your answer.'
      }
    }
  }
}
