import { makeCase, result, writeProof } from '../../kit.mjs'
export const layer = 'nored'
const cases = ['none', 'empty', 'missing', 'wrongid', 'noassert'].map((k) => makeCase(layer, k))
export async function listCases() {
  return cases
}
export async function run({ cases: asked, outDir }) {
  const out = []
  for (const m of asked) {
    const key = m.itemIds[0]
    const proof = (log, assertionId = m.assertionIds[0]) => ({
      kind: 'commit',
      ref: 'abc123',
      assertionId,
      log
    })
    if (key === 'none') out.push(result(m, 'PASS'))
    else if (key === 'empty')
      out.push(result(m, 'PASS', { redProof: proof(await writeProof(outDir, m.id, '')) }))
    else if (key === 'missing') out.push(result(m, 'PASS', { redProof: proof('red/not-there.log') }))
    else if (key === 'wrongid')
      out.push(result(m, 'PASS', { redProof: proof(await writeProof(outDir, m.id), 'other-assertion') }))
    else out.push(result(m, 'PASS', { assertionIds: [], redProof: proof(await writeProof(outDir, m.id)) }))
  }
  return out
}
