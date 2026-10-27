/**
 * The demo blog of a FULL Joomla site is TRANSLATED, never rewritten (product owner, decision 1 after the g65 builds, 12/10/2026;
 * TCH #1013), and a menu entry into a blog category renamed for the trade takes its new name (L1). Through the engine and the
 * Apply door, on JA Essence j6 1.0.4 (51 posts of the blog, 39 distinct lines).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { articleRows, blogArticleSlots } from '../src/sites/brief-engines/joomla-blog-articles.js'
import { kitEntities } from '../src/sites/brief-engines/joomla-kit.js'
import { essence, essenceModel, essenceSite, map, runEssence } from './_joomla-essence-site.mjs'

/** The text lines of the posts of the blog, as the engine tells them apart. */
const blog = (() => {
  const kit = kitEntities(essence.dir)
  const posts = blogArticleSlots({
    slots: map.slots,
    pages: map.pages,
    kit,
    shown: () => true,
    isDerived: () => false,
    articles: articleRows(essence.dir)
  })
  const stories = new Set(posts.stories)
  return posts.slots.filter(
    (/** @type {any} */ s) =>
      stories.has(s.entity) && s.type === 'text' && !s.requiresEvidence && /\p{L}/u.test(String(s.sample))
  )
})()
const samples = new Set(blog.map((/** @type {any} */ s) => String(s.sample)))

/** The asks of the old rewrite path: none may be made now. */
const REWRITE = /^(You plan the blog|You write the articles|You title the articles|You open the articles)/

/** The translator's asks that hold a line of the blog, and how many lines each held. */
const blogAsks = (/** @type {Array<{ system: string, input: any }>} */ calls) =>
  calls.filter((c) =>
    (Array.isArray(c.input) ? c.input.map((/** @type {any} */ i) => i.text) : [c.input?.text]).some((t) =>
      samples.has(t)
    )
  )

test('FULL, Vietnamese: every post of the blog is translated where it stands, each distinct text asked once, never rewritten', async (t) => {
  const model = essenceModel({ translate: (text) => `Bản dịch ${text}` })
  const { written } = await runEssence({ model })
  assert.deepEqual(
    model.calls.filter((c) => REWRITE.test(c.system)).map((c) => c.system.slice(0, 30)),
    []
  )
  const wrong = blog.filter((/** @type {any} */ s) => written[s.key] !== `Bản dịch ${s.sample}`)
  assert.deepEqual(
    wrong.slice(0, 5).map((/** @type {any} */ s) => [s.key, written[s.key]]),
    [],
    `${wrong.length} of ${blog.length} lines`
  )
  // A title the demo repeats is repeated, translated the same (accepted: titles duplicated as in the demo).
  const asks = blogAsks(model.calls)
  const asked = asks.flatMap((c) =>
    Array.isArray(c.input) ? c.input.map((/** @type {any} */ i) => i.text) : [c.input.text]
  )
  const twice = asked.filter((text, i) => asked.indexOf(text) !== i)
  assert.deepEqual(twice, [], 'each distinct text once')
  t.diagnostic(`${asks.length} model call(s) for ${blog.length} lines of the blog (${samples.size} distinct)`)
  assert.ok(asks.length <= 10, `${asks.length} calls`)
})

test('FULL, English: the posts of the blog stay exactly as the template has them, and the translator is never asked them', async () => {
  const model = essenceModel({ translate: (text) => `Bản dịch ${text}` })
  const { written } = await runEssence({ model, languages: ['en'] })
  assert.deepEqual(
    blog.filter((/** @type {any} */ s) => s.key in written).map((/** @type {any} */ s) => s.key),
    []
  )
  assert.deepEqual(
    model.calls.filter((c) => REWRITE.test(c.system)),
    []
  )
  assert.deepEqual(blogAsks(model.calls), [])
})

test('FULL, Vietnamese, a disobedient translator that keeps one line English every time: asked again, split, alone, then said', async () => {
  const stubborn = 'Me unpleasing impossible'
  assert.ok(samples.has(stubborn), 'a line of the JA Essence blog')
  const base = essenceModel({ translate: (text) => (text === stubborn ? text : `Bản dịch ${text}`) })
  const model = {
    ...base,
    models: async () => {
      const own = await base.models()
      return {
        ...own,
        text: {
          ...own.text,
          chat: async (/** @type {any} */ request) => {
            const input = JSON.parse(request.messages[1].content)
            // Alone, it keeps the English too.
            if (String(request.messages[0].content).startsWith('You translate one line'))
              return JSON.stringify({ text: input.text === stubborn ? stubborn : `Bản dịch ${input.text}` })
            return own.text.chat(request)
          }
        }
      }
    }
  }
  const { written, notes } = await runEssence({ model })
  const stubbornKeys = blog
    .filter((/** @type {any} */ s) => s.sample === stubborn)
    .map((/** @type {any} */ s) => s.key)
  assert.ok(stubbornKeys.length > 1)
  assert.deepEqual(
    stubbornKeys.filter((key) => key in written),
    [],
    'its English is never written as a translation'
  )
  assert.ok(
    notes.some((n) =>
      /line\(s\) of the demo blog articles keep the template’s language.*Me unpleasing impossible/.test(n)
    ),
    notes.join('\n')
  )
  const other = blog.find((/** @type {any} */ s) => s.sample !== stubborn)
  assert.equal(written[other.key], `Bản dịch ${other.sample}`)
})

// 🔒 L1 (product owner, after g65): on dev g65-ess-j-full the footer's entries into the renamed categories still read "Thiết kế",
// "Thời trang" (the demo's names translated), beside categories renamed "Quy trình nướng".
test('FULL: every menu entry into a renamed blog category that carries its name, an alias included, takes its new name with the tidy-up', async () => {
  const site = essenceSite()
  const menu = [
    {
      id: 145,
      menutype: 'mainmenu',
      type: 'component',
      title: 'Category Style 3',
      published: 1,
      language: '*',
      link: 'index.php?option=com_content&view=category&layout=ja_essence:news&id=11',
      params: '{}'
    },
    {
      id: 154,
      menutype: 'footer',
      type: 'alias',
      title: 'Fashion',
      published: 1,
      language: '*',
      link: 'index.php?Itemid=',
      params: '{"aliasoptions":"145"}'
    },
    {
      id: 155,
      menutype: 'footer',
      type: 'component',
      title: 'Bản dịch Fashion',
      published: 1,
      language: '*',
      link: 'index.php?option=com_content&view=category&id=15',
      params: '{}'
    },
    {
      id: 156,
      menutype: 'category',
      type: 'component',
      title: 'Resources',
      published: 1,
      language: '*',
      link: 'index.php?option=com_content&view=category&layout=ja_essence:news&id=16',
      params: '{}'
    },
    // A parent category is no topic and is not renamed; an entry of another kind keeps its title.
    {
      id: 147,
      menutype: 'mainmenu',
      type: 'component',
      title: 'Category Style 4',
      published: 1,
      language: '*',
      link: 'index.php?option=com_content&view=category&layout=ja_essence:news&id=12',
      params: '{}'
    },
    {
      id: 160,
      menutype: 'mainmenu',
      type: 'component',
      title: 'Contact',
      published: 1,
      language: '*',
      link: 'index.php?option=com_contact&view=category&id=11',
      params: '{}'
    }
  ]
  const answer = site.apply
  site.apply = async (/** @type {any} */ call) =>
    call.action === 'content.list' && call.params.kind === 'menuItem'
      ? { ok: true, items: call.params.offset ? [] : menu.map((row) => ({ ...row })) }
      : answer(call)
  const names = {
    Health: 'Bánh mì',
    Design: 'Quy trình nướng',
    Fashion: 'Bánh ngọt',
    Resources: 'Công thức',
    Lifestyle: 'Bữa sáng'
  }
  const model = essenceModel({
    translate: (text) => `Bản dịch ${text}`,
    lookup: (input) =>
      Array.isArray(input?.categories)
        ? JSON.stringify({
            names: Object.fromEntries(
              input.categories.map((/** @type {any} */ c) => [
                c.key,
                names[/** @type {keyof typeof names} */ (c.name)]
              ])
            )
          })
        : null
  })
  const { times } = await runEssence({ model, site })
  const titles = Object.fromEntries(
    site.records
      .filter((/** @type {any} */ r) => r.kind === 'menuItem' && r.fields?.title !== undefined)
      .map((/** @type {any} */ r) => [r.id, r.fields.title])
  )
  assert.equal(titles[145], undefined, 'a layout sample labelled otherwise keeps its label')
  assert.equal(titles[154], 'Bánh ngọt', 'the footer alias labelled with the demo name')
  assert.equal(titles[155], 'Bánh ngọt', 'an entry labelled with the category’s translated name')
  // "Resources" is a generic section label: the category keeps its name, so its entry keeps its label (Akemi, 25/10/2026).
  assert.equal(
    titles[156],
    undefined,
    'an entry into a category with a generic section label keeps its label'
  )
  assert.notEqual(titles[147], 'Bánh mì', 'a parent category is not renamed')
  assert.equal(titles[160], undefined, 'a contact category is not an article category')
  assert.equal(times.menuCategoriesNamed, 2)
  // Written with the tidy-up, under its apply id: one revert undoes it.
  const batch = site.calls.find(
    (/** @type {any} */ c) =>
      c.action === 'content.batch' &&
      c.params.operations.some((/** @type {any} */ o) => o.kind === 'menuItem' && o.id === 154)
  )
  assert.match(String(batch?.params.apply_id), /^tidy-/)
})
