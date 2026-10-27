// Which navigations of a product window start a desktop sign-in round, and how a first run marks
// the sign-in page (src/signin-doors.js; tasks/todo-desktop-onboard-v2.md, contract 2 and 5).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import doors from '../src/signin-doors.js'

const { signInDoor, firstRunLoginUrl, signInFailedUrl } = doors
const HOME = 'https://cowork.example'

test('Google, GitHub and email on the app origin are sign-in doors', () => {
  assert.deepEqual(signInDoor(`${HOME}/signin/google`, HOME), { email: undefined })
  assert.deepEqual(signInDoor(`${HOME}/signin/github?next=/`, HOME), { email: undefined })
  assert.deepEqual(signInDoor(`${HOME}/signin/email?email=lee%40example.com`, HOME), {
    email: 'lee@example.com'
  })
  assert.deepEqual(signInDoor('/signin/email', HOME), { email: undefined })
})

test('anything else is not a door: other paths, other origins, garbage', () => {
  assert.equal(signInDoor(`${HOME}/signin`, HOME), null)
  assert.equal(signInDoor(`${HOME}/signin?n=abc`, HOME), null)
  assert.equal(signInDoor(`${HOME}/login`, HOME), null)
  assert.equal(signInDoor('https://evil.example/signin/email?email=a@b.c', HOME), null)
  assert.equal(signInDoor('http://cowork.example/signin/google', HOME), null)
  assert.equal(signInDoor('http://[::1', HOME), null)
})

test('first run: the sign-in page gets onboard=1 and keeps its other parameters', () => {
  assert.equal(firstRunLoginUrl(`${HOME}/login`, HOME), `${HOME}/login?onboard=1`)
  assert.equal(
    firstRunLoginUrl(`${HOME}/login?next=%2Fsite%2Fa&email=x%40y.z`, HOME),
    `${HOME}/login?next=%2Fsite%2Fa&email=x%40y.z&onboard=1`
  )
  assert.equal(firstRunLoginUrl(`${HOME}/login#top`, HOME), `${HOME}/login?onboard=1#top`)
})

test('nothing to change: already marked, another page, another origin', () => {
  assert.equal(firstRunLoginUrl(`${HOME}/login?onboard=1`, HOME), null)
  assert.equal(firstRunLoginUrl(`${HOME}/login/`, HOME), null)
  assert.equal(firstRunLoginUrl(`${HOME}/logout`, HOME), null)
  assert.equal(firstRunLoginUrl(`${HOME}/`, HOME), null)
  assert.equal(firstRunLoginUrl('https://other.example/login', HOME), null)
  assert.equal(firstRunLoginUrl('not a url', HOME), null)
})

test('a round that ended without a session sends the window to /login with the reason word', () => {
  assert.equal(
    signInFailedUrl(HOME, { outcome: 'failed', refusal: 'not-admitted' }),
    `${HOME}/login?reason=not-admitted`
  )
  assert.equal(signInFailedUrl(HOME, { outcome: 'denied' }), `${HOME}/login?reason=denied`)
  assert.equal(signInFailedUrl(HOME, { outcome: 'expired' }), `${HOME}/login?reason=expired`)
  assert.equal(
    signInFailedUrl(HOME, { outcome: 'failed', reason: 'redeem answered 404' }),
    `${HOME}/login?reason=failed`
  )
})

test('a first run still marks the reason page with onboard=1, keeping the reason', () => {
  const failed = signInFailedUrl(HOME, { outcome: 'denied' })
  assert.equal(firstRunLoginUrl(failed, HOME), `${HOME}/login?reason=denied&onboard=1`)
})
