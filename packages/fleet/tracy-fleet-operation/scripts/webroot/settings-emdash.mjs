// SQLite is opened read-only, and only fixed public site settings leave the container.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
const db = new DatabaseSync('/app/data/data.db', { readOnly: true })
const answer = { ok: true, platform: 'emdash' }
for (const key of ['title', 'tagline', 'postsPerPage', 'timezone']) {
  const row = db.prepare('SELECT value FROM options WHERE name = ?').get(`site:${key}`)
  if (row) answer[key] = JSON.parse(row.value)
}
const seo = db.prepare('SELECT value FROM options WHERE name = ?').get('site:seo')
if (seo) answer.titleSeparator = JSON.parse(seo.value)?.titleSeparator
try {
  answer.version = JSON.parse(readFileSync('/app/node_modules/emdash/package.json', 'utf8')).version
} catch {
  /* unavailable, never substitute the quickstart version */
}
try {
  answer.template = JSON.parse(readFileSync('/app/package.json', 'utf8')).name
} catch {
  /* no declared template name */
}
db.close()
console.log(JSON.stringify(answer))
