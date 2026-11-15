// An inline picture made from a picture file of the archive (ticket #586, run 4): a template's optimiser joins its
// stylesheets into one file the site makes at run time and writes each small picture they draw (`url(../images/x.png)`)
// into it as a data address. No file of the archive writes that address, but its bytes are the archive's own picture
// file: the source is that file, owned by its template, not an unknown. Invented archive and pictures.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { sourceResolver } from '../ai-quickstart/gate/sources.mjs'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><circle r="2"/></svg>'
const DOT = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const ARCHIVE = {
  names: ['templates/petal/images/dot.png', 'templates/petal/images/arrow.svg'],
  files: new Map(),
  pictures: new Map([
    [sha(DOT), 'templates/petal/images/dot.png'],
    [sha(Buffer.from(SVG)), 'templates/petal/images/arrow.svg']
  ])
}
const resolve = sourceResolver(ARCHIVE, { site: 'http://florist.example' })

test('an inline picture whose bytes are a picture file of the archive is that file, owned by its template', () => {
  const png = resolve.picture('data:image/png;base64,' + DOT.toString('base64'))
  assert.equal(png.class, 'picture_file')
  assert.equal(png.file, 'templates/petal/images/dot.png')
  assert.equal(png.owner, 'template')
  assert.equal(png.inline, true)
  const svg = resolve.picture('data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64'))
  assert.equal(svg.file, 'templates/petal/images/arrow.svg')
  const percent = resolve.picture('data:image/svg+xml,' + encodeURIComponent(SVG))
  assert.equal(percent.file, 'templates/petal/images/arrow.svg')
})

test('an inline picture no file writes and no picture file holds stays unknown', () => {
  const other = resolve.picture('data:image/png;base64,' + Buffer.from('not a picture').toString('base64'))
  assert.equal(other.class, 'unknown')
  assert.equal(other.inline, true)
})
