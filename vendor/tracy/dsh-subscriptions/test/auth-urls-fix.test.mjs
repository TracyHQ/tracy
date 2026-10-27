import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVendor } from '../lib/vendors/index.js'
import { discoverLocalCliSessions } from '../lib/import-auth.js'

test('cursor authorizeUrl points to https://cursor.com/settings', () => {
  const url = getVendor('cursor').authorizeUrl()
  assert.equal(url, 'https://cursor.com/settings')
})

test('kimi authorizeUrl points to Moonshot console api-keys', () => {
  const url = getVendor('kimi').authorizeUrl()
  assert.equal(url, 'https://platform.moonshot.cn/console/api-keys')
})

test('glm authorizeUrl points to Zhipu usercenter apikeys', () => {
  const url = getVendor('glm').authorizeUrl()
  assert.equal(url, 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys')
})

test('discoverLocalCliSessions detects cursor from cli-config or env', async () => {
  const detected = await discoverLocalCliSessions()
  if (detected.cursor) {
    assert.equal(detected.cursor.provider, 'cursor')
    assert.ok(detected.cursor.path)
  }
})
