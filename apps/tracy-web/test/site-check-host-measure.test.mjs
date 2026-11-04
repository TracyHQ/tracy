// The site check's way to the host: a Joomla site without URL rewriting answers only under /index.php, so the asked pages
// are sent there like the host does for the planned ones. Everything here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hostMeasure } from '../src/site-check/host-measure.js'

function measure(platform) {
  const sent = []
  const host = hostMeasure({
    hostCall: async (_config, _host, _path, body) => (sent.push(body), { ok: true, body: { checks: [] } }),
    config: { defaultHost: 'host.example.test' },
    site: { label: 'bench-site', platform, port: 8080 },
    selfNames: () => ({})
  })
  return { host, sent }
}

test('a Joomla site is asked for its pages under /index.php, home and prefixed paths as they are', async () => {
  const { host, sent } = measure('joomla')
  await host({ pages: ['/', '/classes', '/index.php/plans', '/about-us/contact'], plan: ['/price'] })
  assert.deepEqual(sent[0].pages, [
    '/',
    '/index.php/classes',
    '/index.php/plans',
    '/index.php/about-us/contact'
  ])
  assert.deepEqual(sent[0].plan, ['/price'])
})

test('another platform is asked for the paths it was given', async () => {
  const { host, sent } = measure('wordpress')
  await host({ pages: ['/', '/classes'] })
  assert.deepEqual(sent[0].pages, ['/', '/classes'])
})

test('a call with no pages sends none', async () => {
  const { host, sent } = measure('joomla')
  await host({ discover: false })
  assert.equal('pages' in sent[0], false)
})
