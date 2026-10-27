import { makeCase } from '../../kit.mjs'
export const layer = 'badmanifest'
export async function listCases() {
  const broken = makeCase(layer, 'x')
  delete broken.effects
  return [broken]
}
export async function run() {
  throw new Error('must never run')
}
