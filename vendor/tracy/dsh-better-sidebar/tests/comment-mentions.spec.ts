/**
 * The `@` picker's pure rules (TCH spec #809 case C1, `src/client/comment-mentions.ts`): which `@` the
 * caret stands in, whom the list offers, what a pick writes, and which ids a save names.
 */
import { describe, expect, it } from 'vitest'
import { handleOf, insertMention, matchPeople, mentionIds, mentionQuery, picksOf, readPeople, roleName, type MentionPerson } from '../src/client/comment-mentions.ts'
import { createBodyOf, commentFromServer, createCommentApi } from '../src/client/comment-api.ts'

const AKEMI: MentionPerson = { accountId: 'a1', email: 'akemi@example.com', name: 'Akemi', initial: 'A', role: 'owner', you: true }
const DUC: MentionPerson = { accountId: 'a2', email: 'duc@example.com', name: 'Đặng Đức', initial: 'Đ', role: 'editor' }
const VIN: MentionPerson = { accountId: 'a3', email: 'vincent.ng@example.com', initial: 'V', role: 'admin' }
const PEOPLE = [AKEMI, DUC, VIN]

describe('mentionQuery', () => {
  it('finds the @word the caret stands in, at the start or after a space', () => {
    expect(mentionQuery('@ak', 3)).toEqual({ start: 0, end: 3, query: 'ak' })
    expect(mentionQuery('hi @', 4)).toEqual({ start: 3, end: 4, query: '' })
    expect(mentionQuery('hi @du there', 6)).toEqual({ start: 3, end: 6, query: 'du' })
  })
  it('never an address, nor an @ the caret already left', () => {
    expect(mentionQuery('mail a@b.co', 11)).toBeNull()
    expect(mentionQuery('@ak done', 8)).toBeNull()
  })
})

describe('matchPeople', () => {
  it('offers everyone but the viewer, by the start of a name word or the address, accents folded', () => {
    expect(matchPeople(PEOPLE, '').map(p => p.accountId)).toEqual(['a2', 'a3'])
    expect(matchPeople(PEOPLE, 'duc').map(p => p.accountId)).toEqual(['a2'])
    expect(matchPeople(PEOPLE, 'dang').map(p => p.accountId)).toEqual(['a2'])
    expect(matchPeople(PEOPLE, 'vin').map(p => p.accountId)).toEqual(['a3'])
    expect(matchPeople(PEOPLE, 'ak')).toEqual([])
  })
})

describe('a pick and what a save names', () => {
  it('writes @handle and a space; the handle is the first name word, else the address', () => {
    expect(handleOf(DUC)).toBe('Đặng')
    expect(handleOf(VIN)).toBe('vincent.ng')
    expect(handleOf({ email: '...@x.y', name: '  ' })).toBe('someone')
    const at = mentionQuery('ask @du', 7)!
    expect(insertMention('ask @du', at, DUC)).toEqual({ text: 'ask @Đặng ', caret: 10 })
    expect(insertMention('ask @du now', { start: 4, end: 7, query: 'du' }, DUC).text).toBe('ask @Đặng now')
  })
  it('names a pick only while its whole @handle stays in the words', () => {
    const picks = new Map([['a2', 'Đặng'], ['a3', 'vincent.ng']])
    expect(mentionIds('@Đặng and @vincent.ng, look', picks)).toEqual(['a2', 'a3'])
    expect(mentionIds('@Đặngx look', picks)).toEqual([])
    expect(mentionIds('@vincent.ngo', picks)).toEqual([])
    expect(mentionIds('@vincent.ng.', picks)).toEqual(['a3'])
    expect(mentionIds('no names', picks)).toEqual([])
  })
  it('an edit starts from the stored ids the roster knows', () => {
    expect([...picksOf(['a2', 'gone'], PEOPLE)]).toEqual([['a2', 'Đặng']])
    expect(picksOf(['a2'], null).size).toBe(0)
  })
  it('roles stay English', () => {
    expect(PEOPLE.map(p => roleName(p.role))).toEqual(['Owner', 'Editor', 'Admin'])
  })
})

describe('the doors', () => {
  it('reads the roster from GET …/comments/people', async () => {
    const calls: string[] = []
    const api = createCommentApi({
      siteKey: 'kinetic.vn',
      fetchImpl: async (input) => {
        calls.push(input)
        return new Response(JSON.stringify({ people: [{ accountId: 'a1', email: 'a@x.y', initial: 'A', role: 'owner', you: true }, { bad: true }] }), { status: 200 })
      },
    })
    const answer = await api.people()
    expect(calls).toEqual(['/api/sites/kinetic.vn/comments/people'])
    expect(answer).toEqual({ ok: true, value: [{ accountId: 'a1', email: 'a@x.y', initial: 'A', role: 'owner', you: true }] })
    expect(readPeople({})).toBeNull()
  })
  it('keeps the server\'s face as sent; a row with no letter gets the one the server would give (name, else email)', () => {
    const people = readPeople({ people: [
      { accountId: 'a1', email: 'a@x.y', initial: 'Ä', color: '#059669', avatarUrl: 'https://x.y/a.png', role: 'owner' },
      { accountId: 'a2', email: 'zoe@x.y', name: 'brian', role: 'editor' },
      { accountId: 'a3', email: 'zoe@x.y', role: 'editor' },
    ] })!
    expect(people[0]).toEqual({ accountId: 'a1', email: 'a@x.y', initial: 'Ä', color: '#059669', avatarUrl: 'https://x.y/a.png', role: 'owner' })
    expect(people.slice(1).map(p => p.initial)).toEqual(['B', 'Z'])
  })
  it('a create body carries mentions only when there are some; a row reads them back', () => {
    const c = { id: 'l1', n: 1, url: 'http://x/', element: null, locate: null, text: '@Mai hi', status: 'open' as const, createdAt: 0 }
    expect(createBodyOf(c)).not.toHaveProperty('mentions')
    expect(createBodyOf(c, [], ['a2']).mentions).toEqual(['a2'])
    const row = { id: 's1', n: 1, url: 'http://x/', element: null, locate: null, text: 'hi', status: 'pending', replyTo: null, createdAt: null, updatedAt: null, resolvedAt: null, resolvedBy: null, deletedAt: null, author: null, can: { edit: true, delete: true } }
    expect(commentFromServer({ ...row, mentions: ['a2', 7] })?.mentions).toEqual(['a2'])
    expect(commentFromServer({ ...row, mentions: [] })).not.toHaveProperty('mentions')
  })
})
