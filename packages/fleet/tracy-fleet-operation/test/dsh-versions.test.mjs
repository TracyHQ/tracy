#!/usr/bin/env node
/**
 * `provision/dsh-versions.mjs` — the read door behind `POST /dsh-versions`.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/dsh-versions.test.mjs
 *
 * The script runs ON a fleet host and shells out to docker, so what is tested here is everything
 * EXCEPT the shelling out: the parsing, the shape of the answer, and the two refusals that matter.
 *
 * 🔒 THE ENV FILE IS NOT A PAYLOAD. `/etc/tracy/host-dsh.env` is handed to the container whole
 * (`host-dsh.yml` lists it as `env_file`), and its own header says it plainly: everything in it is
 * printed by `docker inspect tracy-dsh` to anyone in the docker group. Three keys are wanted here —
 * the image and its two tags — and a parser that returned the file would put whatever a later
 * editor adds to it through a Worker and onto a web page. So the allow-list is tested, not the
 * parser's cleverness.
 *
 * ⚠ ABSENT IS AN ANSWER, and it is the reason this screen exists at all. A host that cannot say
 * what it runs must come back saying that, not throw: `fleet.js` in the old harness put it as "a
 * host that does not answer is a ROW, not an exception", and the same rule has to hold one level
 * down, or the row arrives empty with nothing to explain it.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { packagesFrom, payloadFrom, tagsFrom } from '../scripts/provision/dsh-versions.mjs'

const ENV_FILE = `# a comment
DSH_IMAGE_TAG=2026-09-07-a1b2c3d
#DSH_IMAGE_TAG_PREVIOUS=2026-09-05-9999999
DSH_IMAGE_TAG_PREVIOUS=2026-09-06-deadbee
HOST_AGENT_HOSTNAME=contabo-agent.tracy.ai
MCP_SEAT_SECRET=this-must-never-leave-the-host
`

test('tagsFrom reads the three keys it wants and nothing else', () => {
  const tags = tagsFrom(ENV_FILE)
  assert.equal(tags.tag, '2026-09-07-a1b2c3d')
  assert.equal(tags.previous, '2026-09-06-deadbee')
  assert.equal(tags.image, 'ghcr.io/tracyhq/tracy-dsh')
  // The allow-list, stated as an assertion rather than a comment: a secret that wandered into the
  // env file must not reach the answer, whatever it is called.
  assert.deepEqual(Object.keys(tags).sort(), ['image', 'previous', 'tag'])
  assert.ok(!JSON.stringify(tags).includes('this-must-never-leave-the-host'))
})

test('a commented-out line is not a value', () => {
  const tags = tagsFrom('#DSH_IMAGE_TAG=2026-01-01-commented\nDSH_IMAGE_TAG=real\n')
  assert.equal(tags.tag, 'real')
})

test('DSH_IMAGE overrides the GHCR default, because a host may run a local build', () => {
  assert.equal(tagsFrom('DSH_IMAGE=tracy/dsh\nDSH_IMAGE_TAG=dev\n').image, 'tracy/dsh')
})

test('an env file that says nothing yields nulls, not a throw', () => {
  const tags = tagsFrom('')
  assert.equal(tags.tag, null)
  assert.equal(tags.previous, null)
  assert.equal(tags.image, 'ghcr.io/tracyhq/tracy-dsh')
})

test('packagesFrom sorts by name and keeps name with version', () => {
  const found = packagesFrom([
    { name: '@tracy/dsh-webroot-read', version: '0.3.1' },
    { name: '@tracy/dsh-native-bundle', version: '0.9.6' }
  ])
  assert.deepEqual(found, [
    { name: '@tracy/dsh-native-bundle', version: '0.9.6' },
    { name: '@tracy/dsh-webroot-read', version: '0.3.1' }
  ])
})

test('a package.json with no version is reported as null, never guessed', () => {
  // The Dockerfile copies plugin directories verbatim and runs no build in them (CLAUDE.md RULE
  // #3), so a directory arriving without a version is a real state of the image, not an error to
  // paper over. `null` says "the image has this package and it does not state a version".
  assert.deepEqual(packagesFrom([{ name: '@tracy/dsh-brand', version: undefined }]), [
    { name: '@tracy/dsh-brand', version: null }
  ])
})

test('payloadFrom reports a running container', () => {
  const payload = payloadFrom({
    host: 'contabo',
    tags: { image: 'ghcr.io/tracyhq/tracy-dsh', tag: '2026-09-07-a1b2c3d', previous: null },
    inspect: {
      State: { Status: 'running', Health: { Status: 'healthy' }, StartedAt: '2026-09-08T10:00:00Z' },
      Config: { Image: 'ghcr.io/tracyhq/tracy-dsh:2026-09-07-a1b2c3d' }
    },
    packages: [{ name: '@tracy/dsh-native-bundle', version: '0.9.6' }]
  })
  assert.equal(payload.host, 'contabo')
  assert.equal(payload.container.status, 'running')
  assert.equal(payload.container.health, 'healthy')
  assert.equal(payload.image.tag, '2026-09-07-a1b2c3d')
  assert.equal(payload.packages.length, 1)
  assert.equal(payload.error, null)
})

test('a container that is not there is a payload, not a throw', () => {
  const payload = payloadFrom({
    host: 'do',
    tags: { image: 'ghcr.io/tracyhq/tracy-dsh', tag: null, previous: null },
    inspect: null,
    packages: []
  })
  assert.equal(payload.container.status, 'absent')
  assert.equal(payload.container.health, null)
  assert.equal(payload.packages.length, 0)
  assert.equal(payload.host, 'do')
})

test('a container with no healthcheck reports null health, not "unhealthy"', () => {
  // Two different facts, and conflating them would put a red dot next to a healthy machine.
  const payload = payloadFrom({
    host: 'do',
    tags: { image: 'x', tag: 't', previous: null },
    inspect: { State: { Status: 'running', StartedAt: '2026-09-08T10:00:00Z' }, Config: { Image: 'x:t' } },
    packages: []
  })
  assert.equal(payload.container.health, null)
  assert.equal(payload.container.status, 'running')
})

test('the running image is reported as docker states it, beside what the env file claims', () => {
  // These disagree exactly when a deploy half-succeeded: the env file was rewritten and the
  // container was not restarted. The screen can only show that if both are carried.
  const payload = payloadFrom({
    host: 'contabo',
    tags: { image: 'ghcr.io/tracyhq/tracy-dsh', tag: '2026-09-08-newtag', previous: '2026-09-07-old' },
    inspect: {
      State: { Status: 'running', StartedAt: '2026-09-07T10:00:00Z' },
      Config: { Image: 'ghcr.io/tracyhq/tracy-dsh:2026-09-07-old' }
    },
    packages: []
  })
  assert.equal(payload.image.tag, '2026-09-08-newtag')
  assert.equal(payload.container.image, 'ghcr.io/tracyhq/tracy-dsh:2026-09-07-old')
})
