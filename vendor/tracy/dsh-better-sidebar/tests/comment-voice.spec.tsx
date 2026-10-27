// @vitest-environment jsdom
/**
 * Tracy's microphone in the comment boxes (`src/client/CommentVoice.tsx`, `voice-bridge.ts`; TCH
 * `feat/voice-comment`): the box draws the component Tracy published on the window, with its text area
 * adapted to the chat box's slot props; nothing published, an unknown version or a component that throws
 * leaves the box as it was. The microphone stands in the text field; listening, its row runs along the field's bottom and, in the
 * foot, only the button Enter presses stays.
 * The real component (Tracy's `VoiceInput`) is held by TCH `tracy-chat-input/test/e2e/voice-comment.test.mjs`;
 * here a stand-in drives the props.
 */
import { createElement, type ReactElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h, Fragment } = await import('react')
  return {
    Pill: (p: { className?: string; onClick?: () => void; children?: ReactNode }) => h('button', { type: 'button', className: p.className, onClick: p.onClick }, p.children),
    Menu: (p: { anchor: ReactNode }) => h(Fragment, null, p.anchor),
    IconRefreshOutlineRegular: () => h('svg', { 'data-icon': 'refresh' }),
    IconPaperclipOutlineRegular: () => h('svg', { 'data-icon': 'paperclip' }),
  }
})

import { CommentOverlay } from '../src/client/CommentLayer.tsx'
import { textDraft } from '../src/client/CommentVoice.tsx'
import { type CommentMode } from '../src/client/comment-controller.ts'
import { SEAT_VIEWER_ATTR } from '../src/client/seat-viewer.ts'
import { VOICE_BRIDGE_EVENT, VOICE_BRIDGE_KEY, VOICE_BRIDGE_VERSION, readVoiceComponent, type VoiceBoxProps, type VoiceSpan } from '../src/client/voice-bridge.ts'
import css from '../src/client/sidebar.module.css'
import { MAI, comment, fixtureMode, picked } from './comment-layer-fixture.ts'

let root: Root | null = null
let host: HTMLDivElement
const slot = globalThis as unknown as Record<string, unknown>

/** What the stand-in microphone saw. */
const seen: { span: VoiceSpan | null; wrote: boolean | null; draft: string | null } = { span: null, wrote: null, draft: null }

/** A stand-in for Tracy's VoiceInput: Dictate writes at the caret and goes active, Done ends, Enter submits. */
function FakeVoice(p: VoiceBoxProps): ReactElement {
  seen.draft = p.useInput(s => s.draft)
  const h = createElement
  return h('span', { 'data-fake-voice': '' },
    h('button', {
      type: 'button',
      'aria-label': 'Dictate',
      disabled: p.locked === true,
      onClick: () => {
        const span = p.inputActions.captureInsertion()
        seen.span = span
        p.onActiveChange?.(true)
        seen.wrote = p.inputActions.insertText(' and more', { start: span.end, end: span.end, draftRev: span.draftRev })
      },
    }),
    h('button', { type: 'button', 'aria-label': 'Done', onClick: () => p.onActiveChange?.(false) }),
    h('button', { type: 'button', 'aria-label': 'Enter while speaking', onClick: () => { p.inputActions.submit() } }),
  )
}

async function publish(Component: unknown, version = VOICE_BRIDGE_VERSION): Promise<void> {
  await act(async () => {
    slot[VOICE_BRIDGE_KEY] = { version, Component }
    window.dispatchEvent(new Event(VOICE_BRIDGE_EVENT))
  })
}
async function unpublish(): Promise<void> {
  await act(async () => {
    delete slot[VOICE_BRIDGE_KEY]
    window.dispatchEvent(new Event(VOICE_BRIDGE_EVENT))
  })
}

beforeEach(() => {
  Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
  host = document.createElement('div')
  document.body.append(host)
  seen.span = null
  seen.wrote = null
  seen.draft = null
})

afterEach(async () => {
  if (root !== null) await act(async () => { root!.unmount() })
  root = null
  host.remove()
  delete slot[VOICE_BRIDGE_KEY]
  document.documentElement.removeAttribute(SEAT_VIEWER_ATTR)
  vi.restoreAllMocks()
})

async function draw(node: ReactElement): Promise<void> {
  root ??= createRoot(host)
  await act(async () => { root!.render(node) })
}
const overlay = (mode: CommentMode): ReactElement => createElement(CommentOverlay, { mode, zoom: 100 })
const q = <T extends Element = HTMLElement>(selector: string): T | null => host.querySelector<T>(selector)
const names = (scope: Element): string[] => [...scope.querySelectorAll('button')].map(b => b.getAttribute('aria-label') ?? b.textContent ?? '')
const click = async (label: string): Promise<void> => {
  const button = [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label)
  if (button === undefined) throw new Error(`no button ${label}`)
  await act(async () => { button.click() })
}

describe('textDraft: a text area under dsh\'s draft rules', () => {
  it('the words go at the caret, replace exactly their own span, and move the revision', () => {
    const writes: string[] = []
    let caret: { start: number; end: number } | null = { start: 4, end: 4 }
    const draft = textDraft(t => { writes.push(t) }, () => caret, () => {})
    draft.sync('Make it red')
    const at = draft.actions.captureInsertion()
    expect(at).toEqual({ start: 4, end: 4, draftRev: 1 })
    expect(draft.actions.insertText(' bold', { start: 4, end: 4, draftRev: at.draftRev })).toBe(true)
    expect(writes.at(-1)).toBe('Make bold it red')
    // The next revision of the phrase replaces what the previous one wrote.
    const next = draft.actions.captureInsertion().draftRev
    expect(draft.actions.insertText(' bolder', { start: 4, end: 9, draftRev: next })).toBe(true)
    expect(writes.at(-1)).toBe('Make bolder it red')
    // The render that shows the microphone's own words moves nothing.
    draft.sync('Make bolder it red')
    caret = null
    expect(draft.actions.captureInsertion()).toEqual({ start: 18, end: 18, draftRev: 3 })
  })

  it('a change it did not write (the person typed) refuses the next edit: the microphone stops', () => {
    const write = vi.fn()
    const draft = textDraft(write, () => null, () => {})
    draft.sync('Hello')
    const at = draft.actions.captureInsertion()
    draft.sync('Hello there')
    expect(draft.actions.insertText(' world', { start: 5, end: 5, draftRev: at.draftRev })).toBe(false)
    expect(write).not.toHaveBeenCalled()
    // An out-of-range span is refused too.
    const now = draft.actions.captureInsertion().draftRev
    expect(draft.actions.insertText('x', { start: 2, end: 99, draftRev: now })).toBe(false)
  })

  it('a selection is never replaced: the caret is the selection\'s end', () => {
    const draft = textDraft(() => {}, () => ({ start: 0, end: 5 }), () => {})
    draft.sync('Hello world')
    expect(draft.actions.captureInsertion()).toMatchObject({ start: 0, end: 5 })
  })
})

describe('the contract', () => {
  it('reads version 1 only, and only a component', () => {
    const target: Record<string, unknown> = {}
    expect(readVoiceComponent(target)).toBeNull()
    target[VOICE_BRIDGE_KEY] = { version: 2, Component: FakeVoice }
    expect(readVoiceComponent(target)).toBeNull()
    target[VOICE_BRIDGE_KEY] = { version: 1, Component: 'nope' }
    expect(readVoiceComponent(target)).toBeNull()
    target[VOICE_BRIDGE_KEY] = { version: 1, Component: FakeVoice }
    expect(readVoiceComponent(target)).toBe(FakeVoice)
  })
})

describe('the new-pick popover', () => {
  it('nothing published: the foot is as it was; published later: the microphone comes first in the foot\'s end', async () => {
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(mode))
    const dialog = q('[role="dialog"]')!
    expect(dialog.hasAttribute('data-voice-composer')).toBe(true)
    expect(names(dialog)).toEqual(['Close', 'Note for team', 'Ask Tracy to edit↵'])
    await publish(FakeVoice)
    expect(names(dialog)).toEqual(['Close', 'Dictate', 'Done', 'Enter while speaking', 'Note for team', 'Ask Tracy to edit↵'])
    // Inside the text field, like the Reply box's paperclip: the foot keeps its width.
    expect(q(`.${css.commentField!} [data-comment-voice] [data-fake-voice]`)).not.toBeNull()
    expect(q(`.${css.commentFoot!} [data-fake-voice]`)).toBeNull()
    expect(seen.draft).toBe('Words')
    await unpublish()
    expect(names(dialog)).toEqual(['Close', 'Note for team', 'Ask Tracy to edit↵'])
  })

  it('listening: the words go into the box, the paperclip and "Note for team" step aside, Ask Tracy stays; done, they come back', async () => {
    await publish(FakeVoice)
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words', attachments: { enabled: true, maxBytes: 10_000_000, maxFiles: 20 } })
    await draw(overlay(mode))
    expect(q('[data-attach]')).not.toBeNull()
    // The person typed "Words": the caret stands after them (jsdom leaves a value set by code at 0).
    q<HTMLTextAreaElement>('[role="dialog"] textarea')!.setSelectionRange(5, 5)
    await click('Dictate')
    expect(seen.wrote).toBe(true)
    expect(mode.setText).toHaveBeenLastCalledWith('Words and more')
    const dialog = q('[role="dialog"]')!
    expect(names(dialog)).toEqual(['Close', 'Dictate', 'Done', 'Enter while speaking', 'Ask Tracy to edit↵'])
    expect(q('[data-attach]')).toBeNull()
    expect(q(`.${css.commentField!} .${css.commentVoiceOn!}`)).not.toBeNull()
    await click('Done')
    expect(names(dialog)).toEqual(['Close', 'Dictate', 'Done', 'Enter while speaking', 'Attach files', 'Note for team', 'Ask Tracy to edit↵'])
    expect(q(`.${css.commentVoiceOn!}`)).toBeNull()
    expect(q('[data-attach]')).not.toBeNull()
  })

  it('the microphone\'s Enter presses what the box\'s Enter presses: Ask Tracy for an editor, Note for team for a Viewer, Save in a reopened comment', async () => {
    await publish(FakeVoice)
    const editor = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(editor))
    await click('Enter while speaking')
    expect(editor.sendToTracy).toHaveBeenCalledTimes(1)
    expect(editor.addComment).not.toHaveBeenCalled()

    document.documentElement.setAttribute(SEAT_VIEWER_ATTR, '')
    const viewer = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(viewer))
    await click('Dictate')
    // A Viewer's one action is the Enter one: it stays while listening.
    expect(names(q('[role="dialog"]')!)).toEqual(['Close', 'Dictate', 'Done', 'Enter while speaking', 'Note for team↵'])
    await click('Enter while speaking')
    expect(viewer.addComment).toHaveBeenCalledTimes(1)
    expect(viewer.sendToTracy).not.toHaveBeenCalled()
    document.documentElement.removeAttribute(SEAT_VIEWER_ATTR)

    const mine = comment(1, 'Say hello')
    const reopened = fixtureMode({ foot: 'edit', editing: mine, text: 'Say hello', pageComments: [mine], rects: new Map([['c1', { x: 40, y: 200, width: 300, height: 40 }]]) })
    await draw(overlay(reopened))
    await click('Dictate')
    // Listening in a reopened comment: Delete and Ask Tracy (a click) step aside, Save (Enter) stays.
    expect(names(q('[role="dialog"]')!)).toEqual(['Close', 'Dictate', 'Done', 'Enter while speaking', 'Save↵'])
    await click('Enter while speaking')
    expect(reopened.save).toHaveBeenCalledTimes(1)
  })

  it('a send on its way locks the microphone', async () => {
    await publish(FakeVoice)
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), text: 'Words', sending: true })))
    const dictate = [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Dictate')!
    expect(dictate.disabled).toBe(true)
  })

  it('a microphone that throws draws nothing; the box works on', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await publish(() => { throw new Error('boom') })
    const mode = fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })
    await draw(overlay(mode))
    expect(names(q('[role="dialog"]')!)).toEqual(['Close', 'Note for team', 'Ask Tracy to edit↵'])
    expect(error.mock.calls.some(call => String(call[0]).includes('[dsh-better-sidebar] voice input failed'))).toBe(true)
  })

  it('a version this fork does not know draws no microphone', async () => {
    await publish(FakeVoice, 2)
    await draw(overlay(fixtureMode({ foot: 'new', picked: picked(), text: 'Words' })))
    expect(q('[data-fake-voice]')).toBeNull()
  })
})

describe('the thread card\'s Reply box', () => {
  const root1 = comment(1, 'We have 14 subsidiaries now.', { author: MAI, can: { edit: false, delete: false } })
  const threadMode = (over: Partial<CommentMode> = {}): CommentMode => fixtureMode({ thread: root1, threadMessages: [root1], pageComments: [root1], rects: new Map([['c1', { x: 32, y: 300, width: 200, height: 40 }]]), replyText: 'Words', ...over })
  const foot = (): string[] => [...q('[data-thread="c1"]')!.querySelectorAll(`.${css.commentFootEnd!} button`)].map(b => b.getAttribute('aria-label') ?? b.textContent ?? '')
  const field = (): string[] => [...q('[data-thread="c1"]')!.querySelectorAll(`.${css.threadField!} button`)].map(b => b.getAttribute('aria-label') ?? b.textContent ?? '')

  it('has the microphone; listening, Reply steps aside and Enter sends the thread to Tracy', async () => {
    await publish(FakeVoice)
    const mode = threadMode()
    await draw(overlay(mode))
    expect(q('[data-thread-compose]')!.hasAttribute('data-voice-composer')).toBe(true)
    expect(field()).toEqual(['Dictate', 'Done', 'Enter while speaking'])
    expect(foot()).toEqual(['Reply', 'Ask Tracy to edit↵'])
    // The Reply box was never clicked into: the words are added after what is there.
    await click('Dictate')
    expect(mode.setReplyText).toHaveBeenLastCalledWith('Words and more')
    expect(foot()).toEqual(['Ask Tracy to edit↵'])
    await click('Enter while speaking')
    expect(mode.sendThread).toHaveBeenCalledTimes(1)
    expect(mode.reply).not.toHaveBeenCalled()
  })

  it('a Viewer keeps Reply (their Enter) while listening', async () => {
    document.documentElement.setAttribute(SEAT_VIEWER_ATTR, '')
    await publish(FakeVoice)
    const mode = threadMode()
    await draw(overlay(mode))
    await click('Dictate')
    expect(foot()).toEqual(['Reply↵'])
    await click('Enter while speaking')
    expect(mode.reply).toHaveBeenCalledTimes(1)
  })
})
