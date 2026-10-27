/**
 * Comment files (stage 6, `tasks/evidence/comment-people/attachments-contract.md`): the list's
 * `attachments` block says whether files may be kept with a comment, a comment's stored files count
 * on its row, and sizes read the way a file browser shows them.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatSize, readAttachmentsConfig } from '../src/client/comment-attachments.mjs'
import { createCommentLists, readCommentList, viewModel } from '../src/client/comment-view.mjs'

const MiB = 1024 * 1024
const HOME = 'https://northgate-ind.ru/'
const list = (extra = {}, comments = []) => ({
  sessionId: 's1',
  tabId: 'tab-a',
  siteKey: 'acbj2709',
  host: 'northgate-ind.ru',
  active: true,
  url: HOME,
  comments,
  ...extra
})
const snapshotOf = (detail) => {
  const lists = createCommentLists()
  lists.accept(detail)
  return lists.getSnapshot()
}

test('the list says whether files may be kept with a comment; no block = off', () => {
  assert.deepEqual(
    readCommentList(list({ attachments: { enabled: true, maxBytes: 5 * MiB, maxFiles: 3 } }))?.attachments,
    {
      enabled: true,
      maxBytes: 5 * MiB,
      maxFiles: 3
    }
  )
  assert.equal(readCommentList(list({ attachments: { enabled: false } }))?.attachments.enabled, false)
  assert.equal(readCommentList(list())?.attachments.enabled, false)
  assert.deepEqual(readAttachmentsConfig({ enabled: true }), {
    enabled: true,
    maxBytes: 20 * MiB,
    maxFiles: 20
  })
  const vm = viewModel(snapshotOf(list({ attachments: { enabled: true, maxBytes: MiB, maxFiles: 2 } })))
  assert.deepEqual(vm.attachments, { enabled: true, maxBytes: MiB, maxFiles: 2 })
  assert.equal(viewModel(createCommentLists().getSnapshot()).attachments.enabled, false)
})

test('a row counts the files stored with its comment', () => {
  const at = Date.now()
  const vm = viewModel(
    snapshotOf(
      list({}, [
        {
          id: 'c1',
          url: HOME,
          text: 'Two photos.',
          createdAt: at,
          element: null,
          attachments: [
            {
              id: 'f1',
              name: 'a.png',
              size: 1,
              type: 'image/png',
              url: '/api/sites/k/comments/attachments/f1'
            },
            {
              id: 'f2',
              name: 'b.png',
              size: 1,
              type: 'image/png',
              url: '/api/sites/k/comments/attachments/f2'
            }
          ]
        },
        { id: 'c2', url: HOME, text: 'None.', createdAt: at - 1, element: null },
        { id: 'c3', url: HOME, text: 'Bad list.', createdAt: at - 2, element: null, attachments: 'x' }
      ])
    )
  )
  assert.deepEqual(
    vm.open.map((r) => [r.id, r.files]),
    [
      ['c1', 2],
      ['c2', 0],
      ['c3', 0]
    ]
  )
})

test('sizes read the way a file browser shows them', () => {
  assert.equal(formatSize(940), '940 B')
  assert.equal(formatSize(12_300), '12 KB')
  assert.equal(formatSize(1_234_567), '1.2 MB')
  assert.equal(formatSize(20 * MiB), '21 MB')
})
