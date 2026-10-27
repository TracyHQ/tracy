/**
 * PHP for the case scripts whose suites run real PHP (`scripts/test-support/php.mjs` and friends).
 *
 * Those suites use a local `php` when PATH has one (CI's runner image carries `php-cli`), and fall
 * back to a `php:8.3-cli-alpine` container otherwise. The container fallback copies the package in
 * but cannot see files a test writes on the host while it runs (e.g. the rate-limit store of
 * `wp-contact-mail.test.mjs`, written under the OS temporary folder), so on a machine with docker
 * and no `php` those tests fail for a reason that is not the code.
 *
 * `phpEnv()` returns the environment to run such a suite with: unchanged when `php` is on PATH;
 * otherwise PATH gains a `php` that runs the same image with the repository and a fresh temporary
 * folder bind-mounted at their own paths (and TMPDIR pointed at that folder), so PHP sees exactly
 * the paths the test wrote. It is still real PHP 8.3; only where it runs changes.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT, cannotRun } from './lib.mjs'

const IMAGE = 'php:8.3-cli-alpine'

const has = (bin) => spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).status === 0

/**
 * The environment a PHP suite runs with on this machine.
 * @returns {{env: Record<string, string | undefined>, how: string, cleanup: () => void}} env to pass, what it uses, and a clean-up.
 */
export function phpEnv() {
  if (has('php')) return { env: { ...process.env }, how: 'local php', cleanup: () => {} }
  if (!has('docker') || spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0)
    cannotRun('neither `php` on PATH nor a docker daemon answering `docker info`')
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'reg-php-'))
  const bin = join(base, 'bin')
  const tmp = join(base, 'tmp')
  mkdirSync(bin)
  mkdirSync(tmp)
  const shim = join(bin, 'php')
  writeFileSync(
    shim,
    [
      '#!/bin/sh',
      `exec docker run --rm -i -v '${ROOT}:${ROOT}' -v '${tmp}:${tmp}' -e 'TMPDIR=${tmp}' -w "$PWD" ${IMAGE} php "$@"`,
      ''
    ].join('\n')
  )
  chmodSync(shim, 0o755)
  return {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, TMPDIR: tmp },
    how: `${IMAGE} through a php shim (no php on PATH)`,
    cleanup: () => rmSync(base, { recursive: true, force: true })
  }
}
