/** Disposable component fixtures for comparing native WordPress discovery implementations. */
import assert from 'node:assert/strict'
import { component, PAGES } from './fake-wordpress.mjs'
import { planReplace } from '../../../src/host/replace.mjs'

export async function discoveryTrial(engine, { wide = true, delayMs = 0 } = {}) {
  const original = '<!-- wp:paragraph -->\n<p>Keep this short line.</p>\n<!-- /wp:paragraph -->'
  const template =
    '<!-- wp:template-part {"slug":"header"} /-->\n<!-- wp:group {"tagName":"main"} -->\n<main class="wp-block-group"><!-- wp:post-content /-->\n<!-- wp:paragraph -->\n<p>Built with Tracy on WordPress</p>\n<!-- /wp:paragraph --></main>\n<!-- /wp:group -->'
  const site = component({
    posts: [
      {
        ID: 904,
        post_type: 'page',
        post_status: 'publish',
        post_name: 'plain',
        post_title: 'Plain',
        post_excerpt: '',
        post_content: original
      }
    ],
    themeFiles: { templates: { page: template, index: '<!-- wp:post-content /-->' } }
  })
  const html = () =>
    PAGES['/']
      .replace(/page-id-42/g, 'page-id-904')
      .replace(
        /<main\b[\s\S]*<\/main>/,
        `<main class="wp-block-group"><div class="entry-content wp-block-post-content">${site.posts.get(904).post_content}</div>${site.templateOf('page')?.post_content ?? template}</main>`
      )
  const plan = planReplace({
    path: '/plain/',
    find: wide ? 'Built with Tracy on WordPress' : 'Keep this short line.',
    replace: wide ? 'Made with Tracy' : 'Keep this fresh line.'
  })
  assert.equal(plan.ok, true)
  const before = structuredClone([...site.posts])
  const read = async (action, params) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    return site.door(action, params)
  }
  const start = performance.now()
  const out = await engine({
    plan,
    read,
    write: site.door,
    pageHtml: async () => ({ ok: true, status: 200, html: html() }),
    mintApplyId: () => 'discovery-bench',
    verify: true
  })
  const elapsedMs = performance.now() - start
  assert.equal(out.ok, true, JSON.stringify(out))
  const expected = wide
    ? template.replace('Built with Tracy on WordPress', 'Made with Tracy')
    : original.replace('Keep this short line.', 'Keep this fresh line.')
  assert.equal(wide ? site.templateOf('page').post_content : site.posts.get(904).post_content, expected)
  const changed = new Set(site.writes().map((w) => `${w.kind}:${w.key ?? w.id}`))
  assert.equal(site.writes().length, 1, 'exactly one write')
  for (const [id, post] of before)
    if (wide || id !== 904) assert.deepEqual(site.posts.get(id), post, `unrelated post ${id}`)
  const reads = site.calls.filter(([a]) => a === 'content.get' || a === 'content.list')
  const counts = {}
  for (const [action, params] of reads) {
    const key = JSON.stringify([action, params])
    counts[key] = (counts[key] ?? 0) + 1
  }
  assert.equal(out.undo.action, 'apply.revert')
  await site.door(out.undo.action, out.undo.params)
  assert.deepEqual([...site.posts], before, 'Undo restores every stored record and removes the override')
  return {
    reads: reads.length,
    counts,
    elapsedMs,
    changed: [...changed],
    receipt: out,
    verified: true,
    undoVerified: true
  }
}
