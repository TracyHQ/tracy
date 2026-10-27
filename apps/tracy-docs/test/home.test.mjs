/**
 * The home page is for people who use Tracy; the API keeps its own front page at `/api/`
 * (tasks/todo-desktop-update-policy.md, PR-0b). Read from the page sources, so no build is needed.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import yaml from 'js-yaml'

const CONTENT = new URL('../src/content/docs/', import.meta.url)

/** `{ data, body }` of one page: its YAML frontmatter and the text after it. */
function page(rel) {
  const text = readFileSync(new URL(rel, CONTENT), 'utf8')
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
  assert.ok(match, `${rel} has frontmatter`)
  return { data: yaml.load(match[1]), body: match[2] }
}

test('the home page sends a reader to Get started and to the app download', () => {
  const { data } = page('index.mdx')
  assert.equal(data.template, 'splash')
  assert.match(data.hero.title, /^Tracy Cowork — build and edit your website with AI$/)
  assert.deepEqual(
    data.hero.actions.map((action) => [action.text, action.link]),
    [
      ['Get started', '/get-started/'],
      ['Download the app', '/desktop/download/']
    ]
  )
})

test('the home page links each part of the site once, the API as one card', () => {
  const { body } = page('index.mdx')
  const links = [...body.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1])
  // The Changelog card names both changelogs: the product's (web and desktop app) and the API's.
  assert.deepEqual(links, [
    '/get-started/',
    '/desktop/download/',
    '/mcp/getting-started/',
    '/using-tracy/',
    '/changelog/desktop/',
    '/changelog/',
    '/api/'
  ])
  // The walkthrough of API calls lives on the API's own front page now, not here.
  assert.doesNotMatch(body, /\/v1\//)
})

test('the API front page is at /api/ and still opens on the Quickstart', () => {
  const { data, body } = page('api/index.mdx')
  assert.equal(data.title, 'Tracy API')
  assert.equal(data.hero.actions[0].link, '/quickstart/')
  assert.match(body, /\[Quickstart\]\(\/quickstart\/\)/)
})
