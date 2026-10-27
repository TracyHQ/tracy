import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderAgentPrompt } from '../domain/agent-prompt.mjs'

const menu = (items) => ({
  business: { name: 'Quán Huế' },
  sitemap: [{ slug: 'menu', sections: [{ kind: 'menu', menuItems: items }] }]
})
const photo = (assetId, status) => ({ assetId, status, how: 'caption', matcher: 'dish-photos/1' })

test('an accepted dish photo is named beside its picture, wherever the picture is; a candidate never is', () => {
  const p = renderAgentPrompt({
    revision: {
      id: 'rev-1',
      cms: 'wordpress',
      brief: menu([
        { name: 'Bún bò Huế', photo: photo('a1', 'accepted') },
        { name: 'Cơm hến', photo: photo('a2', 'candidate') }
      ]),
      brief_md: ''
    },
    placed: { a1: 'wp-content/uploads/tracy-content/a1.jpg', a2: 'wp-content/uploads/tracy-content/a2.jpg' },
    pictures: {
      placed: [{ file: 'dish-1.jpg', mediaId: 'a3', path: 'x/a3.jpg', origin: 'real', dish: 'Cơm hến' }],
      placeholders: []
    }
  })
  assert.match(p, /- a1: .*a1\.jpg — the photo of the dish "Bún bò Huế": show it beside that dish/)
  assert.match(
    p,
    /- dish-1\.jpg ← .*a3\.jpg \(a3, real\) — the photo of the dish "Cơm hến": that dish goes in this item/
  )
  assert.doesNotMatch(p, /- a2: [^\n]*the photo of the dish/)
  assert.match(p, /\d+\. A dish the brief lists with "photo of this dish" shows that photo beside it/)
})

test('a brief without a dish photo reads as before', () => {
  const p = renderAgentPrompt({
    revision: { id: 'rev-1', cms: 'joomla', brief: menu([{ name: 'Bún bò Huế' }]), brief_md: '' },
    placed: { a1: 'images/a1.jpg' }
  })
  assert.doesNotMatch(p, /photo of this dish|the photo of the dish/)
})
