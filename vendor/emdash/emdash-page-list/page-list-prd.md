---
title: "PRD: EmDash Page List"
status: draft
priority: P1
inspired_by: "Page-list"
plugin_id: "page-list"
package_name: "@emdash-cms/plugin-page-list"
execution_mode: "Trusted-first, sandbox-compatible target"
---

# PRD: EmDash Page List

## Product summary

EmDash Page List lets editors render dynamic lists of pages or other content collections without hardcoding those lists into templates. The greenfield version should avoid pretending EmDash has WordPress page-parent semantics everywhere. Instead, it should support two clean sources:

- **collection-backed lists** for flat or filtered content queries,
- **menu-backed lists** for hierarchical navigation trees.

This makes the plugin useful immediately while staying honest about current platform shape.

## Problem

Editors often need reusable lists of pages such as:

- documentation landing pages,
- related pages in a section,
- resource hubs,
- “start here” menus,
- curated navigation trees.

In WordPress, Page-list often leans on page hierarchy. In EmDash, hierarchy is better treated as either:

- a content query,
- a taxonomy grouping,
- or a menu structure.

The plugin should solve the actual product need without forcing a fake page tree model onto EmDash.

## Goals

1. Let editors create dynamic page lists inside content.
2. Support both flat lists and hierarchical menu-backed lists.
3. Keep the configuration simple enough for non-technical editors.
4. Avoid public routes and unnecessary runtime state.
5. Give theme developers a reusable renderer they can also place outside content.

## Non-goals

- Recreating WordPress parent-child page management
- Building a full navigation-editor replacement
- Complex faceted filtering in v1
- Arbitrary cross-collection relationship modeling
- Automatic sitewide sidebars

## Primary users

### Editors
They want to add lists of pages or resources without asking a developer.

### Site owners
They want section pages and resource hubs to stay current automatically.

### Theme developers
They want a reliable, reusable list component they can render inside templates.

## Key user stories

1. As an editor, I can insert a list of pages from a collection into a page.
2. As an editor, I can render a nested list from an existing menu when hierarchy matters.
3. As an admin, I can choose default list style and sort behavior.
4. As a reader, I can see a clear list of related pages with optional descriptions.
5. As a theme developer, I can import the same list renderer for use in layouts.

## MVP scope

### In scope

- `pageList` Portable Text block
- theme-imported list component
- collection-backed list mode
- menu-backed hierarchical list mode
- per-block options:
  - source type,
  - collection or menu name,
  - limit,
  - sort order,
  - show excerpt,
  - show publish date,
  - heading text,
  - empty-state text

### Out of scope

- taxonomy-driven faceted filtering
- drag-and-drop curation inside the plugin
- personalized lists
- content recommendation logic
- a custom admin page for content picking in v1

## Functional requirements

### Collection-backed mode

Editors must be able to configure:

- collection slug
- limit
- sort field and direction
- include/exclude drafts in preview behavior
- optional display of excerpt and date
- list style (`bulleted`, `card`, `compact`)

### Menu-backed mode

Editors must be able to point the block at an existing menu and render:

- nested hierarchy
- custom labels already stored in the menu
- optional child depth limit

This mode is the v1 answer for hierarchical page navigation.

### Frontend behavior

- The component must render a semantic list.
- Empty-state text must be configurable.
- The renderer must degrade gracefully if the collection or menu does not exist.

## UX and integration model

The block should open with a simple source chooser:

- Collection
- Menu

That keeps the product legible for editors and avoids a maze of configuration fields. Advanced controls can be shown progressively after the source type is chosen.

## Technical approach for EmDash

### Plugin surfaces

- `admin.settingsSchema`
- `admin.portableTextBlocks`
- `componentsEntry`
- optional direct component export for themes

### Capabilities

None required for the plugin runtime itself in the MVP.

The renderer can query EmDash content or menu data from the site-side component layer instead of using plugin routes.

### Storage

No storage in v1.

### Routes

No plugin routes in v1.

### Settings

- `settings:defaultSourceType`
- `settings:defaultListStyle`
- `settings:defaultLimit`
- `settings:showExcerptByDefault`
- `settings:showDateByDefault`

### Block contract

Suggested fields:

- `sourceType`
- `collection`
- `menuName`
- `limit`
- `sortField`
- `sortDirection`
- `showExcerpt`
- `showDate`
- `heading`
- `emptyState`
- `style`

## Success metrics

- Editors can create collection-backed lists without template changes.
- Hierarchical navigation can be rendered from menus without custom code.
- Teams use this for at least one hub page and one navigational page.
- No plugin storage or routes are required for the first release.

## Risks and mitigations

### Risk: users expect WordPress page-parent parity
Mitigation: document menu-backed hierarchy as the preferred EmDash pattern.

### Risk: block configuration needs content pickers
Mitigation: start with collection and menu names, then add richer picker UX later if demand justifies it.

### Risk: inconsistent metadata availability across collections
Mitigation: keep excerpt/date optional and tolerant of missing fields.

## Milestones

1. Define block schema and source modes.
2. Build collection-backed renderer.
3. Build menu-backed renderer.
4. Add admin settings and docs.
5. Validate with a resource hub and docs landing page example.

## Acceptance criteria

- Editors can insert a `pageList` block.
- The block supports collection-backed and menu-backed modes.
- The renderer handles empty states gracefully.
- The plugin launches without storage, routes, or required capabilities.

## Open questions

1. Should taxonomy-backed grouping become a v1.1 feature or a separate plugin?
2. Do we want a “children of current page” concept later, and if so, what would it mean in EmDash?
3. Should the theme import path expose a generic `ContentList` component beyond this plugin?
