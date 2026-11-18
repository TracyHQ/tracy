import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pictureReviewOf } from '../src/write-step-nine.js'

test('the final write report keeps each rejected picture and the looker fault names', async () => {
  const manifest = {
    version: 'site-pictures/1',
    frames: [
      {
        frame: 'hero.1',
        source: 'owner-photo',
        sitePath: 'images/tracy-content/hero.jpg',
        filledBy: { rung: 'best-rejected', faults: ['subject cut off'] }
      },
      {
        frame: 'card.2',
        source: 'drawn',
        sitePath: 'images/tracy-content/card.png',
        filledBy: { rung: 'draw', faults: [] }
      }
    ],
    siteSettings: [
      {
        frame: 'logo.1',
        source: 'owner-photo',
        sitePath: 'images/tracy-content/logo.png',
        filledBy: { rung: 'best-rejected', faults: ['wrong composition'] }
      }
    ]
  }
  assert.deepEqual(pictureReviewOf(manifest), [
    {
      frame: 'hero.1',
      source: 'owner-photo',
      sitePath: 'images/tracy-content/hero.jpg',
      filledBy: { rung: 'best-rejected', faults: ['subject cut off'] }
    },
    {
      frame: 'logo.1',
      source: 'owner-photo',
      sitePath: 'images/tracy-content/logo.png',
      filledBy: { rung: 'best-rejected', faults: ['wrong composition'] }
    }
  ])
  assert.deepEqual(pictureReviewOf(null), [])
})
