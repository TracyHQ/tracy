// Starlight's content collection: every page under `src/content/docs/`, validated against the
// Starlight frontmatter schema (`title` required, `description` optional — every page here sets both).
// The translated trees (`vi/`, `zh-cn/`, …) are part of the same collection; their `_sidebar.json`
// starts with `_`, which the loader ignores, so it is read by `astro.config.mjs` alone.
//
// No `i18n` collection on purpose: it would hold OVERRIDES of Starlight's own UI strings, and the six
// languages shipped all have complete built-in translations. Starlight still logs one
// `The collection "i18n" does not exist or is empty` warning per build — expected, not a defect.
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'
import { defineCollection } from 'astro:content'

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() })
}
