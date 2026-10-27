import { makeCase, passWithProof, result } from '../../kit.mjs'
export const layer = 'failing'
const cases = [makeCase(layer, 'ok'), makeCase(layer, 'bad')]
export async function listCases() {
  return cases
}
export async function run({ cases: asked, outDir }) {
  return Promise.all(
    asked.map((m) =>
      m.itemIds[0] === 'bad'
        ? result(m, 'FAIL', { reason: 'injected fault caught' })
        : passWithProof(m, outDir)
    )
  )
}
