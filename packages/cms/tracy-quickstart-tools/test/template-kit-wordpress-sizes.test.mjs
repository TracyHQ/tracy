// The template kit reads a size WordPress generated from an upload as that upload (template-kit/lib/picture-frames.mjs):
// a write to the slot moves the block's attachment, so every size follows it. Dev arabian-tea-wp8 (JA Diner WordPress,
// 27/11/2026): the home page printed `item-1-1536x864.jpg` where the content map names `item-1.jpg`, and the kit kept its
// frames as pictures no slot holds, so no build could replace them. Invented files.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pictureFrames } from '../template-kit/lib/picture-frames.mjs'

const map = {
  slots: [
    {
      key: 'page-home.hero.image.1',
      entity: 'page-home',
      type: 'image',
      sample: 'wp-content/uploads/2026/10/cake.jpg'
    }
  ]
}
const kitWith = () => ({
  blocks: [{ id: 'body-home', slots: [], demoOwned: [], lists: [], frames: [] }]
})
const reading = (file) =>
  new Map([['body-home', { pictures: [{ file, position: 0, painter: 'img.wp-image-9', via: 'img' }] }]])

test('a generated size of a slot picture is held by the slot, so no frame no slot holds is added', () => {
  for (const file of [
    'wp-content/uploads/2026/10/cake-1536x864.jpg',
    '/wp-content/uploads/2026/10/cake-scaled.jpg'
  ]) {
    const kit = kitWith()
    kit.blocks[0].slots.push({ id: 'page-home.hero.image.1', type: 'image' })
    assert.equal(pictureFrames(kit, map, reading(file)), 0, file)
  }
})

test('another picture, a size of another file, or a file whose own name ends in digits is still a frame of its own', () => {
  for (const file of [
    'wp-content/uploads/2026/10/scone-1536x864.jpg',
    'wp-content/uploads/2026/10/cake-2.jpg',
    'images/joomla/cake-300x200.jpg'
  ]) {
    const kit = kitWith()
    kit.blocks[0].slots.push({ id: 'page-home.hero.image.1', type: 'image' })
    assert.equal(pictureFrames(kit, map, reading(file)), 1, file)
  }
})
