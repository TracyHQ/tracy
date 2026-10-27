/**
 * The thread card draws a comment's @mentions the way the chat column's Comments list does
 * (TCH `packages/ui/tracy-chat-input` `textParts`): each mention at the start or after a space, never
 * an e-mail address. Seen on dev 05/10/2026: the list showed "@octopal @anhvp.ecom" in terracotta
 * while the thread card printed them as plain text.
 */
import { describe, expect, it } from 'vitest'
import { mentionParts } from '../src/client/comment-mentions.ts'

describe('mentionParts', () => {
  it('cuts every mention out of the words, in order', () => {
    expect(mentionParts('@octopal @anhvp.ecom cái này')).toEqual([
      { text: '@octopal', mention: true },
      { text: ' ', mention: false },
      { text: '@anhvp.ecom', mention: true },
      { text: ' cái này', mention: false }
    ])
  })
  it('a mention after text, and a trailing dot left out', () => {
    expect(mentionParts('kìa @anhvp.ecom.')).toEqual([
      { text: 'kìa ', mention: false },
      { text: '@anhvp.ecom', mention: true },
      { text: '.', mention: false }
    ])
  })
  it('never an e-mail address, and plain words stay one part', () => {
    expect(mentionParts('mail a@b.co please')).toEqual([{ text: 'mail a@b.co please', mention: false }])
    expect(mentionParts('')).toEqual([])
  })
})
