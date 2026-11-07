// The one line that names the CMS at the top of the four locked model prompts (planner, brand, writer, pictures).
// The prompt files stay byte for byte as approved; the line is put in front of them when a run's system prompt is built.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cmsLine, withCmsLine } from '../src/lib/cms-line.js'

test('a WordPress kit gets the WordPress line, a Joomla kit the Joomla line', () => {
  assert.equal(cmsLine('wordpress'), 'This site runs on WordPress (block editor).')
  assert.equal(cmsLine('joomla'), 'This site runs on Joomla.')
})

test('the line goes first and the locked prompt follows byte for byte', () => {
  const text = '# Locked prompt\n\nBody.\n'
  assert.equal(withCmsLine(text, 'wordpress'), `This site runs on WordPress (block editor).\n\n${text}`)
  assert.ok(withCmsLine(text, 'joomla').endsWith(text))
})

test('a kit without a known platform fails loudly instead of guessing', () => {
  for (const platform of ['', undefined, null, 'drupal', 'WordPress'])
    assert.throws(() => cmsLine(platform), /platform/i, String(platform))
  assert.throws(() => withCmsLine('x', ''), /platform/i)
})
