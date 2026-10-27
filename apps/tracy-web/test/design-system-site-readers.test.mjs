/**
 * The site browser's Design system panel reads the running site (`sites/design-system-site-readers.js`): the
 * marker after a write, the words of its cards, the fonts a worn system needs. A site on ANOTHER host must be
 * read at its public address, never at `siteTarget`'s remote name `<label>.<host>-sites.<domain>` (a two-level
 * name the edge certificate does not cover: every read of a `fleet01` site failed its TLS handshake there,
 * measured 14/10/2026). A site on THIS host stays read on its own web container.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { designSystemSiteReaders } from '../src/sites/design-system-site-readers.js'

const config = { hostName: 'dev', siteDomain: 'tracy.site', origin: 'https://cowork.tracy.site' }

/** A fetch that records every URL asked and answers a page carrying the slot marker. */
function recorder() {
  const asked = []
  const fetchImpl = async (url) => {
    asked.push(String(url))
    return new Response('<html><!-- tracy-ds-slot: moxie --><body>Hi</body></html>', { status: 200 })
  }
  return { asked, fetchImpl }
}

const remote = { host: 'fleet01', label: 'shop', platform: 'joomla', address: 'https://shop.tracy.site/' }

test('a site on another host is read at its public address by seen, home and glyphReader', async () => {
  const { asked, fetchImpl } = recorder()
  const readers = designSystemSiteReaders({ config, fetchImpl })
  assert.equal(await readers.seen(remote, 'moxie'), true)
  assert.match(await readers.home(remote), /Hi/)
  const glyphs = await readers.glyphReader(remote)
  assert.equal(glyphs.base, 'https://shop.tracy.site/')
  await glyphs.text('/css/template.css')
  assert.deepEqual(asked, [
    'https://shop.tracy.site/',
    'https://shop.tracy.site/',
    'https://shop.tracy.site/css/template.css'
  ])
  assert.ok(!asked.some((u) => u.includes('-sites.')), `no read at the internal name: ${asked.join(', ')}`)
})

test('a site on another host with no address of its own is read at the address it was born with', async () => {
  const { asked, fetchImpl } = recorder()
  await designSystemSiteReaders({ config, fetchImpl }).home({ ...remote, address: null })
  assert.deepEqual(asked, ['https://shop.tracy.site/'])
})

test('a site on this host is read on its own web container', async () => {
  const { asked, fetchImpl } = recorder()
  const readers = designSystemSiteReaders({ config, fetchImpl })
  await readers.seen({ ...remote, host: 'dev' }, 'moxie')
  await readers.home({ ...remote, host: 'dev', platform: 'emdash' })
  assert.deepEqual(asked, ['http://shop-web-1/', 'http://shop-web-1:4321/'])
})

test('the preview popup frames the page at the same address the panel reads', () => {
  const readers = designSystemSiteReaders({ config })
  assert.equal(readers.readOrigin(remote).href, 'https://shop.tracy.site/')
  assert.equal(readers.publicOf({ ...remote, address: null }), 'https://shop.tracy.site/')
})

test('public local asset URLs resolve through the site container without changing their path or query', async () => {
  const { siteReadUrl } = await import('../src/sites/resolver.js')
  const site = {
    host: 'local',
    label: 'maru-udon',
    platform: 'emdash',
    address: 'https://maru-udon.tracy.test:8443/'
  }
  const config = { hostName: 'local', siteDomain: 'tracy.test' }
  assert.equal(
    siteReadUrl(site, config, '/_emdash/api/media/file/photo.jpg?v=2').href,
    'http://maru-udon-web-1:4321/_emdash/api/media/file/photo.jpg?v=2'
  )
  assert.equal(
    siteReadUrl(site, config, 'https://fonts.googleapis.com/css?family=Inter').hostname,
    'fonts.googleapis.com'
  )
  const remote = { ...site, host: 'fleet01', address: 'https://maru.example/' }
  assert.equal(siteReadUrl(remote, config, '/photo.jpg').href, 'https://maru.example/photo.jpg')
})

test('PHP site readers clear a public custom port when resolving the local container', async () => {
  const { siteReadUrl } = await import('../src/sites/resolver.js')
  for (const platform of ['wordpress', 'joomla']) {
    const site = {
      host: 'local',
      label: 'reader-test',
      platform,
      address: 'https://reader-test.tracy.test:8443/'
    }
    const local = { hostName: 'local', siteDomain: 'tracy.test' }
    assert.equal(
      siteReadUrl(site, local, '/wp-json/wp/v2/types?context=view').href,
      'http://reader-test-web-1/wp-json/wp/v2/types?context=view'
    )
    assert.equal(
      siteReadUrl({ ...site, host: 'remote' }, local, '/photo.jpg').href,
      'https://reader-test.tracy.test:8443/photo.jpg'
    )
  }
})
