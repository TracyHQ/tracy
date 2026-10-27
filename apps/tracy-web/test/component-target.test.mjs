// Which copy of an imported site the Apply door writes to. The import registers the component on
// the CUSTOMER'S LIVE site — that is where the extension was installed and its token read — and
// until 14/09 every `tracy_site` call went there: measured on fijitrips.example, an agent working
// in the site's Tracy workspace disabled a plugin on the production site. The fleet copy carries
// the same component with the same token (the database was copied), so the endpoint keeps its
// path and moves to the copy's origin.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyEndpointFor, isOnCopy } from '../src/sites/component-target.js'

const config = { hostName: 'local', siteDomain: 'tracy.test' }
const joomla = { label: 'fijitrips-example-5254d120', host: 'local', platform: 'joomla' }
const LIVE = 'https://fijitrips.example/index.php?option=com_claudecowork&task=api.exec&format=json'

test('the copy endpoint keeps path and query, and takes the fleet copy origin', () => {
  assert.equal(
    copyEndpointFor(LIVE, joomla, config),
    'http://fijitrips-example-5254d120-web-1/index.php?option=com_claudecowork&task=api.exec&format=json'
  )
})

test('a WordPress REST route moves the same way', () => {
  const wp = { label: 'shop-example-com-1', host: 'local', platform: 'wordpress' }
  assert.equal(
    copyEndpointFor('https://shop.example.com/wp-json/claude-cowork/v1/exec', wp, config),
    'http://shop-example-com-1-web-1/wp-json/claude-cowork/v1/exec'
  )
})

test('a site on another host moves to that host’s site address', () => {
  const remote = { ...joomla, host: 'prod1' }
  assert.equal(
    copyEndpointFor(LIVE, remote, config),
    'https://fijitrips-example-5254d120.prod1-sites.tracy.test/index.php?option=com_claudecowork&task=api.exec&format=json'
  )
})

test('isOnCopy: only the fleet copy origin counts', () => {
  assert.equal(isOnCopy(LIVE, joomla, config), false)
  assert.equal(isOnCopy(copyEndpointFor(LIVE, joomla, config), joomla, config), true)
  assert.equal(isOnCopy('not a url', joomla, config), false)
})

test('an endpoint that is not a URL has no copy', () => {
  assert.equal(copyEndpointFor('not a url', joomla, config), null)
})

// Issue #165: a long imported label's `<label>-web-1` is past the 63-octet DNS-label cap, so the
// Apply door must move the endpoint to the bounded alias `render-compose.sh` puts on the network —
// never to the over-long container name, which fails ENOTFOUND before a byte leaves tracy-web.
test('a long label moves the endpoint to the bounded #165 alias', () => {
  const long = {
    label: 'synthetic-imported-site-dns-length-regression-165-0a1b2c3def',
    host: 'local',
    platform: 'joomla'
  }
  const copy = copyEndpointFor(LIVE, long, config)
  assert.equal(
    copy,
    'http://tracy-web-df7e98761c149c8be701bc8688f7db77/index.php?option=com_claudecowork&task=api.exec&format=json'
  )
  assert.ok(!copy.includes(`${long.label}-web-1`))
  assert.equal(isOnCopy(copy, long, config), true)
})
