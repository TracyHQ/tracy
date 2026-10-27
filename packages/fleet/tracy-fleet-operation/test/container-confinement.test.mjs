#!/usr/bin/env node
/**
 * Reading a web container's confinement — the check that stands between "the agent has a shell in
 * the site's web container" and "the agent is root on the host".
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/container-confinement.test.mjs
 *
 * 🔒 WHY THIS IS WORTH A TEST FILE. The socket proxy (dsh/docker-proxy.haproxy.cfg) bounds WHICH
 * container may be exec'd into. It cannot bound the exec's request body, so a privileged root exec
 * into `<label>-web-1` is reachable — measured 06/09/2026 through the committed config: uid 0 with
 * CapEff 000001ffffffffff, against 0000000000000000 for a normal exec. What stopped the escape in
 * that same measurement was the web container's own seccomp/AppArmor profile. This parsing is what
 * makes losing that profile refuse an attach instead of passing unnoticed.
 *
 * The inputs are `docker inspect --format` output copied verbatim from Docker 29.4.1 on 06/09 —
 * a Go template renders a nil slice as `[]` and a populated one space-separated inside brackets,
 * which is neither JSON nor a shell list, and inventing the shape is how a check like this comes
 * out green on a container it should refuse.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const LIB = fileURLToPath(new URL('../scripts/lib/container-confinement.sh', import.meta.url))

/** The function, called exactly the way attach-site.sh calls it. */
function problem(privileged, securityOpt) {
  return execFileSync(
    'bash',
    ['-c', '. "$1"; container_confinement_problem "$2" "$3"', '_', LIB, privileged, securityOpt],
    { encoding: 'utf8' }
  ).replace(/\n$/, '')
}

/** The way attach-site.sh splits one `docker inspect` line into the two fields. */
function fromInspectLine(line) {
  return execFileSync(
    'bash',
    ['-c', '. "$1"; container_confinement_problem "${2%% *}" "${2#* }"', '_', LIB, line],
    { encoding: 'utf8' }
  ).replace(/\n$/, '')
}

test('a default container passes — and so does a hardened one', () => {
  // Measured: `docker run -d alpine` and `docker run -d --security-opt no-new-privileges:true …`
  assert.equal(fromInspectLine('false []'), '')
  assert.equal(fromInspectLine('false [no-new-privileges:true]'), '')
  // The shape render-compose.sh now writes for every platform.
  assert.equal(problem('false', '[no-new-privileges:true]'), '')
})

test('--privileged is refused, and the reason says what it costs', () => {
  // Measured: docker adds `label=disable` itself when a container is privileged, so the option
  // list alone does NOT read as unconfined — the Privileged field is the one that answers.
  const said = fromInspectLine('true [label=disable]')
  assert.match(said, /privileged/)
  assert.notEqual(said, '')
  assert.notEqual(problem('true', '[]'), '')
  assert.notEqual(problem('True', '[]'), '')
})

test('seccomp=unconfined is refused', () => {
  const said = fromInspectLine('false [seccomp=unconfined]')
  assert.match(said, /seccomp=unconfined/)
})

test('apparmor=unconfined is refused', () => {
  const said = fromInspectLine('false [apparmor=unconfined]')
  assert.match(said, /apparmor=unconfined/)
})

test('both at once is refused, whichever order docker prints them in', () => {
  // Measured verbatim: `--security-opt seccomp=unconfined --security-opt apparmor=unconfined`.
  assert.notEqual(fromInspectLine('false [seccomp=unconfined apparmor=unconfined]'), '')
  assert.notEqual(fromInspectLine('false [apparmor=unconfined seccomp=unconfined]'), '')
})

test('a CUSTOM profile is not "unconfined" and must not be refused', () => {
  // `seccomp=/etc/docker/profile.json` contains neither forbidden string. Refusing it would be a
  // check nobody can satisfy: the operator did the more careful thing and got told off for it.
  assert.equal(problem('false', '[seccomp=/etc/docker/tracy-web.json]'), '')
  assert.equal(problem('false', '[label=user:tracy]'), '')
})

test('an empty or missing field is not read as a problem', () => {
  // `docker inspect` on a container with no options prints `[]`; a caller that lost the field
  // entirely passes an empty string. Neither means "unconfined", and treating them as a refusal
  // would block every attach on the day the format changes.
  assert.equal(problem('false', ''), '')
  assert.equal(problem('', ''), '')
})

test('the answer is a REASON, not a boolean — the operator has to know what to undo', () => {
  for (const line of ['true [label=disable]', 'false [seccomp=unconfined]', 'false [apparmor=unconfined]']) {
    const said = fromInspectLine(line)
    assert.ok(said.length > 20, `${line} -> ${said}`)
    assert.ok(!/^(true|false|1|0)$/.test(said), `${line} -> ${said}`)
  }
})
