/** Read-only inventory: published Joomla menu pages plus internal content links. */
import { readFile, writeFile } from 'node:fs/promises'
import { parseHTML } from 'linkedom'

const [menuFile, output] = process.argv.slice(2)
const origin = 'http://127.0.0.1:8212'
const menus = JSON.parse(await readFile(menuFile, 'utf8'))
const queue = menus.filter((m) => m.type === 'component').map((m) => (m.home ? '/' : '/' + m.path))
const seen = new Set(),
  pages = []
while (queue.length) {
  const route = queue.shift()
  if (seen.has(route)) continue
  seen.add(route)
  if (seen.size > 500) throw new Error('Unexpected inventory growth; inspect links before continuing.')
  const response = await fetch(origin + route)
  const html = await response.text()
  const { document } = parseHTML(html)
  pages.push({
    route,
    status: response.status,
    finalRoute: new URL(response.url).pathname,
    title: document.querySelector('title')?.textContent,
    heading: document.querySelector('h1')?.textContent.trim(),
    hasSharedTypography: html.includes('site-repairs.css')
  })
  for (const anchor of document.querySelectorAll('a[href]')) {
    const url = new URL(anchor.getAttribute('href'), response.url)
    if (
      url.origin !== origin ||
      url.pathname.startsWith('/administrator') ||
      /^\/(media|images|templates|plugins|api)\//.test(url.pathname)
    )
      continue
    if (/\.(zip|pdf|png|jpe?g|svg|webp|css|js|xml)$/i.test(url.pathname)) continue
    if (
      [...url.searchParams.keys()].some(
        (key) => !['start', 'limitstart', 'limit', 'Itemid', 'option', 'view', 'id', 'catid'].includes(key)
      )
    )
      continue
    if (
      url.searchParams.has('option') &&
      !['com_content', 'com_contact', 'com_tags', 'com_newsfeeds'].includes(url.searchParams.get('option'))
    )
      continue
    if (url.pathname === '/index.php' && !url.search) continue
    const next = url.pathname + url.search
    if (!seen.has(next)) queue.push(next)
  }
}
await writeFile(output, JSON.stringify(pages, null, 2) + '\n')
console.log(
  `${pages.length} linked routes; ${pages.filter((p) => p.status !== 200).length} non-200; ${pages.filter((p) => !p.hasSharedTypography).length} without shared stylesheet.`
)
