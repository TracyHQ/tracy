// Tests for the artifact pages: the engine builds the same documents the preview dialog draws,
// and the theme carries their stylesheets fenced and their bodies as snippets.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ARTIFACT_KINDS, artifactSnippet, buildArtifactDocsFor } from '../lib/artifacts.mjs'
import { fixtureParts, scopeFixtureCss } from '../lib/fixture.mjs'

test('the three page artifacts of a system build as full documents with one style block and no script', () => {
  const docs = buildArtifactDocsFor('brutalism')
  assert.deepEqual(Object.keys(docs), [...ARTIFACT_KINDS])
  for (const kind of ARTIFACT_KINDS) {
    const parts = fixtureParts(docs[kind])
    assert.ok(parts.css.length > 1000, `${kind}: css`)
    assert.ok(parts.body.length > 1000, `${kind}: body`)
    assert.equal(parts.scripts, 0, `${kind}: scripts`)
  }
  assert.match(docs.landing, /Brutalism/)
})

test('an artifact stylesheet fences under .tracy-artifact with the brand variables on the wrapper', () => {
  const docs = buildArtifactDocsFor('apple')
  const css = scopeFixtureCss(fixtureParts(docs.landing).css, '.tracy-artifact')
  assert.match(css, /\.tracy-artifact \{\n/)
  assert.match(css, /& \{[^}]*--brand-/)
  assert.doesNotMatch(css, /\n(html|body|:root)\b[^{]*\{/)
})

test('artifactSnippet wraps the body and names system and kind', () => {
  const docs = buildArtifactDocsFor('airbnb')
  const snippet = artifactSnippet(docs.form, 'airbnb', 'form')
  assert.match(snippet, /^<div class="tracy-artifact" data-inspiration="airbnb" data-artifact="form">\n/)
  assert.doesNotMatch(snippet, /<style|<script|<head[\s>]|<html|<body/)
})

test('a system outside the catalog is refused', () => {
  assert.throws(() => buildArtifactDocsFor('nope'), /not in the catalog/)
})
