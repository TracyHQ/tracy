/**
 * The widget's drawing-free half (`src/client/chat.ts`): the event stream reader, the answer's
 * blocks, the link allowlist, and the site the page names.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blocksOf, errorKeyOf, inlineOf, listedHref, siteOfPage, takeFrames } from '../src/client/chat.ts'

test('takeFrames returns whole frames and keeps a frame cut in half for the next read', () => {
  const first = takeFrames(
    'event: meta\ndata: {"conversationId":"c1","links":[]}\n\nevent: delta\ndata: {"te'
  )
  assert.deepEqual(first.frames, [{ event: 'meta', data: { conversationId: 'c1', links: [] } }])
  const second = takeFrames(`${first.rest}xt":"Hi"}\n\nevent: done\ndata: {}\n\n`)
  assert.deepEqual(second.frames, [
    { event: 'delta', data: { text: 'Hi' } },
    { event: 'done', data: {} }
  ])
  assert.equal(second.rest, '')
})

test('a link is clickable only when the server listed its exact address', () => {
  const allowed = new Set(['/new/?tab=tracy:add-site'])
  assert.deepEqual(inlineOf('Open [Add site](/new/?tab=tracy:add-site) now', allowed), [
    { kind: 'text', text: 'Open ' },
    { kind: 'link', text: 'Add site', href: '/new/?tab=tracy:add-site' },
    { kind: 'text', text: ' now' }
  ])
  // Invented, altered or foreign addresses keep their label and lose the link.
  // CommonMark's bracketed destination is the same address.
  assert.deepEqual(inlineOf('[Add site](</new/?tab=tracy:add-site>)', allowed), [
    { kind: 'link', text: 'Add site', href: '/new/?tab=tracy:add-site' }
  ])
  for (const href of ['https://evil.example/login', '/new/?tab=tracy:add-site&x=1', 'javascript:alert']) {
    const parts = inlineOf(`[Sign in](${href})`, allowed)
    assert.ok(!parts.some((p) => p.kind === 'link'), href)
    assert.equal(parts[0].text, 'Sign in', href)
  }
  // A destination with parentheses is not a destination; it never becomes a link.
  for (const href of ['javascript:alert(1)', '/new/(x)']) {
    assert.ok(!inlineOf(`[Sign in](${href})`, allowed).some((p) => p.kind === 'link'), href)
  }
})

test('a model that pads the parentheses still gets its listed link; an unlisted one keeps its label', () => {
  const publish = '/site/?tab=tracy:site-publish&site=site'
  const allowed = new Set([publish, '/site/'])
  const link = { kind: 'link', text: 'Publish', href: publish }
  for (const destination of [` ${publish}`, `${publish} `, `\t${publish}\t`, ` <${publish}> `]) {
    assert.deepEqual(inlineOf(`[Publish](${destination})`, allowed), [link], JSON.stringify(destination))
  }
  // The two shortenings keep working when padded.
  assert.deepEqual(inlineOf('[Publish]( /?tab=tracy:site-publish&site=site )', allowed), [link])
  assert.deepEqual(inlineOf('[Site]( /site )', allowed), [{ kind: 'link', text: 'Site', href: '/site/' }])
  for (const destination of [' /unlisted', ' /unlisted ', ' <https://unlisted.example/> ']) {
    assert.deepEqual(
      inlineOf(`[Other](${destination})`, allowed),
      [{ kind: 'text', text: 'Other' }],
      destination
    )
  }
  for (const destination of [' /site bad ', ' /site(foo) ', ' /<site>bad ']) {
    assert.ok(!inlineOf(`[Other](${destination})`, allowed).some((p) => p.kind === 'link'), destination)
  }
  assert.equal(listedHref('/site', allowed), '/site/')
  assert.equal(listedHref('/?tab=tracy:team&site=site', allowed), null)
  // Paragraphs and list items share inlineOf.
  assert.deepEqual(blocksOf(`[Publish]( ${publish} )\n\n- [Publish]( ${publish} )`, allowed), [
    { kind: 'paragraph', inline: [link] },
    { kind: 'list', ordered: false, items: [[link]] }
  ])
})

test('blocksOf: paragraphs, bullet and numbered lists, bold, code; HTML stays text', () => {
  const blocks = blocksOf(
    '**Steps**\n\n1. Open Add site\n2. Pick `WordPress`\n\n- one\n- two\n<img src=x onerror=alert(1)>',
    new Set()
  )
  assert.deepEqual(blocks, [
    { kind: 'paragraph', inline: [{ kind: 'bold', text: 'Steps' }] },
    {
      kind: 'list',
      ordered: true,
      items: [
        [{ kind: 'text', text: 'Open Add site' }],
        [
          { kind: 'text', text: 'Pick ' },
          { kind: 'code', text: 'WordPress' }
        ]
      ]
    },
    {
      kind: 'list',
      ordered: false,
      items: [[{ kind: 'text', text: 'one' }], [{ kind: 'text', text: 'two' }]]
    },
    { kind: 'paragraph', inline: [{ kind: 'text', text: '<img src=x onerror=alert(1)>' }] }
  ])
})

test('siteOfPage names the site of a workspace and nothing on the creation workspace', () => {
  assert.equal(siteOfPage('https://cowork.tracy.ai/bakery.tracy.site/'), 'bakery.tracy.site')
  assert.equal(siteOfPage('https://cowork.tracy.ai/bakery.tracy.site/s/abc'), 'bakery.tracy.site')
  assert.equal(siteOfPage('https://cowork.tracy.ai/new/'), null)
  assert.equal(siteOfPage('https://cowork.tracy.ai/'), null)
  assert.equal(siteOfPage('not a url'), null)
})

test('errorKeyOf maps the door’s refusals to what Help says', () => {
  assert.equal(errorKeyOf(401, 'NOT_SIGNED_IN'), 'error.signin')
  assert.equal(errorKeyOf(429, 'RATE_LIMITED'), 'error.limit')
  assert.equal(errorKeyOf(400, 'BAD_MESSAGE'), 'error.tooLong')
  assert.equal(errorKeyOf(503, 'NOT_CONFIGURED'), 'error.unavailable')
  assert.equal(errorKeyOf(429, 'RATE_LIMITED', 'day'), 'error.limitDay')
})

test('listedHref rebuilds the two shortenings a model makes, and only into a listed address', () => {
  const allowed = new Set(['/shop.tracy.site/', '/shop.tracy.site/?tab=tracy:changes&site=shop.tracy.site'])
  assert.equal(
    listedHref('/?tab=tracy:changes&site=shop.tracy.site', allowed),
    '/shop.tracy.site/?tab=tracy:changes&site=shop.tracy.site'
  )
  assert.equal(listedHref('/shop.tracy.site', allowed), '/shop.tracy.site/')
  // Rebuilt but not listed: another site, another tab, an outside address.
  assert.equal(listedHref('/?tab=tracy:changes&site=other.tracy.site', allowed), null)
  assert.equal(listedHref('/?tab=tracy:team&site=shop.tracy.site', allowed), null)
  assert.equal(listedHref('https://evil.example/', allowed), null)
  assert.equal(listedHref('//evil.example', allowed), null)
})

test('blocksOf: a fenced block is one copy block of plain text; markup inside stays text; an open fence streams', () => {
  const none = new Set()
  const done = blocksOf(
    'Try this:\n```\nChange the footer phone to <b>0909 123 456</b>.\nKeep the rest.\n```\nDone.',
    none
  )
  assert.deepEqual(
    done.map((b) => b.kind),
    ['paragraph', 'copy', 'paragraph']
  )
  assert.equal(done[1].text, 'Change the footer phone to <b>0909 123 456</b>.\nKeep the rest.')
  const open = blocksOf('Try:\n```\nChange the foo', none)
  assert.deepEqual(
    open.map((b) => b.kind),
    ['paragraph', 'copy']
  )
  assert.equal(open[1].text, 'Change the foo')
  assert.deepEqual(
    blocksOf('- a\n```\nx\n```', none).map((b) => b.kind),
    ['list', 'copy']
  )
})
