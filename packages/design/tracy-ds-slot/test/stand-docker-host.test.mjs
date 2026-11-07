/**
 * A stand bind-mounts a folder of this machine: against a Docker engine elsewhere it came up as the empty Joomla
 * installer and a verify compared two of them as equal. The stand refuses such an engine up front.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dockerEndpoint, remoteEngineProblem } from '../src/stand-docker-host.mjs'

test('a local socket runs a stand', () => {
  assert.equal(
    remoteEngineProblem(dockerEndpoint({ dockerHost: '', contextEndpoint: 'unix:///var/run/docker.sock' })),
    null
  )
  assert.equal(remoteEngineProblem(dockerEndpoint({})), null)
})

test('an engine over ssh or tcp, from the context or from DOCKER_HOST, is refused with the reason', () => {
  assert.match(
    remoteEngineProblem(dockerEndpoint({ contextEndpoint: 'ssh://builder' })),
    /not on this machine/
  )
  assert.match(
    remoteEngineProblem(
      dockerEndpoint({ dockerHost: 'tcp://docker.example:2376', contextEndpoint: 'unix:///x.sock' })
    ),
    /tcp:\/\/docker\.example:2376/
  )
})
