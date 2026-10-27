# Content map and ownership

Read ../AGENTS.md. seed/seed.json defines the baseline schema and entries;
template.config.json defines import ordering, locales and form bindings. Installed
IDs and current values must be discovered from the target CMS, not copied here.

| Collection | Purpose |
| --- | --- |
| site | Localized site chrome, footer and contact settings |
| home | Home page content |
| about | About page content |
| services_page | Services landing page |
| services | Individual services |
| projects_page | Projects landing page |
| projects | Individual projects |
| news_page | News landing page and newsletter binding |
| posts | News articles |
| careers | Careers page |
| vacancies | Open positions |
| investors | Investor page content |
| contact | Contact page and real form binding |
| pages | Other pages, including marketing-kit and legal content |

Singleton-style collections have locale-specific entries; do not collapse their
per-locale variants into one untranslated value. The supplied baseline has 14 collections
and 100 entries; these are not quotas or assertions about a customer's live site.

Menus include primary, topbar, resources_kit, footer_services, footer_company and
footer_legal. Read their localized installed values before changing navigation.
Posts use category/tag taxonomies, projects use sector and vacancies department.

## Where to make changes

- Text, footer attribution, links and repeatable business rows: CMS entry fields.
- Header/footer presentation: src/components/site/ and chrome helpers.
- Page family layout: src/views/; shared document shell: src/layouts/Base.astro.
- A new CMS-backed route: model and entry, catch-all dispatch, view, navigation and
  SEO/language behavior together. Do not just add a static HTML copy.
- Form definitions and bindings: tools/forms.json and template.config.json, then
  supported plugin APIs. Do not hardcode another installation's form ID.

Media mappings connect seed assets to CMS media. Published rendering uses CMS
references. A filename match is not proof of identical bytes. Keep hash-based reuse.
Do not regenerate a customer's edited content from the original HTML source.
