// Shared builders for the fake layers used by the runner selftests.
import fs from 'node:fs/promises'
import path from 'node:path'

export function makeCase(layer, key, overrides = {}) {
  return {
    id: `QA-${layer.toUpperCase()}-${key}-happy`,
    itemIds: [key],
    requirement: `requirement of ${key}`,
    oracle: { source: 'selftest', ref: 'fixture', invariant: `${key} holds` },
    edgeTags: ['happy'],
    targets: ['local', 'dev', 'prod'],
    effects: { reads: ['fixture'], writes: [], mail: false, model: false, containers: false },
    prerequisites: [],
    assertionIds: [`${key}-a1`],
    redProof: null,
    legacyIds: [],
    ...overrides
  }
}

export async function writeProof(outDir, id, content = 'assertion a1 failed on broken code\n') {
  const rel = path.join('red', `${id}.log`)
  await fs.mkdir(path.join(outDir, 'red'), { recursive: true })
  await fs.writeFile(path.join(outDir, rel), content)
  return rel
}

export const result = (manifest, verdict, extra = {}) => ({
  id: manifest.id,
  verdict,
  reason: verdict === 'PASS' ? '' : `${verdict} reason`,
  assertionIds: manifest.assertionIds,
  evidence: [],
  durationMs: 1,
  redProof: null,
  ...extra
})

export async function passWithProof(manifest, outDir) {
  const log = await writeProof(outDir, manifest.id)
  return result(manifest, 'PASS', {
    redProof: { kind: 'mutation', ref: 'mutant-1', assertionId: manifest.assertionIds[0], log }
  })
}
