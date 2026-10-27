/**
 * 🔒 A CHIP IN THE CHAT IS PLAIN WORDS, in every CMS and every rendering (plan "comment multi-pin",
 * § Vocabulary; the 27/09 regression drew a raw ULID and a fenced block). Each fixture is an element
 * as the Browser tab sends it plus the `content.locate` answer the Apply door gives, carrying its
 * own ids: the test asserts the chip's words hold none of THAT fixture's ref, selector, ids or ULID,
 * and no fence — against the fixture's metadata, never by banning `<` or `#`, which a customer's
 * own words may hold.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCommentTurn,
  chipLabel,
  COMMENT_FENCE,
  commentTurnFold,
  parseCommentTurn
} from '../src/client/comment-turn.mjs'

const ULID = '01K5Z8W3J9Q2M4N6P8R0T2V4X6'

/**
 * @typedef {{ name: string, element: Record<string, unknown>, locate: Record<string, unknown> | null,
 *   chip: string, many?: string, secrets: string[] }} Fixture
 * `many`: the chip among several in one turn, when it differs — an element with words is quoted
 * there even when its record is sure (stand e2e 28/09: three WordPress chips all read `page "Home"`).
 * `secrets`: the fixture's own machine strings (ids, refs, selector, file ids) no chip may show.
 */
/** @type {Fixture[]} */
const FIXTURES = [
  {
    name: 'image without alt, served by its storage id (EmDash)',
    element: {
      url: 'https://r2e.tracy.site/',
      selector: 'main section.hero > img.cover',
      label: `${ULID}.webp`,
      text: '',
      marks: []
    },
    locate: null,
    chip: '',
    secrets: [ULID, 'main section.hero > img.cover', 'img.cover']
  },
  {
    name: 'image without alt, EmDash 1.4.5 file name <ULID>.<ULID>.png (dev acceptance H-1)',
    element: {
      url: 'https://acbe.tracy.site/',
      selector: 'main section.gallery > img',
      label: `${ULID}.01M3GF56T5K3S92ZRJFQ8XA1BC.png`,
      text: '',
      marks: []
    },
    locate: null,
    chip: '',
    secrets: [ULID, '01M3GF56T5K3S92ZRJFQ8XA1BC', 'main section.gallery > img']
  },
  {
    name: 'image without alt, EmDash file name cut by the Browser tab to a ULID prefix + "…" (dev re-check 29/09)',
    element: {
      url: 'https://acbe.tracy.site/',
      selector: 'main section.gallery > img:nth-child(2)',
      label: `${ULID}.01M3GF56T7DE…`,
      text: '',
      marks: []
    },
    locate: null,
    chip: '',
    secrets: [ULID, '01M3GF56T7DE', 'main section.gallery > img:nth-child(2)']
  },
  {
    name: 'EmDash record addressed by a ULID ref',
    element: {
      url: 'https://r2e.tracy.site/blog/hello',
      selector: 'article h1',
      label: 'post "Hello world"',
      text: 'Hello world',
      marks: [`emdash:posts:${ULID}`]
    },
    locate: {
      status: 'resolved',
      levels: [
        {
          kind: 'record',
          id: `emdash:posts:${ULID}`,
          label: 'post "Hello world"',
          native: [{ kind: 'post', key: ULID }],
          writable: true
        }
      ]
    },
    chip: 'post "Hello world"',
    many: '"Hello world"',
    secrets: [ULID, `emdash:posts:${ULID}`, 'article h1']
  },
  {
    name: 'Joomla menu item, alias and item id in the selector and native ref',
    element: {
      url: 'https://capijl1644.tracy.site/en/',
      selector: 'header nav li.item-104.alias-services > a',
      label: 'Services',
      text: 'Services',
      marks: ['menuItem:104', 'module:87 mod:mod_menu']
    },
    locate: {
      status: 'resolved',
      levels: [
        {
          kind: 'record',
          id: 'joomla:menu:104',
          label: 'menu item "Services"',
          native: [{ kind: 'menuItem', id: 104 }],
          writable: true
        }
      ]
    },
    chip: 'menu item "Services"',
    many: '"Services"',
    secrets: ['joomla:menu:104', 'menuItem #104', 'item-104', 'alias-services', 'menuItem:104']
  },
  {
    name: 'WordPress post title link in a query loop, not sure which post',
    element: {
      url: 'https://capiwl1643.tracy.site/news/',
      selector: 'ul.wp-block-post-template > li.post-42 h2.wp-block-post-title > a',
      label: '"Read our story"',
      text: 'Read our story',
      marks: ['post:42 block:core/post-title']
    },
    locate: {
      status: 'candidates',
      levels: [],
      candidates: [
        { kind: 'record', id: 'wp:post:42', label: 'post "Our story"', writable: true },
        { kind: 'record', id: 'wp:post:43', label: 'post "Our team"', writable: true }
      ]
    },
    chip: '"Read our story"',
    secrets: ['wp:post:42', 'wp:post:43', 'li.post-42', 'post:42 block:core/post-title']
  },
  {
    name: 'Cyrillic text',
    element: {
      url: 'https://capijl1644.tracy.site/ru/',
      selector: 'section#about p.lead',
      label: '"Промышленное строительство"',
      text: 'Промышленное строительство под ключ',
      marks: ['article:17']
    },
    locate: { status: 'unknown', levels: [] },
    chip: '"Промышленное строительство под ключ"',
    secrets: ['section#about p.lead', 'article:17']
  },
  {
    name: 'Vietnamese text, resolved but read from part of the site',
    element: {
      url: 'https://acbw2709.tracy.site/',
      selector: 'main .wp-block-cover h2',
      label: 'Cover › heading',
      text: 'Xây dựng công nghiệp trọn gói',
      marks: []
    },
    locate: {
      status: 'resolved',
      incomplete: true,
      levels: [{ kind: 'field', id: 'content_9#block_2/heading', label: 'Cover › heading', writable: true }]
    },
    chip: '"Xây dựng công nghiệp trọn gói"',
    secrets: ['content_9#block_2/heading', 'main .wp-block-cover h2']
  },
  {
    name: 'no label and no words (a bare section)',
    element: {
      url: 'https://s.tracy.site/',
      selector: 'body > div:nth-child(3)',
      label: '',
      text: '',
      marks: []
    },
    locate: { status: 'unknown', levels: [] },
    chip: '',
    secrets: ['body > div:nth-child(3)', 'nth-child']
  },
  {
    name: 'no locate answer at all',
    element: {
      url: 'https://s.tracy.site/contact',
      selector: 'footer .contact a[href^="tel:"]',
      label: '"8 800 550-67-90"',
      text: '8 800 550-67-90',
      marks: []
    },
    locate: null,
    chip: '"8 800 550-67-90"',
    secrets: ['footer .contact a[href^="tel:"]', 'href^=']
  },
  {
    name: 'very long text',
    element: {
      url: 'https://s.tracy.site/',
      selector: 'main p.intro-long',
      label: 'Intro',
      text: 'Northgate Group is a family of thirteen companies across Europe and Asia, building plants since 1994.',
      marks: []
    },
    locate: { status: 'unconfirmed', levels: [{ kind: 'block', id: 'block_77', label: 'Intro' }] },
    chip: '"Northgate Group is a family of thirteen…"',
    secrets: ['block_77', 'main p.intro-long']
  },
  {
    name: 'nested inline tags: the label is only a tag, the words come through',
    element: {
      url: 'https://s.tracy.site/',
      selector: 'main p > span.hl > em',
      label: '<span class="hl">',
      text: 'Build better, faster <safely>',
      marks: []
    },
    locate: { status: 'unknown', levels: [] },
    chip: '"Build better, faster <safely>"',
    secrets: ['main p > span.hl > em', 'span class="hl"']
  },
  {
    name: 'an <img> inside a link, alt text as the name',
    element: {
      url: 'https://s.tracy.site/',
      selector: 'header a.custom-logo-link > img.custom-logo',
      label: 'Northgate logo',
      text: '',
      marks: ['option:site_logo']
    },
    locate: {
      status: 'conflict',
      levels: [],
      candidates: [
        { kind: 'record', id: 'wp:option:site_logo', label: 'site logo' },
        { kind: 'record', id: 'wp:attachment:311', label: 'image "logo.png"' }
      ],
      chosen: { source: 'stamp' }
    },
    // No words and no sure answer: the name the person settled on in the popover (the chosen side).
    chip: 'site logo',
    secrets: ['wp:option:site_logo', 'wp:attachment:311', 'img.custom-logo', 'option:site_logo']
  },
  {
    name: 'a form control, its label as the name',
    element: {
      url: 'https://s.tracy.site/contact',
      selector: 'form#wpforms-12 input[name="wpforms[fields][2]"]',
      label: 'Email address',
      text: '',
      marks: ['form:12 field:2']
    },
    locate: { status: 'resolved', levels: [{ kind: 'field', id: 'wpforms:12/2', label: 'Email address' }] },
    chip: 'Email address',
    secrets: ['wpforms:12/2', 'wpforms-12', 'wpforms[fields][2]', 'form:12 field:2']
  }
]

/** Each block of a turn with what follows it, as dsh's fold registry hands them over. */
function foldsOf(turn) {
  const chips = []
  const re = /(?:^|\n)(```tracy-element\n[\s\S]*?\n```)(?=\n|$)/g
  for (let m = re.exec(turn); m; m = re.exec(turn)) {
    const start = m.index + (turn[m.index] === '\n' ? 1 : 0)
    const end = start + m[1].length
    chips.push(commentTurnFold(turn.slice(start, end), turn.slice(end)))
  }
  return chips
}

/** @param {string} label @param {Fixture} fixture */
function assertPlain(label, fixture) {
  for (const secret of fixture.secrets)
    assert.ok(!label.includes(secret), `${fixture.name}: "${label}" shows ${secret}`)
  assert.ok(!label.includes('```') && !label.includes(COMMENT_FENCE), `${fixture.name}: a fence`)
  assert.ok(!label.includes(fixture.element.selector), `${fixture.name}: the selector`)
}

test('twelve fixtures: the chip of a one-comment turn is plain words from the fixture itself', () => {
  assert.equal(FIXTURES.length, 14)
  for (const fixture of FIXTURES) {
    const turn = buildCommentTurn({ text: 'Change this.', element: fixture.element, locate: fixture.locate })
    const [chip] = foldsOf(turn)
    assert.ok(chip, fixture.name)
    assert.equal(chip.label, fixture.chip, fixture.name)
    assert.equal(chipLabel(parseCommentTurn(turn)?.element ?? {}), fixture.chip, fixture.name)
    assertPlain(chip.label, fixture)
  }
})

test('the same twelve sent together: each numbered chip quotes its words, else its name', () => {
  const items = FIXTURES.map((fixture, i) => ({
    n: i + 1,
    text: `Change ${i + 1}.`,
    element: fixture.element,
    locate: fixture.locate
  }))
  const turn = buildCommentTurn({ items })
  const chips = foldsOf(turn)
  assert.equal(chips.length, FIXTURES.length)
  chips.forEach((chip, i) => {
    assert.ok(chip, FIXTURES[i].name)
    assert.equal(chip.n, i + 1)
    assert.equal(chip.label, FIXTURES[i].many ?? FIXTURES[i].chip, FIXTURES[i].name)
    assertPlain(chip.label, FIXTURES[i])
  })
  // Only the last chip hides the hint; the person's lines stay.
  assert.deepEqual(
    chips.map((c) => c.trailing > 0),
    [...Array(FIXTURES.length - 1).fill(false), true]
  )
})
