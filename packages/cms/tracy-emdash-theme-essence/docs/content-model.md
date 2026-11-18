# Content ownership

The seed (`seed/seed.json`, built from `seed/site-model.json` by `ingest/rebuild-seed.sh`) has eight collections, two menus and two taxonomies.

| Collection | Holds | Used by |
|---|---|---|
| `chrome` (single) | brand name, header button, footer logo and words, copyright pattern, newsletter box words, sidebar and article labels | Header, Footer, sidebar, article, lists |
| `pages` | one entry per ported page (`home`, `our-authors`, `contact`) | router, page views |
| `posts` | the 51 articles: title, excerpt, body (portable text), date, `cover` (list picture), `hero` (article picture), `author`, `hits`, `featured` + `featured_order` (Home list), `home_lead` (Home top strip), `highlight` (the article the source lists as a picture card with the text over it), `kind` (`standard` / `video` / `gallery`), `layout` (`default` / `type-1` / `type-2`), `video_source` + `video_id`, `gallery` (pictures); taxonomies `category` and `tag` | blog lists, article, Home, sidebar |
| `authors` | name, avatar, job title, bio | byline, Authors page, "Author's latest articles" |
| `category_info` | one entry per category page (slug = category term): title, description, picture, `list_style` (`grid` / `stack` / `sidebar`) | category pages |
| `contact` (single, slug `contact-layout`) | the words of the contact page and its form, `form_id` | Contact |
| `gallery` | the picture strip above the footer (`items`: image, alt) and its button | all pages |
| `social` | social buttons (`social` in the header of Home, `follow-me` in the sidebar) | header, sidebar |

Menu `primary` is the header menu (Home, Categories > Health, Design, Fashion, Resources, Lifestyle, Authors (`/our-authors`), Contact); menu `footer` repeats the five categories. A new page = a `pages` entry plus a menu item; a new section on a page needs the view to print it (page composition is code, DECISIONS D5). The sidebar blocks (latest, features, tags cloud, trending) are computed from `posts`, not stored.

Read ../AGENTS.md and generated/inventory.md. The generated schema and counts describe
seed only; discover current IDs and edited content from the installed CMS. Keep
business copy editable in CMS rather than copying complete pages into HTML blobs.
