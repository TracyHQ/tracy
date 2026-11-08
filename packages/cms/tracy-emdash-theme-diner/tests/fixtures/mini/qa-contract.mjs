// A complete, valid qa.contract for the mini-html fixture (DE/FR). Tests mutate copies of it to
// prove each validator rule can FAIL; the mock site in qa.test.mjs renders exactly what it declares.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { hash } from '../../../tools/qa-contract.mjs'
export const SOURCE = path.resolve(new URL('.', import.meta.url).pathname, '../mini-html')
const file = (p, disposition) => ({ path: p, sha256: hash(readFileSync(path.join(SOURCE, p))), disposition })
const VARIANTS = ['desktop-light', 'mobile-dark']
const page = (id, { path: route, locale, source, title, tagline, states = ['default'] }) => ({
  id,
  path: route,
  locale,
  status: 200,
  identity: 'main h1',
  source: [source],
  variants: VARIANTS,
  states,
  rules: ['body-font'],
  content: [
    {
      id: 'title',
      selector: 'main h1',
      source,
      owner: 'field',
      binding: 'seiten.<slug>.titel',
      attribute: 'text',
      expected: title
    },
    ...(tagline
      ? [
          {
            id: 'tagline',
            selector: 'main p',
            source,
            owner: 'field',
            binding: 'seiten.<slug>.text',
            attribute: 'text',
            expected: tagline
          },
          {
            id: 'logo',
            selector: 'header img',
            source: 'logo.png',
            owner: 'setting',
            binding: 'site.logo',
            attribute: 'src',
            expected: '/logo.png'
          }
        ]
      : [
          {
            id: 'email',
            selector: 'main form input[name=email]',
            source,
            owner: 'static',
            binding: 'form field rendered by the forms plugin',
            attribute: 'text',
            expected: ''
          }
        ])
  ]
})
export function miniContract() {
  return {
    schemaVersion: 1,
    id: 'mini-atelier',
    revision: 1,
    pending: [],
    locales: ['de', 'fr'],
    defaultLocale: 'de',
    source: {
      reference: 'tests/fixtures/mini-html',
      files: [
        file('de/index.html', 'converted'),
        file('de/kontakt.html', 'converted'),
        file('fr/contact.html', 'converted'),
        file('fr/index.html', 'converted'),
        file('logo.png', 'asset'),
        file('style.css', 'asset')
      ]
    },
    variants: [
      { id: 'desktop-light', width: 1280, height: 800, theme: 'light', reducedMotion: 'reduce' },
      { id: 'mobile-dark', width: 390, height: 844, theme: 'dark', reducedMotion: 'reduce' }
    ],
    design: {
      theme: {
        selector: 'html',
        attribute: 'data-theme',
        values: { light: null, dark: 'dark' },
        storageKey: 'mini-theme'
      },
      rules: [
        {
          id: 'body-font',
          selector: 'body',
          source: 'style.css',
          styles: { 'desktop-light': { 'font-family': 'serif' }, 'mobile-dark': { 'font-family': 'serif' } }
        }
      ]
    },
    interactions: {
      'menu-open': {
        trigger: '#menu-trigger',
        panel: '#menu-panel',
        link: '#menu-panel a',
        open: 'click',
        fullWidth: true,
        inner: '#menu-panel .inner',
        maxInnerWidth: 640
      }
    },
    fonts: { selectors: ['h1', 'p'] },
    pages: [
      page('de-home', {
        path: '/',
        locale: 'de',
        source: 'de/index.html',
        title: 'Willkommen',
        tagline: 'Handgefertigte Möbel.',
        states: ['default', 'menu-open']
      }),
      page('de-kontakt', { path: '/kontakt', locale: 'de', source: 'de/kontakt.html', title: 'Kontakt' }),
      page('fr-home', {
        path: '/fr',
        locale: 'fr',
        source: 'fr/index.html',
        title: 'Bienvenue',
        tagline: 'Meubles faits main.',
        states: ['default', 'menu-open']
      }),
      page('fr-contact', { path: '/fr/contact', locale: 'fr', source: 'fr/contact.html', title: 'Contact' })
    ],
    reviews: Object.fromEntries(
      [
        'build',
        'security',
        'visual-review',
        'font-review',
        'viewing-contexts',
        'editability',
        'forms',
        'recovery',
        'clean-install',
        'independent'
      ].map((g) => [g, { mode: 'required' }])
    ),
    capabilities: ['i18n', 'forms'],
    distribution: {
      include: ['package.json', 'pnpm-lock.yaml', 'template.config.json', 'public', 'seed', 'src'],
      required: ['public/favicon.svg', 'seed/seed.json']
    }
  }
}
