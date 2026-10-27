import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pinAddedFiles } from '../src/release-lock-added.mjs'

const LOCK = `{
  "entities": {},
  "fileRoots": [
    "templates/t"
  ],
  "files": {
    "templates/t/a.css": "aa",
    "templates/t/c.css": "cc"
  }
}
`

test('a file an overlay adds under a file root is pinned at its sorted place, every other byte kept', () => {
  const { text, pinned } = pinAddedFiles(LOCK, { 'templates/t/b.scss': 'bb', 'images/x.png': 'xx' })
  assert.deepEqual(pinned, ['templates/t/b.scss'])
  assert.equal(
    text,
    LOCK.replace(
      '"templates/t/a.css": "aa",\n',
      '"templates/t/a.css": "aa",\n    "templates/t/b.scss": "bb",\n'
    )
  )
  assert.equal(JSON.parse(text).files['templates/t/b.scss'], 'bb')
})

test('a file after the last key closes the list with it; a file the lock has is left alone', () => {
  const { text } = pinAddedFiles(LOCK, { 'templates/t/d.css': 'dd', 'templates/t/a.css': 'zz' })
  assert.deepEqual(JSON.parse(text).files, {
    'templates/t/a.css': 'aa',
    'templates/t/c.css': 'cc',
    'templates/t/d.css': 'dd'
  })
})

test('a lock written with escaped slashes gets its new key escaped the same way', () => {
  const escaped = LOCK.replace(/templates\/t\//g, 'templates\\/t\\/')
  const { text } = pinAddedFiles(escaped, { 'templates/t/b.scss': 'bb' })
  assert.match(text, /"templates\\\/t\\\/b\.scss": "bb"/)
})
