// Runner of the focused gate rule tests: copy a passing case, break exactly one thing, expect the gate to name it.
import assert from 'node:assert/strict'
import { checkBrandFile } from '../src/brand-step/save-brand-file.js'
import { loadCase } from './_brand-gate-files.mjs'

/** Rows: [title, case id, mutate({ brand, brief, kit, c }) -> optional { files }, expected field, optional why regex]. */
export async function expectRejected(id, mutate) {
  const c = await loadCase(id)
  const ctx = { brand: structuredClone(c.brand), brief: structuredClone(c.brief), kit: c.kit, c }
  const changed = await mutate(ctx)
  return checkBrandFile({
    brandFile: ctx.brand,
    brief: ctx.brief,
    kit: ctx.kit,
    files: changed?.files ?? c.files
  })
}

export function assertNames(result, field, why) {
  assert.equal(result.ok, false, `the gate accepted a broken file (expected a rejection of ${field})`)
  const hit = result.rejected.filter((r) => r.field === field)
  assert.ok(hit.length, `expected ${field} among ${JSON.stringify(result.rejected.map((r) => r.field))}`)
  if (why)
    assert.ok(
      hit.some((r) => why.test(r.why)),
      `${field}: no reason matches ${why}, got ${JSON.stringify(hit)}`
    )
}

export const lookOf = (brand, file, ground) =>
  brand.logo.look.filter((l) => l.file === file && (!ground || l.ground === ground))
export const slotKey = (brand, where) => brand.name.slots.find((s) => s.where === where)
