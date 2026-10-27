import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composeLink, usageFull } from '../src/client/outreach-model.ts'

const message = 'Xin chào & hello?\nA + B #1 — https://demo.example/\nLee'
const subject = 'Demo: Phở & Friends'

test('compose links preserve punctuation, accents and line breaks in the draft; none sends it', () => {
  const email = new URL(composeLink('email', 'owner+demo@example.test', message, subject))
  assert.equal(email.protocol, 'mailto:')
  assert.equal(decodeURIComponent(email.pathname), 'owner+demo@example.test')
  assert.equal(email.searchParams.get('body'), message)
  assert.equal(email.searchParams.get('subject'), subject)
  const gmail = new URL(composeLink('gmail', 'owner+demo@example.test', message, subject))
  assert.equal(gmail.hostname, 'mail.google.com')
  assert.equal(gmail.searchParams.get('view'), 'cm')
  assert.equal(gmail.searchParams.get('body'), message)
  assert.equal(gmail.searchParams.get('to'), 'owner+demo@example.test')
  const whatsapp = new URL(
    composeLink('whatsapp', 'https://api.whatsapp.com/send?phone=84901234567', message, subject)
  )
  assert.equal(whatsapp.hostname, 'wa.me')
  assert.equal(whatsapp.pathname, '/84901234567')
  assert.equal(whatsapp.searchParams.get('text'), message)
})

test('known other chats open their existing URL; invalid hosts, credentials and scripts are refused', () => {
  for (const [channel, url] of [
    ['zalo', 'https://zalo.me/84901234567'],
    ['messenger', 'https://m.me/restaurant'],
    ['instagram', 'https://ig.me/m/restaurant'],
    ['line', 'https://line.me/R/ti/p/restaurant']
  ]) {
    assert.equal(composeLink(channel, url, message, subject), url)
  }
  for (const url of [
    'javascript:alert(1)',
    'http://m.me/restaurant',
    'https://m.me.evil.test/restaurant',
    'https://owner:secret@m.me/restaurant'
  ]) {
    assert.equal(composeLink('messenger', url, message, subject), null)
  }
  assert.equal(composeLink('whatsapp', 'https://evil.test/84901234567', message, subject), null)
  assert.equal(composeLink('phone', 'https://example.test/', message, subject), null)
})

test('Instagram and Facebook profile contacts open direct chat routes instead of profiles', () => {
  assert.equal(
    composeLink('instagram', 'https://www.instagram.com/Restaurant.Name/?igsh=tracking', message, subject),
    'https://ig.me/m/restaurant.name'
  )
  assert.equal(
    composeLink('messenger', 'https://www.facebook.com/restaurant.name/', message, subject),
    'https://m.me/restaurant.name'
  )
  assert.equal(
    composeLink('messenger', 'https://www.facebook.com/profile.php?id=138592309', message, subject),
    'https://m.me/138592309'
  )
  assert.equal(
    composeLink('instagram', 'https://instagram.com/direct/t/138592309/', message, subject),
    'https://instagram.com/direct/t/138592309/'
  )
  assert.equal(
    composeLink('messenger', 'https://facebook.com/messages/t/138592309/', message, subject),
    'https://facebook.com/messages/t/138592309/'
  )
  for (const [channel, url] of [
    ['instagram', 'https://instagram.com/p/not-a-profile'],
    ['instagram', 'https://instagram.com/accounts/login/'],
    ['messenger', 'https://facebook.com/messages/']
  ]) {
    assert.equal(composeLink(channel, url, message, subject), null)
  }
})

test('daily usage disables a batch before it would exceed the cap; zero stays uncapped', () => {
  assert.equal(usageFull({ used: 19, limit: 20, resetsAt: '' }), false)
  assert.equal(usageFull({ used: 19, limit: 20, resetsAt: '' }, 2), true)
  assert.equal(usageFull({ used: 20, limit: 20, resetsAt: '' }), true)
  assert.equal(usageFull({ used: 300, limit: 0, resetsAt: '' }, 100), false)
})
