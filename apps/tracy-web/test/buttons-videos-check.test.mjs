// The final checks of buttons, videos and page names (spec TracyHQ/tracy#189 round 9, class C), on served pages of an
// invented ceramics studio.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkButtonsVideos } from '../src/opportunities-build/buttons-videos-check.js'

const sitePlan = {
  channels: [{ kind: 'message', href: 'https://ig.me/m/kiln.and.clay', label: 'Message us on Instagram' }]
}
const page = (path, body, head = '') => ({
  path,
  status: 200,
  html: `<html><head>${head}</head><body class="nav-breakpoint-lg">${body}</body></html>`
})

test('a shown play control with no video id is a finding; one the leftover block hides is not', () => {
  const body = '<a class="video-btn" data-src="https://www.youtube.com/embed/">play</a>'
  const shown = checkButtonsVideos({ pages: [page('/classes/wheel', body)], sitePlan })
  assert.deepEqual(
    shown.map((f) => f.kind),
    ['empty-video']
  )
  const hidden = checkButtonsVideos({
    pages: [
      page(
        '/classes/wheel',
        body,
        '<style data-tracy-leftovers>/* play controls that name no video */</style>'
      )
    ],
    sitePlan
  })
  assert.deepEqual(hidden, [])
  const real = '<a class="video-btn" data-src="https://www.youtube.com/embed/Ab3dE5gH7jK">play</a>'
  assert.deepEqual(checkButtonsVideos({ pages: [page('/', real)], sitePlan }), [])
})

test("a link in a channel's words that leads elsewhere than the channel is a finding", () => {
  const wrong =
    '<footer><a href="https://www.instagram.com/kiln.and.clay/">Message us on Instagram</a></footer>'
  assert.deepEqual(
    checkButtonsVideos({ pages: [page('/', wrong)], sitePlan }).map((f) => f.kind),
    ['channel-target']
  )
  const right = '<footer><a href="https://ig.me/m/kiln.and.clay">Message us on Instagram</a></footer>'
  assert.deepEqual(checkButtonsVideos({ pages: [page('/', right)], sitePlan }), [])
})

test('one page named differently by the header and the footer is a finding', () => {
  const html =
    '<header><nav><a href="/about/potters">Our potters</a></nav><a class="btn" href="/contact">Book a class</a></header>' +
    '<main><a href="/about/potters">Meet them</a></main>' +
    '<div class="t4-footnav"><ul class="nav"><li><a href="/about/potters">Team</a></li></ul></div>'
  const out = checkButtonsVideos({ pages: [page('/', html)], sitePlan })
  assert.deepEqual(
    out.map((f) => [f.kind, f.found]),
    [['page-names', 'header: Our potters | footer: Team']]
  )
  const same =
    '<header><nav><a href="/about/potters">Our potters</a><a href="/contact">Contact</a></nav>' +
    '<a class="btn" href="/contact">Book a class</a></header>' +
    '<footer><nav><a href="/about/potters">Our potters</a></nav></footer>'
  assert.deepEqual(checkButtonsVideos({ pages: [page('/', same)], sitePlan }), [])
})
