/**
 * `@tracy/ui` carries no English of its own (#797, F-S2-007): every word a control shows or
 * announces is handed in by the caller, already translated, exactly as `DialogContent` has done
 * since #730. Three things are checked:
 *
 *   1. the source of the controls holds no bare English a reader would meet (the same scanner the
 *      `interface-languages` gate runs over plugin code), and no English default parameter;
 *   2. rendered, each control shows the caller's words, a second render with other words leaves
 *      nothing of the first, and the label prop does not leak into the DOM as an attribute;
 *   3. leaving a label out is a type error: `packages/ui/tracy-ui/src/type-tests/required-labels.tsx`,
 *      read by the package's own `typecheck`. This file only checks that fixture still covers
 *      every control.
 *
 * Rendering is server-side markup: no browser and no DOM library. Controls that draw into a
 * portal (the sheet, the toasts) render nothing that way, so for them points 1 and 3 carry the
 * proof and point 2 checks the pieces that do render in place.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { bareLiterals } from '../lib/ui-literals.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const UI = join(ROOT, 'packages/ui/tracy-ui/src/components/ui')

/** The controls of #797 and the two others in the library that had the same defect. */
const FILES = [
  'dialog.tsx',
  'sheet.tsx',
  'toast.tsx',
  'spinner.tsx',
  'pagination.tsx',
  'sidebar.tsx',
  'breadcrumb.tsx',
  'carousel.tsx'
]

// React comes from the UI package's own dependency tree, so the components and the renderer
// share one copy (two copies of React break hooks).
const requireFromUi = createRequire(join(ROOT, 'packages/core/tracy-core/package.json'))
// The scripts' tsconfig has no React types (gates run on Node), so the two functions this file
// calls are described here instead of imported.
type Element = { readonly type: unknown }
type CreateElement = (
  type: unknown,
  props?: Record<string, unknown> | null,
  ...children: unknown[]
) => Element
const React = requireFromUi('react') as { createElement: CreateElement }
const { renderToStaticMarkup } = requireFromUi('react-dom/server') as {
  renderToStaticMarkup: (element: Element) => string
}
const h = React.createElement
// The root tsconfig compiles JSX to `React.createElement`, and the controls import React as a
// namespace only where they use it; the renderer needs the name in scope for the others.
;(globalThis as { React?: unknown }).React = React

test('the controls hold no bare English a reader would meet', () => {
  for (const file of FILES) {
    const found = bareLiterals(file, readFileSync(join(UI, file), 'utf8'))
    assert.deepEqual(
      found.map((f) => `${f.kind}: ${f.text}`),
      [],
      `${file} writes English straight into the page`
    )
  }
})

test('no control defaults a label to an English word', () => {
  // `name = 'Word'` in a parameter list: the shape `text = 'Previous'` had.
  const defaultWord =
    /\b(?:text|label|title|closeLabel|resizeLabel|mobileTitle|mobileDescription)\s*=\s*['"`][A-Za-z]/
  for (const file of FILES) {
    const text = readFileSync(join(UI, file), 'utf8')
    const hits = text.split('\n').filter((line) => defaultWord.test(line) && !line.includes('<'))
    assert.deepEqual(hits, [], `${file} has an English default`)
  }
})

/** Render one element twice with two sets of words; nothing of the first set may survive. */
function rendersOnlyCallerWords(
  name: string,
  make: (words: Record<string, string>) => Element,
  keys: string[],
  english: string[]
) {
  const first = Object.fromEntries(keys.map((key) => [key, `Erste-${key}`]))
  const second = Object.fromEntries(keys.map((key) => [key, `Zweite-${key}`]))
  const a = renderToStaticMarkup(make(first))
  const b = renderToStaticMarkup(make(second))
  for (const key of keys) {
    assert.ok(a.includes(first[key]), `${name}: "${key}" is not in the markup: ${a}`)
    assert.ok(b.includes(second[key]), `${name}: "${key}" did not follow the second render: ${b}`)
    assert.ok(!b.includes(first[key]), `${name}: the first "${key}" survived a render with new words`)
  }
  for (const word of english) {
    assert.ok(!a.includes(word), `${name}: English "${word}" is still in the markup: ${a}`)
  }
  for (const attribute of [
    ' label=',
    ' closelabel=',
    ' closeLabel=',
    ' text=',
    ' resizelabel=',
    ' mobiletitle='
  ]) {
    assert.ok(!a.includes(attribute), `${name}: the prop leaked as a DOM attribute (${attribute.trim()})`)
  }
  return a
}

test('Spinner announces the caller’s word', async () => {
  const { Spinner } = await import('../../packages/ui/tracy-ui/src/components/ui/spinner.tsx')
  const html = rendersOnlyCallerWords(
    'Spinner',
    (w) => h(Spinner, { label: w.label }),
    ['label'],
    ['Loading']
  )
  assert.match(html, /role="status"/)
  assert.match(html, /aria-label="Erste-label"/)
})

test('Pagination shows and announces the caller’s words', async () => {
  const p = await import('../../packages/ui/tracy-ui/src/components/ui/pagination.tsx')
  const html = rendersOnlyCallerWords(
    'Pagination',
    (w) =>
      h(
        p.Pagination,
        { label: w.nav },
        h(
          p.PaginationContent,
          null,
          h(p.PaginationItem, null, h(p.PaginationPrevious, { href: '#', text: w.prev, label: w.prevName })),
          h(p.PaginationItem, null, h(p.PaginationEllipsis, { label: w.more })),
          h(p.PaginationItem, null, h(p.PaginationNext, { href: '#', text: w.next, label: w.nextName }))
        )
      ),
    ['nav', 'prev', 'prevName', 'more', 'next', 'nextName'],
    ['Previous', 'Next', 'Go to', 'More pages', 'aria-label="pagination"']
  )
  assert.match(html, /<nav[^>]*aria-label="Erste-nav"/)
  assert.match(html, /aria-label="Erste-prevName"/)
  assert.match(html, /aria-label="Erste-nextName"/)
})

test('an icon-only pager step still has its accessible name', async () => {
  const p = await import('../../packages/ui/tracy-ui/src/components/ui/pagination.tsx')
  const html = renderToStaticMarkup(
    h(p.PaginationPrevious, { href: '#', text: '', label: 'Vorherige Seite' })
  )
  assert.match(html, /aria-label="Vorherige Seite"/)
  assert.doesNotMatch(html, /Previous/)
})

test('a caller’s own aria-label still wins over the label', async () => {
  const p = await import('../../packages/ui/tracy-ui/src/components/ui/pagination.tsx')
  const html = renderToStaticMarkup(
    h(p.PaginationNext, {
      href: '#',
      text: 'Weiter',
      label: 'Zur nächsten Seite',
      'aria-label': 'Eigener Name'
    })
  )
  assert.match(html, /aria-label="Eigener Name"/)
  assert.doesNotMatch(html, /Zur nächsten Seite/)
})

test('DialogFooter’s Close button says the caller’s word, and is absent unless asked for', async () => {
  const d = await import('../../packages/ui/tracy-ui/src/components/ui/dialog.tsx')
  rendersOnlyCallerWords(
    'DialogFooter',
    (w) => h(d.Dialog, { open: true }, h(d.DialogFooter, { showCloseButton: true, closeLabel: w.close })),
    ['close'],
    ['Close']
  )
  const without = renderToStaticMarkup(h(d.Dialog, { open: true }, h(d.DialogFooter, null, 'x')))
  assert.doesNotMatch(without, /<button/)
})

test('SidebarTrigger and SidebarRail take their name from the caller', async () => {
  const s = await import('../../packages/ui/tracy-ui/src/components/ui/sidebar.tsx')
  const html = rendersOnlyCallerWords(
    'Sidebar',
    (w) =>
      h(
        s.SidebarProvider,
        null,
        h(s.SidebarTrigger, { label: w.trigger }),
        h(s.Sidebar, { mobileTitle: w.title, mobileDescription: w.hint }, h(s.SidebarRail, { label: w.rail }))
      ),
    ['trigger', 'rail'],
    ['Toggle Sidebar']
  )
  assert.match(html, /aria-label="Erste-rail"/)
  assert.match(html, /title="Erste-rail"/)
})

test('Breadcrumb and its ellipsis take their names from the caller', async () => {
  const b = await import('../../packages/ui/tracy-ui/src/components/ui/breadcrumb.tsx')
  const html = rendersOnlyCallerWords(
    'Breadcrumb',
    (w) => h(b.Breadcrumb, { label: w.nav }, h(b.BreadcrumbEllipsis, { label: w.more })),
    ['nav', 'more'],
    ['aria-label="breadcrumb"', '>More<']
  )
  assert.match(html, /<nav[^>]*aria-label="Erste-nav"/)
})

test('the compile-time fixture covers every control of this change', () => {
  const fixture = readFileSync(join(ROOT, 'packages/ui/tracy-ui/src/type-tests/required-labels.tsx'), 'utf8')
  const refused = fixture.slice(0, fixture.indexOf('export function LabelsAreAccepted'))
  for (const control of [
    'DialogContent',
    'DialogFooter',
    'SheetContent',
    'ToastClose',
    'Toaster',
    'Spinner',
    'Pagination',
    'PaginationPrevious',
    'PaginationNext',
    'PaginationEllipsis',
    'Sidebar',
    'SidebarTrigger',
    'SidebarRail',
    'Breadcrumb',
    'BreadcrumbEllipsis',
    'CarouselPrevious',
    'CarouselNext'
  ]) {
    assert.match(
      refused,
      new RegExp(`@ts-expect-error[^\\n]*\\n\\s*<${control}[ />]`),
      `${control} has no "missing label is an error" case`
    )
  }
  // The package's typecheck reads the fixture: it lives under `src`, which the tsconfig includes.
  const tsconfig = readFileSync(join(ROOT, 'packages/ui/tracy-ui/tsconfig.json'), 'utf8')
  assert.match(tsconfig, /"include":\s*\["src"\]/)
})
