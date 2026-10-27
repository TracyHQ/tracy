/**
 * The thread card head's "On <element>" for a comment anchored on an image (Akemi 01/10/2026, option
 * a): `Image · "<alt>"`, else `Image · <file name>` — the same words as the Comments tab row (TCH
 * tracy-chat-input `imageAnchor`). Measured on dev: wp-ja-kinetic's hero terminal panel is an `<img>`
 * whose alt repeats the heading, so its card read "On "Ship fast. Sleep through the night."".
 */
import { describe, expect, it } from 'vitest'
import { threadPlace } from '../src/client/comment-store.ts'
import type { PreviewPickTarget } from '../src/client/preview-protocol.generated.ts'

const HOME = 'https://kineticakemi.tracy.site/'
const PANEL = 'https://kineticakemi.tracy.site/wp-content/themes/wp-ja-kinetic/assets/img/hero-terminal-panel-terminal.webp'
const WORDS = 'Ship fast. Sleep through the night.'
const target = (over: Partial<PreviewPickTarget>): PreviewPickTarget => ({ text: WORDS, tag: 'h1', image: null, domPath: 'h1', selector: 'h1', rect: { x: 1, y: 2, width: 3, height: 4 }, marks: [], levels: [], level: 0, ...over })
const place = (element: PreviewPickTarget, image?: string): string | null => threadPlace({ url: HOME, element, locate: null }, image)

describe('threadPlace on an image', () => {
  it('names the kinetic terminal panel as an image with its alt, not as the heading', () => {
    expect(place(target({ tag: 'img', selector: 'img.hx-panelimg.is-terminal', image: { src: `${PANEL}?ver=1.4`, alt: WORDS } }))).toBe(`Image · "${WORDS}"`)
  })
  it('falls back to the file name, decoded and without query or hash, when the alt is empty', () => {
    expect(place(target({ tag: 'img', text: '', image: { src: 'https://x.test/media/hero%20terminal.webp?ver=2#y', alt: ' ' } }))).toBe('Image · hero terminal.webp')
  })
  it('says the kind in the caller\'s language', () => {
    expect(place(target({ tag: 'img', image: { src: PANEL, alt: WORDS } }), 'Ảnh')).toBe(`Ảnh · "${WORDS}"`)
  })
  it('treats a wordless wrapper around one image as the image', () => {
    expect(place(target({ tag: 'a', text: '', image: { src: PANEL, alt: '' } }))).toBe('Image · hero-terminal-panel-terminal.webp')
  })
  it('leaves a heading, and a section with words over a background image, as they were', () => {
    expect(place(target({}))).toBe(`"${WORDS}"`)
    expect(place(target({ tag: 'section', text: 'Hero words', image: { src: PANEL, alt: '' } }))).toBe('"Hero words"')
  })
})
