import { useEffect, useState } from 'react'

import { definePreview } from '@storybook/react-vite'
import { DirectionProvider, TooltipProvider } from '@tracy/ui'

import { ShellProvider } from '../src/app/app-context'

// The bench's root CSS, the same file `src/main.tsx` loads.
//
// This is the most important line in the file, and the one `storybook init` does NOT add. Without
// it every component still renders — just bare, no Tailwind, no tokens — and with no error at all.
import '../src/style.css'

/**
 * Banner copy per label.
 *
 * See `story-kind.mjs` for how a label is derived. This file only DRAWS; it decides nothing, so
 * the rule stays in one place — the same place the CI gate runs.
 */
const BANNERS: Record<string, { text: string; fg: string; bg: string; border: string }> = {
  'real-screen': {
    text: 'REAL SCREEN · this ships to customers; edits here reach them',
    fg: '#0b5c2e',
    bg: '#d8f3e3',
    border: '1px solid #6fc79a'
  },
  'not-in-product': {
    text: 'NOT IN PRODUCT · a proposal; it still has to be ported before customers see it',
    fg: '#7a4a05',
    bg: '#fdf0d5',
    border: '1px dashed #e0a83c'
  },
  'building-block': {
    text: 'BUILDING BLOCK · one component, not a screen',
    fg: '#3f4756',
    bg: '#eceef2',
    border: '1px solid #c3c8d2'
  }
}

/**
 * A strip that tells the reviewer WHAT THEY ARE LOOKING AT.
 *
 * WHY IT SITS IN THE VIEWING FRAME rather than only as a branch on the tree: a branch name is
 * read while searching, and a reviewer who opens a screen forgets which branch they came from.
 * Measured 2026-09-03: the 15 stories under `Screens/App` look exactly like real screens, while
 * their import graph touches no product code at all — a folder-shaped label cannot catch that.
 */
/**
 * Read the label from the INDEX, not from `context.tags`.
 *
 * ⚠ Measured 2026-09-03: tags added by `experimental_indexers` DO land in `/index.json`
 * (35 · 57 · 282, the right counts) but never reach `context.tags` at runtime — Storybook only
 * merges tags declared in a story's own meta. A DOM dump confirmed it: not one character of the
 * banner rendered.
 *
 * So the preview asks the index itself. It is same-origin with the iframe, and one fetch serves
 * every story because the `Promise` is remembered at module scope.
 */
let indexPromise: Promise<Record<string, { tags?: string[] }>> | null = null
function storyIndex() {
  indexPromise ??= fetch('./index.json')
    .then((r) => r.json())
    .then((j) => j.entries ?? {})
    .catch(() => ({}))
  return indexPromise
}

function KindBanner({ id }: { id: string }) {
  const [tags, setTags] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    storyIndex().then((entries) => {
      if (alive) setTags(entries[id]?.tags ?? [])
    })
    return () => {
      alive = false
    }
  }, [id])
  const tag = tags.find((t) => t.startsWith('kind-'))
  const banner = tag ? BANNERS[tag.slice('kind-'.length)] : undefined
  if (!banner) return null
  return (
    <div
      style={{
        font: '600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
        letterSpacing: '.04em',
        padding: '6px 12px',
        color: banner.fg,
        background: banner.bg,
        borderBottom: banner.border
      }}
    >
      {banner.text}
    </div>
  )
}

export default definePreview({
  /**
   * Auto-generated docs pages for EVERY story.
   *
   * 🔒 DECLARED HERE, NOT AS `docs: { autodocs: true }` IN `main.ts`. That key was removed; putting
   * it in the config still boots fine and **generates no docs pages** — measured 03/09:
   * `/index.json` returned 247 stories, 0 `type: 'docs'` entries, not one warning.
   *
   * Set here rather than `tags: ['autodocs']` per file: 62 components are 62 places to forget.
   */
  tags: ['autodocs'],

  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // Tokens decide the background, not an addon: `ShellProvider` sets class `dark` on <html> and
    // `style.css` paints the background from it. Enabling the backgrounds addon means two painters.
    backgrounds: { disable: true },

    /**
     * Viewport — the "Check responsiveness with Viewports" section of Storybook's Guide.
     *
     * Three breakpoints, and they are NOT Storybook's defaults (`mobile1` 320px…). They are this
     * product's real ones:
     *
     *   - 768px is `MOBILE_BREAKPOINT` in `@tracy/ui`'s `src/hooks/use-mobile.ts`. Below it
     *     `Sidebar` changes shape entirely — it renders as a `Sheet` instead of shrinking. It is
     *     the only breakpoint in the library that changes the DOM TREE, so it must be one click
     *     away.
     *   - 1280px is the width the bench builds its 31 views at.
     *   - 1440px is the Electron shell's default desktop window.
     */
    viewport: {
      options: {
        mobile: { name: 'Mobile — under the 768 breakpoint', styles: { width: '390px', height: '844px' } },
        bench: { name: 'Bench — 1280', styles: { width: '1280px', height: '900px' } },
        desktop: { name: 'Desktop — 1440', styles: { width: '1440px', height: '900px' } }
      }
    }
  },

  globalTypes: {
    theme: {
      description: 'Light / dark',
      defaultValue: 'light',
      toolbar: { title: 'Theme', icon: 'circlehollow', items: ['light', 'dark'], dynamicTitle: true }
    },

    /**
     * LTR / RTL switch.
     *
     * Not to serve any market — it is here because `base-nova` builds writing direction into its
     * components: `cn-rtl-flip` on the arrows of `Pagination`/`Breadcrumb`/`Sidebar`, and the
     * `DirectionProvider` that base-ui's `Menu`, `Select`, `Slider` read to know which way to open.
     * Without the switch that is code nobody has ever seen run.
     */
    direction: {
      description: 'Writing direction',
      defaultValue: 'ltr',
      toolbar: { title: 'Dir', icon: 'transfer', items: ['ltr', 'rtl'], dynamicTitle: true }
    }
  },

  // 🔒 THE THEME MUST BE SEEDED THROUGH `localStorage`, AND BEFORE THE STORY RENDERS.
  //
  // `ShellProvider` reads `cwkit-dark` in `useState(() => …)` — ONCE, at mount — and from then on
  // owns class `dark` and `data-theme` on <html> through an effect. Setting the class from outside
  // means two writers on one spot and the later one wins: the toolbar switch loses silently.
  // Seeding first and letting the provider set it leaves a single writer.
  beforeEach(context) {
    localStorage.setItem('cwkit-dark', context.globals.theme === 'dark' ? '1' : '0')
    // `dir` must be on <html>: `[dir='rtl'] .cn-rtl-flip` in `tokens.css` is an ancestor
    // selector, and `DirectionProvider` below only informs base-ui's JS; it sets no attribute.
    document.documentElement.dir = context.globals.direction === 'rtl' ? 'rtl' : 'ltr'
  },

  decorators: [
    /**
     * The same provider stack as `src/main.tsx`, minus `BrowserRouter` — a story that needs a
     * router wraps its own, since most views do not and a spare router hides real navigation bugs.
     *
     * `key` forces the provider to REMOUNT on a theme change: it reads `localStorage` only at
     * init, so without a remount the seed in `beforeEach` does nothing.
     *
     * ⚠ `h-screen` ONLY for `layout: 'fullscreen'` stories. It dates from when there were only page
     * stories, all declaring `fullscreen`. Since the 62 `@tracy/ui` components got stories too it
     * became a trap: a `Badge` stuffed into a screen-high frame sticks to the top edge of a vast
     * empty area, and the docs page generated from it is unreadable.
     */
    (Story, context) => {
      const fullscreen = context.parameters.layout === 'fullscreen'
      return (
        <DirectionProvider direction={context.globals.direction === 'rtl' ? 'rtl' : 'ltr'}>
          <TooltipProvider>
            <ShellProvider key={`${context.globals.theme}-${context.globals.direction}`}>
              <KindBanner id={context.id} />
              <div className={fullscreen ? 'h-screen' : ''}>
                <Story />
              </div>
            </ShellProvider>
          </TooltipProvider>
        </DirectionProvider>
      )
    }
  ]
})
