import assert from 'node:assert/strict'
import { test } from 'node:test'
import { previewOf, targetUrlOf } from '../src/target-url.mjs'

test('fleet addresses retain their scheme and port in local and hosted builds', () => {
  assert.equal(
    targetUrlOf('http://bakery.localhost:8080/', 'bakery.localhost'),
    'http://bakery.localhost:8080/'
  )
  assert.equal(
    targetUrlOf('http://bakery.tracy.test:8080/', 'bakery.tracy.test'),
    'http://bakery.tracy.test:8080/'
  )
  assert.equal(targetUrlOf('https://bakery.example/', 'bakery.example'), 'https://bakery.example/')
})

test('a target URL cannot point to the source site or carry credentials', () => {
  for (const url of [
    'https://source.example/',
    'https://target.example@source.example/',
    'https://secret@target.example/',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'http://target.example/'
  ]) {
    assert.equal(targetUrlOf(url, 'target.example'), null)
  }
  assert.equal(previewOf({ site: { url: 'https://source.example/' } }), null)
})

test('preview changes only after a stage settles, never for progress messages', () => {
  const job = {
    job: 'one',
    runs: 1,
    startedAt: 'start',
    targetSiteKey: 'target.example',
    targetUrl: 'https://target.example/',
    stages: [{ name: 'seed', status: 'running', note: '1 of 3' }]
  }
  const before = previewOf(job)
  job.stages[0].note = '2 of 3'
  assert.deepEqual(previewOf(job), before)
  job.stages[0] = { name: 'seed', status: 'done', endedAt: 'end' }
  assert.notEqual(previewOf(job).revision, before.revision)
  job.contentRevision = 'committed-content'
  const committed = previewOf(job).revision
  job.runs += 1
  job.stages[0] = { name: 'copy', status: 'done', endedAt: 'later' }
  assert.equal(previewOf(job).revision, committed)
  job.contentRevision = 'revised-content'
  assert.notEqual(previewOf(job).revision, committed)
})
