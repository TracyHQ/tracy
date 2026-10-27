/**
 * REG-PR-1145: the 0.5.1 fixes of the first-run screen. S1 runs the notify bridge's suite (Linux
 * settings target: GNOME's control centre when present, `settingsTarget: false` otherwise) and the
 * screen's flow suite (a previous Done counts the look step as done when reopened). S2 checks the
 * committed plugin bundle matches its source.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
let failed = 0
const step = (label, cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  const ok = r.status === 0
  if (!ok) failed += 1
  console.log(`${ok ? 'ok' : 'not ok'} - ${label}`)
  if (!ok)
    console.log(
      (r.stdout + r.stderr)
        .split('\n')
        .filter((l) => /not ok|✖|Error/.test(l))
        .slice(0, 12)
        .join('\n')
    )
}
step(
  'S1a notify bridge suite (Linux settings target)',
  'node',
  ['--test', 'test/notify-bridge.test.mjs'],
  path.join(ROOT, 'packages/desktop/tracy-desktop')
)
step(
  'S1b onboarding flow suite (prior Done counts the look step)',
  'node',
  ['--test', 'test/flow.test.mjs', 'test/mount.test.mjs'],
  path.join(ROOT, 'packages/ui/tracy-onboard')
)
step(
  'S2 committed bundle matches its source',
  'node',
  ['scripts/build-client.mjs', '--check'],
  path.join(ROOT, 'packages/ui/tracy-onboard')
)
console.log(failed === 0 ? 'PASS' : `FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
