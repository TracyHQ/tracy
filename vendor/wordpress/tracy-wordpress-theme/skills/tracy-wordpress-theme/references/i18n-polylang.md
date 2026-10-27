# Two-language site — Polylang free, seeder `--i18n polylang`

> **Packet Phase 7b (i18n).** Read when `page-map.json` has more than one entry in `locales`. Precondition: Phase 7
> has run once in the default mode (`--i18n none`) or not at all; Polylang has been `plugin install
> polylang --activate`d on the stand (the seeder does **not** install plugins — missing means `PLL()` undefined, a clear error).
> Original decision: `tasks/wp-tracy-business/DECISIONS.md` D11. Measured on Polylang 3.8.9, WP 7.1, 14/09/2026.

## 1. Free versus Pro — what can and cannot be done

| | Free 3.8.9 | Pro |
|---|---|---|
| One post/term one language, one translation group (`pll_set_post_language`, `pll_save_post_translations`) | yes | yes |
| Two languages with **the same slug** (`/about/` and `/ru/about/`) | **no** — "share slugs" is Pro; free only shows a preview button | yes |
| Language for `wp_navigation` (block menus) | **no** — the theme swaps the `ref` itself (§3) | yes |
| Block `polylang/language-switcher` in a template part | yes | yes |
| Front page and posts page mapped per language (`page_on_front`, `page_for_posts`) | yes | yes |
| String translation (`blogname`, `blogdescription`) | **no** — one string for the whole site | yes |

Consequence of free: an RU page **cannot** be `/ru/about/` if EN is already `/about/`. The RU slug is a different slug, and
the seeder takes it from the **title** (§2).

## 2. URL and slug rules

- Option `polylang`: `force_lang=1` (the language is a `/ru/` directory), `hide_default=true` (default at
  `/`), `browser=false` and `redirect_lang=false` (no page switching by browser — parity measured with
  `curl` would drift if they were on). The seeder writes these four keys through `PLL()->options->set` + `save_all()`, only when different.
- Languages: each code in `page-map.locales` is one language (`en`→`en_US`, `ru`→`ru_RU`, `vi`, `de_DE`,
  `fr_FR`, `es_ES`; an unknown code → `<code>_<CODE>`), created through `PLL()->model->languages->add()`, default =
  `defaultLocale` (`languages->update_default`). An existing one is not recreated (`report.i18n.created`).
- Secondary-locale pages are **top-level** (no longer under a `/ru` parent); slug = `wpPostName(page-map slug)`, but
  if the default locale already holds that slug at the same level (`about`), slug = `wpPostName(title)` — Cyrillic
  percent-encoded, exactly as `sanitize_title` truncates at 200 **encoded** characters (gotcha 25). Note:
  `slug taken by the default-locale page; slug from the title`. The locale home page (`/ru`) keeps the slug `ru`;
  its real URL is `/ru/` because it is the translation of `page_on_front`.
- A site previously seeded in `none` mode: the subtree under `/ru` is **moved in place** (ids kept) — the seeder
  finds the old page by slug + old parent and only touches pages carrying its `_tracy_seed`. Note `page <id> moved
  from under /ru …`. Nothing is deleted. **One-way**: rerunning `none` on a site seeded with `polylang`, the seeder
  does not see the top-level RU pages and recreates the whole subtree under `/ru` — pick a mode once per stand.
- Posts: language from `post.locale`; translations paired by `translationOf` if the spec has it, otherwise **by
  order** within the same category (5 EN ↔ 5 RU) — note `posts paired by order; the spec carries no
  translationOf`. Categories: each secondary locale gets a term `<slug>-<locale>` (`news-ru`), same name because the spec
  has no translated names; RU posts go into the RU term; the two terms are paired with `pll_save_term_translations`.
- A `view: single` page (article template: `/article`, `/ru/article`) → 301 to **the first post of the same
  locale**, at its real URL (`/ru/<slug>/`) — a rule added to the theme's redirect option, in every `--i18n` mode.

⚠ **Polylang's language cache holds `page_on_front`/`page_for_posts` per language**, computed when
the language is created — before any translation exists. Without clearing it, `/ru/<news-ru>/` renders as a normal page (no
`blog`, no RU title) and the switcher on `/ru/` carries the class `no-translation`, **with no error at all**.
The seeder calls `PLL()->model->clean_languages_cache()` at the end of the pairing pass (measured 14/09: right immediately after clearing).

## 3. What the theme must have (wp-tracy-business has it)

- `parts/header.html`: block `polylang/language-switcher` (without the plugin the block does not render, no error).
- Filter `render_block_data`: a `core/navigation` block named `nav.<menutype>` has its `ref` swapped to the
  `wp_navigation` post with slug `<menutype>-<lang>` when `pll_current_language()` ≠ default
  (`inc/extra.php`, `wp_tracy_business_localize_navigation`). The seeder just creates the menus `tracy-ru`,
  `footer-company-ru`… from `menus.json`; links in the RU menu point by **page id**, so the real URL follows.
- Template `home.html`: `home.title`/`home.lead` read from the posts page — Polylang maps `page_for_posts`
  per language, so `/ru/<news-ru>/` carries the RU title (D10).

## 4. What the seeder does, in order (`seed.mjs`, `--i18n polylang`)

0b languages → 1 categories (+ twin) → 5 posts (term by locale) → 6 pages (top-level, slug) →
6b `pllLink` **one** `wp eval`: language of every page/post/term + translation groups, read-first (run 2:
`linked = {lang:0, groups:0, termLang:0, termGroups:0}`) → read permalinks (now with `/ru/`) →
7 menus → 10 redirects (+ single) → 11 routes: secondary-locale pages measured at their real URL, `pagemapPath` keeps the
page-map path alongside; the `404` page measured at the page-map path, expect 404.

Default mode `none`: not a single `pll_*` command, RU remains a subtree — Tracy Base does not change by one byte.

## 5. Check

```
curl -s http://127.0.0.1:8237/ru/ | grep -o '<html[^>]*lang="[^"]*"'          # lang="ru-RU"
curl -s http://127.0.0.1:8237/ru/ | grep -o 'hreflang="[^"]*"' | sort -u        # en-US, ru-RU
curl -s http://127.0.0.1:8237/ru/ | grep -c 'tracy-topbar__switcher'            # switcher present
curl -s http://127.0.0.1:8237/ru/<slug-news-ru>/ | grep -o '<h1[^>]*>[^<]*'    # RU title (D10)
```

Report: `i18n.languages`, `i18n.created`, `i18n.linked`; `routes[]` with `pagemapPath` for RU;
run 2 must be `+0 ~0` with `linked` all 0. RU parity runs on `routes[].path` (the real URL), not on
`page-map.path`.
