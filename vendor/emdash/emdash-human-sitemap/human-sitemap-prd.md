---
title: "PRD: EmDash Human Sitemap"
status: draft
priority: P1
inspired_by: "WP Sitemap Page"
plugin_id: "human-sitemap"
package_name: "@emdash-cms/plugin-human-sitemap"
execution_mode: "Trusted-first, sandbox-compatible target"
---

# PRD: EmDash Human Sitemap

## Product summary

EmDash Human Sitemap provides a reader-facing sitemap page that helps people browse the site by section, collection, taxonomy, and optionally menu group. This is not an XML sitemap product. It is a human-readable discovery surface designed for content-heavy sites.

The MVP should be a content block and reusable page component that editors can place on a normal page such as `/sitemap`.

## Problem

Large sites become hard to browse through navigation alone. Visitors, especially on editorial, docs, and knowledge-base sites, benefit from a page that lists major content groupings in one place.

WordPress sitemap-page plugins typically create a shortcode that renders a page tree. In EmDash, the cleanest product is:

- an explicit “human sitemap” block,
- site-side queries for collections, menus, and terms,
- admin settings that define what appears on the sitemap.

## Goals

1. Give teams an easy way to publish a human-readable sitemap page.
2. Support multiple data sources without creating public routes.
3. Let admins choose which sections of the site appear.
4. Keep the first release simple and editorially useful.
5. Make it easy to pair with accessibility and information-architecture efforts.

## Non-goals

- XML sitemap generation
- Search-engine submission or pinging
- Redirect management
- Crawl reports
- Sitewide navigation replacement

## Primary users

### Editors
They want to publish a sitemap page without hand-maintaining a giant list of links.

### Site owners
They want a better fallback discovery path for large sites.

### Readers
They want one page that helps them understand the shape of the site.

## Key user stories

1. As an editor, I can add a sitemap block to a normal page.
2. As an admin, I can choose which collections and menus appear.
3. As a reader, I can browse the site by section and category.
4. As a content team, I can trust the page to stay current when new content is published.
5. As a theme developer, I can render the sitemap in a custom layout if desired.

## MVP scope

### In scope

- `humanSitemap` Portable Text block
- theme-imported sitemap component
- configurable inclusion of:
  - collections,
  - menus,
  - taxonomies,
  - section headings
- optional post counts
- optional descriptions for taxonomy groups
- configurable max items per section with “view all” style link support handled by theme or content

### Out of scope

- XML sitemap endpoint
- crawl prioritization
- search UI
- analytics overlays
- custom public pages registered directly by the plugin runtime

## Functional requirements

### Admin configuration

Settings must include:

- included collections
- included menus
- include taxonomies yes/no
- show counts yes/no
- max items per section
- alphabetical vs date sort
- section heading labels

### Editor experience

The block must allow per-page override of:

- title
- which sections are visible
- whether counts are shown
- compact vs expanded layout

### Frontend behavior

- Render semantic headings and link lists.
- Hide empty groups where configured.
- Support large sites by limiting oversized sections in v1.

## UX and integration model

The primary integration path is simple:

1. admin enables the plugin and picks defaults,
2. editor creates a page called “Sitemap,”
3. editor inserts the `humanSitemap` block.

Theme developers can also import the component directly for custom layouts.

## Technical approach for EmDash

### Plugin surfaces

- `admin.settingsSchema`
- `admin.portableTextBlocks`
- `componentsEntry`

### Capabilities

None required in the plugin runtime for MVP.

### Storage

No storage in v1.

### Routes

No plugin routes in v1.

### Data model

KV settings only:

- `settings:includedCollections`
- `settings:includedMenus`
- `settings:includeTaxonomies`
- `settings:showCounts`
- `settings:maxItemsPerSection`
- `settings:defaultSort`

### Component responsibilities

The component should aggregate site data into sections such as:

- Pages
- Posts or Articles
- Primary navigation
- Categories
- Tags or topic terms

This should remain configurable rather than hardcoded.

## Success metrics

- A site can publish a human-readable sitemap page with no custom template logic.
- The sitemap updates automatically as content changes.
- The product remains route-free and storage-free in v1.
- The page is usable for both editorial and documentation-style sites.

## Risks and mitigations

### Risk: users confuse this with SEO XML sitemap behavior
Mitigation: name the product “Human Sitemap” in UX and docs.

### Risk: very large sites create giant pages
Mitigation: support section limits and compact rendering.

### Risk: different sites want different grouping logic
Mitigation: keep the section model configurable and avoid opinionated defaults that cannot be changed.

## Milestones

1. Define settings and block contract.
2. Build collection and menu section renderers.
3. Add taxonomy sections and count options.
4. QA against large and small site structures.
5. Publish docs with recommended `/sitemap` page recipe.

## Acceptance criteria

- Editors can insert a `humanSitemap` block into a page.
- Admins can choose which sections appear by default.
- The renderer can show collections, menus, and taxonomies.
- The plugin launches with no routes, storage, or required capabilities.

## Open questions

1. Should section-level descriptions come from collection metadata, plugin settings, or both?
2. Do we need collapsible sections in the first release for very large sites?
3. Should there be a separate XML sitemap plugin later instead of extending this one?
