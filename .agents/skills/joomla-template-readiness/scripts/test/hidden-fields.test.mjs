import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commandsOf, savedOf } from '../hidden-fields.mjs'

const KIT = 'kit/template-kit.json'

test('saves only the five hidden fields and their reasons', () => {
  const site = {
    logoSpots: [{ id: 'logo-1' }],
    emptyVideoButtons: [{ selector: '.play[data-src$="/embed/"]', why: 'cards print an empty embed' }],
    selfLinkButtons: [],
    noneWhy: { selfLinkButtons: 'no more button on any layout' },
    createdPageLayouts: { legal: { articleLayout: 'ja_example:default', why: 'prints the article alone' } }
  }
  assert.deepEqual(savedOf({ site }), {
    emptyVideoButtons: site.emptyVideoButtons,
    selfLinkButtons: [],
    noneWhy: { selfLinkButtons: 'no more button on any layout' },
    // Saved under its own field path since the shared list (template-kit lib/declared-site-fields.mjs); a file saved
    // before it, with `legal`, still replays.
    createdPageLayouts: { legal: site.createdPageLayouts.legal }
  })
})

test('replays an entry per declared item and --none for a field with a reason', () => {
  const saved = {
    emptyVideoButtons: [{ selector: '.play[data-src$="/embed/"]', why: 'cards print an empty embed' }],
    selfLinkButtons: [],
    hiddenPageLinks: [{ container: '.team-card', why: 'card names link to profiles' }],
    createdPageHide: [{ selector: '.share-bar', why: 'every article prints it' }],
    noneWhy: { selfLinkButtons: 'no more button on any layout' },
    legal: { articleLayout: null, why: 'the default article is plain' }
  }
  assert.deepEqual(commandsOf(saved, KIT), [
    [
      'video-buttons',
      '--kit',
      KIT,
      '--selector',
      '.play[data-src$="/embed/"]',
      '--why',
      'cards print an empty embed'
    ],
    ['self-link-buttons', '--kit', KIT, '--none', '--why', 'no more button on any layout'],
    ['hidden-page-links', '--kit', KIT, '--container', '.team-card', '--why', 'card names link to profiles'],
    ['created-page-hide', '--kit', KIT, '--selector', '.share-bar', '--why', 'every article prints it'],
    ['legal-layout', '--kit', KIT, '--none', '--why', 'the default article is plain']
  ])
})

test('a field never declared replays nothing, so the verdict still names it', () => {
  assert.deepEqual(commandsOf({ emptyVideoButtons: [] }, KIT), [])
  assert.deepEqual(commandsOf({}, KIT), [])
})
