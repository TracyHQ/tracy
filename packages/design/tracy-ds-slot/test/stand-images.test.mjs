import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { standImagesFrom } from '../src/stand-images.mjs'

const policy = readFileSync(
  new URL('../../../fleet/tracy-fleet-operation/web/IMAGE_TAGS', import.meta.url),
  'utf8'
)
const valid =
  'wordpress:php8.3-apache=tracy/web-wordpress:php8.3-apache-20261027-r1\njoomla:6-apache=tracy/web-joomla:6-apache-20261027-r1\n'

test('stand images follow the authoritative fleet policy and preserve exact CMS bases', () => {
  const result = standImagesFrom(policy)
  assert.equal(result.joomla, 'tracy/web-joomla:6-apache-20261027-r1')
  assert.equal(result.wordpress, 'tracy/web-wordpress:php8.3-apache-20261027-r1')
  assert.notEqual(result.joomla, 'tracy/web-joomla:6-apache-20260923-r1')
  assert.equal(result.db, 'mariadb:11')
  assert.deepEqual(standImagesFrom(valid + 'joomla=tracy/web-joomla:5-apache-20261027-r1\n'), result)
})

test('stand image policy refuses missing, ambiguous, malformed and mismatched base declarations', () => {
  assert.throws(() => standImagesFrom(''), /exactly one wordpress:php8.3-apache/)
  assert.throws(() => standImagesFrom(valid.split('\n')[0]), /exactly one joomla:6-apache/)
  assert.throws(() => standImagesFrom(valid + valid.split('\n')[1] + '\n'), /found 2/)
  for (const bad of [
    'joomla:6-apache =tracy/web-joomla:6-apache-20261027-r1',
    'joomla:6-apache=joomla:6-apache',
    'joomla:6-apache=tracy/web-joomla:5-apache-20261027-r1',
    'joomla:6-apache=tracy/web-joomla:latest',
    'joomla:6-apache=tracy/web-joomla:6-apache-20261027-r1=extra'
  ]) {
    assert.throws(() => standImagesFrom(valid.split('\n')[0] + '\n' + bad), /malformed pinned image/)
  }
})
