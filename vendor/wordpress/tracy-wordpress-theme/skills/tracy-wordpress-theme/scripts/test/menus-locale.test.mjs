// Footer menus of a secondary locale: the theme swaps menus by `<default menutype>-<lang>` (D11),
// so the RU column that translates "Company" must be `footer-company-ru`, not a slug of the
// Russian heading — and a column the adapter already emits as a named menu is not doubled as a
// synthesised `footnav-N` block that no template reads.
import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { extractMenus } from '../lib/html-content.mjs'
import { buildMenus } from '../ingest/from-html.mjs'

const footer = (cols) =>
  new JSDOM(`<body><main><h1>x</h1></main><footer><div>${cols.map(([h, links]) => `<div>${h ? `<div>${h}</div>` : ''}${links.map(([l, u]) => `<a href="${u}">${l}</a>`).join('')}</div>`).join('')}</div></footer></body>`).window.document
const menusOf = (cols) => extractMenus(footer(cols))
const ctx = { locales: ['en', 'ru'], defaultLocale: 'en', fileByPath: new Map() }

test('menus: a secondary-locale footer column takes the menutype of its default-locale column, keeps its translated title', () => {
  const byLocale = new Map([
    ['en', menusOf([['Company', [['About us', '/about'], ['Careers', '/careers']]], ['Contact', [['Book a call', '/contact'], ['Telegram', 'https://t.me/x']]]])],
    ['ru', menusOf([['Компания', [['О нас', '/ru/about'], ['Вакансии', '/ru/careers']]], ['Контакты', [['Записаться', '/ru/contact'], ['Telegram', 'https://t.me/x']]]])]
  ])
  const { menus, footerCustoms, notes } = buildMenus(byLocale, ctx)
  assert.deepEqual(
    menus.map((m) => [m.menutype, m.locale, m.title, m.items.length]),
    [
      ['footer-company', 'en', 'Company', 2],
      ['footer-contact', 'en', 'Contact', 2],
      ['footer-company-ru', 'ru', 'Компания (RU)', 2],
      ['footer-contact-ru', 'ru', 'Контакты (RU)', 2]
    ]
  )
  assert.equal(menus[2].items[0].id, 'footer-company-ru-1')
  assert.deepEqual(footerCustoms, [], 'named columns are menus, not synthesised footnav blocks')
  assert.deepEqual(notes, [])
})

test('menus: a column with no default-locale counterpart keeps its own slug with a note; a heading-less column is still a footnav block', () => {
  const byLocale = new Map([
    ['en', menusOf([['Company', [['About us', '/about'], ['Careers', '/careers']]], [null, [['Terms', '/terms'], ['Privacy', '/privacy']]]])],
    ['ru', menusOf([['Компания', [['О нас', '/ru/about'], ['Вакансии', '/ru/careers']]], [null, [['Условия', '/ru/terms'], ['Политика', '/ru/privacy']]], ['Партнёры', [['Дилеры', '/ru/dealers'], ['Поставщики', '/ru/suppliers']]]])]
  ])
  const { menus, footerCustoms, notes } = buildMenus(byLocale, ctx)
  assert.deepEqual(
    menus.map((m) => [m.menutype, m.locale]),
    [
      ['footer-company', 'en'],
      ['footer-2', 'en'],
      ['footer-company-ru', 'ru'],
      ['footer-2-ru', 'ru'],
      ['footer-партнеры-ru', 'ru']
    ]
  )
  assert.deepEqual(
    footerCustoms.map((c) => [c.id, c.position, c.locale]),
    [
      ['footnav-2', 'footnav-2', 'en'],
      ['footnav-2-ru', 'footnav-2', 'ru']
    ],
    'only the heading-less column is synthesised, at its own column position'
  )
  assert.equal(notes.length, 1)
  assert.match(notes[0], /Партнёры/)
})
