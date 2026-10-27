// E9's local half: a copy of a real contract with its sidecar removed, made stale (one base file changed) and made
// malformed, read by the same reader the Road to live step uses (`apps/tracy-web/src/lib/slot-roles.js`). The copy
// lives in a fresh temporary folder; nothing in the repository changes.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { slotRolesOf } from '../../../../apps/tracy-web/src/lib/slot-roles.js'
import { slotRolesStep } from '../../../../apps/tracy-web/src/lib/slot-roles-step.js'

/**
 * @param {string} contractDir - a contract with a ready sidecar
 * @returns {{ missing: any, stale: any, invalid: any, ready: any }} each `{ state, step: {state, code} }`
 */
export function sidecarStates(contractDir) {
  const root = mkdtempSync(join(tmpdir(), 'e2e-slot-roles-'))
  const copy = (name) => {
    const dir = join(root, name)
    cpSync(contractDir, dir, { recursive: true })
    return dir
  }
  try {
    const ready = copy('ready')
    const missing = copy('missing')
    rmSync(join(missing, 'slot-roles.json'))
    const stale = copy('stale')
    const firstBase = Object.keys(
      JSON.parse(readFileSync(join(stale, 'slot-roles.json'), 'utf8')).baseFiles
    )[0]
    writeFileSync(join(stale, firstBase), `${readFileSync(join(stale, firstBase), 'utf8')}\n`)
    const invalid = copy('invalid')
    writeFileSync(join(invalid, 'slot-roles.json'), '{ "schemaVersion": ')
    const judge = (dir) => {
      const roles = slotRolesOf(dir)
      // A release not on Design inspiration yet, its earlier steps passed: the step's own verdict, unwaited.
      const release = { tag: 'quickstart/tracy-base/j6', platform: 'joomla' }
      const step = slotRolesStep(
        (step, state, code, params) => ({ step, state, code, params }),
        () => undefined,
        {
          release,
          version: null,
          slotRoles: roles
        }
      )
      return { state: roles.state, step: { state: step.state, code: step.code } }
    }
    return { ready: judge(ready), missing: judge(missing), stale: judge(stale), invalid: judge(invalid) }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
