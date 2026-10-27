import { makeCase, passWithProof } from '../../kit.mjs'
export const layer = 'good'
const cases = [makeCase(layer, 'a'), makeCase(layer, 'b', { edgeTags: ['empty'] })]
export async function listCases({ area } = {}) {
  return area === 'none' ? [] : cases
}
export async function run({ cases: asked, outDir }) {
  return Promise.all(asked.map((m) => passWithProof(m, outDir)))
}
