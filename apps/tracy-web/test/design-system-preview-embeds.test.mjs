/**
 * Script-only third-party content in the design system preview (16/10/2026): the preview frame runs no
 * script, so JA Directory's "Featured Video" (and JA Spa's "Our spa") showed YouTube's error, its
 * Contact map was a blank band, and its Owl carousels were not there. Markup cut from the JA Directory
 * Joomla 1.0.4 demo and the JA Google Map plugin's template (`tmpl/default.php`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  EMBEDS_STYLE,
  standInOf,
  withScriptlessEmbeds,
  youtubeIdOf
} from '../src/sites/design-system-preview-embeds.js'
import { previewDocOf } from '../src/sites/design-system-preview-page.js'

const BASE = 'https://ja-directory.tracy.site/index.php/home'
const VIDEO =
  '<iframe width="560" height="315" src="https://www.youtube.com/embed/Spel7vfkpNc?rel=0&amp;controls=0&amp;showinfo=0" frameborder="0" allowfullscreen></iframe>'
const MAP =
  '<div id="ja-widget-map95-container" class="map-container" style="width:100%">\n    <div id="ja-widget-map95" style="height:500px"></div>\n\t<div id="ja-widget-map95-route" class="map-route"></div>\n</div>'

test('a YouTube frame shows the video poster, linked to the video, and loads nothing from YouTube', () => {
  const out = withScriptlessEmbeds(VIDEO, { base: BASE })
  assert.doesNotMatch(out, /\ssrc=/, 'no address left to load')
  assert.match(out, /^<iframe srcdoc="/)
  // the template's sizing stays on the same element
  assert.match(out, /width="560" height="315"/)
  assert.match(out, /i\.ytimg\.com\/vi\/Spel7vfkpNc\/hqdefault\.jpg/)
  assert.match(out, /youtube\.com\/watch\?v=Spel7vfkpNc/)
  assert.match(out, /target=&quot;_blank&quot;/)
})

test('the video id is read from every YouTube address form, and only from YouTube', () => {
  const id = (/** @type {string} */ s) => youtubeIdOf(new URL(s))
  assert.equal(id('https://www.youtube.com/embed/Spel7vfkpNc?rel=0'), 'Spel7vfkpNc')
  assert.equal(id('https://www.youtube-nocookie.com/embed/Spel7vfkpNc'), 'Spel7vfkpNc')
  assert.equal(id('https://youtu.be/Spel7vfkpNc'), 'Spel7vfkpNc')
  assert.equal(id('https://www.youtube.com/watch?v=Spel7vfkpNc'), 'Spel7vfkpNc')
  assert.equal(id('https://player.vimeo.com/video/1'), null)
  assert.equal(id('https://www.youtube.com/embed/"><script>'), null)
})

test('another provider, a lazy frame and a map frame get a soft box with a glyph, no words', () => {
  const vimeo = withScriptlessEmbeds(
    '<iframe data-src="https://player.vimeo.com/video/1" class="lazy"></iframe>',
    {
      base: BASE
    }
  )
  assert.doesNotMatch(vimeo, /data-src=/)
  assert.match(vimeo, /class="lazy"/)
  assert.match(vimeo, /srcdoc="[^"]*M8 5v14l11-7z/)
  const map = standInOf(new URL('https://www.google.com/maps/embed?pb=1'))
  assert.match(map, /M12 2a7 7 0 0 0-7 7/, 'a map pin')
  const words = map
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]*>/g, '')
    .trim()
  assert.equal(words, '', 'no visible words')
})

test('frames of the demo itself and tracking frames stay as they are', () => {
  const own =
    '<iframe src="/index.php/form"></iframe><iframe src="https://ja-directory.tracy.site/x"></iframe>'
  assert.equal(withScriptlessEmbeds(own, { base: BASE }), own)
  const gtm =
    '<iframe src="https://www.googletagmanager.com/ns.html" height="0" width="0" style="display:none"></iframe>'
  assert.equal(withScriptlessEmbeds(gtm, { base: BASE }), gtm)
  const done = '<iframe srcdoc="&lt;p&gt;x"></iframe>'
  assert.equal(withScriptlessEmbeds(done, { base: BASE }), done)
})

test("the JA Google Map plugin's empty box gets a map pin; its empty route box does not", () => {
  const out = withScriptlessEmbeds(MAP, { base: BASE })
  assert.match(out, /<div id="ja-widget-map95" style="height:500px"><span class="tracy-preview-map"><svg/)
  assert.match(out, /<div id="ja-widget-map95-route" class="map-route"><\/div>/)
  // an empty box that only names a map, or a box with something in it, is not a map waiting for a script
  for (const kept of [
    '<div class="sitemap" style="height:200px"></div>',
    '<div id="map" style="height:300px"><img src="/m.png"></div>',
    '<div class="map"></div>'
  ])
    assert.equal(withScriptlessEmbeds(kept, { base: BASE }), kept)
})

test('the preview carries the stand-ins and the rule that lays a carousel that never started in a row', () => {
  const doc = previewDocOf(
    `<html><head></head><body><div class="owl-carousel owl-theme"><div class="item">1</div></div>${VIDEO}${MAP}</body></html>`,
    {
      platform: 'joomla',
      bytes: '<style id="tracy-ds-slot"></style>',
      base: BASE,
      inner: 'http://b2-l1-web/'
    }
  )
  assert.ok(doc)
  assert.ok(doc.includes(EMBEDS_STYLE))
  assert.match(EMBEDS_STYLE, /\.owl-carousel:not\(\.owl-loaded\)\{display:flex!important/)
  assert.ok(doc.indexOf(EMBEDS_STYLE) < doc.indexOf('tracy-ds-slot'), 'before the slot')
  assert.doesNotMatch(doc, /youtube\.com\/embed/)
  assert.match(doc, /tracy-preview-map/)
  // no literal colour in the page itself: the box takes the colour of where it sits
  assert.doesNotMatch(EMBEDS_STYLE, /#[0-9a-f]{3,8}\b|rgba?\(/i)
})

test("a frame on the demo's container is the demo's own, once its address is made public", () => {
  const doc = previewDocOf(
    '<html><head></head><body><iframe src="http://b2-l1-web/index.php/x"></iframe></body></html>',
    {
      platform: 'joomla',
      bytes: '',
      base: BASE,
      inner: 'http://b2-l1-web/'
    }
  )
  assert.match(doc ?? '', /<iframe src="https:\/\/ja-directory\.tracy\.site\/index\.php\/x"><\/iframe>/)
})
