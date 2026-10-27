import { makeCase, result } from '../../kit.mjs'
export const layer = 'envpending'
const cases = [makeCase(layer, 'live'), makeCase(layer, 'later')]
export async function listCases() {
  return cases
}
export async function run({ cases: asked }) {
  return asked.map((m) =>
    m.itemIds[0] === 'live'
      ? result(m, 'ENV', { reason: 'probe: QA_STAND_URL unset' })
      : result(m, 'PENDING', { reason: 'no oracle yet' })
  )
}
