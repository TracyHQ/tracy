# Content model: where every kind of text lives

DOCS_REQUIRED: List this site's navigation slugs, synced pattern slugs (or state that the seed
created none), the options the theme reads, the post types and taxonomies in use, the section
patterns and the pages that use each custom template.

Read ../AGENTS.md and generated/inventory.md. The counts there are the seed's, not the live
site's; find current ids by slug with `wp post list`.

| Text | Lives in | Find it | Edit it |
| --- | --- | --- | --- |
| A page or post body, including its sections | `post_content` of the page/post, block markup | `wp post list --post_type=page --fields=ID,post_name,url` | the editor, or `wp post update <id> --post_content=@file` |
| A block shared by many pages (contact details, a notice) | a **synced pattern**: `wp_block` post, referenced as `<!-- wp:block {"ref":<id>} /-->` | `wp post list --post_type=wp_block --fields=ID,post_name,post_title` | edit the `wp_block` post once; every reference follows |
| A menu | a `wp_navigation` post; the header/footer navigation block carries its id in `ref` | `wp post list --post_type=wp_navigation --fields=ID,post_name,post_title` | Site Editor > Navigation, or update the post's block markup (`core/navigation-link`, `core/navigation-submenu`) |
| Header and footer | `parts/header.html`, `parts/footer.html` — or the `wp_template_part` rows that shadow them | `wp post list --post_type=wp_template_part --fields=ID,post_name` | Site Editor > Patterns > Template parts; a row exists when a seeder filled the navigation refs |
| Site name, tagline, logo, front page | options `blogname`, `blogdescription`, `site_logo` (the attachment id), `show_on_front`, `page_on_front` | `wp option get blogname` | `wp option update …`, or Settings > General / Reading |
| Contact form | the form plugin's own post type, placed in the page by shortcode or block | `wp post list --post_type=<plugin type>` | the plugin's screen |
| Redirects from retired URLs | a theme option holding JSON rules `[{from,to,status}]` | `wp option get <option> --format=json` | `wp option update <option> --format=json < rules.json` |
| Labels inside a pattern that are not content (button captions in a template part, "Search") | the pattern PHP or part HTML in the theme | grep the theme | not on the site — that is a theme change, rebuilt and updated |

## Sections: the pattern convention

A section is a theme pattern under `patterns/`, slug `<theme>/section-<name>`, category the
theme's own. Inserting it into a page copies its markup into `post_content`; the page then owns
those blocks. Every editable block in a section carries

```
metadata: {"role":"content","name":"<type>.<field>[.<n>]"}
```

`<type>` is the section type, `<field>` the field, `<n>` the 1-based index inside a repeated
group; a repeated item's wrapper carries `{"name":"<type>.item.<n>"}` with no role — clone or
delete the wrapper to change the item count, its children keep the same names with the new
index. Locate a block by its `metadata.name`, never by position: names survive re-ordering,
inserted paragraphs and a rebuild of the theme. Blocks without `role: content` are the frame
(groups, columns, spacers) and are meant to stay.

To add a section to a page: in the editor, Patterns > `<theme category>` > insert, then fill
the content blocks; or by command, take the pattern's markup (`wp eval` with
`WP_Block_Patterns_Registry::get_instance()->get_registered('<slug>')['content']`) and splice it
into `post_content`. A new section **type** is a theme change (a new `patterns/section-*.php`),
not a site edit.

## Posts and archives

Posts use the core `post` type with `category` and `post_tag`; archives (`category`, `tag`,
`date`, `author`, `search`) render from the theme's templates with Query Loop blocks, so a new
post appears in them without an edit. The blog index is `page_for_posts` when set, otherwise
`templates/home.html` at the root.
