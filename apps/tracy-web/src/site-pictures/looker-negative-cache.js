// A readable rejection for visible lettering is independent of a frame's subject, mood and alt request.
// Reuse only that failure for identical source bytes and rendered pixels under the same display and model contract.
// Passes, other faults, descriptions and alts remain specific to the full looker's original question.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sha256Hex } from './file-store.js'

export const NEGATIVE_LOOK_POLICY = 'rendered-lettering/1'
const HEX = /^[a-f0-9]{64}$/
export const letteringRejection = (said) =>
  said?.verdict === 'fail' && said?.faults?.includes('stray lettering')
const readJson = (file) =>
  readFile(file, 'utf8')
    .then(JSON.parse)
    .catch(() => null)

export function negativeLookKey(input) {
  return sha256Hex(JSON.stringify([NEGATIVE_LOOK_POLICY, input]))
}

export function negativeLookCache({ dir, model }) {
  const active = new Map()
  const proofDir = path.join(dir, 'negative-looks', 'rendered-lettering-1')
  async function reuse(key) {
    const proof = await readJson(path.join(proofDir, `${key}.json`))
    if (proof?.policy !== NEGATIVE_LOOK_POLICY || proof.renderKey !== key || !HEX.test(proof.sourceKey))
      return null
    const source = await readJson(path.join(dir, 'looks', `${proof.sourceKey}.json`))
    if (!letteringRejection(source) || source.model !== model) return null
    return {
      said: {
        verdict: 'fail',
        faults: ['stray lettering'],
        seen: 'This exact rendered picture was already rejected for visible lettering.',
        model,
        ms: 0,
        costUsd: 0,
        cacheSource: { policy: NEGATIVE_LOOK_POLICY, renderKey: key, lookKey: proof.sourceKey }
      },
      cached: true
    }
  }
  async function run(key, sourceKey, work) {
    // Establish the gate before any disk read, so simultaneous identical renders do not each pay for the same fault.
    const pending = active.get(key)
    if (pending) {
      await pending.catch(() => {})
      // A pass or another fault proves nothing about a new question: release its own work without serializing siblings.
      return perform()
    }
    const task = perform()
    active.set(key, task)
    try {
      return await task
    } finally {
      if (active.get(key) === task) active.delete(key)
    }

    async function perform() {
      const before = await reuse(key)
      if (before) return before
      const result = await work()
      await remember(key, sourceKey, result.said)
      return result
    }
  }
  async function remember(key, sourceKey, said) {
    if (!letteringRejection(said)) return
    await mkdir(proofDir, { recursive: true })
    await writeFile(
      path.join(proofDir, `${key}.json`),
      JSON.stringify({ policy: NEGATIVE_LOOK_POLICY, renderKey: key, sourceKey })
    )
  }
  return { run, remember }
}
