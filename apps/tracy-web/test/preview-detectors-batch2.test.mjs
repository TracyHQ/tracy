/**
 * Findings the batch 2 preview measurement (16/10/2026, 31 JA templates at probe v8) showed to be the
 * probe reading the template's own design as the wear's fault, each checked on the page by eye:
 * - heading-quiet (HIER-2): JA Resort, Spa and Space set their masthead heading in white on a background
 *   picture (`.ja-masthead[style=background-image:url(…)]`); the probe walked past the picture to the
 *   section's ground, which the system repaints white, and read "1.09:1" for a heading that reads on the photo.
 * - logo-doubled (LOGO-2): JA Resort's footer logo sits in T4's `#t4-footnav`, a footer the probe did not
 *   know by name, so it counted as a second header logo.
 * - button-role (BTN-2): JA Voyara's pricing FAQ is a Bootstrap accordion; each question row is a <button
 *   aria-expanded> the width of the column, hugged by its 14px-cornered item. A disclosure row is no call to
 *   action, and the visitor sees a list of questions, not square buttons beside the system's pills.
 * - template-fonts-left (FONT-2): JA Space's footer "Powered By T3 Framework" is a picture with its words
 *   hidden by Bootstrap's `.text-hide` (`font: 0/0 a; color: transparent`); the probe counted the hidden words
 *   as a block in the family "a" on every page.
 * - the preview probe's texts (CON-2 lowText) and heading-quiet: JA Space's header (white menu) and
 *   JA Donate's hero heading are painted over a hero picture that is not their ancestor (the header is the
 *   hero's earlier sibling, pulled over it); walking up the ancestors found the page's white and read the
 *   white words as 1:1. A picture inside the ancestor that gives the ground, under the words, is their ground.
 * - shape-fill (TPL-2): JA Vega's typography page shows Bootstrap's image placeholders, an
 *   `<svg class="bd-placeholder-img" role="img" aria-label="Placeholder: Image cap">` with a grey rect; the
 *   probe read the picture's rect as a template shape left in its colour.
 * - shape-fill (TPL-2): JA Podcast's "Listen On Spotify" icon is a 24×25 SVG whose path runs past the
 *   SVG's box (an 80×24 bounding box, clipped); its unclipped box passed the shape size and the green icon
 *   counted as a shape on every page, where an icon glyph is below the size the detector judges.
 * - collapsed-button (CLIP-1): JA Vogue's outline buttons ("CONTACT US", 139×38) draw their hover fill with a
 *   0px-high ::before rotated 45° inside overflow:hidden; it raised the button's scrollHeight to 67 against
 *   36 and every one read "label cut", while the words (95×20 at 9px from the top) show whole.
 * - heading-quiet (HIER-2) and every probe that asks `seen`: JA Morgan's registration form names its terms
 *   fieldset with a `legend.visually-hidden` (1×1 px, clipped), text for a screen reader the visitor never
 *   sees, and it was judged as a heading quieter than the body.
 * The probes run in a real headless Chrome. Skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import {
  detect as collapsed,
  probe as collapsedProbe
} from '../scripts/preview-detectors/collapsed-button.mjs'
import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { detect as buttonRole, probe as roleProbe } from '../scripts/preview-detectors/button-role.mjs'
import {
  detect as fontsLeft,
  probe as fontsProbe
} from '../scripts/preview-detectors/template-fonts-left.mjs'
import { PREVIEW_PROBE } from '../src/sites/design-system-preview-probe.js'
import { detect as shapeFill, probe as shapeProbe } from '../scripts/preview-detectors/shape-fill.mjs'
import { detect as headingQuiet, probe as headingProbe } from '../scripts/preview-detectors/heading-quiet.mjs'
import { detect as logoDoubled, probe as logoProbe } from '../scripts/preview-detectors/logo-doubled.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }
const page = (/** @type {string} */ body, bg = '#ffffff') =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="margin:0;background:${bg}">${body}</body></html>`)}`

// a 2×2 dark picture, as a masthead's photo
const PHOTO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#203040"/></svg>'
  )
const MASTHEAD = (
  /** @type {string} */ section,
  /** @type {string} */ text,
  /** @type {string} */ heading = '#ffffff'
) =>
  `<section style="background:${section};padding:20px"><div style="background-image:url('${PHOTO}');background-size:cover;padding:60px"><h3 style="color:${heading};font-size:40px">Hotel Reservations</h3></div><p style="color:${text}">Book now at any of our resorts worldwide and get the best rate guaranteed.</p></section>`

test(
  'heading-quiet: a heading on a background picture is not judged against the ground under the picture',
  opts,
  async () => {
    const chrome = await browser(9661)
    try {
      const read = async (/** @type {string} */ html) => {
        await chrome.open(page(html), 1200)
        return chrome.evaluate(headingProbe)
      }
      // the template's section is dark, the system repaints it white; the heading stays on the photo
      const plain = await read(MASTHEAD('#333333', '#dddddd'))
      const worn = await read(MASTHEAD('#ffffff', '#222222'))
      assert.equal(headingQuiet({ worn: { data: worn }, plain: { data: plain } }).count, 0)
      // a heading on the repainted ground itself, quieter than the body text there, is still found
      const flat = (
        /** @type {string} */ section,
        /** @type {string} */ text,
        /** @type {string} */ heading
      ) =>
        `<section style="background:${section};padding:20px"><h3 style="color:${heading};font-size:40px">Hotel Reservations</h3><p style="color:${text}">Book now at any of our resorts worldwide and get the best rate guaranteed.</p></section>`
      const plainFlat = await read(flat('#333333', '#dddddd', '#ffffff'))
      const wornFlat = await read(flat('#ffffff', '#222222', '#eeeeee'))
      assert.equal(headingQuiet({ worn: { data: wornFlat }, plain: { data: plainFlat } }).count, 1)
    } finally {
      await chrome.close()
    }
  }
)

const LOGO = (/** @type {string} */ src) =>
  `<div class="navbar-brand logo-image"><a href="/"><img class="logo-img" width="168" height="48" src="${src}" alt="Logo"></a></div>`

test(
  'logo-doubled: a logo at the foot of the page is the footer’s, whatever its box is named',
  opts,
  async () => {
    const chrome = await browser(9662)
    try {
      const read = async (/** @type {string} */ html) => {
        await chrome.open(page(html), 1200)
        return chrome.evaluate(logoProbe)
      }
      const html = `<header id="t4-header">${LOGO(PHOTO)}</header><main style="height:3000px">Content</main><div id="t4-footnav" class="t4-section t4-footnav">${LOGO(PHOTO)}</div>`
      const data = await read(html)
      assert.equal(data.header.length, 1)
      assert.equal(data.footer.length, 1)
      assert.equal(logoDoubled({ worn: { data }, plain: { data } }).count, 0)
      // two logos side by side in the header are still two
      const twice = await read(
        `<header id="t4-header">${LOGO(PHOTO)}${LOGO(PHOTO)}</header><main style="height:3000px">Content</main>`
      )
      assert.equal(logoDoubled({ worn: { data: twice }, plain: { data } }).count, 1)
    } finally {
      await chrome.close()
    }
  }
)

const SLOT = '<style id="tracy-ds-slot">:root{--ds-btn-radius:36px;--ds-c-accent:#4d49fc}</style>'
const QUESTION = (/** @type {string} */ q) =>
  `<div class="accordion-item" style="border-radius:14px;background:#f5f5f5;width:600px;overflow:hidden"><h2 style="margin:0"><button class="accordion-button collapsed" type="button" aria-expanded="false" aria-controls="faq1" style="width:100%;padding:28px 24px;border:0;background:transparent;text-align:left;font-size:18px">${q}</button></h2></div>`

test(
  'button-role: a disclosure row the width of its column is not judged as the system\u2019s button',
  opts,
  async () => {
    const chrome = await browser(9663)
    try {
      const read = async (/** @type {string} */ html) => {
        await chrome.open(page(`${SLOT}<div style="padding:40px">${html}</div>`), 1200)
        return chrome.evaluate(roleProbe)
      }
      const pill =
        '<a class="btn" style="display:inline-block;padding:10px 20px;border-radius:36px;background:#4d49fc;color:#fff">Choose Voyager</a>'
      const faq = await read(`${pill}${QUESTION('Do you charge booking fees on top of the plan?')}`)
      const colours = ['#4d49fc', '#f5f5f5', '#ffffff', '#000000']
      assert.equal(buttonRole({ worn: { data: faq }, plain: { data: faq }, systemColours: colours }).count, 0)
      // a square button beside the pills is still found
      const square = await read(
        `${pill}<button style="padding:10px 20px;border:0;border-radius:0;background:#4d49fc;color:#fff">Send</button>`
      )
      assert.equal(
        buttonRole({ worn: { data: square }, plain: { data: square }, systemColours: colours }).count,
        1
      )
    } finally {
      await chrome.close()
    }
  }
)

test(
  'template-fonts-left: words hidden behind a picture (font size 0, transparent) are no text block',
  opts,
  async () => {
    const chrome = await browser(9664)
    try {
      const read = async (/** @type {string} */ html) => {
        await chrome.open(page(html), 1200)
        return chrome.evaluate(fontsProbe)
      }
      const hidden = `<a class="t3-logo-small text-hide" style="display:block;width:60px;height:30px;font:0/0 a;color:transparent;background:url('${PHOTO}')">Powered By <strong>T3 Framework</strong></a>`
      const slot = '<style id="tracy-ds-slot">:root{--ds-font-body:"IBM Plex Sans"}</style>'
      const plain = await read(`${hidden}<p style="font-family:'Template Text'">Words of the template</p>`)
      assert.equal(plain.families.a, undefined, 'the hidden words are left out')
      const worn = await read(`${hidden}<p style="font-family:'IBM Plex Sans'">Words of the system</p>`)
      assert.equal(fontsLeft({ worn: { data: worn, html: slot }, plain: { data: plain } }).count, 0)
    } finally {
      await chrome.close()
    }
  }
)

// a transparent header pulled over the hero picture that follows it (JA Space)
const OVER_HERO = (/** @type {string} */ words) =>
  `<div style="background:#ffffff"><header style="position:absolute;top:0;left:0;right:0;padding:20px"><a href="/" style="color:#ffffff">${words}</a></header><div style="height:600px;background-image:url('${PHOTO}');background-size:cover"><h2 style="margin:0;padding-top:200px;color:#ffffff;font-size:48px">Everyone. Everywhere.</h2></div><p style="color:#222222">Body text of the page, long enough to be read as the page's words.</p></div>`

test(
  'preview probe and heading-quiet: words painted over a picture that is not their ancestor have no ground',
  opts,
  async () => {
    const chrome = await browser(9665)
    try {
      await chrome.open(page(OVER_HERO('Our projects')), 1200)
      const base = await chrome.evaluate(PREVIEW_PROBE)
      assert.equal(
        base.texts.find((/** @type {any} */ t) => t.text === 'Our projects'),
        undefined,
        'the menu on the hero is left out'
      )
      assert.ok(
        base.texts.some((/** @type {any} */ t) => t.text.startsWith('Body text')),
        'the page text is still read'
      )
      const headings = await chrome.evaluate(headingProbe)
      assert.equal(
        headings.headings.find((/** @type {any} */ h) => /Everyone/.test(h.text)),
        undefined
      )
    } finally {
      await chrome.close()
    }
  }
)

const PLACEHOLDER =
  '<svg class="bd-placeholder-img card-img-top" width="300" height="180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Placeholder: Image cap"><rect width="100%" height="100%" fill="#868e96"></rect><text x="40%" y="50%" fill="#dee2e6">Image cap</text></svg>'
const WEDGE =
  '<svg width="600" height="80" viewBox="0 0 600 80" preserveAspectRatio="none"><path class="shape-fill" d="M0 0 L600 80 L0 80 Z" fill="#868e96"></path></svg>'

test(
  'shape-fill: an SVG that says it is a picture (role=img) is the template\u2019s art, not a shape',
  opts,
  async () => {
    const chrome = await browser(9666)
    try {
      const read = async (/** @type {string} */ html) => {
        await chrome.open(page(html), 1200)
        return chrome.evaluate(shapeProbe)
      }
      const data = await read(`<div class="card">${PLACEHOLDER}</div>`)
      const colours = ['#4d49fc', '#ffffff', '#000000']
      assert.equal(shapeFill({ worn: { data }, plain: { data }, systemColours: colours }).count, 0)
      assert.ok(
        data.excluded.some((/** @type {any} */ x) => /picture/.test(x.reason)),
        'listed as excluded'
      )
      // a section wedge in the template's grey is still found
      const wedge = await read(WEDGE)
      assert.equal(
        shapeFill({ worn: { data: wedge }, plain: { data: wedge }, systemColours: colours }).count,
        1
      )
    } finally {
      await chrome.close()
    }
  }
)

// a 24px icon whose path's bounding box runs past the SVG (Spotify's mark with its hidden wordmark)
const ICON =
  '<a href="#" title="Listen On Spotify"><svg width="24" height="25" viewBox="0 0 24 25"><path d="M0 0 H80 V24 H0 Z" fill="#2ebd59"></path></svg></a>'

test(
  'shape-fill: a shape is as large as it shows inside its SVG, so an icon stays an icon',
  opts,
  async () => {
    const chrome = await browser(9667)
    try {
      await chrome.open(page(ICON), 1200)
      const data = await chrome.evaluate(shapeProbe)
      const colours = ['#4d49fc', '#ffffff', '#000000']
      assert.equal(shapeFill({ worn: { data }, plain: { data }, systemColours: colours }).count, 0)
    } finally {
      await chrome.close()
    }
  }
)

const OUTLINE = (/** @type {string} */ height) =>
  `<style>.btn-o{position:relative;display:inline-block;overflow:hidden;padding:7px 21px;border:1px solid #000;font:16px/22.4px sans-serif;color:#000;height:${height};box-sizing:border-box}.btn-o::before{content:"";position:absolute;top:18px;left:0;width:100%;height:0;background:#84acfb;transform:rotate(45deg)}</style><a class="btn btn-o" href="#">CONTACT US</a>`

test(
  'collapsed-button: a decorative pseudo-element overflowing the button is no cut label',
  opts,
  async () => {
    const chrome = await browser(9668)
    try {
      const read = async (/** @type {string} */ html) => {
        await chrome.open(page(`<div style="padding:40px">${html}</div>`), 1200)
        return chrome.evaluate(collapsedProbe)
      }
      const whole = await read(OUTLINE('38px'))
      assert.equal(collapsed({ worn: { data: whole }, plain: { data: whole } }).count, 0)
      // the same button too short for its words is still cut
      const short = await read(OUTLINE('20px'))
      assert.equal(collapsed({ worn: { data: short }, plain: { data: short } }).count, 1)
    } finally {
      await chrome.close()
    }
  }
)

test('seen: a visually hidden element (1x1, clipped, for a screen reader) is not seen', opts, async () => {
  const chrome = await browser(9669)
  try {
    const sr =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'
    const read = async (/** @type {string} */ legend) => {
      await chrome.open(
        page(
          `<form><fieldset><legend class="visually-hidden" style="${sr};color:${legend};font-size:40px">Terms of Service</legend><p style="color:#000">Body text of the form, long enough to be the page's words.</p></fieldset></form>`
        ),
        1200
      )
      return chrome.evaluate(headingProbe)
    }
    const plain = await read('#000000')
    const worn = await read('#bbbbbb')
    assert.equal(
      worn.headings.find((/** @type {any} */ h) => /Terms/.test(h.text)),
      undefined
    )
    assert.equal(headingQuiet({ worn: { data: worn }, plain: { data: plain } }).count, 0)
  } finally {
    await chrome.close()
  }
})
