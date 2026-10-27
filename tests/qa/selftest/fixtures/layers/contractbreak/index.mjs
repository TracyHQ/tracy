import { makeCase, passWithProof } from '../../kit.mjs'
export const layer = 'contractbreak'
const cases = [makeCase(layer, 'one'), makeCase(layer, 'two')]
export async function listCases() {
  return cases
}
export async function run({ cases: asked, outDir, signal }) {
  const mode = process.env.QA_FIXTURE_MODE
  const first = await passWithProof(asked[0], outDir)
  if (mode === 'duplicate') return [first, first]
  if (mode === 'unsolicited') return [first, { ...first, id: 'QA-CONTRACTBREAK-ghost-happy' }]
  if (mode === 'malformed') return [{ ...first, verdict: 'MAYBE' }]
  if (mode === 'badassertion') return [{ ...first, assertionIds: ['not-declared'] }]
  if (mode === 'escape') return [{ ...first, evidence: ['../outside.txt'] }]
  if (mode === 'absolute') return [{ ...first, evidence: ['/etc/passwd'] }]
  if (mode === 'dirEvidence') {
    await (await import('node:fs/promises')).mkdir(`${outDir}/evdir`)
    return [{ ...first, evidence: ['evdir'] }, await passWithProof(asked[1], outDir)]
  }
  if (mode === 'omit') return [first]
  if (mode === 'throw') throw new Error('boom')
  if (mode === 'hang')
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
  if (mode === 'stubborn') return new Promise(() => {})
  if (mode === 'late') return new Promise((resolve) => setTimeout(() => resolve([first]), 400))
  return Promise.all(asked.map((m) => passWithProof(m, outDir)))
}
