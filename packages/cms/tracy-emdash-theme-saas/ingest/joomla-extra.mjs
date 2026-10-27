#!/usr/bin/env node
// joomla-extra.mjs — the article facts `joomla-dump.mjs` does not read, from the same running site.
//
//   node ingest/joomla-extra.mjs --compose <dir> --out <j6-dir>/extra.json [--db joomla]
//
// WHY. The dump reads six tables (content, categories, menu, modules, modules_menu, template_styles).
// The Kinetic blog shows four things that live elsewhere: the author's display name (`#__users.name`,
// or the article's `created_by_alias`), the author role (custom field `author_role`), tags
// (`#__tags` + `#__contentitem_tag_map`) and the featured flag. Without them the model would carry
// posts with no byline and no tag archive, and the template would have to invent both.
//
// READ-ONLY. SELECT only, through the site's own mariadb client in its compose project, every value
// cast to CHAR — the same contract as joomla-dump.mjs.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args[i + 1]
}
const compose = flag('--compose')
const out = flag('--out')
const database = flag('--db', 'joomla')
if (!compose || !out) {
  console.error('usage: joomla-extra.mjs --compose <dir> --out <extra.json> [--db joomla]')
  process.exit(2)
}
const password = readFileSync(join(compose, '.env'), 'utf8')
  .match(/^MARIADB_ROOT_PASSWORD=(.*)$/m)?.[1]
  ?.trim()
if (!password) {
  console.error('no MARIADB_ROOT_PASSWORD in the compose .env')
  process.exit(2)
}

function rows(statement) {
  const result = execFileSync(
    'docker',
    [
      'compose',
      '--project-directory',
      compose,
      'exec',
      '-T',
      'db',
      'mariadb',
      '-uroot',
      `-p${password}`,
      database,
      '--batch',
      '--skip-column-names',
      '--raw',
      '-e',
      statement
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, DOCKER_HOST: '' } }
  )
  return result
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line))
}

const tables = rows(
  `SELECT JSON_OBJECT('t', table_name) FROM information_schema.tables WHERE table_schema='${database}' AND table_name LIKE '%\\_content'`
)
const content = tables.map((t) => t.t).find((t) => /^[a-z0-9]+_content$/.test(t))
if (!content) {
  console.error('no *_content table')
  process.exit(1)
}
const p = content.replace(/content$/, '')

const articles = rows(
  `SELECT JSON_OBJECT('id', CAST(c.id AS CHAR), 'title', c.title, 'alias', c.alias, 'created', CAST(c.created AS CHAR),
     'featured', CAST(c.featured AS CHAR), 'author', COALESCE(NULLIF(c.created_by_alias, ''), u.name, ''),
     'authorUsername', COALESCE(u.username, ''),
     'authorRole', COALESCE((SELECT fv.value FROM ${p}fields_values fv JOIN ${p}fields f ON f.id = fv.field_id
                             WHERE f.name = 'author_role' AND fv.item_id = CAST(c.id AS CHAR) LIMIT 1), ''))
   FROM ${p}content c LEFT JOIN ${p}users u ON u.id = c.created_by ORDER BY c.id`
)
const tags = rows(
  `SELECT JSON_OBJECT('id', CAST(id AS CHAR), 'title', title, 'alias', alias, 'published', CAST(published AS CHAR), 'description', COALESCE(description, ''))
   FROM ${p}tags WHERE id > 1 ORDER BY lft`
)
const tagMap = rows(
  `SELECT JSON_OBJECT('articleId', CAST(content_item_id AS CHAR), 'tagId', CAST(tag_id AS CHAR))
   FROM ${p}contentitem_tag_map WHERE type_alias = 'com_content.article' ORDER BY content_item_id, tag_id`
)

// The contact page is com_contact: its cards (Support/Sales/Security) are the contact's `misc` HTML, its
// form sends to `email_to`, and `params.show_email_form` says whether the form is shown at all.
const contacts = rows(
  `SELECT JSON_OBJECT('id', CAST(id AS CHAR), 'name', name, 'alias', alias, 'published', CAST(published AS CHAR),
     'emailTo', COALESCE(email_to, ''), 'misc', COALESCE(misc, ''), 'params', COALESCE(params, ''))
   FROM ${p}contact_details ORDER BY id`
)

writeFileSync(
  out,
  `${JSON.stringify({ dumpedAt: new Date().toISOString(), prefix: p, articles, tags, tagMap, contacts }, null, 2)}\n`
)
console.log(
  `joomla-extra: ${articles.length} articles · ${tags.length} tags · ${tagMap.length} tag links · ${contacts.length} contact(s) → ${out}`
)
