# Content ownership

The seed (`seed/seed.json`, built from `seed/site-model.json` by `ingest/rebuild-seed.sh`) has ten collections, one menu and one taxonomy.

| Collection | Holds | Used by |
|---|---|---|
| `chrome` (single) | brand name, footer columns (location, hours, contact), newsletter-band words, `logo_dark` | Header, Footer, newsletter band |
| `pages` | one entry per ported page (`front-page`, `about-us`, `offers`, `reservation`, `contact-us`) | router, `Page.astro` |
| `posts` | the 22 articles: title, excerpt, body (portable text), date, cover; taxonomy `category` | blog list, post, home news row |
| `slideshow` | hero slides (`items`: image, title, text, two buttons) | Home |
| `features_intro` | intro blocks: `meet-three-broomsticks`, `gallery` (carousel items), `meet-our-chef`, `features-style-4/5` | Home, About |
| `container_tabs` + `menu` | the dish menu: the tab container and three lists (`main-dishes`, `soft-drinks`, `dessert`) with `items` (name, description, price) | Home |
| `happyhours` | three promotion bands | Offers |
| `teams` | the chefs | About |
| `modules` | the sidebar banner | blog sidebar |

Menu `primary` is the header menu (Home, About Us, Reservation, Offers, Our Blog, Contact Us). A new page = a `pages` entry plus a menu item; a new section on a page needs the view to print it (page composition is code, DECISIONS D5).

Read ../AGENTS.md and generated/inventory.md. The generated schema and counts describe
seed only; discover current IDs and edited content from the installed CMS. Keep
business copy editable in CMS rather than copying complete pages into HTML blobs.
