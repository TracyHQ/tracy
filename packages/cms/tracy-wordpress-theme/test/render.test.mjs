// The Tracy Business theme's header and footer, rendered by real PHP against a minimal fake
// WordPress (test/fake-wordpress.php): what a visitor reads in each page language. The theme under
// test is the built tree, src/wp-tracy-business/ — the files a customer site installs.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Fails on CI without PHP; skips with a stated reason on a laptop without php or docker.
const PHP_SKIP = phpSupport().skip

// One PHP session for the whole file: a local php, else one container that the theme and the fake
// travel into as a tar (the CI docker socket belongs to the host, so a bind path would not resolve).
let php
before(() => {
  if (!PHP_SKIP)
    php = startPhp({
      image: 'php:8.3-cli',
      files: { cwd: PKG, paths: ['src/wp-tracy-business', 'test/fake-wordpress.php'] }
    })
})
after(() => php?.stop())

/**
 * Renders parts or markup with the built theme. `world`: locale (WordPress), lang (Polylang slug;
 * omitted = no Polylang), options. Returns one string per item of `render`.
 */
function render(world, render) {
  const input = JSON.stringify({ ...world, theme: path.join(php.root, 'src', 'wp-tracy-business'), render })
  const [out] = php.run([{ args: [path.join(php.root, 'test', 'fake-wordpress.php')], input }])
  assert.equal(out.status, 0, `php failed: ${out.stderr}${out.stdout}`)
  return JSON.parse(out.stdout)
}

/** The visible text of rendered markup, tags gone, whitespace collapsed. */
const text = (html) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const SEARCH_EMPTY =
  '<!-- wp:query-no-results --><!-- wp:paragraph {"className":"tracy-muted"} --><p class="tracy-muted">Nothing matched.</p><!-- /wp:paragraph --><!-- /wp:query-no-results -->'

test('header and footer: the fixed words in the page language', { skip: PHP_SKIP }, () => {
  const [header, footer, search] = render({ locale: 'ru_RU', lang: 'ru', options: { blogname: 'Acme' } }, [
    { part: 'header' },
    { part: 'footer' },
    { markup: SEARCH_EMPTY }
  ])
  const words = text(header)
  for (const word of [
    'Горячая линия:',
    'Ресурсы',
    'Маркетинг-кит',
    'Недавние объекты',
    'Найти',
    'Запросить смету'
  ]) {
    assert.ok(words.includes(word), `header lacks ${word}: ${words}`)
  }
  assert.match(header, /placeholder="Поиск по сайту"/)
  assert.ok(text(footer).includes('Компания'), text(footer))
  assert.ok(text(footer).includes('Услуги'), text(footer))
  assert.equal(text(search), 'Ничего не найдено.')
  // No English fixed word is left: every one the theme lists is gone from both parts.
  for (const english of [
    'Hotline:',
    'Resources',
    'Marketing kit',
    'Recent projects',
    'News & updates',
    'All resources →',
    'Request a quote',
    'Services',
    'Company',
    'Maintenance & retrofit'
  ]) {
    assert.ok(!text(header + footer).includes(english), `still English: ${english}`)
  }
})

test("dark-mode toggle: its words and its screen-reader label are the page language's", {
  skip: PHP_SKIP
}, () => {
  const [header] = render({ locale: 'ru_RU', lang: 'ru' }, [{ part: 'header' }])
  const toggle = header.match(/<button[^>]*data-tracy-theme-toggle[^>]*>.*?<\/button>/s)?.[0] ?? ''
  assert.match(toggle, /aria-label="Тёмная"/)
  assert.match(toggle, /data-text-dark="Тёмная" data-text-light="Светлая">Тёмная</)
  assert.doesNotMatch(toggle, /Theme:|Switch/)
})

test('English page, or a locale the theme has no words for: the words stay as written', {
  skip: PHP_SKIP
}, () => {
  for (const world of [{ locale: 'en_US', lang: 'en' }, { locale: 'xx_XX' }]) {
    const [header, footer] = render(world, [{ part: 'header' }, { part: 'footer' }])
    assert.ok(text(header).includes('Hotline:'))
    assert.ok(text(header).includes('Search the site') || header.includes('placeholder="Search the site"'))
    assert.ok(text(footer).includes('Company'))
  }
})

test('a word the owner rewrote is left as written', { skip: PHP_SKIP }, () => {
  const [out] = render({ locale: 'ru_RU', lang: 'ru' }, [
    { markup: '<!-- wp:query-no-results --><p>Nothing matched, try again.</p><!-- /wp:query-no-results -->' }
  ])
  assert.equal(text(out), 'Nothing matched, try again.')
})

test('every language file carries every word the theme translates', () => {
  const theme = path.join(PKG, 'src', 'wp-tracy-business')
  // A PHP string literal's value: single-quoted, or double-quoted with the \x04 that joins a
  // context to its word (the key WordPress looks up for _x()).
  const unquote = (s) =>
    s.startsWith('"')
      ? s
          .slice(1, -1)
          .replace(/\\x04/g, '\u0004')
          .replace(/\\(["\\$])/g, '$1')
      : s.slice(1, -1).replace(/\\(['\\])/g, '$1')
  const source = readFileSync(path.join(theme, 'inc', 'extra.php'), 'utf8')
  const literal = `('(?:[^'\\\\]|\\\\.)*')`
  const wanted = new Set([
    ...[...source.matchAll(new RegExp(`\\b__\\(\\s*${literal}\\s*,\\s*'wp-tracy-business'\\s*\\)`, 'g'))].map(
      (m) => unquote(m[1])
    ),
    ...[
      ...source.matchAll(
        new RegExp(`\\b_x\\(\\s*${literal}\\s*,\\s*${literal}\\s*,\\s*'wp-tracy-business'\\s*\\)`, 'g')
      )
    ].map((m) => `${unquote(m[2])}\u0004${unquote(m[1])}`)
  ])
  // The pattern category's label is the theme's name, not a word to translate.
  wanted.delete('Tracy Business')
  const files = readdirSync(path.join(theme, 'languages'))
  assert.equal(files.length, 40)
  for (const file of files) {
    const body = readFileSync(path.join(theme, 'languages', file), 'utf8')
    const have = new Set(
      [...body.matchAll(/^\t\t('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*") => '(?:[^'\\]|\\.)+',$/gm)].map((m) =>
        unquote(m[1])
      )
    )
    const missing = [...wanted].filter((w) => !have.has(w))
    assert.deepEqual(missing, [], `${file} lacks translations`)
  }
})

// A site whose first language, Vietnamese, is Polylang's default (served at the root) and whose
// English and Russian are served under their prefixes. Pages exist per language where the site
// translated them; the kit's 404 page is a draft on purpose; the project page is English only.
const navLinks = (items) =>
  items
    .map(([label, id]) => `<!-- wp:navigation-link {"label":"${label}","kind":"post-type","id":${id}} /-->`)
    .join('')
const page = (ID, post_name, lang, group, url, post_title = '', post_status = 'publish') => ({
  ID,
  post_type: 'page',
  post_name,
  lang,
  group,
  url,
  post_title,
  post_status
})
const menu = (ID, post_name, items) => ({
  ID,
  post_type: 'wp_navigation',
  post_name,
  post_content: navLinks(items)
})
const H = 'https://acme.test/'
const SITE = {
  default: 'vi',
  home: { vi: 'https://acme.test/', en: 'https://acme.test/en/', ru: 'https://acme.test/ru/' },
  options: { blogname: 'Acme' },
  posts: [
    page(20, 'contact', 'en', 'contact', `${H}en/contact/`, 'Contact'),
    page(21, 'lien-he', 'vi', 'contact', `${H}lien-he/`, 'Liên hệ'),
    page(22, 'kontakty', 'ru', 'contact', `${H}ru/kontakty/`, 'Контакты'),
    page(30, '404', 'en', '404', '', '', 'draft'),
    page(31, '404-vi', 'vi', '404', '', '', 'draft'),
    page(40, 'project-detail', 'en', 'project', `${H}en/project-detail/`, 'Project'),
    page(50, 'news', 'en', 'news', `${H}en/news/`, 'News'),
    page(51, 'tin-tuc', 'vi', 'news', `${H}tin-tuc/`, 'Tin tức'),
    page(60, 'so-do-trang', 'vi', 'sitemap', `${H}so-do-trang/`, 'Sơ đồ trang'),
    page(61, 'sitemap', 'en', 'sitemap', `${H}en/sitemap/`, 'Sitemap'),
    { ID: 70, post_type: 'post', post_name: 'bai-1', lang: 'vi', url: `${H}bai-1/`, post_title: 'Bài một' },
    {
      ID: 71,
      post_type: 'post',
      post_name: 'post-1',
      lang: 'en',
      url: `${H}en/post-1/`,
      post_title: 'Post one'
    },
    menu(100, 'tracy', [['About (base)', 20]]),
    menu(101, 'tracy-vi', [['Liên hệ', 21]]),
    menu(102, 'tracy-en', [['Contact us', 20]]),
    menu(103, 'footer-legal', [['Sitemap', 61]]),
    menu(104, 'footer-legal-vi', [['Sơ đồ trang', 60]])
  ]
}
const hrefOf = (html, label) =>
  html.match(new RegExp(`<a[^>]*href="([^"]*)"[^>]*>${label}<`))?.[1] ?? `no link "${label}"`

test("header and footer links lead to the page language's copy of their page", { skip: PHP_SKIP }, () => {
  const [vi, viFooter] = render({ ...SITE, locale: 'vi', lang: 'vi' }, [
    { part: 'header' },
    { part: 'footer' }
  ])
  assert.equal(hrefOf(vi, 'Yêu cầu báo giá'), `${H}lien-he/`)
  assert.equal(hrefOf(vi, 'Tất cả tài nguyên →'), `${H}tin-tuc/`)
  // No Vietnamese copy: the page itself, in English, rather than a dead end.
  assert.match(vi, new RegExp(`href="${H}en/project-detail/"`))
  // A path that is no page: the same path in the page language. (The base's header no longer
  // links the kit's draft 404 page, so that case has no link to follow here.)
  assert.match(vi, new RegExp(`href="${H}newsletter/"`))
  assert.match(viFooter, new RegExp(`href="${H}services/"`))

  const [en] = render({ ...SITE, locale: 'en_US', lang: 'en' }, [{ part: 'header' }])
  assert.equal(hrefOf(en, 'Request a quote'), `${H}en/contact/`)
  assert.equal(hrefOf(en, 'All resources →'), `${H}en/news/`)
  assert.match(en, new RegExp(`href="${H}en/newsletter/"`))

  const [ru] = render({ ...SITE, locale: 'ru_RU', lang: 'ru' }, [{ part: 'header' }])
  assert.equal(hrefOf(ru, 'Запросить смету'), `${H}ru/kontakty/`)
})

test('each language shows its own menu, English included, when the default language is not English', {
  skip: PHP_SKIP
}, () => {
  const header = (lang, locale) => render({ ...SITE, locale, lang }, [{ part: 'header' }])[0]
  const nav = (html) => text(html.match(/<nav class="wp-block-navigation tracy-nav">.*?<\/nav>/s)?.[0] ?? '')
  assert.equal(nav(header('vi', 'vi')), 'Liên hệ')
  assert.equal(nav(header('en', 'en_US')), 'Contact us')
  // A language with no menu of its own falls back to the base menu.
  assert.equal(nav(header('ru', 'ru_RU')), 'About (base)')
})

test("footer: no Terms or Privacy; the Sitemap link is a menu leading to the page language's Sitemap", {
  skip: PHP_SKIP
}, () => {
  const [vi] = render({ ...SITE, locale: 'vi', lang: 'vi' }, [{ part: 'footer' }])
  const [en] = render({ ...SITE, locale: 'en_US', lang: 'en' }, [{ part: 'footer' }])
  for (const footer of [vi, en]) {
    assert.doesNotMatch(footer, /\/terms\/|\/privacy\/|>Terms<|>Privacy</)
  }
  assert.equal(hrefOf(vi, 'Sơ đồ trang'), `${H}so-do-trang/`)
  assert.equal(hrefOf(en, 'Sitemap'), `${H}en/sitemap/`)
})

test("Sitemap page: the page language's menus, then its other pages, then its news", {
  skip: PHP_SKIP
}, () => {
  const [vi] = render({ ...SITE, locale: 'vi', lang: 'vi' }, [{ template: 'page-sitemap' }])
  const groups = [...vi.matchAll(/<div class="tracy-sitemap__group">(.*?)<\/ul><\/div>/gs)].map((g) =>
    text(g[1])
  )
  assert.deepEqual(groups, ['Công ty Liên hệ', 'Trang Tin tức Sơ đồ trang', 'Tin tức Bài một'])
  assert.doesNotMatch(vi, /Post one|Contact us|About \(base\)/)
})

// The front page's news band (patterns/section-news.php) on a Russian page: two Russian posts, an
// English one the Russian page must not list, and the posts page (Settings → Reading) mapped per
// language. `loop`: the fake's Query Loop lists these posts, newest first.
const post = (ID, lang, post_date, post_title, url) => ({
  ID,
  post_type: 'post',
  lang,
  post_date,
  post_title,
  url
})
const NEWS = {
  locale: 'ru_RU',
  lang: 'ru',
  loop: true,
  options: { blogname: 'Acme', page_for_posts: 50 },
  posts: [
    page(50, 'news', 'en', 'news', `${H}en/news/`, 'News'),
    page(52, 'novosti', 'ru', 'news', `${H}ru/novosti/`, 'Новости'),
    post(80, 'ru', '2026-07-28 00:00:00', 'Четыре ошибки в фундаментах', `${H}ru/chetyre-oshibki/`),
    post(81, 'ru', '2026-08-12 00:00:00', 'Норткейт выиграл тендер', `${H}ru/nortkeit/`),
    post(82, 'en', '2026-09-01 00:00:00', 'An English post', `${H}en/an-english-post/`)
  ]
}
const cardsOf = (html) =>
  [...html.matchAll(/<li class="wp-block-post[^"]*">(.*?)<\/li>/gs)].map((li) => ({
    title: text(li[1].match(/<h3[^>]*>(.*?)<\/h3>/s)?.[1] ?? ''),
    href: li[1].match(/<h3[^>]*><a href="([^"]*)"/)?.[1] ?? '',
    more: li[1].match(/<a class="wp-block-read-more" href="([^"]*)"[^>]*>([^<]*)</)?.slice(1) ?? []
  }))

test('news band: the pattern writes a Query Loop of the three latest posts, not copies of them', {
  skip: PHP_SKIP
}, () => {
  const [ru] = render(NEWS, [{ pattern: 'section-news', inserted: true }])
  const query = JSON.parse(ru.match(/<!-- wp:query (\{.*?\}) -->/)?.[1] ?? 'null')
  assert.deepEqual(
    { ...query?.query },
    {
      perPage: 3,
      pages: 0,
      offset: 0,
      postType: 'post',
      order: 'desc',
      orderBy: 'date',
      author: '',
      search: '',
      exclude: [],
      sticky: 'ignore',
      inherit: false
    }
  )
  assert.match(ru, /<!-- wp:post-template \{"className":"wtb-news__grid"/)
  for (const block of [
    '<!-- wp:group {"className":"wtb-card wtb-news__item"',
    '<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"16/9","sizeSlug":"large","className":"wtb-card__media"} /-->',
    '<!-- wp:post-date {"format":"j M Y"} /-->',
    '<!-- wp:post-terms {"term":"category","prefix":"· "} /-->',
    '<!-- wp:post-title {"level":3,"isLink":true,"className":"wtb-card__title"} /-->',
    '<!-- wp:post-excerpt {"excerptLength":20,"className":"wtb-card__text"} /-->',
    // The link word is written in the language the page was made in.
    '<!-- wp:read-more {"content":"Читать далее →"} /-->'
  ]) {
    assert.ok(ru.includes(block), `the pattern lacks ${block}`)
  }
  // No typed card is left to go stale: no item slots, no demo headline, no dead link.
  assert.doesNotMatch(ru, /news\.item\.|Northgate|12 Aug 2026|<p class="wtb-card__link"><a href="#"/)
  // The head stays text in the page, each block named for the content contract.
  for (const name of ['news.eyebrow', 'news.heading', 'news.intro', 'news.cta.1']) {
    assert.ok(ru.includes(`"name":"${name}"`), `the head lacks ${name}`)
  }
})

test("news band: the page language's latest posts, each card linked to its post", { skip: PHP_SKIP }, () => {
  const [ru] = render(NEWS, [{ pattern: 'section-news' }])
  assert.deepEqual(cardsOf(ru), [
    {
      title: 'Норткейт выиграл тендер',
      href: `${H}ru/nortkeit/`,
      more: [`${H}ru/nortkeit/`, 'Читать далее →']
    },
    {
      title: 'Четыре ошибки в фундаментах',
      href: `${H}ru/chetyre-oshibki/`,
      more: [`${H}ru/chetyre-oshibki/`, 'Читать далее →']
    }
  ])
  assert.doesNotMatch(ru, /An English post/)
  // A post retitled is the card retitled: nothing in the page to copy it into.
  const retitled = {
    ...NEWS,
    posts: NEWS.posts.map((p) => (p.ID === 81 ? { ...p, post_title: 'Норткейт: новый заголовок' } : p))
  }
  assert.equal(
    cardsOf(render(retitled, [{ pattern: 'section-news' }])[0])[0].title,
    'Норткейт: новый заголовок'
  )
})

test('news band: "View all" goes to the page language\'s posts page while it is still the pattern\'s #', {
  skip: PHP_SKIP
}, () => {
  const button = (href) =>
    `<!-- wp:button {"className":"is-style-link","metadata":{"role":"content","name":"news.cta.1"}} --><div class="wp-block-button is-style-link"><a class="wp-block-button__link wp-element-button" href="${href}">Все новости →</a></div><!-- /wp:button -->`
  const [pattern, typed, owners, other] = render(NEWS, [
    { pattern: 'section-news' },
    // A page seeded before 28/09 carries the same button, with the same dead link.
    { markup: button('#') },
    { markup: button('https://example.test/press/') },
    { markup: button('#').replace('news.cta.1', 'cta.cta.1') }
  ])
  assert.equal(hrefOf(pattern, 'View all →'), `${H}ru/novosti/`)
  assert.equal(hrefOf(typed, 'Все новости →'), `${H}ru/novosti/`)
  assert.equal(hrefOf(owners, 'Все новости →'), 'https://example.test/press/')
  assert.equal(hrefOf(other, 'Все новости →'), '#')
  // No posts page set: nowhere better to go, the button is left as it is.
  const [unset] = render({ ...NEWS, options: { blogname: 'Acme' } }, [{ markup: button('#') }])
  assert.equal(hrefOf(unset, 'Все новости →'), '#')
})

test('news band: left out while the page language has no post; a band of typed cards stays', {
  skip: PHP_SKIP
}, () => {
  const typedBand =
    '<!-- wp:group {"tagName":"section","className":"wtb-section wtb-news"} --><section class="wp-block-group wtb-section wtb-news"><!-- wp:group {"className":"wtb-news__grid"} --><div class="wp-block-group wtb-news__grid"><!-- wp:heading {"level":3,"className":"wtb-card__title","metadata":{"role":"content","name":"news.item.1.title"}} --><h3 class="wp-block-heading wtb-card__title">A typed card</h3><!-- /wp:heading --></div><!-- /wp:group --></section><!-- /wp:group -->'
  const [empty, typed] = render({ ...NEWS, lang: 'vi', locale: 'vi' }, [
    { pattern: 'section-news' },
    { markup: typedBand }
  ])
  assert.equal(empty.trim(), '')
  assert.equal(text(typed), 'A typed card')
})

const RU = { locale: 'ru_RU', lang: 'ru', options: { blogname: 'Acme' } }

test("404, news, article and search templates: the theme's words in the page language", {
  skip: PHP_SKIP
}, () => {
  const [notFound, single, home, search] = render(RU, [
    { template: '404' },
    { template: 'single' },
    { template: 'home' },
    { template: 'search' }
  ])
  for (const word of ['Страница не найдена', 'Возможно, страница перемещена', '← На главную']) {
    assert.ok(text(notFound).includes(word), `404 lacks ${word}: ${text(notFound)}`)
  }
  assert.match(notFound, /placeholder="Поиск по сайту"/)
  assert.match(single, /aria-label="Поделиться в LinkedIn"/)
  assert.match(single, /aria-label="Поделиться в Facebook"/)
  assert.match(single, /aria-label="Скопировать ссылку"/)
  for (const word of ['Теги:', '← Предыдущая', 'Следующая →', 'Похожие материалы']) {
    assert.ok(text(single).includes(word), `article lacks ${word}: ${text(single)}`)
  }
  for (const word of ['Новости', 'Главное ·', 'Здесь пока ничего нет.', 'Все']) {
    assert.ok(text(home).includes(word), `news index lacks ${word}: ${text(home)}`)
  }
  assert.match(search, /placeholder="Запрос"/)
  for (const english of ['Page not found', 'Related articles', 'Share on', 'Nothing here yet.', 'Keyword']) {
    assert.ok(!(notFound + single + home + search).includes(english), `still English: ${english}`)
  }
})

test("a post's own content keeps its words; only the template's are swapped", { skip: PHP_SKIP }, () => {
  const [page] = render({ ...RU, content: '<!-- wp:paragraph --><p>News</p><!-- /wp:paragraph -->' }, [
    { markup: '<!-- wp:heading --><h2>News</h2><!-- /wp:heading --><!-- wp:post-content /-->' }
  ])
  assert.match(page, /<h2>Новости<\/h2>/)
  assert.match(page, /<div class="entry-content"><p>News<\/p><\/div>/)
})

test('the draft 404 page drawn by the theme: its words follow the page language, its links stay', {
  skip: PHP_SKIP
}, () => {
  const body =
    '<!-- wp:heading {"level":1} --><h1>We could not find that page</h1><!-- /wp:heading -->' +
    '<!-- wp:heading --><h2>You may be looking for</h2><!-- /wp:heading -->' +
    '<!-- wp:paragraph --><p><a href="#">Capability statement 2026</a></p><!-- /wp:paragraph -->'
  const [page] = render(
    {
      ...RU,
      is_404: true,
      options: { ...RU.options, wp_tracy_business_404_page: 36 },
      posts: [
        { ID: 36, post_type: 'page', post_name: '404', post_status: 'draft', lang: 'en', post_content: body }
      ]
    },
    [{ template: '404' }]
  )
  for (const word of ['Такая страница не найдена', 'Возможно, вы искали', 'Презентация компетенций, 2026']) {
    assert.ok(text(page).includes(word), `404 page lacks ${word}: ${text(page)}`)
  }
  assert.match(page, /<a href="#">Презентация компетенций, 2026<\/a>/)
})

test('sidebars: their words, the newsletter form, and chips that search the word they show', {
  skip: PHP_SKIP
}, () => {
  const [news, search, article] = render(RU, [
    { part: 'sidebar-news' },
    { part: 'sidebar-search' },
    { part: 'sidebar-article' }
  ])
  for (const word of ['Рубрики', 'Свежие материалы', 'Отраслевой дайджест раз в две недели']) {
    assert.ok(text(news).includes(word), `news sidebar lacks ${word}: ${text(news)}`)
  }
  assert.match(news, /placeholder="Введите запрос…"/)
  assert.match(news, /placeholder="Рабочая почта"/)
  assert.match(news, /type="submit" value="Подписаться"/)
  for (const word of ['Фильтр по разделам', 'Частые запросы']) {
    assert.ok(text(search).includes(word), `search sidebar lacks ${word}: ${text(search)}`)
  }
  const chips = [...search.matchAll(/<a href="([^"]*)">([^<]*)<\/a><\/p>/g)].map((m) => [m[2], m[1]])
  assert.deepEqual(
    chips.map(([word]) => word),
    ['смета', 'ISO 45001', 'СРО', 'вакансии']
  )
  for (const [word, href] of chips) {
    assert.equal(href, `/ru/?s=${encodeURIComponent(word)}`)
  }
  for (const word of [
    'Нужен совет по вашему следующему проекту?',
    'Наша инженерная команда бесплатно рассмотрит ваш первый комплект чертежей.',
    'Отправить запрос'
  ]) {
    assert.ok(text(article).includes(word), `article sidebar lacks ${word}: ${text(article)}`)
  }
})

test('the news sidebar runs its subscribe shortcode, and leaves the card out without the form', {
  skip: PHP_SKIP
}, () => {
  // WordPress runs no shortcode over a pattern drawn inside a template part: the card printed
  // [contact-form-7 title="Newsletter"] as text on /news (15/10/2026).
  const [withForm] = render({ locale: 'en_US' }, [{ part: 'sidebar-news' }])
  assert.doesNotMatch(withForm, /\[contact-form-7/)
  assert.match(withForm, /tracy-aside__subscribe/)
  assert.match(withForm, /class="wpcf7-form-control wpcf7-submit" type="submit" value="Subscribe"/)
  for (const world of [{ cf7_forms: ['Contact'] }, { cf7_forms: false }]) {
    const [news] = render({ locale: 'en_US', ...world }, [{ part: 'sidebar-news' }])
    assert.doesNotMatch(news, /\[contact-form-7/, JSON.stringify(world))
    assert.doesNotMatch(news, /tracy-aside__subscribe|Get our industry brief/, JSON.stringify(world))
    assert.match(news, /tracy-aside__latest/, 'the other cards stay')
  }
})

test("a form's sent / error message follows the language of the page it was sent from", {
  skip: PHP_SKIP
}, () => {
  const sent = 'Thank you for your message. It has been sent.'
  const [ru, own, fields] = render(RU, [
    { filter: 'wpcf7_display_message', value: sent },
    { filter: 'wpcf7_display_message', value: 'Thanks, we will call you back.' },
    { filter: 'wpcf7_form_hidden_fields', value: {} }
  ])
  assert.equal(ru, 'Спасибо за сообщение. Оно отправлено.')
  assert.equal(own, 'Thanks, we will call you back.')
  assert.deepEqual(fields, { _wtb_locale: 'ru_RU' })
  const [en] = render({ locale: 'en_US' }, [{ filter: 'wpcf7_display_message', value: sent }])
  assert.equal(en, sent)
})

test("the Contact form's words and messages carried in the theme's translations", { skip: PHP_SKIP }, () => {
  const [ru] = render(RU, [{ call: 'wp_tracy_business_form_words' }])
  assert.equal(ru.words['Full name *'], 'Имя и фамилия *')
  assert.equal(
    ru.words['PDF, DWG, ZIP, JPG, PNG, Word, Excel · 25 MB max'],
    'PDF, DWG, ZIP, JPG, PNG, Word, Excel · до 25 МБ'
  )
  assert.equal(ru.words.Other, 'Другое')
  assert.equal(ru.words['Company name'], 'Юридическое название')
  assert.equal(ru.messages.mail_sent_ok, 'Спасибо за сообщение. Оно отправлено.')
  assert.equal(ru.messages.spam, ru.messages.mail_sent_ng)
  assert.equal(Object.keys(ru.messages).length, 12)
  // The name, email and phone placeholders stay the demo's: they are not words the theme carries.
  for (const placeholder of ['Ivan Petrov', 'you@company.ru', '+7 (___) ___-__-__']) {
    assert.ok(!(placeholder in ru.words))
  }
})

// The shared Contact form (form 25) as the cut writes it — neutral request types, the generic
// description hint, the added upload types — and as Contact Form 7 draws it inside the Contact page.
const CONTACT_FORM =
  '<div class="wtb-form__grid wtb-form__grid--2">' +
  '<label class="wtb-form__field"> Full name *<br /><span class="wpcf7-form-control-wrap" data-name="full-name"><input size="40" class="wpcf7-form-control wpcf7-text" type="text" name="full-name" placeholder="Ivan Petrov" /></span> </label>' +
  '<label class="wtb-form__field"> Company<br /><span class="wpcf7-form-control-wrap" data-name="company"><input size="40" class="wpcf7-form-control wpcf7-text" type="text" name="company" placeholder="Company name" /></span> </label>' +
  '<label class="wtb-form__field"> Email *<br /><span class="wpcf7-form-control-wrap" data-name="email"><input size="40" class="wpcf7-form-control wpcf7-email" type="email" name="email" placeholder="you@company.ru" /></span> </label>' +
  '<label class="wtb-form__field"> Phone<br /><span class="wpcf7-form-control-wrap" data-name="phone"><input size="40" class="wpcf7-form-control wpcf7-tel" type="tel" name="phone" placeholder="+7 (___) ___-__-__" /></span> </label>' +
  '</div>' +
  '<fieldset class="wtb-form__choices"><legend>Request type *</legend><span class="wpcf7-form-control-wrap" data-name="request-type"><span class="wpcf7-form-control wpcf7-radio">' +
  ['Quote request', 'Consultation', 'Support', 'Other']
    .map(
      (type) =>
        `<span class="wpcf7-list-item"><label><input type="radio" name="request-type" value="${type}" /><span class="wpcf7-list-item-label">${type}</span></label></span>`
    )
    .join('') +
  '</span></span></fieldset>' +
  '<label class="wtb-form__field"> Project description *<br /><span class="wpcf7-form-control-wrap" data-name="project-description"><textarea cols="40" rows="10" class="wpcf7-form-control wpcf7-textarea" name="project-description" placeholder="Tell us what you need…"></textarea></span> </label>' +
  '<label class="wtb-form__file"> Drag drawings here, or click to choose files <span class="wtb-form__hint">PDF, DWG, ZIP, JPG, PNG, Word, Excel · 25 MB max</span><br /><span class="wpcf7-form-control-wrap" data-name="file-1"><input size="40" class="wpcf7-form-control wpcf7-file" accept=".pdf,.dwg,.zip,.jpg,.png,.doc,.docx,.xls,.xlsx" type="file" name="file-1" /></span> </label>' +
  '<span class="wpcf7-form-control-wrap" data-name="acceptance-1"><span class="wpcf7-form-control wpcf7-acceptance"><span class="wpcf7-list-item"><label><input type="checkbox" name="acceptance-1" value="1" /><span class="wpcf7-list-item-label">I consent to the processing of personal data under Federal Law 152-FZ.</span></label></span></span></span>' +
  '<div class="wtb-form__actions"><input class="wpcf7-form-control wpcf7-submit has-spinner" type="submit" value="Send request" /> <button type="reset" class="wtb-form__reset">Clear form</button></div>'

test("the Contact page's shared form: its words in the page language, its values and placeholders kept", {
  skip: PHP_SKIP
}, () => {
  const VI = { locale: 'vi', lang: 'vi', options: { blogname: 'Acme' } }
  const [vi] = render(VI, [{ filter: 'wpcf7_form_elements', value: CONTACT_FORM }])
  const [ru] = render(RU, [{ filter: 'wpcf7_form_elements', value: CONTACT_FORM }])
  for (const word of [
    'Loại yêu cầu *',
    'Yêu cầu báo giá',
    'Kéo bản vẽ vào đây, hoặc bấm để chọn tệp',
    'PDF, DWG, ZIP, JPG, PNG, Word, Excel · tối đa 25 MB',
    'Xóa biểu mẫu'
  ]) {
    assert.ok(text(vi).includes(word), `vi form lacks ${word}: ${text(vi)}`)
  }
  assert.match(vi, /placeholder="Hãy cho chúng tôi biết bạn cần gì…"/)
  assert.match(vi, /type="submit" value="Gửi yêu cầu"/)
  assert.match(vi, /placeholder="Tên công ty"/)
  for (const word of [
    'Тип обращения *',
    'Запрос коммерческого предложения',
    'Согласен на обработку персональных данных по 152-ФЗ.',
    'Очистить форму'
  ]) {
    assert.ok(text(ru).includes(word), `ru form lacks ${word}: ${text(ru)}`)
  }
  assert.match(ru, /placeholder="Расскажите, что вам нужно…"/)
  assert.match(ru, /type="submit" value="Отправить запрос"/)
  assert.match(ru, /placeholder="Юридическое название"/)
  for (const form of [vi, ru]) {
    for (const english of [
      'Request type *',
      'Drag drawings here',
      'Send request',
      'Tell us what you need',
      'I consent',
      'Company name'
    ]) {
      assert.ok(!form.includes(english), `still English: ${english}`)
    }
    // What the visitor sends stays the form's own: the chosen type's value and the demo placeholders.
    assert.match(form, /value="Quote request"/)
    for (const placeholder of ['Ivan Petrov', 'you@company.ru', '+7 (___) ___-__-__']) {
      assert.ok(form.includes(`placeholder="${placeholder}"`), `placeholder changed: ${placeholder}`)
    }
  }
  const [en] = render({ locale: 'en_US' }, [{ filter: 'wpcf7_form_elements', value: CONTACT_FORM }])
  assert.ok(text(en).includes('Quote request') && en.includes('value="Send request"'))
  assert.match(en, /placeholder="Company name"/)
})

// Contact Form 7 draws a form in the form's own locale (`en_US`), switching WordPress to it while it
// draws wherever the page language has WordPress's own files (German, French, … — not Russian on
// the base), so everything read from the current locale inside the form reads English.
test("Contact Form 7's switch to the form's locale: the form's words and hidden field still follow the page language", {
  skip: PHP_SKIP
}, () => {
  const sent = 'Thank you for your message. It has been sent.'
  for (const [locale, lang, words, message] of [
    [
      'de_DE',
      'de',
      [
        'Art der Anfrage *',
        'Angebotsanfrage',
        'Anfrage senden',
        'Firmenname',
        'Sagen Sie uns, was Sie brauchen…'
      ],
      'Vielen Dank für Ihre Nachricht. Sie wurde gesendet.'
    ],
    [
      'fr_FR',
      'fr',
      [
        'Type de demande *',
        'Demande de devis',
        'Envoyer la demande',
        'Raison sociale',
        'Dites-nous ce dont vous avez besoin…'
      ],
      'Merci pour votre message. Il a bien été envoyé.'
    ]
  ]) {
    const [{ fields, form }] = render({ locale, lang, options: { blogname: 'Acme' } }, [
      { cf7: CONTACT_FORM }
    ])
    assert.deepEqual(fields, { _wtb_locale: locale })
    for (const word of words) {
      assert.ok(form.includes(word), `${locale} form lacks ${word}: ${text(form)}`)
    }
    for (const english of ['Request type *', 'Send request', 'Company name', 'Tell us what you need']) {
      assert.ok(!form.includes(english), `${locale} still English: ${english}`)
    }
    // The message comes back from a send, inside the same switch: the hidden field names the page.
    const [back] = render({ locale: 'en_US', post: fields }, [
      { filter: 'wpcf7_display_message', value: sent }
    ])
    assert.equal(back, message)
  }
  // The newsletter form in the news sidebar is drawn the same way: its field names the page too.
  const [{ fields }] = render(RU, [{ cf7: '<input type="email" placeholder="Work email">' }])
  assert.deepEqual(fields, { _wtb_locale: 'ru_RU' })
})

// The Contact card as the cut writes it into every language's Contact page: each row marked with
// the identity field it shows, its value as identity tokens, its label the theme's English word.
const CONTACT_CARD =
  '<!-- wp:group {"className":"wtb-contact__card"} -->\n<div class="wp-block-group wtb-contact__card">\n' +
  [
    ['contact.address', 'Address', '{contact.address}'],
    ['contact.phone', 'Hotline', '<a href="tel:{contact.tel}">{contact.phone}</a>'],
    ['contact.email', 'Email', '<a href="mailto:{contact.email}">{contact.email}</a>'],
    ['contact.hours', 'Office hours', '{contact.hours}']
  ]
    .map(
      ([field, label, value], i) =>
        `<!-- wp:group {"className":"wtb-contact__row","metadata":{"name":"contact.item.${i + 1}"}} -->\n` +
        `<div class="wp-block-group wtb-contact__row" data-tracy-identity="${field}">\n` +
        `<!-- wp:paragraph {"className":"wtb-contact__label"} -->\n<p class="wtb-contact__label">${label}</p>\n<!-- /wp:paragraph -->\n` +
        `<!-- wp:paragraph {"className":"wtb-contact__value"} -->\n<p class="wtb-contact__value">${value}</p>\n<!-- /wp:paragraph -->\n` +
        '</div>\n<!-- /wp:group -->\n'
    )
    .join('') +
  '</div>\n<!-- /wp:group -->\n'

test("Contact card: the identity store's contact under the page language's labels; an empty field drops its row, and no field drops the card", {
  skip: PHP_SKIP
}, () => {
  const contact = {
    address: '1 Market St, Springfield',
    phone: '+84 912 345 678',
    email: 'hi@acme.test',
    hours: 'Mon–Fri, 9:00–18:00'
  }
  const card = (identity) => {
    const [page] = render(
      {
        ...RU,
        identity: true,
        content: CONTACT_CARD,
        options: { ...RU.options, tracy_site_identity: { contact: identity } }
      },
      [{ markup: '<!-- wp:post-content /-->' }]
    )
    return {
      page,
      labels: [...page.matchAll(/<p class="wtb-contact__label">([^<]*)<\/p>/g)].map((m) => m[1]),
      values: [...page.matchAll(/<p class="wtb-contact__value">(.*?)<\/p>/g)].map((m) => text(m[1]))
    }
  }
  const full = card(contact)
  assert.deepEqual(full.labels, ['Адрес', 'Горячая линия', 'Эл. почта', 'Часы работы'])
  assert.deepEqual(full.values, [contact.address, contact.phone, contact.email, contact.hours])
  assert.match(full.page, /<a href="tel:\+84912345678">/)
  assert.match(full.page, /<a href="mailto:hi@acme.test">/)

  const noPhone = card({ ...contact, phone: '' })
  assert.deepEqual(noPhone.labels, ['Адрес', 'Эл. почта', 'Часы работы'])
  assert.doesNotMatch(noPhone.page, /tel:/)

  const empty = card({})
  // all four empty: the card goes too, never an empty ink block (/contact, 15/10/2026)
  assert.doesNotMatch(empty.page, /wtb-contact__card/)
  assert.deepEqual(empty.labels, [])
  assert.doesNotMatch(empty.page, /\{contact\./)
})
