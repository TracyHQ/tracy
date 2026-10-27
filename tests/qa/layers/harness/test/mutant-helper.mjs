import { MUTANTS } from '../mutations.mjs'

/** Apply one catalogue mutant into `scratch` (selftests only). */
export async function applyMutantForTest(id, scratch) {
  const mutant = MUTANTS.find((m) => m.id === id)
  if (mutant === undefined) throw new Error(`no mutant ${id}`)
  return await mutant.prepare(scratch, 'harness.fence.read.traversal-abs')
}
