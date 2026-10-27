// Every page of the invitation and join flow sits in the same card as its confirm step (live on dev
// 04/10/2026: "Decline this invitation?" was in a card, "Invitation declined" was not).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  declineInvitePage,
  expiredInvitePage,
  invalidInvitePage,
  inviteLandingPage,
  messagePage,
  tooManyRequestsPage,
  wrongAccountPage
} from '../src/seats/pages.js'

const SITES = ['tripbylee.tracy.site']
const LANDED = [{ siteKey: 'tripbylee.tracy.site', label: 'tripbylee', outcome: 'granted' }]
const PAGES = {
  'decline confirm': declineInvitePage({ state: 'confirm', siteKeys: SITES, action: '/invite/t/decline' }),
  'decline result': declineInvitePage({ state: 'declined', siteKeys: SITES }),
  'decline already accepted': declineInvitePage({ state: 'already', siteKeys: SITES }),
  'decline withdrawn': declineInvitePage({ state: 'revoked', siteKeys: SITES }),
  'invite landed': inviteLandingPage({
    summary: 'granted',
    role: 'editor',
    sites: LANDED,
    email: 'a@b.test'
  }),
  'invite already': inviteLandingPage({
    summary: 'already',
    role: 'editor',
    sites: LANDED,
    email: 'a@b.test'
  }),
  'invite withdrawn': inviteLandingPage({
    summary: 'revoked',
    role: 'editor',
    sites: LANDED,
    email: 'a@b.test'
  }),
  'invalid link': invalidInvitePage(),
  'expired link': expiredInvitePage(),
  'wrong account': wrongAccountPage({ email: 'a@b.test', loginHref: '/login?next=/' }),
  'too many': tooManyRequestsPage(),
  message: messagePage('Title', 'Body')
}

test('every invitation and join result page uses the card shell of the confirm step', () => {
  for (const [name, html] of Object.entries(PAGES)) {
    assert.match(html, /<div class="card auth-card">/, `${name}: in the card`)
    assert.match(html, /<h1 class="card-title">/, `${name}: the card's title`)
  }
})
