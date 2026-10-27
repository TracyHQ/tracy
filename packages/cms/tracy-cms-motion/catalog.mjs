/**
 * The motion library's catalogue: the slot list, the effect records, and the library version.
 *
 * This file is the single source of the version integer. The build stamps it onto line 1 of the
 * emitted JS and refuses any effect declaring a `since` ahead of it, so a site can never be handed
 * a file that claims to carry an effect the file does not hold.
 *
 * Slot names are frozen. An effect id is bare kebab-case, is unique library-wide, and is never
 * reused: every name the library writes into a customer's page derives from it under the one
 * prefix `tracy-motion-` (keyframes `tracy-motion-<id>`, class `.tracy-motion-<id>`).
 */

/**
 * Monotonically increasing integer, and the single source of the library version. It answers one
 * question: which library a live site is running, read off line 1 of the file that site holds. It
 * moves when a release goes out carrying something a site can be behind on — a new effect, which
 * declares the version it arrives in as its `since`.
 */
export const VERSION = 2

/**
 * The slots. A slot is a trigger plus a target. The first four target structurally, never
 * `tracy-*`; `button-hover` and `page-background` are partitioned here with no effect yet — the
 * gallery derives its groups from the effect list, so an empty group cannot appear.
 *
 * The three slots added in version 2 are OPT-IN BY MARKUP: they touch only an element that carries
 * the slot's own class (`tracy-motion-reveal`, `tracy-motion-carousel`, `tracy-motion-pulse`), a
 * class a block's author sets. A page with none of those classes behaves exactly as under version 1.
 * They exist for ported templates whose design is element-level motion — JA Vega (26/09): 53 scroll-in
 * elements with their own direction and delay, three carousels, two pulsing rings.
 */
export const SLOTS = Object.freeze([
  Object.freeze({
    id: 'hero-entrance',
    trigger: 'page-load',
    targetRule: 'the first outermost <section> inside <main>, in document order',
    galleryLabel: 'Hero entrance',
    order: 1
  }),
  Object.freeze({
    id: 'section-reveal',
    trigger: 'scroll-into-view, once',
    targetRule: 'every other outermost <section> inside <main>',
    galleryLabel: 'Section reveal',
    order: 2
  }),
  Object.freeze({
    id: 'button-hover',
    trigger: 'hover / click, gated @media (hover: hover), :focus-visible mirrors hover',
    targetRule: 'button-like elements page-wide',
    galleryLabel: 'Button hover',
    order: 3
  }),
  Object.freeze({
    id: 'page-background',
    trigger: 'page-load, continuous',
    targetRule: 'the whole-page background layer',
    galleryLabel: 'Page background',
    order: 4
  }),
  Object.freeze({
    id: 'element-reveal',
    trigger: 'scroll-into-view, once',
    targetRule: 'every element inside <main> carrying the class tracy-motion-reveal',
    galleryLabel: 'Element reveal',
    order: 5
  }),
  Object.freeze({
    id: 'carousel',
    trigger: 'visitor: previous / next controls, dots, arrow keys, swipe',
    targetRule:
      'every element inside <main> carrying the class tracy-motion-carousel; its first child is the track and the track children are the slides',
    galleryLabel: 'Carousel',
    order: 6
  }),
  Object.freeze({
    id: 'loop',
    trigger: 'page-load, continuous',
    targetRule: 'every element inside <main> carrying the class tracy-motion-pulse',
    galleryLabel: 'Attention loop',
    order: 7
  })
])

/**
 * The effects, in gallery order within their group. Six fields each, none optional. Every effect
 * ships both intensities; `subtle` is the default.
 */
export const EFFECTS = Object.freeze([
  Object.freeze({
    id: 'hero-stagger',
    since: 1,
    slot: 'hero-entrance',
    cssPropsWritten: 'opacity, transform, animation; 8 delay rungs, set through the Web Animations API',
    sampleHtml:
      '<main><section><div class="tracy-hero__inner"><div class="tracy-hero__copy"><p class="tracy-eyebrow">Launch faster</p><h1>Your site, ready this week</h1><p class="tracy-lead">Tracy writes the words with you, section by section.</p><div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="#start">Start</a></div><div class="wp-block-button"><a class="wp-block-button__link" href="#pricing">See pricing</a></div></div><p class="tracy-hero__note">No credit card</p></div><figure class="tracy-hero__media"><div style="aspect-ratio:16/9;background:#d8dee9"></div></figure></div></section></main>',
    description: 'On load, the hero units arrive one after another in document order, not all at once.'
  }),
  Object.freeze({
    id: 'fade-up',
    since: 1,
    slot: 'section-reveal',
    cssPropsWritten: 'opacity, transform, animation; 8 delay rungs, set through the Web Animations API',
    sampleHtml:
      '<main><section><p class="tracy-eyebrow">Above the fold</p><h1>Your site, ready this week</h1></section><section><h2>Everything you need to open</h2><p class="tracy-lead">Three plans, one place to start.</p><div class="wp-block-columns"><div class="wp-block-column"><h3>Starter</h3><p>One site, written with you.</p></div><div class="wp-block-column"><h3>Studio</h3><p>A small team, one voice.</p></div><div class="wp-block-column"><h3>Agency</h3><p>Many sites, one desk.</p></div></div></section></main>',
    description: 'As a section below the hero scrolls into view, its units rise slightly and fade in, once.'
  }),
  Object.freeze({
    id: 'reveal',
    since: 2,
    slot: 'element-reveal',
    cssPropsWritten:
      'opacity, transform, animation, animation-name; direction and delay read off the element’s own classes',
    sampleHtml:
      '<main><section><h2 class="tracy-motion-reveal">What we do</h2><div class="wp-block-columns"><div class="wp-block-column tracy-motion-reveal tracy-motion-delay-1"><h3>Consultancy</h3></div><div class="wp-block-column tracy-motion-reveal tracy-motion-delay-2"><h3>Cloud</h3></div><div class="wp-block-column tracy-motion-reveal tracy-motion-reveal--fade-left tracy-motion-delay-3"><h3>Apps</h3></div></div></section></main>',
    description:
      'Each marked element fades in from its own direction (up, from the right, from the left, or flipping up) the first time it scrolls into view, after its own delay.'
  }),
  Object.freeze({
    id: 'carousel-step',
    since: 2,
    slot: 'carousel',
    cssPropsWritten: '; the track is moved through the Web Animations API, the layout comes from the theme',
    sampleHtml:
      '<main><section><div class="tracy-motion-carousel tracy-motion-carousel--dots"><div class="tracy-motion-track"><figure class="tracy-motion-slide">One</figure><figure class="tracy-motion-slide">Two</figure><figure class="tracy-motion-slide">Three</figure></div></div></section></main>',
    description:
      'Slides move sideways one step at a time from previous / next controls, dots, the arrow keys or a swipe, and wrap round at either end; nothing moves on its own.'
  }),
  Object.freeze({
    id: 'pulse',
    since: 2,
    slot: 'loop',
    cssPropsWritten: 'opacity, scale, animation, animation-delay; two rings, the second half a beat behind',
    sampleHtml:
      '<main><section><a class="tracy-motion-pulse" href="#video" aria-label="Play the video">▶</a></section></main>',
    description:
      'Two rings swell out of the marked element and fade, over and over, the second one a moment after the first.'
  })
])
