// @vitest-environment jsdom
/**
 * The one way the fork draws a person (Tracy, TCH plan `tasks/todo-account-menu.md` C6): the face
 * the server sent (`{initial, color, avatarUrl}`), drawn as TCH's `Face`
 * (`packages/core/tracy-core/src/team/face.tsx`) draws it — the photo when there is one, the letter
 * on the colour when there is none or the photo does not load.
 */
import { createElement } from 'react'
import { act } from 'react-dom/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRoot, setupReactAct, type RenderedRoot } from './test-utils.ts'
import { Face, NEUTRAL_FACE_COLOUR, fallbackInitial } from '../src/client/face.tsx'

setupReactAct()

let view: RenderedRoot | null = null
afterEach(() => {
  view?.unmount()
  view = null
})

function draw(face: Parameters<typeof Face>[0]['face'], size = 24): HTMLElement {
  view = renderRoot(createElement(Face, { face, size }))
  return view.container.querySelector<HTMLElement>('[data-tracy-face]')!
}

describe('Face: one person, drawn from the face the server sent', () => {
  it('draws the letter on the colour when there is no photo: round, white, 45% of the size, weight 600', () => {
    const face = draw({ initial: 'S', color: '#db2777', avatarUrl: null }, 40)
    expect(face.textContent).toBe('S')
    expect(face.querySelector('img')).toBeNull()
    expect(face.style.background).toBe('rgb(219, 39, 119)')
    expect(face.style.color).toBe('rgb(255, 255, 255)')
    expect(face.style.borderRadius).toBe('50%')
    expect(face.style.width).toBe('40px')
    expect(face.style.fontSize).toBe('18px')
    expect(face.style.fontWeight).toBe('600')
  })

  it('draws the photo when the server sent one, and no letter', () => {
    const face = draw({ initial: 'S', color: '#db2777', avatarUrl: 'https://example.com/sam.png' })
    expect(face.querySelector('img')?.getAttribute('src')).toBe('https://example.com/sam.png')
    expect(face.textContent).toBe('')
  })

  it('a photo that fails to load gives way to the letter', () => {
    const face = draw({ initial: 'S', color: '#db2777', avatarUrl: 'https://example.com/broken.png' })
    act(() => { face.querySelector('img')!.dispatchEvent(new Event('error')) })
    expect(face.querySelector('img')).toBeNull()
    expect(face.textContent).toBe('S')
  })

  it('a face with no colour stands on the neutral grey', () => {
    const face = draw({ initial: 'L', color: '', avatarUrl: null })
    expect(face.getAttribute('style')).toContain(`background: ${NEUTRAL_FACE_COLOUR}`)
  })
})

describe('fallbackInitial: the letter the server would give a person it sent no face for', () => {
  it('is the first character of the name, else of the email, upper case; ? with neither', () => {
    expect(fallbackInitial({ name: 'élodie', email: 'x@example.com' })).toBe('É')
    expect(fallbackInitial({ name: '', email: 'lee@example.com' })).toBe('L')
    expect(fallbackInitial({ email: '😀@example.com' })).toBe('😀')
    expect(fallbackInitial({})).toBe('?')
  })
})
