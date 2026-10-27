# Content and owner decisions

Read ../AGENTS.md. Missing PDFs, URLs, legal text or business facts remain explicit
gaps; do not fabricate replacements. Distribution price is distinct from license terms.
Keep seed changes separate from targeted edits to an installed customer's site.

## Provenance

| Material | Origin | Status |
| --- | --- | --- |
| Design (layout, colours, type scale) | JA Kinetic Joomla 6 quickstart 1.0.0 by JoomlArt | Re-implemented from measurements of the rendered site; no PHP, CSS, JS or SVG copied |
| Demo text, menus, sections, 240 posts | the quickstart database | Imported through the neutral site model (`seed/site-model.json`) |
| Images (post covers, people photos, hero/query panel images, bento chart) | the quickstart `images/` folder | Copied into `seed/media/`; GPL-2.0-or-later (JoomlArt grant, 26/10/2026) |
| Fonts | Space Grotesk, IBM Plex Sans, JetBrains Mono (Google Fonts) | SIL Open Font License |
| Icons | lucide (`lucide-react`) | ISC licence |

## Licence

The template files of the source used to carry two conflicting licence statements: the section layouts
said "Copyrighted Commercial Software … may not be redistributed", while its `templateDetails.xml` declared
GNU/GPLv3. JoomlArt, the copyright holder, released the design, the demo content, the quickstart images and
this port under GPL-2.0-or-later on 26/10/2026. `package.json` says `GPL-2.0-or-later` and `LICENSE` holds
the text.

## Owner decisions still open

- Account pages: the source's login, registration, profile and password pages are not built (EmDash has
  no public accounts); buttons that pointed at them link to `#`.
- RSS link in the footer brand block points at the Joomla feed URL, which this site does not serve.
- The newsletter confirmation text uses the Forms plugin default.
- Authors are names on posts; there are no author profiles (bio, photo) beyond the team section.

## Language

English only. Words on screen come from the CMS; short UI labels of the blog chrome (pagination, counts)
and the 404 page are template text in the views.
