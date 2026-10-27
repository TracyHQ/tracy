import fs from 'node:fs/promises'
import path from 'node:path'
import { makeCase, passWithProof } from '../../kit.mjs'
export const layer = 'prodwrite'
const cases = [
  makeCase(layer, 'reader'),
  makeCase(layer, 'writer', {
    effects: { reads: [], writes: ['site db'], mail: false, model: false, containers: false }
  }),
  makeCase(layer, 'mailer', {
    effects: { reads: [], writes: [], mail: true, model: false, containers: false }
  }),
  makeCase(layer, 'modeler', {
    effects: { reads: [], writes: [], mail: false, model: true, containers: false }
  }),
  makeCase(layer, 'boxer', {
    effects: { reads: [], writes: [], mail: false, model: false, containers: true }
  }),
  makeCase(layer, 'localonly', { targets: ['local'] })
]
export async function listCases() {
  return cases
}
export async function run({ cases: asked, outDir }) {
  await fs.writeFile(path.join(outDir, 'received.json'), JSON.stringify(asked.map((m) => m.id)))
  return Promise.all(asked.map((m) => passWithProof(m, outDir)))
}
