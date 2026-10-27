// A comment on an IMAGE (plan "comment thread", C3): the block names the picture the person pinned —
// its file and the alt the page prints — and, when `content.locate` was sure, what that alt is on the
// site: the one call that writes it, or that the page prints none of it, or prints other words.
//
// Stand E2E 29/09 (`tasks/evidence/comment-multi-pin/stand-e2e.md` M3, V3-H2, V4-M1): with no picture in
// the block the agent changed the hero's alt (WordPress), an alt the Joomla card never prints, or the
// EmDash project image's alt while the card prints the project title; and one run of two stopped at
// "no alt slot" where the other changed the alt by its words.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCommentTurn,
  chipLabel,
  COMMENT_IMAGE_WORDS,
  COMMENT_TURN_LIMIT,
  parseCommentTurn
} from '../src/client/comment-turn.mjs'

const WP_ELEMENT = {
  url: 'https://w.test/',
  selector:
    '#wp--skip-link--target > div:nth-child(1) > section:nth-child(3) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > figure:nth-child(1) > img:nth-child(1)',
  label: 'Project photo · 4:3',
  text: '',
  image: { src: 'https://w.test/wp-content/uploads/2026/09/proj-ru-2.png?ver=2', alt: 'Project photo · 4:3' },
  marks: ['post:42:home block:core/image', 'post:42:home block:core/group', 'post:42:home']
}

/** The resolver's answer for the second card image (`content-locate-image.test.mjs`, WordPress). */
const WP_LOCATE = {
  status: 'resolved',
  levels: [
    {
      kind: 'field',
      id: 'c42#bProjects/i2/projects.item.2.img',
      contentId: 'c42',
      fieldKey: 'projects.item.2.img',
      value: '/wp-content/uploads/2026/09/proj-ru-2.png',
      next: {
        tool: 'tracy_site',
        action: 'content.contract',
        operation: 'apply',
        changes: { 'home.projects.item.2.img': null },
        expected_content_revisions: { c42: 'rev42' }
      },
      image: {
        media: 'mProj2',
        alt: 'Project photo · 4:3',
        printed: 'same',
        next: { tool: 'tracy_site', action: 'content.replace', at: ['post:42#projects.item.2.img@alt'] }
      },
      label: 'Home › projects.item.2.img',
      writable: true
    },
    {
      kind: 'record',
      id: 'c42',
      contentId: 'c42',
      native: [{ kind: 'post', id: 42 }],
      label: 'page "Home"',
      writable: true
    }
  ],
  sources: { value: 'exact', mark: 'confirmed' }
}

const said = "Change the alt to 'Project photo — night shift'"

test('an image block names the pinned file and its printed alt, and the one call that writes that alt', () => {
  const turn = buildCommentTurn({ text: said, element: WP_ELEMENT, locate: WP_LOCATE })
  const lines = turn.split('\n')
  assert.ok(lines.includes('image: proj-ru-2.png · alt "Project photo · 4:3"'), turn)
  assert.ok(
    lines.includes(
      'alt write: content.replace {find: its alt, replace, path, at:["post:42#projects.item.2.img@alt"]}'
    ),
    turn
  )
  const hint = lines[lines.length - 1]
  assert.match(hint, /never another image/)
  assert.match(hint, /`content\.replace` \{find: its alt words/)
  // The record is sure, but its name is a crumb (`Home › projects.item.2.img`), never chip words
  // (V5S-5): the Browser tab's own label for the image names the chip.
  assert.equal(chipLabel(parseCommentTurn(turn).element), 'Project photo · 4:3')
})

test('an image no lookup answered still carries its file and alt, and the hint says its road', () => {
  const turn = buildCommentTurn({ text: said, element: WP_ELEMENT, locate: null })
  assert.match(turn, /^image: proj-ru-2\.png · alt "Project photo · 4:3"$/m)
  assert.doesNotMatch(turn, /^alt write:/m)
  assert.match(turn.slice(turn.lastIndexOf('\n') + 1), /Image line:/)
})

test('an EmDash file named only by storage ids is left out; an image the page prints with no alt says so', () => {
  const turn = buildCommentTurn({
    text: said,
    element: {
      url: 'https://e.test/',
      selector: 'main img',
      label: '',
      text: '',
      image: {
        src: 'https://e.test/_emdash/api/media/file/01M3ATZJ349P2XX7DMJP5X0Q7S.01M3ATZJ35Y4D0B2D0V6GJEVR4.png',
        alt: ''
      },
      marks: []
    },
    locate: null
  })
  assert.match(turn, /^image: no alt printed$/m)
  assert.doesNotMatch(turn, /01M3ATZ/)
})

test('Joomla: a card printing alt="" over a stored alt says the page prints none of it', () => {
  const turn = buildCommentTurn({
    text: said,
    element: {
      url: 'https://j.test/en/',
      selector:
        '#tb-projects-443 > div:nth-child(1) > div:nth-child(2) > article:nth-child(1) > a:nth-child(1) > img:nth-child(1)',
      label: 'factory-ru-1.png',
      text: '',
      image: { src: 'https://j.test/images/northgate/factory-ru-1.png', alt: '' },
      marks: ['article:546:elektra-plant-lipetsk block:mod_ja_acm', 'module:443 block:mod_ja_acm']
    },
    locate: {
      status: 'resolved',
      levels: [
        {
          kind: 'field',
          id: 'a546#bImages/article-546.image_intro',
          fieldKey: 'article-546.image_intro',
          value: 'images/northgate/factory-ru-1.png',
          image: { media: 'mIntro', alt: 'Elektra appliance plant, Lipetsk SEZ', printed: 'none' },
          label: 'Elektra appliance plant, Lipetsk SEZ › image_intro',
          writable: true
        }
      ]
    }
  })
  assert.match(turn, /^image: factory-ru-1\.png · no alt printed$/m)
  assert.match(
    turn,
    /^alt: the page prints none here; the stored alt "Elektra appliance plant, Lipetsk SEZ" is not shown on this page$/m
  )
})

test('EmDash: a card printing its title as the alt names that field', () => {
  const turn = buildCommentTurn({
    text: said,
    element: {
      url: 'https://e.test/',
      selector: 'main article img',
      label: 'Elektra appliance plant, Lipetsk SEZ',
      text: '',
      image: {
        src: 'https://e.test/_emdash/api/media/file/01M3ATZHTH1MJZ35AWQVC9M8SZ.01M3ATZHTKYC3NVZJGTB8CTBBS.png',
        alt: 'Elektra appliance plant, Lipetsk SEZ'
      },
      marks: ['emdash:projects:01M3ATZCA8SJZP1TA2KQMEVERM:elektra-lipetsk field:image']
    },
    locate: {
      status: 'resolved',
      levels: [
        {
          kind: 'field',
          id: 'pElektra#image',
          fieldKey: 'image',
          image: { media: 'mPlant', alt: 'Plant photo', printed: 'other', from: 'title' },
          label: 'Elektra appliance plant, Lipetsk SEZ › image',
          writable: true
        }
      ]
    }
  })
  assert.match(turn, /^image: alt "Elektra appliance plant, Lipetsk SEZ"$/m)
  assert.match(
    turn,
    /^alt: the page prints its title field here; the stored alt "Plant photo" is not shown on this page$/m
  )
})

test('several comments: each image block carries its own image line, and the hint says the image road once', () => {
  const turn = buildCommentTurn({
    items: [
      {
        n: 1,
        text: 'Make this heading shorter',
        element: {
          url: 'https://w.test/',
          selector: 'h2',
          label: '"Selected projects"',
          text: 'Selected projects',
          marks: []
        },
        locate: null
      },
      { n: 2, text: said, element: WP_ELEMENT, locate: WP_LOCATE }
    ]
  })
  assert.equal(turn.match(/^image: /gm)?.length, 1)
  assert.equal(turn.match(/Image line:/g)?.length, 1)
})

/**
 * V4-M1 (stand E2E round 4, 29/09): the same WordPress alt request succeeded once by `content.replace`
 * on the alt words, and the next run stopped with "no alt slot" after a contract inspect found none —
 * the words the files sentence gave as its example of "nothing to write". A page that prints an alt has
 * one to change, contract slot or not; only a page printing none is that answer.
 */
test('the files sentence names an image the page prints with no alt, never a missing "alt slot"', async () => {
  const { COMMENT_WRITES_ONLY } = await import('../src/client/comment-turn.mjs')
  assert.doesNotMatch(COMMENT_WRITES_ONLY, /alt slot/)
  assert.match(COMMENT_WRITES_ONLY, /an image the page prints with no alt at all/)
})

/**
 * The Browser tab names a sure pick by its record (`resolvedLabel`, dsh-better-sidebar), so the popover's
 * crumb — and `[picked]` — is the record, above the image field (stand 29/09, EmDash: every image turn
 * read `[picked]` on the project record). The image facts sit on the field; they are the element's
 * whichever crumb is picked.
 */
test('the alt line comes from the image field level even when the record is the picked crumb', () => {
  const turn = buildCommentTurn({
    text: said,
    element: { ...WP_ELEMENT, label: 'page "Home"' },
    locate: WP_LOCATE
  })
  assert.match(turn, /^- record "page "Home"" id=c42 \(post #42\) \[picked\]$/m)
  assert.match(
    turn,
    /^alt write: content\.replace \{find: its alt, replace, path, at:\["post:42#projects\.item\.2\.img@alt"\]\}$/m
  )
})

test('a picked link around one image (runtime 8) carries the image line like a picked img', () => {
  // The pointer on a Joomla card's linked image lands on the <a>; runtime 8 reports its one image.
  const element = {
    url: 'https://j.test/',
    selector: 'div.card:nth-child(2) > a:nth-child(1)',
    label: '',
    text: '',
    tag: 'a',
    image: { src: 'https://j.test/images/cards/team-3.jpg', alt: 'Our team' },
    marks: ['article:7']
  }
  const turn = buildCommentTurn({ text: said, element })
  assert.ok(turn.split('\n').includes('image: team-3.jpg · alt "Our team"'), turn)
  assert.match(turn.split('\n').at(-1), /never another image/)
})

/**
 * M6 (stage 3; Brian 29/09 ~17:20): a comment asks to change words DRAWN INSIDE an image — a banner's
 * "Summer sale 30%", a logo's company name. No record or alt holds them; the honest answer is ✗ with
 * the file named, and a question card offering to replace the picture. Said only on the image road
 * (a turn whose block carries an `image:` line), so no other turn pays for it.
 */
test('M6: the image road says words drawn inside the picture are ✗ + a question card; other turns do not', () => {
  assert.match(COMMENT_IMAGE_WORDS, /words drawn inside the image itself/)
  assert.match(
    COMMENT_IMAGE_WORDS,
    /`✗ the words are part of the image file <file>; changing them needs a new image`/
  )
  assert.match(
    COMMENT_IMAGE_WORDS,
    /question card whether the person wants to replace the image \(upload a new one\)/
  )
  const banner = {
    ...WP_ELEMENT,
    label: 'Summer sale banner',
    image: { src: 'https://w.test/banner.png', alt: '' }
  }
  const one = buildCommentTurn({ text: "Change 'Summer sale 30%' to 'Autumn sale 40%'", element: banner })
  const many = buildCommentTurn({
    items: [
      {
        n: 1,
        text: 'Make this heading shorter',
        element: { url: 'https://w.test/', selector: 'h2', label: 'x', text: 'Selected projects', marks: [] }
      },
      { n: 2, text: "Change 'Summer sale 30%'", element: banner }
    ]
  })
  for (const turn of [one, many]) assert.equal(turn.split(COMMENT_IMAGE_WORDS).length, 2, turn)
  // A long image turn still says it (the short hint too), and keeps the room the page data had.
  const long = buildCommentTurn({
    text: `Change the words drawn on it. ${'Please '.repeat(300)}`,
    element: banner
  })
  assert.ok(long.includes(COMMENT_IMAGE_WORDS))
  assert.ok(long.length <= COMMENT_TURN_LIMIT + COMMENT_IMAGE_WORDS.length + 1, String(long.length))
  // A turn with no picture: not a byte of it.
  const plain = buildCommentTurn({
    text: 'Make this heading shorter',
    element: { url: 'https://w.test/', selector: 'h2', label: 'x', text: 'Selected projects', marks: [] }
  })
  assert.ok(!plain.includes(COMMENT_IMAGE_WORDS))
})

/**
 * Round 5 leftover (the picker's report, 30/09): an image with no alt is named by its file, and a long
 * request put the turn over budget; the selector was the first thing cut and ended EMPTY, so the block
 * no longer told the agent which picture it was. The label and the image line's file name give way
 * first; the selector is only ever folded to its last steps, never emptied.
 */
test('a long file name and an empty alt: the label and file name give way before the selector, which is never emptied', () => {
  const file = 'team-photo-2026-summer-offsite-at-the-northgate-plant-in-kazan-final-edit-v3-highres.jpg'
  const element = {
    ...WP_ELEMENT,
    label: file,
    image: { src: `https://w.test/wp-content/uploads/2026/09/${file}`, alt: '' }
  }
  const whole = `selector="${WP_ELEMENT.selector.replace(/>/g, '&gt;')}"`
  const base = buildCommentTurn({ text: 'x', element })
  assert.ok(base.includes(whole), 'with room to spare the selector is whole')
  // Just over the budget (the image road has its own room for its sentence): shortening the label and
  // the file name is enough; the selector stays whole.
  const limit = COMMENT_TURN_LIMIT + COMMENT_IMAGE_WORDS.length + 1
  const near = buildCommentTurn({ text: 'y'.repeat(limit - base.length + 30), element })
  assert.ok(near.length <= limit, `turn is ${near.length} chars`)
  assert.ok(near.includes(whole), near)
  const label = near.match(/ label="([^"]*)"| name="([^"]*)"/)
  assert.ok(
    label && Array.from(label[1] ?? label[2]).length < Array.from(file).length,
    'the label was shortened'
  )
  assert.match(near, /^image: .+ · no alt printed$/m)
  // Far over the budget: the selector keeps its last steps — never empty.
  const far = buildCommentTurn({ text: 'z'.repeat(COMMENT_TURN_LIMIT), element })
  const selector = far.match(/ selector="([^"]*)"/)?.[1] ?? ''
  assert.notEqual(selector, '', 'the selector is never emptied')
  assert.ok(selector.endsWith('img:nth-child(1)'), selector)
})

test('several comments: an image selector is never emptied by the budget either', () => {
  const file = 'team-photo-2026-summer-offsite-at-the-northgate-plant-in-kazan-final-edit-v3-highres.jpg'
  const element = { ...WP_ELEMENT, label: file, image: { src: `https://w.test/u/${file}`, alt: '' } }
  const other = {
    ...WP_ELEMENT,
    selector: `${WP_ELEMENT.selector.replace(/img:nth-child\(1\)$/, '')}figcaption:nth-child(2)`,
    label: 'Caption',
    text: 'Caption words',
    image: undefined
  }
  const turn = buildCommentTurn({
    items: [
      { n: 1, text: 'a'.repeat(150), element },
      { n: 2, text: 'b'.repeat(150), element: other }
    ]
  })
  for (const selector of [...turn.matchAll(/ selector="([^"]*)"/g)].map((m) => m[1]))
    assert.notEqual(selector, '', turn)
})
