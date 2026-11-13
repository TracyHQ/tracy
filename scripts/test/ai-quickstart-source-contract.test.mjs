// The parts of the AI quickstart contract check that read the source contract (ticket #584): library positions the
// template has, network icon classes for every network the demo draws, and the inline write form and span position
// of text fields. On an invented source contract in a throwaway tree.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  demoNetworkProblems,
  inlineSourceProblems,
  libraryPositionProblems
} from '../ai-quickstart/check-source-contract.mjs'

const CONTRACT = 'example-gym/j6/1.0.0'

/** A tree holding one invented source contract: two module positions, an ACM heading, an HTML heading, icons. */
function tree(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'ai-quickstart-source-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = path.join(root, 'packages/cms/tracy-joomla-quickstart/contracts', CONTRACT)
  mkdirSync(dir, { recursive: true })
  const kit = { blocks: [{ id: 'block-21', modules: [{ position: 'section-1' }] }] }
  const contentMap = {
    entities: [
      { key: 'module-22', kind: 'module', identity: { title: 'Invented', position: 'main-bottom-1' } }
    ],
    slots: [
      {
        key: 'module-21.0',
        column: 'params',
        nestedJson: 'jatools-config',
        jsonPath: ['heading'],
        sample: '((span))ACE((/span)) invented gym'
      },
      {
        key: 'module-22.0',
        column: 'params',
        jsonPath: ['main-section'],
        xpath: '/html/body/span',
        sample: 'Invented((br/)) ((span))drills((/span))'
      },
      { key: 'module-23.0', column: 'params', jsonPath: ['icon', 0], sample: 'fa fa-facebook' },
      { key: 'module-23.1', column: 'params', jsonPath: ['icon', 1], sample: 'fa fa-twitter' },
      { key: 'module-23.2', column: 'params', jsonPath: ['icon', 2], sample: 'far fa-comment-dots' }
    ]
  }
  writeFileSync(path.join(dir, 'template-kit.json'), JSON.stringify(kit))
  writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(contentMap))
  return root
}

const store = () => ({
  draftedBy: { kit: CONTRACT },
  blocks: [
    {
      id: 'block-21',
      fields: [
        {
          name: 'heading',
          type: 'text',
          slot: 'module-21.0',
          inline: {
            emphasis: [{ tag: 'span', attrs: '', at: 'start' }],
            from: 'template-kit',
            write: 'codes'
          }
        }
      ]
    },
    {
      id: 'block-22',
      fields: [
        {
          name: 'heading',
          type: 'text',
          slot: 'module-22.0',
          inline: {
            emphasis: [{ tag: 'br' }, { tag: 'span', attrs: '', at: 'end' }],
            from: 'template-kit',
            write: 'html'
          }
        }
      ]
    },
    {
      id: 'block-23',
      lists: [
        {
          name: 'links',
          fields: [
            {
              name: 'icon',
              type: 'icon',
              iconOf: 'network',
              storage: 'class-name',
              slots: ['module-23.0', 'module-23.1', 'module-23.2']
            }
          ]
        }
      ]
    }
  ]
})

test('the library publishes in positions the source contract records (#584)', (t) => {
  const root = tree(t)
  const mapping = { library: { position: 'section-1', pageTypes: { post: 'main-bottom-1' } } }
  assert.deepEqual(libraryPositionProblems(mapping, store(), root), [])
  mapping.library.position = 'section-9'
  mapping.library.pageTypes.post = 'nowhere'
  assert.deepEqual(
    libraryPositionProblems(mapping, store(), root).map((p) => `${p.at}: ${p.message}`),
    [
      'library.position: "section-9" is no position of the template (the source contract records main-bottom-1, section-1)',
      'library.pageTypes[post]: "nowhere" is no position of the template (the source contract records main-bottom-1, section-1)'
    ]
  )
  const lost = { ...store(), draftedBy: { kit: 'no/such/contract' } }
  assert.match(libraryPositionProblems(mapping, lost, root)[0].message, /names no source contract/)
})

test('every network the demo draws in a class name icon place has its class (#584)', (t) => {
  const root = tree(t)
  const classes = { facebook: 'fab fa-facebook', x: 'fab fa-twitter' }
  assert.deepEqual(demoNetworkProblems({ networkIconClasses: { classes } }, store(), root), [])
  delete classes.x
  assert.deepEqual(
    demoNetworkProblems({ networkIconClasses: { classes } }, store(), root).map((p) => p.message),
    ['the demo draws x (fa-twitter, module-23.1, block-23.icon): give its icon class']
  )
})

test('an inline write form follows the storage of its places, and its span position the demo words (#584)', (t) => {
  const root = tree(t)
  assert.deepEqual(inlineSourceProblems(store(), root), [])
  const wrong = store()
  wrong.blocks[0].fields[0].inline.write = 'html'
  wrong.blocks[1].fields[0].inline.emphasis[1].at = 'inside'
  assert.deepEqual(
    inlineSourceProblems(wrong, root).map((p) => `${p.at}: ${p.message}`),
    [
      'blocks[block-21].heading.inline.write: its places store the value as codes, not "html"',
      'blocks[block-22].heading.inline.emphasis: the demo values put the accent span at end, the field declares inside'
    ]
  )
})

test('the blank site contract check reports a location leading nowhere and a missing php, never crashes (#584)', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { blankSiteContractProblems } = await import('../ai-quickstart/check-blank-site-contract.mjs')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const kit = path.join(root, 'packages/cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11')
  const mapping = () => JSON.parse(readFileSync(path.join(kit, 'mapping.json'), 'utf8'))
  const bad = mapping()
  bad.blocks['block-156'].fields.heading = {
    entity: 'module-156',
    column: 'params',
    jsonPath: ['nowhere', 3]
  }
  const lines = blankSiteContractProblems(kit, bad, root, { emptyHtml: () => [] })
  assert.equal(lines.length, 1)
  assert.match(lines[0].message, /could not be checked: module-156: no text at/)
  const noPhp = () => {
    throw new Error('spawnSync php ENOENT')
  }
  const missing = blankSiteContractProblems(kit, mapping(), root, { emptyHtml: noPhp })
  assert.deepEqual(
    missing.map((p) => p.message),
    ['the samples of the emptied places need php on PATH: spawnSync php ENOENT']
  )
})
