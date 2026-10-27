import assert from 'node:assert/strict'
import { test } from 'node:test'

import { startingDesignImage } from '../src/client/starting-design-image.mjs'

test('the grid uses the same 720px shot thumbnail as Design inspiration, never the full desktop shot', () => {
  const shot = 'https://tracy.test/api/templates/business/shots/home.png'
  assert.equal(
    startingDesignImage({
      card: { demo: { url: 'https://demo.test/' }, layouts: [{ key: 'home', shots: { desktop: shot } }] }
    }),
    `${shot}?w=720`
  )
  assert.equal(startingDesignImage({ card: { image: `${shot}?v=2` } }), `${shot}?v=2&w=720`)
  assert.equal(
    startingDesignImage({ card: { image: 'https://cdn.test/card.webp' } }),
    'https://cdn.test/card.webp'
  )
  assert.equal(
    startingDesignImage({
      card: { image: 'bare.png', layouts: [{ key: 'home', shots: { desktop: shot } }] }
    }),
    null
  )
  assert.equal(startingDesignImage(null), null)
  assert.equal(
    startingDesignImage({
      card: {
        demo: { url: 'https://demo.test/' },
        image: shot,
        layouts: [{ key: 'home', shots: { desktop: 'https://cdn.test/full.png' } }]
      }
    }),
    `${shot}?w=720`
  )
})
