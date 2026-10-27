import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withSiteSocials } from '../domain/site-socials.mjs'

test('withSiteSocials lifts the profiles a site check found that the place lacks', () => {
  const socials = { facebook: 'https://www.facebook.com/phoba' }
  const out = withSiteSocials(socials, {
    socials: { facebook: 'https://www.facebook.com/other', instagram: 'https://www.instagram.com/phoba/' }
  })
  assert.deepEqual(out, {
    facebook: 'https://www.facebook.com/phoba',
    instagram: 'https://www.instagram.com/phoba/'
  })
  assert.equal(withSiteSocials(socials, null), socials, 'nothing added: the same object')
})

test('withSiteSocials drops links that are not a profile of that network (dev round L4)', () => {
  const found = {
    facebook: 'https://www.facebook.com/messages',
    instagram: 'https://www.instagram.com/p/C7QwnWDw9u8/',
    tiktok: 'https://www.tiktok.com/@phoba',
    youtube: 'https://www.facebook.com/phoba'
  }
  assert.deepEqual(withSiteSocials({}, { socials: found }), { tiktok: 'https://www.tiktok.com/@phoba' })
  const none = {}
  assert.equal(
    withSiteSocials(none, { socials: { facebook: 'https://www.facebook.com/sharer.php?u=x' } }),
    none
  )
})
