#!/usr/bin/env python3
"""What Tracy changed on an imported site's copy, as writes the live site's Claude Cowork engine can
take ("Sync to live" phase 1, plan tasks/ke-hoach-sync-to-live.md; job contract
webroot/LIVE-PUSH-CONTRACT.md).

    base    the live site as the last Sync from live read it: `sync/live-base.sql.gz`, loaded raw into a
            scratch schema, and `refs/tracy/live` — the live site's own numbers and address
    copy    the copy's database and its sealed webroot (HEAD), in the copy's numbers and address

The changeset is copy − base, record by record, for the kinds the engine writes (`KINDS`): each item says
what to write in the live site's terms (its ids, its address) and what the live site must still hold
for the write to go ahead (`expect`, the base's values: a compare-and-set the writer checks with
`content.get`). A record the copy numbered again in a sync (`sync/id-map.json`, `{table: {live: copy}}`)
is found under its live number (an entry filed under the wrong live number is put right first:
`Changeset.repair_map`); a record only the copy has is a `create` — never one the map names, which is the
live site's own — and whatever points at it carries a placeholder (`{"$new": "<entity>:<copy id>"}`, or `@@tracy-new:<entity>:<copy id>@@` inside
text) that the writer fills with the number the live site gave it. What Tracy changed that the engine
cannot write — files outside the engine's file doors, settings without a door, tables of extensions,
fields outside the writer's own lists — is named under `unsupported`, never written, with the reason.

Phase 2 (files and settings): a file under the folders `media.upload` writes (Joomla `images/` and
`media/`, WordPress `wp-content/uploads/` for a picture the Media Library already has) goes as a file
item checked by its bytes (`baseBlob`: the live file must still be the base's); a PHP file among them
only after a lint and its own confirmation (`group: php`). Settings go through their semantic doors:
Joomla's site name and description (`site.identity`), a template style's params (`content.update`
`templateStyle`), a T4 site profile or the favicon file (`template.siteSettings`); WordPress's options,
its active theme's mods (the whole option, compared whole) and its Additional CSS (the `custom_css`
post). Every other file and setting stays named, with why.

Template files: when the live engine has the template door (`info.template_files`, read by
`live-write.mjs info` with its roots from `template.files.status`, handed in as `--engine`), a file of a
template or theme the live site runs (Joomla `templates/<name>/` and `media/templates/site/<name>/` of an
installed site template, WordPress the active theme and its parent) goes through `template.files.write`
— added, changed or removed, checked by the base's blob — within the door's limits; a PHP file only when
the owner allowed PHP there (else `php-disabled`), linted and confirmed like phase 2's.

The engine's write lists are its own (claude-cowork `JoomlaSiteWriter::MAP`/`NESTED` and
`Claude_Cowork_Site_Writer::POST_FIELDS`, read at 0ace6bd): a column the engine would silently drop is
not offered. `content.contract` is the quickstart contract's door, not a list of kinds.

Usage (one JSON object on stdout):
    live_push.py changeset --base-schema B --copy-schema M --platform P --prefix X --id-map F
                           --repo R --base-rev REV --copy-rev REV [--engine F] [--kept F]
                                                                       (SQL client: env TRACY_SYNC_SQL)
    live_push.py changeset --from-json F --platform P                  (the rows already read: tests)
    live_push.py answer --changeset F --preview-id ID [--sync F]       (the preview's answer)
    live_push.py record --changeset F --result F --id-map F --pushed F [--undo]
    live_push.py lint --changeset F --repo R --php VERSION              (PHP files: env TRACY_PHP_LINT)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import live_sync as LS  # noqa: E402 — the merge's own SQL client, policies and helpers

WP = LS._WORDPRESS

# How many items one apply writes (the plan's cap); the rest waits for the next push.
LIMIT = 200
# A value shown in an answer, cut to this many characters (the sync's own VALUE_LIMIT).
VALUE_LIMIT = 2000
# How many items and unsupported places an answer carries; the changeset on the host has them all.
ANSWER_ITEMS = 500
ANSWER_UNSUPPORTED = 300
# The engine's inline media ceiling (`media.upload`, 8 MiB; `file.read` reads as much).
MEDIA_LIMIT = 8 * 1024 * 1024

# ── phase 2: what a file may be ──────────────────────────────────────────────────────────────
# The folders `media.upload` writes (claude-cowork `Engine::MEDIA_ROOTS`, read at origin/main 9b8a955):
# Joomla takes any file under `images/` and `media/`, and sends from `media/` only a template's own
# (`media/templates/`: a Joomla 4/5 template's CSS, JS and pictures) — the rest of `media/` is an
# extension's, which goes with its extension, never alone (`extension-file`). WordPress only
# `wp-content/uploads/`, and every file it is given there becomes a Media Library item — so only a
# picture the library already has is sent.
FILE_ROOTS = {"joomla": ("images/", "media/templates/"), "wordpress": ("wp-content/uploads/",)}
EXTENSION_MEDIA = {"joomla": ("media/",), "wordpress": ()}
# `media.delete` (Joomla): one picture under `images/`, its bytes kept in the engine's undo log.
DELETABLE = ("images/",)
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif", ".ico")
PHP_EXTENSIONS = (".php", ".phtml", ".php3", ".php4", ".php5", ".php7", ".php8", ".phar", ".inc")
# What the CMS or one of its extensions rewrites by itself, and what Tracy writes on every copy:
# never sent (lib/webroot-excludes.sh, the same folders), named `excluded`.
NEVER_DIRS = ("cache/", "tmp/", "logs/", "log/", "administrator/cache/", "administrator/logs/", "media/t4/optimize/",
              "media/t4/css/", "t3-assets/", "media/cache/", "jaextmanager_data/", "wp-content/cache/",
              "wp-content/upgrade/", "wp-content/upgrade-temp-backup/", "wp-content/et-cache/",
              "wp-content/litespeed/", "wp-content/wflogs/", "wp-content/uploads/elementor/css/",
              "wp-content/uploads/wc-logs/", "wp-content/uploads/wpcf7_uploads/", "wp-content/uploads/wpcf7_captcha/",
              "_resources/")
# Tracy's own media folders (the engine's and the sign-in plugin's): never sent, never named.
TRACY_MEDIA = ("media/com_claudecowork/", "media/plg_system_tracyaccess/", "media/plg_system_claudecoworkapi/",
               "media/plg_system_claudecoworkupdate/")
# The web server's own settings files, which a copy carries its host's rules in: named, never sent.
SERVER_FILES = (".htaccess", ".user.ini", "php.ini", "web.config", ".maintenance")
# A T4 site profile, or the favicon/share-image file beside them: the files `template.siteSettings`
# writes (claude-cowork lib/TemplateSiteSettings.php `isDoorFile`, `FAVICON_FILE`, the key lists).
DOOR_FILE = re.compile(r"^templates/([A-Za-z0-9_-]{1,100})/local/etc/site/([A-Za-z0-9_-][A-Za-z0-9 _.-]{0,99})\.json$")
FAVICON_FILE = "tracy-favicon"
T4_KEYS = ("site_logo", "site_logo_small", "site_logo_dark", "site_logo_dark_small", "site_logo_2", "site_name",
           "site_slogan", "other_faviconFile")
SITE_KEYS = ("other_shareImage", "other_glyphFaces")
OTHER_KEYS = ("other_faviconFile", "other_shareImage", "other_glyphFaces")
# Joomla's Global Configuration values `site.identity` writes (claude-cowork lib/SiteIdentity.php FIELDS).
SITE_IDENTITY = ("sitename", "MetaDesc", "sitename_pagetitles")
SITE_IDENTITY_LABELS = {"sitename": "Site Name", "MetaDesc": "Site Meta Description",
                        "sitename_pagetitles": "Site Name in Page Titles"}

# ── template files: a template's or theme's own files (claude-cowork `template.files.*`) ─────
# Where a site's look lives on each platform. Under these, what the engine's template door writes is
# decided by the live site: its roots (`template.files.status`: Joomla every installed site template's
# `templates/<name>/` and `media/templates/site/<name>/`, WordPress the active theme and its parent),
# its switches (`info.template_files.enabled`, `.php`) and its limits. Without the door (an older
# engine) a file there stays named `engine-has-no-file-write`; with it switched off, `template-files-off`.
TEMPLATE_PREFIXES = {"joomla": ("templates/", "media/templates/site/"), "wordpress": ("wp-content/themes/",)}
# The door's own path rules (claude-cowork lib/TemplateFiles.php `SEGMENT`, `DENIED_NAMES`,
# `RUNNABLE_INNER`, `MAX_PATH`, `MAX_DEPTH`): a path it would refuse is named here, never sent.
TEMPLATE_SEGMENT = re.compile(r"^[A-Za-z0-9_@+-][A-Za-z0-9._@+-]*$")
TEMPLATE_DENIED = ("configuration.php", "wp-config.php", "wp-config-sample.php", ".htaccess", ".htpasswd",
                   ".user.ini", "php.ini", "web.config")
TEMPLATE_RUNNABLE_INNER = re.compile(r"\.(php\d*|phtml|phar|pht|phps|cgi)\.", re.I)
TEMPLATE_MAX_PATH, TEMPLATE_MAX_DEPTH = 512, 16
# What the door advertises when `info.template_files` leaves a limit out (its version 1 values).
TEMPLATE_LIMITS = {"maxFileBytes": 2 * 1024 * 1024, "maxBytes": 8 * 1024 * 1024, "maxFiles": 100}
TEMPLATE_EXTENSIONS = ("css", "scss", "sass", "less", "js", "mjs", "json", "map", "php", "html", "htm", "svg", "png",
                       "jpg", "jpeg", "gif", "webp", "avif", "ico", "woff", "woff2", "ttf", "otf", "eot")


def template_door(engine: dict | None) -> dict | None:
    """The live engine's template door as `live-write.mjs info` read it (`templateFiles`): None when
    the engine has none, `{"enabled": False}` when its owner switched it off (or its roots could not be
    read), else its switches, limits and roots."""
    tf = (engine or {}).get("templateFiles") if isinstance(engine, dict) else None
    if not isinstance(tf, dict):
        return None
    if tf.get("enabled") is not True:
        return {"enabled": False}
    roots = []
    for r in tf.get("roots") or []:
        if isinstance(r, dict) and isinstance(r.get("path"), str) and r["path"].strip("/"):
            roots.append({"path": r["path"].strip("/"), "kind": str(r.get("kind") or "template"),
                          "name": str(r.get("name") or ""), "php": r.get("php") is True})
    limits = {}
    for key, fallback in TEMPLATE_LIMITS.items():
        value = tf.get(key)
        limits[key] = int(value) if isinstance(value, int) and not isinstance(value, bool) and value > 0 else fallback
    extensions = tf.get("extensions")
    extensions = tuple(str(e).lower() for e in extensions) if isinstance(extensions, list) and extensions else TEMPLATE_EXTENSIONS
    return {"enabled": True, "php": tf.get("php") is True, "extensions": extensions, "roots": roots, **limits}


class Binary:
    """A value that is not UTF-8 text: never written (the engine takes JSON), named instead."""

    def __init__(self, raw: bytes):
        self.raw = raw

    def __eq__(self, other):
        return isinstance(other, Binary) and other.raw == self.raw

    def __hash__(self):
        return hash(self.raw)


class Placeholder:
    """The live number of a record this push creates, known once the live site gave it."""

    def __init__(self, entity: str, copy_id: int):
        self.entity, self.copy_id = entity, int(copy_id)

    @property
    def ref(self) -> str:
        return f"{self.entity}:{self.copy_id}"

    def marker(self) -> str:
        return f"@@tracy-new:{self.ref}@@"

    def __eq__(self, other):
        return isinstance(other, Placeholder) and other.ref == self.ref

    def __hash__(self):
        return hash(self.ref)

    def __str__(self):
        return self.marker()


MARKER = re.compile(r"@@tracy-new:([a-z_]+):([0-9]+)@@")
INT = re.compile(r"^-?[0-9]+$")


# ── the kinds ────────────────────────────────────────────────────────────────────────────────

@dataclass
class Spec:
    """One kind of record the engine writes, as the copy's and the base's database hold it.

    `columns`: SQL expressions over `r` (the record's table) and `joins`, when the record is not one
    row of one table; None reads the table's own columns. `key`: the columns that name a record;
    `key_refs` says which of them hold another record's number (and which entity's). `refs`: columns
    holding another record's number; `lists`: comma-separated lists of numbers; `texts`: columns whose
    links name records (`entities` texts of the merge's policy). `tree`: a Joomla nested set, its
    siblings grouped by `parent_id` and these columns, ordered by `lft`."""

    name: str
    kind: str
    table: str
    entity: str | None
    key: tuple = ("id",)
    key_refs: dict = field(default_factory=dict)
    where: str = ""
    joins: str = ""
    columns: dict | None = None
    extra: dict = field(default_factory=dict)
    title: tuple = ("title",)
    write: tuple = ()
    create: tuple | None = None
    trash: tuple | None = None
    delete_absent: bool = True
    ignore: frozenset = frozenset()
    refs: dict = field(default_factory=dict)
    lists: dict = field(default_factory=dict)
    texts: tuple = ()
    tree: tuple | None = None
    address: bool = False
    report: str = "field"
    follows: str | None = None
    live_id: str | None = None
    group: str | None = None
    # A column the engine names otherwise (`post_content` of a template part is its `content`): the
    # table's own name stays for links, seeds and the dialog; the item writes and expects the engine's.
    engine: dict = field(default_factory=dict)


J_STAMPS = frozenset({"asset_id", "created", "created_by", "modified", "modified_by", "checked_out",
                      "checked_out_time", "version", "hits", "created_user_id", "created_time",
                      "modified_user_id", "modified_time"})
J_TREE = frozenset({"lft", "rgt", "level", "path", "parent_id"})

# claude-cowork JoomlaSiteWriter::MAP columns (update) and NESTED createColumns (create).
J_ARTICLE = ("title", "alias", "introtext", "fulltext", "state", "catid", "images", "urls", "attribs",
             "metadata", "metakey", "metadesc", "language", "featured", "ordering", "access", "publish_up",
             "publish_down", "note")
J_CATEGORY = ("title", "note", "description", "published", "access", "language", "params", "metadesc",
              "metakey")
J_TAG = ("title", "note", "description", "published", "access", "language", "params")
J_MENU = ("title", "note", "published", "params", "home", "language", "template_style_id", "link")
J_MENU_CREATE = ("title", "menutype", "link", "type", "published", "parent_id", "browserNav", "access",
                 "language", "note", "params", "home", "template_style_id", "alias")
J_MODULE = ("title", "note", "content", "position", "module", "access", "showtitle", "params", "published",
            "language", "ordering")
J_REDIRECT = ("old_url", "new_url", "comment", "published", "header")

# The custom field contexts whose item is a record the sync numbers (`fields_values.item_id`).
FIELD_ITEM_ENTITY = {"com_content.article": "content", "com_content.categories": "categories",
                     "com_users.user": "users"}


def _field_item_entity(key: dict) -> str | None:
    return FIELD_ITEM_ENTITY.get(key.get("context") or "")


def joomla_specs(prefix: str) -> list[Spec]:
    t = lambda name: "{s}." + LS.q(prefix + name)  # noqa: E731 — a table of the side being read
    tags_of = (f"(SELECT GROUP_CONCAT(m.tag_id ORDER BY m.tag_id) FROM {t('contentitem_tag_map')} m"
               f" WHERE m.content_item_id = r.id AND m.type_alias = 'com_content.article')")
    menuids = (f"(SELECT CONCAT('[', GROUP_CONCAT(mm.menuid ORDER BY mm.menuid SEPARATOR ','), ']')"
               f" FROM {t('modules_menu')} mm WHERE mm.moduleid = r.id)")
    single = (f"(SELECT COUNT(*) FROM {t('fields_values')} x WHERE x.field_id = r.field_id"
              f" AND x.item_id = r.item_id) = 1")
    return [
        Spec("category", "category", "categories", "categories", where="r.extension = 'com_content'",
             write=J_CATEGORY, create=J_CATEGORY + ("parent_id", "extension"), trash=("published", "-2"),
             ignore=J_STAMPS | J_TREE, refs={"parent_id": "categories"}, tree=("extension",)),
        Spec("tag", "tag", "tags", "tags", where="r.id > 1", write=J_TAG, create=J_TAG + ("parent_id",),
             trash=("published", "-2"), ignore=J_STAMPS | J_TREE, refs={"parent_id": "tags"}, tree=()),
        Spec("article", "article", "content", "content", extra={"tags": tags_of}, write=J_ARTICLE,
             create=J_ARTICLE, trash=("state", "-2"), ignore=J_STAMPS, refs={"catid": "categories"},
             lists={"tags": "tags"}, texts=("introtext", "fulltext")),
        Spec("menutype", "menutype", "menu_types", None, key=("menutype",), where="r.client_id = 0",
             write=("title", "description"), create=("menutype", "title", "description", "client_id"),
             ignore=frozenset({"id", "asset_id", "ordering"}), live_id="id"),
        Spec("menuItem", "menuItem", "menu", "menu", where="r.client_id = 0 AND r.id > 1", write=J_MENU,
             create=J_MENU_CREATE, trash=("published", "-2"),
             ignore=J_STAMPS | J_TREE | {"component_id", "client_id", "img"}, refs={"parent_id": "menu"},
             texts=("link",), tree=("menutype",)),
        Spec("module", "module", "modules", "modules", where="r.client_id = 0", write=J_MODULE,
             create=J_MODULE, trash=("published", "-2"), ignore=J_STAMPS | {"client_id"}),
        Spec("moduleAssignment", "moduleAssignment", "modules", "modules", where="r.client_id = 0",
             columns={"id": "r.id", "title": "r.title", "menuids": menuids}, write=("menuids",), ignore=frozenset({"title"}),
             delete_absent=False, follows="module"),
        Spec("redirect", "redirect", "redirect_links", "redirect_links", title=("old_url",), write=J_REDIRECT,
             create=J_REDIRECT, trash=("published", "-2"),
             ignore=frozenset({"hits", "created_date", "modified_date", "referer"})),
        Spec("fieldValue", "fieldValue", "fields_values", None, key=("field_id", "item_id", "context"),
             key_refs={"item_id": _field_item_entity},
             joins=f"JOIN {t('fields')} f ON f.id = r.field_id", where=single,
             columns={"field_id": "r.field_id", "item_id": "r.item_id", "context": "f.context",
                      "title": "f.title", "value": "r.value"},
             title=("title",), write=("value",), ignore=frozenset({"title"}), delete_absent=False),
        # A site template style: its title and params (JoomlaSiteWriter::MAP `templateStyle`; `home` and
        # `template` stay named — which style is the default, or which template a style is of, is not a
        # setting of the site but a switch of its design). Never made or removed by a push.
        Spec("templateStyle", "templateStyle", "template_styles", None, where="r.client_id = 0",
             write=("title", "params"), ignore=frozenset({"client_id"}), group="settings"),
    ]


# claude-cowork Claude_Cowork_Site_Writer::POST_FIELDS (and `categories`/`tags` by slug).
W_POST = ("post_title", "post_content", "post_excerpt", "post_status", "post_name", "post_parent", "menu_order",
          "post_date")
W_POST_TYPES = ("post", "page")
# A block theme's parts and templates as the Site Editor overrides them: one row of the active theme
# per slug (claude-cowork SiteWriter::THEME_ROWS), written by slug through `content.update`
# `templatePart` / `template` — always with its content and title (a write without its title names
# the row by its slug); deleting the row hands the slot back to the theme's own file.
W_THEME_ROWS = {"templatePart": "wp_template_part", "template": "wp_template"}
# Block content the engine writes as a post (`content.update` `post`, any post type): a block theme's
# menus and synced patterns, and the active theme's Styles (made with the theme, never made again).
W_BLOCK_POSTS = ("wp_navigation", "wp_block")
# Post types no kind writes and nobody edits as content: WordPress's own bookkeeping.
W_POST_NOISE = ("revision", "customize_changeset", "oembed_cache", "user_request")
W_STAMPS = frozenset({"post_modified", "post_modified_gmt", "post_date_gmt", "guid", "comment_count",
                      "post_content_filtered", "to_ping", "pinged", "post_mime_type", "post_author",
                      "category_slugs", "tag_slugs", "tag_names"})
W_MENU = ("title", "position", "type", "object", "object_id", "url", "parent")
# Options a person sets in Settings › General / Reading / Discussion and the Customizer's Site
# Identity that the engine writes as one value (`content.update` `option`; PROTECTED_OPTIONS refused).
W_OPTIONS = ("blogname", "blogdescription", "date_format", "time_format", "start_of_week", "posts_per_page",
             "show_on_front", "page_on_front", "page_for_posts",
             # phase 2
             "site_icon", "timezone_string", "gmt_offset", "posts_per_rss", "rss_use_excerpt",
             "default_comment_status", "default_ping_status", "comment_registration", "comments_per_page",
             "page_comments", "thread_comments")
W_OPTION_POSTS = ("page_on_front", "page_for_posts", "site_icon")
# Never sent, whatever Tracy did: the address of every page (a push would break every link the live
# site has given out), named `permalink`.
W_NEVER_OPTIONS = ("permalink_structure", "category_base", "tag_base")
# What a person calls them (Settings › General, Reading, Discussion; Customizer › Site Identity).
OPTION_LABELS = {"blogname": "Site title", "blogdescription": "Tagline", "date_format": "Date format",
                 "time_format": "Time format", "start_of_week": "Week starts on", "posts_per_page": "Posts per page",
                 "show_on_front": "Your homepage displays", "page_on_front": "Homepage", "page_for_posts": "Posts page",
                 "site_icon": "Site icon", "timezone_string": "Timezone", "gmt_offset": "Timezone",
                 "posts_per_rss": "Syndication feeds show the most recent", "rss_use_excerpt": "For each post in a feed",
                 "default_comment_status": "Allow comments on new posts",
                 "default_ping_status": "Allow link notifications", "comment_registration": "Users must be registered to comment",
                 "comments_per_page": "Comments per page", "page_comments": "Break comments into pages",
                 "thread_comments": "Threaded comments", "permalink_structure": "Permalink structure",
                 "category_base": "Category base", "tag_base": "Tag base"}
# Fixed words of a title (`Changeset.worded`), by the name the dialog translates them under
# (`push.label.<name>`): each option's label, and the words of a setting's title.
LABELS = {**OPTION_LABELS, "additionalCss": "Additional CSS", "customizer": "Customizer",
          "templateStyle": "Template style", "styles": "Styles", "globalConfiguration": "Global Configuration",
          "featuredImage": "Featured image", "pageTemplate": "Page template", "altText": "Alt text"}
# What each kind of change is, as the dialog names it (`push.what.<name>`): a record, a setting, a file.
WHAT = {"article": "article", "category": "category", "tag": "tag", "menuItem": "menuItem", "menutype": "menu",
        "module": "module", "moduleAssignment": "module", "fieldValue": "customField", "redirect": "redirect",
        "templateStyle": "setting", "option": "setting", "optionOther": "setting", "themeMods": "setting",
        "customCss": "setting", "globalStyles": "setting", "siteIdentity": "setting", "templateSettings": "setting",
        "templatePart": "templatePart", "template": "template", "postmeta": "pageDetail", "attachment": "media",
        "file": "file"}
# Polylang's language and translation group of a post or a term (`Changeset.translation_refused`):
# compared on their own, never written — the live engine's write door has no read of them to check
# against and no undo (`content.language`), so a change of them is named, not sent.
W_POLYLANG = frozenset({"language", "translations"})
# Post meta never offered: WordPress's and Tracy's own bookkeeping, the menu item's (its own kind).
W_META_SKIP = ("_edit_lock", "_edit_last", "_encloseme", "_pingme", "_wp_old_slug", "_wp_old_date",
               "_wp_trash_meta_status", "_wp_trash_meta_time", "_wp_desired_post_slug", "_wp_attached_file", "_wp_attachment_metadata")


def _menu_object_entity(row: dict) -> str | None:
    return {"post_type": "posts", "taxonomy": "terms"}.get(row.get("type") or "")


def _option_entity(key: dict) -> str | None:
    return "posts" if key.get("option_name") in W_OPTION_POSTS else None


def _meta_entity(row: dict) -> str | None:
    return "posts" if row.get("meta_key") == "_thumbnail_id" else None


def wordpress_specs(prefix: str) -> list[Spec]:
    t = lambda name: "{s}." + LS.q(prefix + name)  # noqa: E731

    def terms_of(taxonomy: str, column: str) -> str:
        order = "x.term_id" if column == "term_id" else f"x.{column}"
        return (f"(SELECT GROUP_CONCAT(x.{column} ORDER BY {order}) FROM {t('term_relationships')} tr"
                f" JOIN {t('term_taxonomy')} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id"
                f" JOIN {t('terms')} x ON x.term_id = tt.term_id"
                f" WHERE tr.object_id = r.ID AND tt.taxonomy = '{taxonomy}')")

    def meta(key: str) -> str:
        return f"(SELECT m.meta_value FROM {t('postmeta')} m WHERE m.post_id = r.ID AND m.meta_key = '{key}' LIMIT 1)"

    def filed(record: str, taxonomy: str, value: str) -> str:
        """One term of `taxonomy` the record (`r.ID`, `r.term_id`) is filed under: Polylang's language
        (`x.slug`) or translation group (`tt.description`)."""
        return (f"(SELECT {value} FROM {t('term_relationships')} tr JOIN {t('term_taxonomy')} tt"
                f" ON tt.term_taxonomy_id = tr.term_taxonomy_id JOIN {t('terms')} x ON x.term_id = tt.term_id"
                f" WHERE tr.object_id = {record} AND tt.taxonomy = '{taxonomy}' ORDER BY tt.term_taxonomy_id LIMIT 1)")

    menu_slug = (f"(SELECT x.slug FROM {t('term_relationships')} tr JOIN {t('term_taxonomy')} tt"
                 f" ON tt.term_taxonomy_id = tr.term_taxonomy_id JOIN {t('terms')} x ON x.term_id = tt.term_id"
                 f" WHERE tr.object_id = r.ID AND tt.taxonomy = 'nav_menu' LIMIT 1)")
    types = ", ".join(LS.sql_str(p) for p in W_POST_TYPES)
    block_posts = ", ".join(LS.sql_str(p) for p in W_BLOCK_POSTS)
    handled = ", ".join(LS.sql_str(p) for p in W_POST_TYPES + W_BLOCK_POSTS + tuple(W_THEME_ROWS.values()) + W_POST_NOISE
                        + ("attachment", "nav_menu_item", "custom_css", "wp_global_styles"))

    def term_of(taxonomy: str) -> str:
        return (f"(SELECT x.name FROM {t('term_relationships')} tr JOIN {t('term_taxonomy')} tt"
                f" ON tt.term_taxonomy_id = tr.term_taxonomy_id JOIN {t('terms')} x ON x.term_id = tt.term_id"
                f" WHERE tr.object_id = r.ID AND tt.taxonomy = '{taxonomy}' LIMIT 1)")

    # A row of the active theme (its `wp_theme` term names the `stylesheet`), compared as bytes for the
    # same two-collation reason as the theme mods below.
    of_active_theme = (f"CAST({term_of('wp_theme')} AS BINARY) = (SELECT CAST(st.option_value AS BINARY)"
                       f" FROM {t('options')} st WHERE st.option_name = 'stylesheet' LIMIT 1)")
    menu_object_title = (
        f"CASE WHEN {meta('_menu_item_type')} = 'post_type' THEN"
        f" (SELECT target.post_title FROM {t('posts')} target WHERE target.ID = CAST({meta('_menu_item_object_id')} AS UNSIGNED)"
        f" AND target.post_type = {meta('_menu_item_object')} LIMIT 1)"
        f" WHEN {meta('_menu_item_type')} = 'taxonomy' THEN"
        f" (SELECT target.name FROM {t('terms')} target JOIN {t('term_taxonomy')} taxonomy ON taxonomy.term_id = target.term_id"
        f" WHERE target.term_id = CAST({meta('_menu_item_object_id')} AS UNSIGNED)"
        f" AND taxonomy.taxonomy = {meta('_menu_item_object')} LIMIT 1) END")
    skip = ", ".join(LS.sql_str(k) for k in W_META_SKIP + WP.VOLATILE_NAMES["postmeta"][1])
    options = ", ".join(LS.sql_str(o) for o in W_OPTIONS)
    tracy_option = WP.TRACY_OPTIONS
    volatile_option = WP.VOLATILE_OPTIONS
    # The active theme's mods (`theme_mods_<stylesheet>`), on the side being read — as bytes, compared
    # with the option's name as bytes: `option_name` and `option_value` of an old site's table can carry
    # two collations, and MariaDB refuses `=` between them (ERROR 1267, dev 24/10/2026).
    active_mods = (f"CONCAT(X'{'theme_mods_'.encode().hex()}', (SELECT CAST(st.option_value AS BINARY)"
                   f" FROM {t('options')} st WHERE st.option_name = 'stylesheet' LIMIT 1))")
    option_bytes = "CAST(r.option_name AS BINARY)"
    return [
        Spec("term", "term", "terms", None, key=("term_id", "taxonomy"), key_refs={"term_id": "terms"},
             joins=f"JOIN {t('term_taxonomy')} tt ON tt.term_id = r.term_id",
             where="tt.taxonomy IN ('category', 'post_tag', 'nav_menu')",
             columns={"term_id": "r.term_id", "taxonomy": "tt.taxonomy", "name": "r.name", "slug": "r.slug",
                      "description": "tt.description", "parent": "tt.parent"},
             extra={"language": filed("r.term_id", "term_language", "x.slug"),
                    "translations": filed("r.term_id", "term_translations", "tt.description")},
             title=("name", "slug"), write=("name", "slug", "description", "parent"),
             create=("name", "slug", "description", "parent"), ignore=W_POLYLANG, refs={"parent": "terms"},
             address=True),
        Spec("attachment", "media", "posts", "posts", key=("ID",), where="r.post_type = 'attachment'",
             columns={"ID": "r.ID", "post_title": "r.post_title", "file": meta("_wp_attached_file")},
             title=("post_title", "file"), write=(), ignore=frozenset({"post_title"}), delete_absent=False,
             report="media"),
        Spec("post", "post", "posts", "posts", key=("ID",),
             where=f"r.post_type IN ({types}) AND r.post_status NOT IN ('auto-draft', 'inherit')",
             extra={"categories": terms_of("category", "term_id"), "tags": terms_of("post_tag", "term_id"),
                    "category_slugs": terms_of("category", "slug"), "tag_slugs": terms_of("post_tag", "slug"),
                    "tag_names": terms_of("post_tag", "name"),
                    "language": filed("r.ID", "language", "x.slug"),
                    "translations": filed("r.ID", "post_translations", "tt.description")},
             title=("post_title", "post_name"), write=W_POST + ("categories", "tags"),
             create=("post_type",) + W_POST + ("categories", "tags"), trash=("post_status", "trash"),
             ignore=W_STAMPS | W_POLYLANG, refs={"post_parent": "posts"}, lists={"categories": "terms", "tags": "terms"},
             texts=("post_content",), address=True),
        Spec("menuItem", "menuItem", "posts", "posts", key=("ID",), where="r.post_type = 'nav_menu_item'",
             columns={"ID": "r.ID", "title": "r.post_title", "position": "r.menu_order",
                      "type": meta("_menu_item_type"), "object": meta("_menu_item_object"),
                      "object_id": meta("_menu_item_object_id"), "url": meta("_menu_item_url"),
                      "parent": meta("_menu_item_menu_item_parent"), "menu": menu_slug, "object_title": menu_object_title},
             title=("title", "object_title", "url"), write=W_MENU, create=W_MENU,
             ignore=frozenset({"object_title"}), refs={"object_id": _menu_object_entity, "parent": "posts"}, address=True),
        Spec("option", "option", "options", None, key=("option_name",), key_refs={},
             where=f"r.option_name IN ({options})",
             columns={"option_name": "r.option_name", "value": "r.option_value"},
             title=("option_name",), write=("value",), create=("value",), delete_absent=False,
             refs={"value": lambda row: "posts" if row.get("option_name") in W_OPTION_POSTS else None},
             address=True, group="settings"),
        Spec("themeMods", "option", "options", None, key=("option_name",), where=f"{option_bytes} = {active_mods}",
             columns={"option_name": "r.option_name", "value": "r.option_value"},
             title=("option_name",), write=("value",), delete_absent=False, address=True, report="themeMods",
             group="settings"),
        # Customizer › Additional CSS: the active theme's `custom_css` post (wp_get_custom_css_post), whose
        # content the engine writes as a post's (`content.update` `post`, any post type).
        Spec("customCss", "post", "posts", "posts", key=("ID",),
             where="r.post_type = 'custom_css' AND r.post_status NOT IN ('auto-draft', 'inherit', 'trash')",
             columns={"ID": "r.ID", "post_name": "r.post_name", "post_title": "r.post_title",
                      "post_status": "r.post_status", "post_type": "r.post_type", "post_content": "r.post_content"},
             title=("post_name",), write=("post_content",),
             create=("post_type", "post_name", "post_title", "post_status", "post_content"),
             ignore=frozenset({"post_type"}), address=True, group="settings"),
        # A block theme's header, footer and other parts, and its templates, as the Site Editor saved
        # them: by slug, the area as the engine reads it (`uncategorized` when none is filed).
        Spec("templatePart", "templatePart", "posts", None, key=("post_name",), key_refs={},
             where=f"r.post_type = 'wp_template_part' AND r.post_status = 'publish' AND {of_active_theme}",
             columns={"post_name": "r.post_name", "ID": "r.ID", "post_title": "r.post_title",
                      "post_content": "r.post_content",
                      "area": f"COALESCE({term_of('wp_template_part_area')}, 'uncategorized')"},
             title=("post_title", "post_name"), write=("post_content", "post_title", "area"),
             create=("post_content", "post_title", "area"), ignore=frozenset({"ID"}), texts=("post_content",),
             address=True, engine={"post_content": "content", "post_title": "title"}),
        Spec("template", "template", "posts", None, key=("post_name",), key_refs={},
             where=f"r.post_type = 'wp_template' AND r.post_status = 'publish' AND {of_active_theme}",
             columns={"post_name": "r.post_name", "ID": "r.ID", "post_title": "r.post_title",
                      "post_content": "r.post_content"},
             title=("post_title", "post_name"), write=("post_content", "post_title"),
             create=("post_content", "post_title"), ignore=frozenset({"ID"}), texts=("post_content",),
             address=True, engine={"post_content": "content", "post_title": "title"}),
        Spec("blockPost", "post", "posts", "posts", key=("ID",),
             where=f"r.post_type IN ({block_posts}) AND r.post_status NOT IN ('auto-draft', 'inherit')",
             columns={"ID": "r.ID", "post_type": "r.post_type", "post_name": "r.post_name",
                      "post_title": "r.post_title", "post_status": "r.post_status", "post_content": "r.post_content"},
             title=("post_title", "post_name"), write=("post_title", "post_content", "post_status"),
             create=("post_type", "post_name", "post_title", "post_status", "post_content"),
             trash=("post_status", "trash"), ignore=frozenset({"post_type", "post_name"}), texts=("post_content",),
             address=True),
        Spec("globalStyles", "post", "posts", "posts", key=("ID",),
             where=f"r.post_type = 'wp_global_styles' AND r.post_status = 'publish' AND {of_active_theme}",
             columns={"ID": "r.ID", "post_name": "r.post_name", "post_title": "r.post_title",
                      "post_content": "r.post_content"},
             title=("post_title",), write=("post_content",), ignore=frozenset({"post_name", "post_title"}),
             address=True, group="settings"),
        # Any other post type (a plugin's products, forms, fonts): named in the list of what is not
        # sent, never passed over in silence. A theme that does not run keeps its parts to itself.
        Spec("postOther", "post", "posts", "posts", key=("ID",),
             where=f"r.post_type NOT IN ({handled}) AND r.post_status NOT IN ('auto-draft', 'inherit')",
             columns={"ID": "r.ID", "post_type": "r.post_type", "post_title": "r.post_title",
                      "post_name": "r.post_name", "post_status": "r.post_status", "post_content": "r.post_content",
                      "post_excerpt": "r.post_excerpt", "post_parent": "r.post_parent", "menu_order": "r.menu_order"},
             title=("post_title", "post_name"), write=(), create=None, delete_absent=True, report="record",
             address=True),
        Spec("optionOther", "option", "options", None, key=("option_name",),
             where=(f"r.option_name NOT IN ({options}) AND NOT ({tracy_option}) AND NOT ({volatile_option})"
                    f" AND NOT ({option_bytes} <=> {active_mods})"),
             columns={"option_name": "r.option_name", "value": "r.option_value"},
             title=("option_name",), write=(), delete_absent=False, address=True, report="setting"),
        Spec("postmeta", "postmeta", "postmeta", None, key=("post_id", "meta_key"), key_refs={"post_id": "posts"},
             joins=f"JOIN {t('posts')} p ON p.ID = r.post_id",
             where=(f"((p.post_type IN ({types}) AND p.post_status NOT IN ('auto-draft', 'inherit'))"
                    f" OR (p.post_type = 'attachment' AND r.meta_key = '_wp_attachment_image_alt'))"
                    f" AND r.meta_key NOT IN ({skip}) AND r.meta_key NOT LIKE '\\\\_tracy\\\\_%'"
                    f" AND r.meta_key NOT LIKE '\\\\_menu\\\\_item\\\\_%'"),
             columns={"post_id": "r.post_id", "meta_key": "r.meta_key", "value": "r.meta_value",
                      "post_title": "p.post_title"},
             title=("post_title",), write=("value",), create=("value",), delete_absent=False,
             ignore=frozenset({"post_title"}), refs={"value": _meta_entity}, address=True),
    ]


# Rows a Sync from live names by their own number (the table's primary key, in the copy's numbers:
# `sync/kept.json`) while a push names the same row by what it is (its seeds' `match`): per platform,
# table without prefix → (the number's column, the columns that say what the row is). `mark_kept`
# finds each kept row's name in the copy, the side whose numbers the sync gave.
KEPT_NAMES = {
    "joomla": {"menu_types": ("id", ("menutype", "client_id"))},
    "wordpress": {"options": ("option_id", ("option_name",)), "postmeta": ("meta_id", ("post_id", "meta_key")),
                  "term_taxonomy": ("term_taxonomy_id", ("term_id", "taxonomy"))},
}
# A column of the database a kept place names, as the item that writes it calls it (a menu item's
# title, an option's or a meta's value), when the item does not call it by the column's own name.
KEPT_FIELDS = {"post_title": "title", "menu_order": "position", "option_value": "value", "meta_value": "value"}


def kept_name_rows(kept: list, platform: str, prefix: str) -> dict[str, list[str]]:
    """The numbers of the kept rows whose name `mark_kept` needs, by table (without prefix)."""
    out: dict[str, list[str]] = {}
    for k in kept or []:
        table, key = k.get("table"), k.get("key")
        if not isinstance(table, str) or not isinstance(key, dict):
            continue
        bare = table[len(prefix):] if prefix and table.startswith(prefix) else table
        named = KEPT_NAMES.get(platform, {}).get(bare)
        if named and list(key) == [named[0]] and str(key[named[0]]) not in out.get(bare, []):
            out.setdefault(bare, []).append(str(key[named[0]]))
    return out


# Tables a kind above covers, and tables never compared (each site's bookkeeping: what the CMS
# writes as a record is saved, or what a visitor's request leaves): per platform, without prefix.
COVERED = {
    "joomla": {"content", "categories", "tags", "menu", "menu_types", "modules", "modules_menu", "redirect_links",
               "fields_values", "contentitem_tag_map", "template_styles"},
    "wordpress": {"posts", "postmeta", "terms", "term_taxonomy", "term_relationships", "options"},
}
BOOKKEEPING = {
    "joomla": {"assets", "ucm_base", "ucm_content", "ucm_history", "history", "workflow_associations",
               "content_frontpage", "content_rating", "banner_tracks", "mail_queue", "schemaorg"},
    "wordpress": set(),
}
# Rows of `extensions` that are Tracy's own, or that provision changes on every copy.
J_EXTENSION_NOISE = ("com_claudecowork", "tracyaccess")


def kinds(platform: str, prefix: str) -> list[Spec]:
    return joomla_specs(prefix) if platform == "joomla" else wordpress_specs(prefix)


def entity_rules(platform: str) -> dict:
    return dict(LS.POLICIES.get(platform, {}).get("entities", []))


def entity_key(platform: str, entity: str) -> str:
    return entity_rules(platform).get(entity, {}).get("key", "id")


# ── reading the two sides ────────────────────────────────────────────────────────────────────

def decode(hexed: str | None):
    if hexed is None:
        return None
    raw = bytes.fromhex(hexed)
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return Binary(raw)


class SqlSource:
    """The rows of every kind on both sides, read through the merge's SQL client: digests of every
    record first, whole rows only of the records whose digest differs, whose number moved, or that
    one side lacks — a site of 20,000 articles is not read twice in full for the five Tracy changed."""

    def __init__(self, sql: LS.Sql, base: str, copy: str, platform: str, prefix: str, id_map: dict,
                 homes: tuple[str, str] | None):
        self.sql, self.base, self.copy, self.platform, self.prefix = sql, base, copy, platform, prefix
        self.id_map = id_map
        self.homes = homes
        self._columns: dict = {}

    def side(self, which: str) -> str:
        return self.base if which == "base" else self.copy

    def table_columns(self, which: str, table: str) -> list[str]:
        k = (which, table)
        if k not in self._columns:
            self._columns[k] = [r[0] for r in self.sql.run(
                f"SELECT column_name FROM information_schema.columns WHERE table_schema = {LS.sql_str(self.side(which))}"
                f" AND table_name = {LS.sql_str(self.prefix + table)} ORDER BY ordinal_position;")]
        return self._columns[k]

    def has(self, which: str, table: str) -> bool:
        return bool(self.table_columns(which, table))

    NAMED = re.compile(r"\{s\}\.`([^`]+)`")

    def present(self, text: str) -> bool:
        """Whether every table an expression names (`{s}.<table>`) is on both sides."""
        return all(self.has(w, name[len(self.prefix):]) for name in self.NAMED.findall(text) for w in ("base", "copy"))

    # A column of the record's own row named in an expression (`r.post_excerpt`, `r.\`ID\``).
    OWN_COLUMN = re.compile(r"(?<![A-Za-z0-9_.`])r\.`?([A-Za-z_][A-Za-z0-9_]*)`?")
    PLAIN_COLUMN = re.compile(r"^r\.`?([A-Za-z_][A-Za-z0-9_]*)`?$")

    def both_columns(self, table: str) -> set[str]:
        return set(self.table_columns("base", table)) & set(self.table_columns("copy", table))

    def usable(self, spec: Spec) -> bool:
        if not (self.has("base", spec.table) and self.has("copy", spec.table)
                and self.present(spec.joins + spec.where + " ".join((spec.columns or {}).values()))):
            return False
        # A kind whose filter or key names a column this site's table lacks (an older or trimmed
        # schema) is not this site's kind: left out, never a changeset that stops on ERROR 1054.
        both = self.both_columns(spec.table)
        keys = [spec.columns.get(k, "") for k in spec.key] if spec.columns is not None else []
        needed = self.OWN_COLUMN.findall(spec.where) + [m.group(1) for k in keys if (m := self.PLAIN_COLUMN.match(k))]
        return all(c in both for c in needed)

    def expressions(self, spec: Spec, which: str) -> dict[str, str]:
        schema = LS.q(self.side(which))
        if spec.columns is not None:
            # A plain column one side's table lacks is left out of what is compared (a trimmed schema
            # with no `post_excerpt`), as the table's own columns are when the kind names none.
            both = self.both_columns(spec.table)
            cols = {c: e for c, e in spec.columns.items()
                    if not (m := self.PLAIN_COLUMN.match(e)) or m.group(1) in both}
        else:
            base_cols = set(self.table_columns("base", spec.table))
            cols = {c: f"r.{LS.q(c)}" for c in self.table_columns("copy", spec.table) if c in base_cols}
        # A part of the record kept in a table this site does not have (a Joomla without tags): left out.
        cols.update({c: e for c, e in spec.extra.items() if self.present(e)})
        return {c: e.replace("{s}", schema) for c, e in cols.items()}

    def source(self, spec: Spec, which: str) -> str:
        schema = LS.q(self.side(which))
        joins = spec.joins.replace("{s}", schema)
        where = spec.where.replace("{s}", schema) if spec.where else ""
        return (f"FROM {schema}.{LS.q(self.prefix + spec.table)} r {joins}" + (f" WHERE {where}" if where else ""))

    def compared(self, spec: Spec, exprs: dict) -> list[str]:
        return [c for c in exprs if c not in spec.key]

    def value_sql(self, expr: str, which: str, address: bool) -> str:
        cast = f"CAST({expr} AS BINARY)"
        if address and which == "base" and self.homes and self.homes[0] != self.homes[1]:
            live, copy = self.homes
            cast = f"REPLACE({cast}, X'{live.encode().hex()}', X'{copy.encode().hex()}')"
        return cast

    def digests(self, spec: Spec, which: str) -> dict[tuple, str]:
        exprs = self.expressions(spec, which)
        cols = self.compared(spec, exprs)
        keys = ", ".join(f"HEX(CAST({exprs[k]} AS BINARY))" for k in spec.key)
        parts = ", ".join(f"COALESCE(MD5({self.value_sql(exprs[c], which, spec.address)}), '-')" for c in cols) or "''"
        out: dict[tuple, str] = {}
        dupes: set = set()
        for row in self.sql.run(f"SELECT {keys}, MD5(CONCAT_WS(',', {parts})) {self.source(spec, which)};"):
            key = tuple(decode(h) for h in row[:len(spec.key)])
            if key in out:
                dupes.add(key)
            out[key] = row[-1]
        for key in dupes:
            out.pop(key, None)
        return out

    def rows(self, spec: Spec, which: str, keys: list[tuple]) -> dict[tuple, dict]:
        if not keys:
            return {}
        exprs = self.expressions(spec, which)
        names = list(exprs)
        select = ", ".join(f"HEX(CAST({exprs[c]} AS BINARY))" for c in names)
        out: dict[tuple, dict] = {}
        for at in range(0, len(keys), 200):
            chunk = keys[at:at + 200]
            cond = " OR ".join("(" + " AND ".join(
                f"CAST({exprs[k]} AS BINARY) = X'{str(v).encode().hex()}'" for k, v in zip(spec.key, key)) + ")"
                for key in chunk)
            src = self.source(spec, which)
            src += f" AND ({cond})" if " WHERE " in src else f" WHERE ({cond})"
            for row in self.sql.run(f"SELECT {select} {src};"):
                values = {c: decode(h) for c, h in zip(names, row)}
                out[tuple(values[k] for k in spec.key)] = values
        return out

    def tree(self, spec: Spec, which: str) -> list[dict]:
        cols = ["id", "parent_id", "lft"] + list(spec.tree or ())
        schema = LS.q(self.side(which))
        select = ", ".join(f"r.{LS.q(c)}" for c in cols)
        where = spec.where.replace("{s}", schema)
        rows = self.sql.run(f"SELECT {select} FROM {schema}.{LS.q(self.prefix + spec.table)} r"
                            + (f" WHERE {where}" if where else "") + " ORDER BY r.lft, r.id;")
        return [dict(zip(cols, r)) for r in rows]

    def attached(self, paths: list[str]) -> list[str]:
        """Which of these uploads files a Media Library item of the live site's last read holds
        (`_wp_attached_file`, relative to uploads/)."""
        rels = [p[len("wp-content/uploads/"):] for p in paths if p.startswith("wp-content/uploads/")]
        if not rels or not self.has("base", "postmeta"):
            return []
        out = []
        for at in range(0, len(rels), 200):
            listed = ", ".join(LS.sql_str(r) for r in rels[at:at + 200])
            out += [r[0] for r in self.sql.run(
                f"SELECT meta_value FROM {LS.q(self.base)}.{LS.q(self.prefix + 'postmeta')}"
                f" WHERE meta_key = '_wp_attached_file' AND meta_value IN ({listed});")]
        return out

    def kept_names(self, kept: list) -> dict[str, list[dict]]:
        """The copy's rows the kept places name by number (`KEPT_NAMES`): each one's number and what it is."""
        out: dict[str, list[dict]] = {}
        for table, numbers in kept_name_rows(kept, self.platform, self.prefix).items():
            if not self.has("copy", table):
                continue
            pk, natural = KEPT_NAMES[self.platform][table]
            cols = [pk, *natural]
            if not all(c in self.table_columns("copy", table) for c in cols):
                continue
            select = ", ".join(f"HEX(CAST({LS.q(c)} AS BINARY))" for c in cols)
            for at in range(0, len(numbers), 200):
                listed = ", ".join(f"X'{n.encode().hex()}'" for n in numbers[at:at + 200])
                for row in self.sql.run(f"SELECT {select} FROM {LS.q(self.copy)}.{LS.q(self.prefix + table)}"
                                        f" WHERE CAST({LS.q(pk)} AS BINARY) IN ({listed});"):
                    out.setdefault(table, []).append({c: decode(h) for c, h in zip(cols, row)})
        return out

    def entity_ids(self, entity: str, which: str) -> list[int]:
        if not self.has(which, entity):
            return []
        key = entity_key(self.platform, entity)
        return [int(r[0]) for r in self.sql.run(
            f"SELECT {LS.q(key)} FROM {LS.q(self.side(which))}.{LS.q(self.prefix + entity)};")]

    def materialize(self, specs: list[Spec]) -> dict:
        """Everything the changeset needs, as plain JSON-able data (`--from-json` takes the same)."""
        entities = {}
        for name in entity_rules(self.platform):
            entities[name] = {w: self.entity_ids(name, w) for w in ("base", "copy")}
        out = {"entities": entities, "kinds": {}}
        for spec in specs:
            if not self.usable(spec):
                continue
            digests = {w: self.digests(spec, w) for w in ("base", "copy")}
            pairs = pair_keys(spec, list(digests["base"]), list(digests["copy"]), self.id_map)
            want = {"base": set(), "copy": set()}
            for b, c in pairs["pairs"]:
                if b != c or digests["base"][b] != digests["copy"][c]:
                    want["base"].add(b)
                    want["copy"].add(c)
            want["copy"] |= set(pairs["copy_only"])
            want["base"] |= set(pairs["base_only"])
            rows = {w: self.rows(spec, w, sorted(want[w], key=str)) for w in ("base", "copy")}
            out["kinds"][spec.name] = {
                "keys": {w: [list(k) for k in digests[w]] for w in ("base", "copy")},
                "rows": {w: [r for r in rows[w].values()] for w in ("base", "copy")},
                **({"tree": {w: self.tree(spec, w) for w in ("base", "copy")}} if spec.tree is not None else {}),
            }
        out["tables"] = self.other_tables(specs)
        if self.platform == "wordpress":
            out["languages"] = self.languages()
        return out

    def languages(self) -> dict:
        """The live site's Polylang default language (`polylang` option, `default_lang`), as the base
        holds it: the language Polylang gives a post or term the engine creates. `{}` with no Polylang."""
        if not self.has("base", "options"):
            return {}
        rows = self.sql.run(f"SELECT HEX(option_value) FROM {LS.q(self.base)}.{LS.q(self.prefix + 'options')}"
                            f" WHERE option_name = 'polylang' LIMIT 1;")
        try:
            settings = php_unserialize(decode(rows[0][0]) or "") if rows and rows[0][0] else None
        except (Unserializable, TypeError):
            settings = None
        default = settings.get("default_lang") if isinstance(settings, dict) else None
        return {"default": default} if isinstance(default, str) and default else {}

    def other_tables(self, specs: list[Spec]) -> list[dict]:
        """Tables no kind covers and no rule leaves out, whose rows differ between the two sides:
        named, with how many rows (Joomla's `extensions`: which extensions)."""
        policy = LS.POLICIES.get(self.platform, {})
        tracy_tables = policy.get("tracyTables")
        ignore = policy.get("ignoreTables", set())
        append = policy.get("appendTables", set())
        covered = COVERED[self.platform] | BOOKKEEPING[self.platform]
        listing = lambda schema: {r[0][len(self.prefix):] for r in self.sql.run(  # noqa: E731
            f"SELECT table_name FROM information_schema.tables WHERE table_schema = {LS.sql_str(schema)}"
            f" AND table_type = 'BASE TABLE' AND table_name LIKE {LS.sql_str(self.prefix.replace('_', chr(92) + '_') + '%')};")
            if r[0].startswith(self.prefix)}
        base, copy = listing(self.base), listing(self.copy)
        out = []
        for name in sorted(base | copy):
            if (name in covered or name in ignore or name in append or LS.TRACY_COPY_TABLE.match(name)
                    or (tracy_tables and tracy_tables.search(name))):
                continue
            if name not in copy or name not in base:
                out.append({"what": "table", "table": name, "change": "added" if name in copy else "removed"})
                continue
            entry = self.table_difference(name)
            if entry:
                out.append(entry)
        return out

    def table_difference(self, name: str) -> dict | None:
        cols_b, cols_c = self.table_columns("base", name), self.table_columns("copy", name)
        cols = [c for c in cols_c if c in cols_b]
        pk = [r[0] for r in self.sql.run(
            f"SELECT column_name FROM information_schema.statistics WHERE table_schema = {LS.sql_str(self.copy)}"
            f" AND table_name = {LS.sql_str(self.prefix + name)} AND index_name = 'PRIMARY' ORDER BY seq_in_index;")]
        skip = set(LS.SUBSTANCE_SKIP_COLUMNS)
        where = ""
        if self.platform == "joomla" and name == "extensions":
            listed = ", ".join(LS.sql_str(e) for e in J_EXTENSION_NOISE)
            where = f" WHERE r.element NOT IN ({listed}) AND r.element NOT LIKE 'claudecowork%'"
        digest = lambda which: ", ".join(  # noqa: E731
            f"COALESCE(MD5({self.value_sql('r.' + LS.q(c), which, self.platform == 'wordpress')}), '-')"
            for c in cols if c not in skip) or "''"
        keyed = pk if pk and all(k in cols for k in pk) else cols
        key_sql = ", ".join(f"HEX(CAST(r.{LS.q(k)} AS BINARY))" for k in keyed)
        sides = {}
        for which in ("base", "copy"):
            label = ", r.element" if (self.platform == "joomla" and name == "extensions") else ", ''"
            rows = self.sql.run(f"SELECT {key_sql}, MD5(CONCAT_WS(',', {digest(which)})){label}"
                                f" FROM {LS.q(self.side(which))}.{LS.q(self.prefix + name)} r{where};")
            sides[which] = {tuple(r[:len(keyed)]): (r[len(keyed)], r[-1]) for r in rows}
        changed = [k for k in set(sides["base"]) | set(sides["copy"])
                   if sides["base"].get(k, (None,))[0] != sides["copy"].get(k, (None,))[0]]
        if not changed:
            return None
        entry = {"what": "table", "table": name, "rows": len(changed)}
        if self.platform == "joomla" and name == "extensions":
            entry["names"] = sorted({(sides["copy"].get(k) or sides["base"].get(k))[1] for k in changed})[:50]
        return entry


def pair_keys(spec: Spec, base_keys: list, copy_keys: list, id_map: dict) -> dict:
    """Base records paired with the copy's: a base key in the copy's numbers (the id map) is the
    copy's key of the same record."""
    copy_set = set(map(tuple, copy_keys))
    pairs, base_only = [], []
    for b in map(tuple, base_keys):
        c = to_copy_key(spec, b, id_map)
        if c in copy_set:
            pairs.append((b, c))
        else:
            base_only.append(b)
    paired = {c for _, c in pairs}
    return {"pairs": pairs, "base_only": base_only, "copy_only": [c for c in copy_set if c not in paired]}


def key_entities(spec: Spec, key: tuple) -> dict[str, str | None]:
    named = dict(zip(spec.key, key))
    out = {}
    for part in spec.key:
        if part in spec.key_refs:
            ent = spec.key_refs[part]
            out[part] = ent(named) if callable(ent) else ent
        elif spec.entity and len(spec.key) == 1:
            out[part] = spec.entity
    return out


def to_copy_key(spec: Spec, key: tuple, id_map: dict) -> tuple:
    ents = key_entities(spec, key)
    out = []
    for part, value in zip(spec.key, key):
        ent = ents.get(part)
        if ent and value is not None and INT.match(str(value)):
            mapped = id_map.get(ent, {}).get(str(int(value)))
            out.append(str(mapped) if mapped is not None else str(value))
        else:
            out.append(value)
    return tuple(out)


# ── the changeset ────────────────────────────────────────────────────────────────────────────

def is_serialized(value) -> bool:
    return isinstance(value, str) and bool(re.match(r"^(a|O|s|i|b|d|C):[0-9]+[:;]|^(N;|b:[01];|i:-?[0-9]+;)", value))


def shown(value) -> dict:
    if value is None:
        return {"null": True}
    if isinstance(value, Binary):
        return {"binary": len(value.raw)}
    if isinstance(value, Placeholder):
        return {"new": value.ref}
    if isinstance(value, (list, dict, int)):
        return {"value": value}
    text = MARKER.sub(lambda m: "[new]", str(value))
    out = {"text": text[:VALUE_LIMIT]}
    if len(text) > VALUE_LIMIT:
        out["truncated"] = len(text)
    return out


def jsonable(value):
    if isinstance(value, Placeholder):
        return {"$new": value.ref}
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    return value


# ── PHP's serialized values (a WordPress option holding an array: the theme's mods) ─────────

class Unserializable(ValueError):
    """A serialized value this reader does not take whole: an object, a reference, a broken length."""


def php_unserialize(text: str):
    """PHP `unserialize` of `N;`, `b:`, `i:`, `d:`, `s:` and `a:`, as JSON-able values the way the engine's
    `json_encode` answers them: an array keyed 0..n-1 in order is a list, any other one an object. An
    `stdClass` becomes an object as JSON does; other objects, references or trailing bytes are refused."""
    data = text.encode("utf-8", "surrogateescape")

    def number(at: int, end: bytes) -> tuple[str, int]:
        stop = data.index(end, at)
        return data[at:stop].decode(), stop + 1

    def value(at: int, depth: int):
        if depth > 32:
            raise Unserializable("too deep")
        tag = data[at:at + 2]
        if data[at:at + 2] == b"N;":
            return None, at + 2
        if tag == b"b:":
            raw, at = number(at + 2, b";")
            return raw == "1", at
        if tag == b"i:":
            raw, at = number(at + 2, b";")
            return int(raw), at
        if tag == b"d:":
            raw, at = number(at + 2, b";")
            got = float(raw)
            return (int(got) if got.is_integer() and "." not in raw and "E" not in raw.upper() else got), at
        if tag == b"s:":
            size, at = number(at + 2, b":")
            if data[at:at + 1] != b'"':
                raise Unserializable("string")
            start = at + 1
            end = start + int(size)
            if data[end:end + 2] != b'";':
                raise Unserializable("string length")
            return data[start:end].decode("utf-8", "surrogateescape"), end + 2
        if tag in (b"a:", b"O:"):
            if tag == b"O:":
                size, at = number(at + 2, b":")
                end = at + 1 + int(size)
                if data[at:at + 1] != b'"' or data[end:end + 2] != b'":' or data[at + 1:end] != b"stdClass":
                    raise Unserializable("object")
                count, at = number(end + 2, b":")
            else:
                count, at = number(at + 2, b":")
            if data[at:at + 1] != b"{":
                raise Unserializable("array")
            at += 1
            pairs = []
            for _ in range(int(count)):
                key, at = value(at, depth + 1)
                if not isinstance(key, (int, str)) or isinstance(key, bool):
                    raise Unserializable("key")
                item, at = value(at, depth + 1)
                pairs.append((key, item))
            if data[at:at + 1] != b"}":
                raise Unserializable("array end")
            if tag == b"a:" and [k for k, _ in pairs] == list(range(len(pairs))):
                return [v for _, v in pairs], at + 1
            return {str(k): v for k, v in pairs}, at + 1
        raise Unserializable(f"tag {tag!r}")

    try:
        got, end = value(0, 0)
    except (ValueError, IndexError) as exc:
        raise Unserializable(str(exc)) from None
    if data[end:].strip():
        raise Unserializable("trailing bytes")
    return got


def php_literal(text: str | None):
    """A configuration.php value (`'Shop'`, `1`) as the value it is, or `Unserializable`: a single-quoted
    string with its two escapes, a double-quoted one without `$` or other escapes, an integer."""
    t = (text or "").strip()
    if re.fullmatch(r"-?[0-9]+", t):
        return int(t)
    if len(t) >= 2 and t[0] == t[-1] == "'":
        inner = t[1:-1]
        if re.search(r"(?<!\\)'", inner.replace("\\\\", "")):
            raise Unserializable("quote")
        return re.sub(r"\\([\\'])", r"\1", inner)
    if len(t) >= 2 and t[0] == t[-1] == '"' and "$" not in t and "\\" not in t:
        return t[1:-1]
    raise Unserializable("literal")


class Changeset:
    def __init__(self, platform: str, prefix: str, data: dict, id_map: dict, homes: tuple[str, str] | None,
                 files: dict | None = None, engine: dict | None = None):
        self.platform, self.prefix, self.data, self.homes = platform, prefix, data, homes
        # The live engine's template door (`template.files.*`), or None when it has none.
        self.door = template_door(engine)
        self.id_map = {e: {str(k): int(v) for k, v in m.items()} for e, m in (id_map or {}).items()}
        self.specs = [s for s in kinds(platform, prefix) if s.name in data.get("kinds", {})]
        self.files = files or {"changes": [], "config": None}
        self.items: list[dict] = []
        self.unsupported: list[dict] = []
        # A remembered number the live site no longer holds, put right (`repair_map`), and the live
        # site's records whose delete waits because they may be one of those (per kind: base keys).
        self.repairs: list[dict] = []
        self.unclear: dict[str, set[tuple]] = {}
        # A title built from fixed words (an option's label, "Additional CSS · <theme>"): those words by
        # name (`label`) and the rest (`subject`), for the dialog to say in the Owner's language.
        self.title_words: dict[str, dict] = {}
        self.repair_map()
        # entity → {copy number: live number} of every record the id map names: one of the live site's
        # records, never one to make again (`known_live`).
        self.known: dict[str, dict[int, int]] = {
            e: {v: int(k) for k, v in m.items() if INT.match(k)} for e, m in self.id_map.items()}
        # entity → {copy id: live id} of every record both sides hold; and the copy's own new ones.
        self.live_of: dict[str, dict[int, int]] = {}
        self.created: dict[str, set[int]] = {}
        for entity, sides in data.get("entities", {}).items():
            m = self.id_map.get(entity, {})
            live = {int(m.get(str(b), b)): int(b) for b in sides.get("base", [])}
            self.live_of[entity] = live
            self.created[entity] = {int(c) for c in sides.get("copy", []) if int(c) not in live}
        self.creatable: set[str] = set()
        self.texts = self._text_rules()

    def _text_rules(self) -> dict[tuple[str, str], list[tuple[str, re.Pattern]]]:
        """(table, column) → [(entity, pattern)] of the links the merge's policy follows."""
        out: dict[tuple[str, str], list] = {}
        for entity, rule in entity_rules(self.platform).items():
            for table, column, template in rule.get("texts", []):
                head, _, tail = template.partition("{id}")
                # `{{"id":{id}` in the policy is a format string: its braces doubled.
                head, tail = head.replace("{{", "{").replace("}}", "}"), tail.replace("{{", "{").replace("}}", "}")
                pattern = re.compile(re.escape(head) + r"([0-9]+)" + re.escape(tail) + ("(?![0-9])" if not tail else ""))
                out.setdefault((table, column), []).append((entity, pattern))
        return out

    # — the id map, checked against the base —
    #
    # The map says which live record each renumbered copy record is: `{live: copy}`. A Sync from live
    # before 24/10/2026 (`IdMap.clash`, fixed in 24f5c8cd29) could file a live record under the wrong
    # live number: the map said `3683 → 3741` (an auto-draft, since dropped by the live site), the live
    # site published post 3741, and the merge, naming the live record by the first remembered number
    # pointing at 3741, numbered the new post 3822 on the copy and wrote `3683 → 3822` over
    # `3683 → 3741` — so live 3741 was remembered nowhere (dev, wp-tracy-ai, 24/10/2026; the same for
    # three posts of one sync, 3759/3771/3775). Such an entry names a live number that is no record of
    # its kind in the base, and the live record it is stands unremembered in the base: paired by the
    # map alone, copy 3822 read as a new post and live 3741 as one Tracy deleted, and the push trashed
    # 3741 and made a second copy of it (25/10/2026).

    # Columns that say when a record was first made, the same on both sides once the sync brought it
    # over: with the record's own name, what tells one record from another under a wrong number.
    BORN = ("post_date_gmt", "post_date", "created", "created_time")

    def repair_map(self) -> None:
        """Remembered numbers filed under the wrong live number, put on the live record they are: in
        each kind of record, a copy record the map files under a live number that is no record of
        that kind in the base, and a base record the map names under no number and the copy holds
        under none of that kind, are one record when they alone carry one name (the kind's title
        columns and when it was made; else when it was made alone). Each such pair is used for this
        changeset and listed in `repairs`, for `record` to write into the map: the live record under
        its own number, and the number it was filed under back on what the map gave it before the
        overwrite — the copy's record under the live record's number, when the copy holds one (the
        auto-draft above), else nothing. A base record that matched by name but not alone waits
        (`unclear`): its delete is not offered."""
        kinds_data = self.data.get("kinds", {})
        entities = self.data.get("entities", {})
        for spec in self.specs:
            if (not spec.entity or len(spec.key) != 1 or spec.follows
                    or spec.report not in ("field", "media")):
                continue
            m = self.id_map.get(spec.entity)
            d = kinds_data.get(spec.name) or {}
            if not m or not d:
                continue
            base_numbers = {str(int(k[0])) for k in d["keys"]["base"] if INT.match(str(k[0]))}
            copy_numbers = {int(c) for c in entities.get(spec.entity, {}).get("copy", [])}
            dangling = {v: int(k) for k, v in m.items() if INT.match(k) and k not in base_numbers}
            if not dangling:
                continue
            pairs = pair_keys(spec, d["keys"]["base"], d["keys"]["copy"], self.id_map)
            rows = {w: {tuple(r[k] for k in spec.key): r for r in d["rows"][w]} for w in ("base", "copy")}
            copies = [c for c in pairs["copy_only"]
                      if INT.match(str(c[0])) and int(c[0]) in dangling and c in rows["copy"]]
            lives = [b for b in pairs["base_only"]
                     if INT.match(str(b[0])) and str(int(b[0])) not in m and b in rows["base"]]
            if not copies or not lives:
                continue
            matched: list[tuple[tuple, tuple]] = []
            named: set[tuple] = set()
            for alone in (False, True):
                ident = lambda row: self.identity(spec, row, alone)  # noqa: E731
                left = {c for _, c in matched}
                by_copy: dict[tuple, list] = {}
                for c in copies:
                    if c not in left and ident(rows["copy"][c]):
                        by_copy.setdefault(ident(rows["copy"][c]), []).append(c)
                done = {b for b, _ in matched}
                by_base: dict[tuple, list] = {}
                for b in lives:
                    if b not in done and ident(rows["base"][b]):
                        by_base.setdefault(ident(rows["base"][b]), []).append(b)
                for name, bs in by_base.items():
                    cs = by_copy.get(name, [])
                    if len(bs) == 1 and len(cs) == 1:
                        matched.append((bs[0], cs[0]))
                    elif cs:
                        named |= set(bs)
            for b, c in matched:
                live, copy = int(b[0]), int(c[0])
                was = dangling[copy]
                then = live if live in copy_numbers else None
                if then is None:
                    del m[str(was)]
                else:
                    m[str(was)] = then
                m[str(live)] = copy
                self.repairs.append({"entity": spec.entity, "kind": spec.kind, "live": live, "copy": copy,
                                     "was": was, "wasNow": then, "title": self.title(spec, rows["copy"][c], c)})
            self.unclear[spec.name] = named - {b for b, _ in matched}

    def identity(self, spec: Spec, row: dict, born_only: bool) -> tuple | None:
        """What a record is called and when it was made, as one value (None when it says nothing)."""
        born = tuple((c, str(row[c])) for c in self.BORN
                     if row.get(c) not in (None, "") and not str(row[c]).startswith("0000-00-00"))
        if born_only:
            return born or None
        names = tuple((c, str(row[c]).strip()) for c in spec.title if str(row.get(c) or "").strip())
        return (names + born) if names else None

    def known_live(self, spec: Spec, key: tuple) -> int | None:
        """The live number the id map gives a record of the copy, when it gives one: such a record is
        the live site's own, never made there again."""
        if not spec.entity or len(spec.key) != 1 or not INT.match(str(key[0])):
            return None
        return self.known.get(spec.entity, {}).get(int(key[0]))

    # numbers, links and the address, from the copy's terms to the live site's
    def live_id(self, entity: str | None, copy_id) -> object:
        if not entity or copy_id is None or not INT.match(str(copy_id)):
            return copy_id
        n = int(copy_id)
        if n <= 0:
            return n
        if n in self.live_of.get(entity, {}):
            return self.live_of[entity][n]
        if n in self.created.get(entity, set()):
            return Placeholder(entity, n)
        return n

    def address(self, value):
        if not self.homes or not isinstance(value, str) or self.homes[0] == self.homes[1]:
            return value
        live, copy = self.homes
        if copy not in value:
            return value
        return WP.replace_value(value.encode("utf-8"), copy.encode("utf-8"), live.encode("utf-8")).decode("utf-8")

    def to_live(self, spec: Spec, row: dict) -> dict:
        out = dict(row)
        for column, value in row.items():
            if isinstance(value, Binary) or value is None:
                continue
            if column in spec.refs:
                ent = spec.refs[column]
                ent = ent(row) if callable(ent) else ent
                if ent:
                    got = self.live_id(ent, value)
                    out[column] = got if isinstance(got, Placeholder) else str(got)
                    continue
            if column in spec.lists:
                ids = [self.live_id(spec.lists[column], v) for v in str(value).split(",") if v.strip()]
                out[column] = sorted(ids, key=lambda v: (isinstance(v, Placeholder), str(v)))
                continue
            if spec.name == "moduleAssignment" and column == "menuids":
                out[column] = self.menuids(value)
                continue
            if column in spec.texts or (spec.table, column) in self.texts:
                value = self.links(spec.table, column, value)
            if spec.address:
                value = self.address(value)
            out[column] = value
        return out

    def links(self, table: str, column: str, value: str) -> str:
        for entity, pattern in self.texts.get((table, column), []):
            def swap(m: re.Match, entity=entity) -> str:
                got = self.live_id(entity, m.group(1))
                number = got.marker() if isinstance(got, Placeholder) else str(got)
                return m.group(0)[:m.start(1) - m.start(0)] + number + m.group(0)[m.end(1) - m.start(0):]
            value = pattern.sub(swap, value)
        return value

    def menuids(self, value: str | None):
        """A module's pages (`[0]` all, `[-12]` all but 12) in the live site's menu numbers."""
        ids = json.loads(value) if value else []
        out = []
        for n in ids:
            got = self.live_id("menu", abs(int(n)))
            out.append(got if isinstance(got, Placeholder) or int(n) >= 0 else -int(got))
        return out

    @staticmethod
    def base_value(spec: Spec, column: str, value):
        """A base value in the same shape `to_live` gives the copy's."""
        if column in spec.lists:
            return sorted(str(v) for v in str(value).split(",") if v.strip()) if value is not None else []
        if spec.name == "moduleAssignment" and column == "menuids":
            return [int(n) for n in json.loads(value)] if value else []
        return value

    @staticmethod
    def same(a, b) -> bool:
        if isinstance(a, list) or isinstance(b, list):
            norm = lambda v: sorted(str(x) for x in (v or []))  # noqa: E731
            return not any(isinstance(x, Placeholder) for x in (a or [])) and norm(a) == norm(b)
        if isinstance(a, Placeholder) or isinstance(b, Placeholder):
            return False
        if isinstance(a, str) and MARKER.search(a):
            return False
        return a == b

    def worded(self, label: str, subject: str | None = None) -> str:
        """A title of fixed words, in English (logs, an older dialog), remembered by name."""
        text = LABELS[label] + (f" · {subject}" if subject else "")
        self.title_words[text] = {"label": label, **({"subject": subject} if subject else {})}
        return text

    def title(self, spec: Spec, row: dict | None, key: tuple) -> str:
        if spec.name == "postmeta":
            label = {"_thumbnail_id": "featuredImage", "_wp_page_template": "pageTemplate",
                     "_wp_attachment_image_alt": "altText"}.get((row or {}).get("meta_key"))
            subject = str((row or {}).get("post_title") or "").strip()[:200]
            return self.worded(label, subject or None) if label else subject
        if spec.kind == "option" and (row or {}).get("option_name") in OPTION_LABELS:
            return self.worded(row["option_name"])
        if spec.name == "customCss":
            return self.worded("additionalCss", str((row or {}).get('post_name') or key[0]))
        if spec.name == "themeMods":
            return self.worded("customizer", str((row or {}).get('option_name') or key[0]).removeprefix('theme_mods_'))
        if spec.name == "templateStyle":
            return self.worded("templateStyle", str((row or {}).get('title') or key[0]))
        if spec.name == "globalStyles":
            return self.worded("styles")
        if spec.name in W_THEME_ROWS or spec.name == "blockPost":
            return str((row or {}).get("post_title") or (row or {}).get("post_name") or key[0])[:200]
        for column in spec.title:
            value = (row or {}).get(column)
            if isinstance(value, str) and value.strip():
                text = value.strip()
                if spec.name == "moduleAssignment":
                    return text
                return text[:200]
        return "" if spec.name == "menuItem" else f"{spec.kind} {' '.join(str(k) for k in key)}"

    def item_id(self, spec: Spec, key: tuple, created: bool = False, suffix: str = "") -> str:
        name = spec.name if spec.name not in ("optionOther",) else "option"
        return f"{name}:{'new:' if created else ''}{':'.join(str(k) for k in key)}{suffix}"

    def engine_address(self, spec: Spec, live_key: tuple, base_row: dict | None) -> tuple[object, str | None]:
        """The `id` and `key` the engine names this record by, on the live site."""
        named = dict(zip(spec.key, live_key))
        if spec.name == "fieldValue":
            item = named["item_id"]
            if isinstance(item, Placeholder):
                return None, None
            return int(named["field_id"]) * 1_000_000_000 + int(item), None
        if spec.name == "term":
            return named["term_id"], named["taxonomy"]
        if spec.name == "option":
            return 0, named["option_name"]
        if spec.name == "postmeta":
            return named["post_id"], named["meta_key"]
        if spec.name == "menuItem" and self.platform == "wordpress":
            ident = named["ID"]
            return (ident if isinstance(ident, Placeholder) else int(ident)), (base_row or {}).get("menu")
        if spec.name in W_THEME_ROWS:
            return 0, named["post_name"]
        if spec.live_id:
            return (int(base_row[spec.live_id]) if base_row and base_row.get(spec.live_id) else None), None
        value = live_key[0]
        return (value if isinstance(value, Placeholder) else int(value)), None

    def live_key(self, spec: Spec, copy_key: tuple) -> tuple:
        ents = key_entities(spec, copy_key)
        return tuple(self.live_id(ents.get(p), v) if ents.get(p) else v for p, v in zip(spec.key, copy_key))

    # — the seeds the next Sync from live takes as base (lib/live_sync.py `seed_pushed`) —
    def seeds(self, spec: Spec, copy_key: tuple, columns: list[str], op: str, row: dict | None) -> list[dict]:
        named = {k: (int(v) if isinstance(v, str) and INT.match(v) else v) for k, v in zip(spec.key, copy_key)}
        if spec.name == "moduleAssignment":
            return [{"table": "modules_menu", "match": {"moduleid": named["id"]}, "rows": "ours"}]
        if spec.name == "fieldValue":
            return [{"table": "fields_values", "match": {"field_id": named["field_id"], "item_id": named["item_id"]},
                     "columns": ["value"]}]
        if spec.name == "term":
            out = []
            if {"name", "slug"} & set(columns) or op == "create":
                out.append({"table": "terms", "match": {"term_id": named["term_id"]},
                            "columns": [c for c in ("name", "slug") if c in columns or op == "create"],
                            **({"create": True, "entity": "terms", "id": int(named["term_id"]),
                                # WordPress numbers the new term's taxonomy row on its own: the copy's
                                # number for it, found by the term and its taxonomy on both sides.
                                "align": {"entity": "term_taxonomy",
                                          "match": {"term_id": named["term_id"], "taxonomy": named["taxonomy"]}}}
                               if op == "create" else {})})
            if {"description", "parent"} & set(columns):
                out.append({"table": "term_taxonomy", "match": {"term_id": named["term_id"], "taxonomy": named["taxonomy"]},
                            "columns": [c for c in ("description", "parent") if c in columns]})
            return out
        if spec.name == "option":
            return [{"table": "options", "match": {"option_name": named["option_name"]}, "columns": ["option_value"]}]
        if spec.name == "postmeta":
            return [{"table": "postmeta", "match": {"post_id": named["post_id"], "meta_key": named["meta_key"]},
                     "columns": ["meta_value"]}]
        if spec.name == "menuItem" and self.platform == "wordpress":
            ident = int(named["ID"])
            out = [{"table": "posts", "match": {"ID": ident},
                    "columns": [{"title": "post_title", "position": "menu_order"}[c] for c in columns
                                if c in ("title", "position")],
                    **({"create": True, "entity": "posts", "id": ident} if op == "create" else {})}]
            for c in columns:
                if c in ("type", "object", "object_id", "url", "parent"):
                    meta = "_menu_item_menu_item_parent" if c == "parent" else f"_menu_item_{c}"
                    out.append({"table": "postmeta", "match": {"post_id": ident, "meta_key": meta}, "columns": ["meta_value"]})
            if op == "delete":
                out = [{"table": "posts", "match": {"ID": ident}, "rows": "theirs"}]
            return out
        if spec.name == "menutype":
            return [{"table": "menu_types", "match": {"menutype": named["menutype"], "client_id": 0},
                     "columns": [c for c in columns if c not in ("menutype", "client_id")] or ["title"]}]
        if spec.name == "attachment":
            ident = int(named["ID"])
            return [{"table": "posts", "match": {"ID": ident}, "columns": [], "create": True, "entity": "posts", "id": ident}]
        if spec.name in W_THEME_ROWS:
            # Named by slug for the engine, by the copy's number in the copy's table.
            ident = int((row or {}).get("ID") or 0)
            if op == "delete" or not ident:
                return []
            return [{"table": "posts", "match": {"ID": ident}, "columns": ["post_content", "post_title"],
                     **({"create": True, "entity": "posts", "id": ident} if op == "create" else {})}]
        pk = spec.key[0]
        ident = int(named[pk])
        db_columns = [c for c in columns if c not in spec.lists and c not in spec.extra]
        out = []
        if op == "delete" and row is None:
            out.append({"table": spec.table, "match": {pk: ident}, "rows": "theirs"})
        else:
            out.append({"table": spec.table, "match": {pk: ident}, "columns": db_columns,
                        **({"create": True, "entity": spec.entity, "id": ident} if op == "create" else {})})
        if self.platform == "wordpress" and spec.name == "post" and ({"categories", "tags"} & set(columns)):
            # Only the categories and tags it writes: the post's other terms (Polylang's language and
            # translation group, a plugin's taxonomy) were never sent, and taken as base they would read
            # as removed on the live site and leave the copy (#105).
            out.append({"table": "term_relationships", "match": {"object_id": ident}, "rows": "ours",
                        "taxonomies": ["category", "post_tag"]})
        return out

    # — building —
    def build(self) -> dict:
        kinds_data = self.data.get("kinds", {})
        prepared = {}
        # Pass 1: which records the copy has alone, so a reference to one is a placeholder only when
        # that record is being created too.
        for spec in self.specs:
            d = kinds_data[spec.name]
            pairs = pair_keys(spec, d["keys"]["base"], d["keys"]["copy"], self.id_map)
            rows = {w: {tuple(r[k] for k in spec.key): r for r in d["rows"][w]} for w in ("base", "copy")}
            prepared[spec.name] = (spec, pairs, rows)
            if spec.create is not None and spec.entity and spec.name not in ("moduleAssignment",):
                for c in pairs["copy_only"]:
                    if self.known_live(spec, c) is None and not self.translation_refused(spec, None, rows["copy"].get(c)):
                        self.creatable.add(f"{spec.entity}:{int(c[0])}")
            if spec.name == "attachment":
                for c in pairs["copy_only"]:
                    row = rows["copy"].get(c) or {}
                    if self.known_live(spec, c) is None and self.media_file(row.get("file")):
                        self.creatable.add(f"posts:{int(c[0])}")
            if spec.name == "term":
                for c in pairs["copy_only"]:
                    if not self.translation_refused(spec, None, rows["copy"].get(c)):
                        self.creatable.add(f"terms:{int(c[0])}")
        for spec in self.specs:
            spec_, pairs, rows = prepared[spec.name]
            self.build_kind(spec, pairs, rows, kinds_data[spec.name])
        self.build_files()
        self.unsupported += self.data.get("tables", [])
        self.menu_items_made()
        self.order()
        # The dialog's groups (contract §2): records by what happens to them; files and settings apart,
        # a PHP file in its own group that needs its own OK; every removal under "remove".
        groups = {sp.name: sp.group for sp in self.specs}
        for item in self.items:
            if item["op"] == "delete":
                item["group"] = "remove"
            elif not item.get("group"):
                item["group"] = groups.get(item["spec"]) or ("files" if item["op"] == "upload" else GROUPS[item["op"]])
            item["what"] = self.what_of(item)
            item.update(self.title_words.get(item["title"], {}))
        for entry in self.unsupported:
            entry.update(self.title_words.get(entry.get("title") or entry.get("name") or "", {}))
        return self.result()

    def what_of(self, item: dict) -> str:
        """What a change is, as the dialog names it in the Owner's words (`push.what.*`)."""
        spec = item.get("spec")
        if spec in ("post", "blockPost"):
            post_type = (item.get("write") or {}).get("post_type") or self.post_type_of(spec, item)
            if spec == "blockPost":
                return "navigation" if post_type == "wp_navigation" else "pattern"
            return "page" if post_type == "page" else "post"
        if spec == "term":
            return {"post_tag": "tag", "nav_menu": "menu"}.get(str(item.get("key")), "category")
        return WHAT.get(spec, str(item.get("kind")))

    def post_type_of(self, spec: str, item: dict) -> str | None:
        rows = self.data.get("kinds", {}).get(spec, {}).get("rows", {})
        copy_id, live_id = str((item.get("copyKey") or [None])[0]), str(item.get("liveId"))
        for row in rows.get("copy", []):
            if str(row.get("ID")) == copy_id:
                return row.get("post_type")
        for row in rows.get("base", []):
            if str(row.get("ID")) == live_id:
                return row.get("post_type")
        return None

    def media_file(self, path) -> dict | None:
        if not isinstance(path, str) or not path:
            return None
        rel = path if path.startswith("wp-content/uploads/") else "wp-content/uploads/" + path.lstrip("/")
        return next((f for f in self.files.get("changes", []) if f["path"] == rel and f["change"] == "added"), None)

    def blocked_by(self, *values) -> list[str]:
        """The placeholders among `values` (in lists and text too) that name no record this push creates."""
        found = []
        for value in values:
            for v in (value if isinstance(value, list) else list(value.values()) if isinstance(value, dict) else [value]):
                if isinstance(v, (list, dict)):
                    found += self.blocked_by(v)
                elif isinstance(v, Placeholder):
                    found.append(v.ref)
                elif isinstance(v, str):
                    found += [f"{m.group(1)}:{m.group(2)}" for m in MARKER.finditer(v)]
        return found

    def depends(self, refs: list[str]) -> tuple[list[str], list[str]]:
        ok, missing = [], []
        for ref in refs:
            (ok if ref in self.creatable else missing).append(ref)
        return ok, missing

    def build_kind(self, spec: Spec, pairs: dict, rows: dict, data: dict) -> None:
        if spec.report == "themeMods":
            return self.theme_mods(spec, pairs, rows)
        compared = lambda row: [c for c in row if c not in spec.key]  # noqa: E731
        for b, c in pairs["pairs"]:
            base_row, copy_row = rows["base"].get(b), rows["copy"].get(c)
            if base_row is None or copy_row is None:
                continue  # same digest, same number: nothing changed
            if self.translation_refused(spec, base_row, copy_row):
                self.refuse_translation(spec, copy_row, c, "update")
                continue
            after = self.to_live(spec, copy_row)
            changed, unsupported = {}, []
            for column in compared(copy_row):
                if column in spec.ignore or column not in base_row:
                    continue
                before = self.base_value(spec, column, base_row.get(column))
                if self.same(after.get(column), before):
                    continue
                if isinstance(copy_row.get(column), Binary):
                    unsupported.append(column)
                elif column in spec.write and not (spec.address and is_serialized(copy_row.get(column))):
                    changed[column] = (before, after.get(column))
                else:
                    unsupported.append(column)
            title = self.title(spec, copy_row, c)
            if spec.report != "field":
                if changed or unsupported:
                    self.report(spec, title, c, "update", copy_row)
                continue
            for column in unsupported:
                self.unsupported.append({"what": "field", "kind": spec.kind, "title": title, "field": column})
            if not changed:
                continue
            live_key = tuple(b)
            ident, key = self.engine_address(spec, live_key, base_row)
            trashed = spec.trash and spec.trash[0] in changed and str(changed[spec.trash[0]][1]) == spec.trash[1]
            if trashed:
                self.delete_item(spec, c, live_key, base_row, copy_row, title, ident, key)
                continue
            self.update_item(spec, c, live_key, base_row, changed, title, ident, key)
            # The live record is in the trash and the copy's is not: the push brings it back (an
            # Undo trashed a post the push made, and the copy kept it). The same live record, out of
            # the trash, never a second one beside it — shown as what it is to the Owner, an
            # addition, not a change of "Status" and a `__trashed` slug (#117).
            if (spec.trash and str(base_row.get(spec.trash[0])) == spec.trash[1] and self.items
                    and self.items[-1].get("copyKey") == list(c) and self.items[-1]["spec"] == spec.name):
                self.items[-1]["group"] = "add"
        for c in self.copy_order(spec, pairs["copy_only"], data):
            copy_row = rows["copy"].get(c)
            if copy_row is None:
                continue
            title = self.title(spec, copy_row, c)
            if spec.report == "record":
                self.report(spec, title, c, "create", copy_row)
                continue
            if spec.report == "setting":
                self.unsupported.append({"what": "setting", "table": spec.table, "name": title, "change": "added",
                                         "reason": "permalink" if c[0] in W_NEVER_OPTIONS else "no-safe-action"})
                continue
            known = None if spec.follows else self.known_live(spec, c)
            if known is not None:
                # The live site's own record (the id map says which), under a number the base lacks:
                # made again, it would be a second copy of it on the live site.
                self.unsupported.append({"what": "record", "kind": spec.kind, "title": title, "op": "create",
                                         "reason": "no-safe-action", "why": "live-record", "liveId": known})
                continue
            if spec.report == "media":
                self.upload_item(spec, c, copy_row, title)
                continue
            if spec.follows:
                # A created module's pages: written once the module is there.
                after = self.to_live(spec, copy_row)
                if after.get("menuids"):
                    self.update_item(spec, c, (Placeholder(spec.entity, int(c[0])),), None,
                                     {col: (None, after.get(col)) for col in spec.write}, title,
                                     Placeholder(spec.entity, int(c[0])), None, created=True)
                continue
            if spec.create is None:
                self.unsupported.append({"what": "record", "kind": spec.kind, "title": title, "op": "create",
                                         "reason": "cannot-create"})
                continue
            if spec.trash and str(copy_row.get(spec.trash[0])) == spec.trash[1]:
                continue  # made and trashed on the copy: nothing to add
            if self.translation_refused(spec, None, copy_row):
                self.refuse_translation(spec, copy_row, c, "create")
                continue
            self.create_item(spec, c, copy_row, title)
        for b in pairs["base_only"]:
            base_row = rows["base"].get(b)
            if base_row is None or not spec.delete_absent or spec.report != "field":
                if spec.report == "record" and base_row is not None and spec.delete_absent:
                    self.report(spec, self.title(spec, base_row, b), b, "delete", base_row)
                if spec.report == "setting" and base_row is not None:
                    self.unsupported.append({"what": "setting", "table": spec.table,
                                             "name": self.title(spec, base_row, b), "change": "removed",
                                             "reason": "permalink" if b[0] in W_NEVER_OPTIONS else "no-safe-action"})
                continue
            if spec.trash and str(base_row.get(spec.trash[0])) == spec.trash[1]:
                continue  # already in the live site's trash
            title = self.title(spec, base_row, b)
            if tuple(b) in self.unclear.get(spec.name, ()):
                # It may be the copy's record the id map files under a number the live site lost.
                self.unsupported.append({"what": "record", "kind": spec.kind, "title": title, "op": "delete",
                                         "reason": "no-safe-action", "why": "live-record-unclear",
                                         "liveId": b[0]})
                continue
            if spec.trash is None and not (self.platform == "wordpress" and spec.name in ("menuItem", *W_THEME_ROWS)):
                self.unsupported.append({"what": "record", "kind": spec.kind, "title": title, "op": "delete",
                                         "reason": "no-trash"})
                continue
            ident, key = self.engine_address(spec, tuple(b), base_row)
            self.delete_item(spec, to_copy_key(spec, b, self.id_map), tuple(b), base_row, None, title, ident, key)
        if spec.tree is not None:
            self.tree_moves(spec, data, pairs, rows)

    # — Polylang's languages and translation groups —
    #
    # Polylang files a post's language and its translation group (`post_translations`: language →
    # post) as terms, and a term's the same way (`term_language`, `term_translations`). The live
    # engine's `content.update` writes neither, and its `content.language` door is no safe write for a
    # push: `content.get` reads no language or group back, so the base's cannot be checked before the
    # write (`pll_save_post_translations` sets the whole group, unlinking a translation the customer
    # linked since), nor taken back on Undo, and a language the live site lacks is made there. Sent
    # anyway, a translation reached the live site in the default language and unlinked, and the sync
    # after the push dropped the copy's own language and group rows (#105). So a post or term whose
    # language or group Tracy changed — a new translation, a new link, another language — is named
    # and not sent; one in a group Tracy left alone (a French title renamed) goes as before.
    TRANSLATED = {"post": "posts", "term": "terms"}

    def translation_state(self, spec: Spec, row: dict, live: bool) -> tuple[str | None, dict]:
        """A row's language and translation group (language → number, the copy's in live numbers, a
        record this push creates by its marker); a group of one member is no group."""
        entity = self.TRANSLATED[spec.name]
        language = row.get("language")
        language = language.removeprefix("pll_") if isinstance(language, str) and language else None
        group = {}
        raw = row.get("translations")
        try:
            parsed = php_unserialize(raw) if isinstance(raw, str) and raw else None
        except Unserializable:
            parsed = None  # unreadable to Polylang too: no group
        for lang, member in (parsed.items() if isinstance(parsed, dict) else ()):
            if lang == "sync" or not INT.match(str(member)) or int(member) <= 0:
                continue
            got = self.live_id(entity, member) if live else int(member)
            group[lang] = got.marker() if isinstance(got, Placeholder) else int(got)
        return language, (group if len(group) > 1 else {})

    def translation_refused(self, spec: Spec, base_row: dict | None, copy_row: dict | None) -> bool:
        """Whether Tracy changed the record's Polylang language or translation group. A record made on
        the copy: in a group, or in a language other than the one Polylang gives it on the live site."""
        if self.platform != "wordpress" or spec.name not in self.TRANSLATED or copy_row is None:
            return False
        language, group = self.translation_state(spec, copy_row, live=True)
        if base_row is None:
            return bool(group) or (language is not None and language != self.data.get("languages", {}).get("default"))
        return (language, group) != self.translation_state(spec, base_row, live=False)

    def refuse_translation(self, spec: Spec, row: dict, key: tuple, op: str) -> None:
        kind = (str(row.get("post_type") or "post") if spec.name == "post"
                else {"post_tag": "tag"}.get(str(row.get("taxonomy")), "category"))
        self.unsupported.append({"what": "record", "kind": kind, "title": self.title(spec, row, key), "op": op,
                                 "reason": "translation-group"})

    @staticmethod
    def copy_order(spec: Spec, keys: list, data: dict) -> list:
        """The copy's own records in the order they are made: a tree's in the copy's order (each is
        made last of its siblings, so made in order they need no move), others by number."""
        place = {}
        for at, r in enumerate((data.get("tree") or {}).get("copy", [])):
            place[str(r["id"])] = at
        number = lambda k: [int(v) if isinstance(v, str) and INT.match(v) else 0 for v in k]  # noqa: E731
        return sorted(keys, key=lambda k: (place.get(str(k[0]), -1), number(k), [str(v) for v in k]))

    def theme_mods(self, spec: Spec, pairs: dict, rows: dict) -> None:
        """The active theme's mods, one serialized option: key by key, in the live site's numbers and
        address. The engine writes the option whole, so the write is the live site's value (the base's)
        with Tracy's keys set, and goes ahead only while the live site still holds the base's value
        whole; a key whose value this cannot read (a PHP object) is named and the rest still go."""
        for c in pairs["copy_only"]:
            row = rows["copy"].get(c) or {}
            # A theme the copy runs and the live site does not: its mods are not the live site's.
            self.unsupported.append({"what": "setting", "table": spec.table, "name": self.title(spec, row, c),
                                     "change": "added", "reason": "theme-switched"})
        for b, c in pairs["pairs"]:
            base_row, copy_row = rows["base"].get(b), rows["copy"].get(c)
            if base_row is None or copy_row is None:
                continue
            title = self.title(spec, copy_row, c)
            try:
                before = php_unserialize(base_row.get("value") or "")
                after = php_unserialize(copy_row.get("value") or "")
            except Unserializable:
                self.unsupported.append({"what": "setting", "table": spec.table, "name": title, "change": "modified",
                                         "reason": "unreadable"})
                continue
            # What the live site answers for the whole option, as it reads it (an empty array is `[]`).
            expect = before
            before, after = ({} if v == [] else v for v in (before, after))
            if not isinstance(before, dict) or not isinstance(after, dict):
                self.unsupported.append({"what": "setting", "table": spec.table, "name": title, "change": "modified",
                                         "reason": "unreadable"})
                continue
            merged = dict(before)
            changed = {}
            for key in list(after) + [k for k in before if k not in after]:
                value = self.mod_to_live(key, after.get(key)) if key in after else None
                if key in after and self.same_json(value, before.get(key)) and key in before:
                    continue
                if key not in after:
                    merged.pop(key, None)
                    changed[key] = (before.get(key), None)
                    continue
                merged[key] = value
                changed[key] = (before.get(key), value)
            if not changed:
                continue
            refs = self.blocked_by(merged)
            deps, missing = self.depends(refs)
            if missing:
                self.unsupported.append({"what": "record", "kind": "option", "title": title, "op": "update",
                                         "reason": "depends-on-unsupported", "on": missing[:10]})
                continue
            name = b[0]
            self.items.append({
                "id": f"option:{name}", "kind": "option", "spec": "themeMods", "op": "update", "group": "settings",
                "title": title, "liveId": 0, "key": name, "ident": 0, "copyKey": list(c),
                "fields": {k: {"before": shown(v[0]) if v[0] is not None else {"null": True},
                               "after": shown(v[1]) if v[1] is not None else {"null": True}} for k, v in changed.items()},
                "write": {"value": jsonable(merged)}, "expect": {"value": expect},
                "dependsOn": sorted(set(deps)),
                "seed": [{"table": "options", "match": {"option_name": name}, "columns": ["option_value"]}],
            })

    def mod_to_live(self, key: str, value):
        """One theme mod of the copy in the live site's terms: a record it names, its address."""
        def number(entity: str, v):
            if v is None or isinstance(v, bool) or not INT.match(str(v)) or int(v) <= 0:
                return v
            got = self.live_id(entity, v)
            # The type the theme stored it in (`i:12;` or `s:2:"12";`), the record's live number.
            return got if isinstance(got, Placeholder) else (str(got) if isinstance(v, str) else int(got))
        def walk(v, path):
            entity = LS._WORDPRESS.theme_mod_entity(path)
            if entity:
                return number(entity, v)
            if isinstance(v, str):
                return self.address(v)
            if isinstance(v, list):
                return [walk(x, path + (i,)) for i, x in enumerate(v)]
            if isinstance(v, dict):
                return {k: walk(x, path + (k,)) for k, x in v.items()}
            return v
        return walk(value, (key,))

    @staticmethod
    def same_json(a, b) -> bool:
        if isinstance(a, Placeholder) or isinstance(b, Placeholder):
            return False
        return json.dumps(jsonable(a), sort_keys=False) == json.dumps(jsonable(b), sort_keys=False)

    def report(self, spec: Spec, title: str, key: tuple, op: str, row: dict | None = None) -> None:
        if spec.report == "record":
            self.unsupported.append({"what": "record", "kind": str((row or {}).get("post_type") or spec.kind),
                                     "title": title, "op": op, "reason": "no-safe-action"})
        elif spec.report == "setting":
            never = key and key[0] in W_NEVER_OPTIONS
            self.unsupported.append({"what": "setting", "table": spec.table, "name": title, "change": "modified",
                                     "reason": "permalink" if never else "no-safe-action"})
        elif spec.report == "media":
            self.unsupported.append({"what": "media", "title": title, "change": "modified"})

    def expect_of(self, spec: Spec, columns, base_row: dict) -> dict:
        out = {}
        for column in columns:
            value = base_row.get(column)
            if self.platform == "wordpress" and spec.name == "post" and column == "categories":
                out["post_category"] = sorted(int(v) for v in str(value or "").split(",") if v.strip())
            elif self.platform == "wordpress" and spec.name == "post" and column == "tags":
                out["tags_input"] = sorted(v for v in str(base_row.get("tag_names") or "").split(",") if v)
            elif spec.name == "moduleAssignment":
                out[column] = value or "[]"
            else:
                out[spec.engine.get(column, column)] = None if isinstance(value, Binary) else value
        return out

    def write_of(self, spec: Spec, columns, live_row: dict, copy_row: dict) -> dict:
        out = {}
        for column in columns:
            if self.platform == "wordpress" and spec.name == "post" and column in ("categories", "tags"):
                slugs = copy_row.get("category_slugs" if column == "categories" else "tag_slugs")
                out[column] = [s for s in str(slugs or "").split(",") if s]
            elif spec.name == "moduleAssignment":
                out[column] = live_row.get(column) or []
            else:
                out[spec.engine.get(column, column)] = live_row.get(column)
        return out

    def update_item(self, spec, copy_key, live_key, base_row, changed: dict, title, ident, key, created=False):
        live_row = {c: a for c, (_, a) in changed.items()}
        copy_row = None
        columns = list(changed)
        data_rows = self.data["kinds"][spec.name]["rows"]["copy"]
        copy_row = next((r for r in data_rows if tuple(r[k] for k in spec.key) == tuple(copy_key)), {})
        # A part or a template is written whole: its content and its title go with any change, and
        # each is checked against the live site as the push read it.
        sent = list(columns)
        if spec.name in W_THEME_ROWS and copy_row:
            after = self.to_live(spec, copy_row)
            for column in ("post_content", "post_title"):
                if column not in live_row:
                    live_row[column] = after.get(column)
                    sent.append(column)
        write = self.write_of(spec, sent, live_row, copy_row)
        refs = self.blocked_by(*write.values(), *live_row.values(), ident)
        deps, missing = self.depends(refs)
        item_id = self.item_id(spec, copy_key, created=created)
        if missing:
            self.unsupported.append({"what": "record", "kind": spec.kind, "title": title, "op": "update",
                                     "reason": "depends-on-unsupported", "on": missing[:10]})
            return
        self.items.append({
            "id": item_id, "kind": spec.kind, "spec": spec.name, "op": "update", "title": title,
            "liveId": None if isinstance(ident, Placeholder) else ident, "key": key,
            "ident": jsonable(ident), "copyKey": list(copy_key),
            "fields": {c: {"before": shown(changed[c][0]), "after": shown(changed[c][1])} for c in columns},
            "write": {c: jsonable(v) for c, v in write.items()},
            "expect": {} if created or base_row is None else self.expect_of(spec, sent, base_row),
            "bodyRevision": (self.platform == "wordpress" and "post_content" in sent
                             and spec.name in ("post", "customCss", "blockPost", "globalStyles", *W_THEME_ROWS)),
            "restore": self.restore_of(spec, columns, base_row),
            "dependsOn": sorted(set(deps)), "seed": self.seeds(spec, copy_key, columns, "update", copy_row),
        })

    def menu_of(self, copy_row: dict):
        """The menu a new menu item goes in, on the live site: True when the live site has it, the id of
        this push's item that makes it, or None when neither (WordPress: no menu at all, its term gone)."""
        if self.platform == "wordpress":
            return True if copy_row.get("menu") else None
        menutype = copy_row.get("menutype")
        # Every menu the live read holds is in its keys (its rows are only the ones that differ).
        live = self.data.get("kinds", {}).get("menutype", {}).get("keys", {}).get("base", [])
        if any(list(k) == [menutype] or (k and str(k[0]) == str(menutype)) for k in live):
            return True
        kinds = self.data.get("kinds", {})
        if "menutype" not in kinds:
            return True  # no read of the live menus to go by (an older read): as before, nothing refused
        # A menu the copy has and the live site does not: this push makes it first (`menu_items_made`
        # names the item instead when that menu is not made after all).
        if any(k and str(k[0]) == str(menutype) for k in kinds["menutype"].get("keys", {}).get("copy", [])):
            spec = next(sp for sp in self.specs if sp.name == "menutype")
            return self.item_id(spec, (menutype,))  # made under its name, as `menutype:<name>`
        return None

    def menu_items_made(self) -> None:
        """A new menu item waiting for a menu this push was to make, which it does not make (refused
        or held): named, never written into a menu the live site does not have (#119)."""
        ids = {i["id"] for i in self.items}
        for item in [i for i in self.items if i.get("spec") == "menuItem" and i["op"] == "create"]:
            gone = [d for d in item.get("dependsOn", []) if d.startswith("menutype:") and d not in ids]
            if gone:
                self.items.remove(item)
                self.unsupported.append({"what": "record", "kind": item["kind"], "title": item["title"],
                                         "op": "create", "reason": "depends-on-unsupported", "on": ["menu"]})

    def restore_of(self, spec: Spec, columns, base_row: dict | None) -> dict:
        """What an Undo writes back where the live site's read of the record cannot be written as it is
        (a post's categories are read as ids and written as slugs)."""
        out = {}
        if base_row and self.platform == "wordpress" and spec.name == "post":
            for column, slugs in (("categories", "category_slugs"), ("tags", "tag_slugs")):
                if column in columns:
                    out[column] = [x for x in str(base_row.get(slugs) or "").split(",") if x]
        return out

    def create_item(self, spec: Spec, copy_key: tuple, copy_row: dict, title: str):
        after = self.to_live(spec, copy_row)
        columns = [c for c in spec.create if c in copy_row or c in spec.lists]
        if self.platform == "joomla" and spec.name in ("category", "tag", "menuItem"):
            columns = [c for c in columns if c != "parent_id"] + ["parent_id"]
        write = self.write_of(spec, columns, after, copy_row)
        # A tree node placed under its parent (Joomla), a term under its parent term: the parent first.
        refs = self.blocked_by(*write.values(), *(after.get(c) for c in columns))
        deps, missing = self.depends(refs)
        if spec.name == "menuItem":
            # Never a menu item in a menu the live site does not have and this push does not make (the
            # customer deleted it, #119): the live engine refused it, or wrote one nobody could see.
            menu = self.menu_of(copy_row)
            if menu is None:
                missing = [*missing, "menu"]
            elif menu is not True:
                deps = [*deps, menu]
        if missing:
            self.unsupported.append({"what": "record", "kind": spec.kind, "title": title, "op": "create",
                                     "reason": "depends-on-unsupported", "on": missing[:10]})
            return
        key = None
        if spec.name == "term":
            key = copy_row.get("taxonomy")
        elif spec.name == "menuItem" and self.platform == "wordpress":
            key = copy_row.get("menu")
        elif spec.name == "option":
            key = copy_row.get("option_name")
        elif spec.name == "postmeta":
            key = copy_row.get("meta_key")
        elif spec.name in W_THEME_ROWS:
            key = copy_row.get("post_name")
        ident = 0
        if spec.name == "postmeta":
            ident = self.live_id("posts", copy_row.get("post_id"))
            deps_extra, missing_extra = self.depends(self.blocked_by(ident))
            if missing_extra:
                return
            deps += deps_extra
        entity = spec.entity if spec.name not in ("postmeta", "option", "menutype") else None
        self.items.append({
            "id": self.item_id(spec, copy_key, created=spec.entity is not None or spec.name == "term"),
            "kind": spec.kind, "spec": spec.name, "op": "create", "title": title, "liveId": None, "key": key,
            "ident": jsonable(ident), "copyKey": list(copy_key),
            "creates": (f"{spec.entity}:{int(copy_key[0])}" if entity
                        else "terms:" + str(int(copy_key[0])) if spec.name == "term"
                        # The live site numbers the part's row: remembered as the copy's, so the next
                        # Sync from live reads it as the same row, not a second one.
                        else f"posts:{int(copy_row['ID'])}" if spec.name in W_THEME_ROWS else None),
            "fields": {c: {"after": shown(after.get(c))} for c in columns if c not in ("category_slugs",)},
            "write": {c: jsonable(v) for c, v in write.items()},
            # A meta or an option the base did not hold: written only while the live site still has none
            # (the writer reads it first; one the customer added since is theirs, never written over).
            # A part or a template likewise: only while the live site still shows the theme's own file.
            "expect": {"$absent": True} if spec.name in ("postmeta", "option", *W_THEME_ROWS) else {},
            "dependsOn": sorted(set(deps)), "seed": self.seeds(spec, copy_key, columns, "create", copy_row),
        })

    def delete_item(self, spec, copy_key, live_key, base_row, copy_row, title, ident, key):
        columns = [c for c in spec.write if c in base_row and c not in spec.lists]
        seed = self.seeds(spec, copy_key, [spec.trash[0]] if spec.trash and copy_row else [], "delete", copy_row)
        if spec.name in W_THEME_ROWS:
            # The row the copy no longer has, by the copy's number for the live site's row: the live
            # site's (none, once handed back) becomes the base's.
            live = int(base_row.get("ID") or 0)
            mine = self.id_map.get("posts", {}).get(str(live), live)
            seed = [{"table": "posts", "match": {"ID": int(mine)}, "rows": "theirs"}] if live else []
        self.items.append({
            "id": self.item_id(spec, live_key), "kind": spec.kind, "spec": spec.name, "op": "delete", "title": title,
            "liveId": ident, "key": key, "ident": ident, "copyKey": list(copy_key),
            "fields": ({spec.trash[0]: {"before": shown(base_row.get(spec.trash[0])), "after": shown(spec.trash[1])}}
                       if spec.trash else {}),
            "write": {}, "expect": self.expect_of(spec, columns, base_row),
            "trash": list(spec.trash) if spec.trash else None,
            "dependsOn": [],
            "seed": seed,
        })

    def upload_item(self, spec: Spec, copy_key: tuple, copy_row: dict, title: str):
        found = self.media_file(copy_row.get("file"))
        if not found:
            self.unsupported.append({"what": "media", "title": title, "change": "added", "reason": "file-not-in-copy"})
            return
        if found.get("size", 0) > MEDIA_LIMIT:
            self.unsupported.append({"what": "media", "title": title, "change": "added", "reason": "too-large"})
            return
        found["handled"] = True
        ident = int(copy_key[0])
        self.items.append({
            "id": f"media:new:{ident}", "kind": "media", "spec": "attachment", "op": "upload", "title": title,
            "liveId": None, "key": None, "ident": 0, "copyKey": list(copy_key), "creates": f"posts:{ident}",
            "path": found["path"], "blob": found["blob"], "baseBlob": None, "size": found.get("size", 0),
            "fields": {"path": {"after": shown(found["path"])}}, "write": {}, "expect": {}, "dependsOn": [],
            "seed": self.seeds(spec, copy_key, [], "create", copy_row),
        })

    # — a Joomla tree: siblings in the copy's order (`move` items) —
    def tree_moves(self, spec: Spec, data: dict, pairs: dict, rows: dict) -> None:
        tree = data.get("tree") or {}
        m = self.id_map.get(spec.entity, {})
        present = {int(r["id"]) for r in tree.get("copy", [])}

        def groups(side: str):
            out: dict[tuple, list[int]] = {}
            for r in tree.get(side, []):
                ident = int(r["id"])
                parent = int(r["parent_id"] or 0)
                if side == "base":
                    ident = int(m.get(str(ident), ident))
                    parent = int(m.get(str(parent), parent))
                key = (parent,) + tuple(str(r.get(c) or "") for c in spec.tree)
                out.setdefault(key, []).append(ident)
            return out

        base_groups, copy_groups = groups("base"), groups("copy")
        base_parent = {i: g[0] for g, ids in base_groups.items() for i in ids}
        base_prev = {i: (ids[at - 1] if at else 0) for g, ids in base_groups.items() for at, i in enumerate(ids)}
        copy_titles = {}
        for r in rows["copy"].values():
            copy_titles[int(r["id"])] = self.title(spec, r, (r["id"],))
        created = self.created.get(spec.entity, set())
        for g, order in sorted(copy_groups.items()):
            # What the live site will hold once the creates ran: its siblings that the copy still has,
            # then the new ones, each made last of its parent's children, in the copy's order.
            before = [i for i in base_groups.get(g, []) if i in present]
            before += [i for i in order if i in created and f"{spec.entity}:{i}" in self.creatable]
            if order == before:
                continue
            # Siblings already in their place at the head of the list stay; from the first that is
            # not, each follows the one before it, as the copy has them.
            start = 0
            while start < min(len(order), len(before)) and order[start] == before[start]:
                start += 1
            for at in range(start, len(order)):
                ident = order[at]
                if ident in created and f"{spec.entity}:{ident}" not in self.creatable:
                    continue
                prev = order[at - 1] if at > 0 else 0
                parent = g[0]
                live_self = self.live_id(spec.entity, ident)
                write = {"parent_id": jsonable(self.live_id(spec.entity, parent)),
                         "move_after": jsonable(self.live_id(spec.entity, prev)) if prev else 0}
                deps, missing = self.depends(self.blocked_by(live_self, self.live_id(spec.entity, parent),
                                                             self.live_id(spec.entity, prev) if prev else None))
                title = copy_titles.get(ident) or f"{spec.kind} {ident}"
                if missing:
                    continue
                exists = ident not in created
                was_parent = base_parent.get(ident)
                live_parent_before = self.live_id(spec.entity, was_parent) if was_parent is not None else None
                self.items.append({
                    "id": self.item_id(spec, (ident,), created=not exists, suffix=":move"),
                    "kind": spec.kind, "spec": spec.name, "op": "move", "title": title,
                    "liveId": None if isinstance(live_self, Placeholder) else live_self, "key": None,
                    "ident": jsonable(live_self), "copyKey": [str(ident)],
                    "fields": {"position": {"before": shown({"parent": jsonable(live_parent_before)}) if exists else {"null": True},
                                            "after": shown({"parent": write["parent_id"], "after": write["move_after"]})}},
                    "write": write,
                    "expect": ({"parent_id": str(live_parent_before)} if exists and live_parent_before is not None else {}),
                    "restore": ({"parent_id": jsonable(live_parent_before),
                                 "move_after": jsonable(self.live_id(spec.entity, base_prev.get(ident, 0)))
                                 if base_prev.get(ident) else 0} if exists and live_parent_before is not None else {}),
                    "dependsOn": sorted(set(deps)),
                    "seed": [{"table": spec.table, "match": {"id": ident}, "columns": ["parent_id"]}],
                })

    # — files: media the engine uploads, the rest named —
    def build_files(self) -> None:
        config = self.files.get("config")
        if config:
            self.config_items(config)
        handled = {i["path"] for i in self.items if i.get("op") == "upload"}
        attached = set(self.data.get("attached") or [])
        # A picture WordPress is given again makes its sizes again: they are never sent either.
        replaced = {c["path"] for c in self.files.get("changes", []) if self.platform == "wordpress"
                    and c["change"] == "modified" and c["path"].removeprefix("wp-content/uploads/") in attached}
        variants = self.upload_variants(handled | replaced)
        roots = FILE_ROOTS[self.platform]
        for change in self.files.get("changes", []):
            path = change["path"]
            if path in handled or path in variants or LS.tracy_owned(self.platform, path):
                continue
            if path == LS.CONFIG_FILES.get(self.platform) or path.startswith(TRACY_MEDIA):
                continue
            what = {"what": "file", "path": path, "change": change["change"]}
            base_name = path.rsplit("/", 1)[-1]
            if any(path.startswith(d) for d in NEVER_DIRS):
                self.unsupported.append({**what, "reason": "excluded"})
                continue
            if "120000" in (change.get("mode"), change.get("baseMode")) or "160000" in (change.get("mode"), change.get("baseMode")):
                self.unsupported.append({**what, "reason": "symlink"})
                continue
            if base_name in SERVER_FILES:
                self.unsupported.append({**what, "reason": "server-config"})
                continue
            root, refusal = self.template_target(change)
            if self.platform == "joomla" and DOOR_FILE.match(path) and change["change"] != "deleted":
                # The keys `template.siteSettings` writes go through it, compared key by key; a file
                # with more than those (or no base to compare with) goes whole through the template door.
                if self.door_item(change, whole_file=root is not None):
                    continue
                if root is None:
                    self.unsupported.append({**what, "reason": "engine-has-no-file-write"})
                    continue
            if root is not None:
                self.template_item(change, root)
                continue
            # A template's file the door does not take: named, unless `media.upload` writes it (phase 2).
            if refusal and not path.startswith(FILE_ROOTS[self.platform]):
                self.unsupported.append({**what, "reason": refusal, **(
                    {"size": max(change.get("size", 0), change.get("baseSize", 0)), "limit": self.door["maxFileBytes"]}
                    if refusal == "too-large" else {})})
                continue
            lower = path.lower()
            php = lower.endswith(PHP_EXTENSIONS)
            if not path.startswith(roots):
                extension = path.startswith(EXTENSION_MEDIA[self.platform])
                self.unsupported.append({**what, "reason": "extension-file" if extension else "engine-has-no-file-write"})
                continue
            if change["change"] == "deleted":
                if self.platform == "joomla" and path.startswith(DELETABLE) and lower.endswith(IMAGE_EXTENSIONS):
                    self.file_item(change, op="delete")
                else:
                    self.unsupported.append({**what, "reason": "engine-cannot-delete-file"})
                continue
            if change.get("size", 0) > MEDIA_LIMIT:
                self.unsupported.append({**what, "reason": "too-large", "size": change.get("size", 0),
                                         "limit": MEDIA_LIMIT})
                continue
            if self.platform == "wordpress":
                # Every file `media.upload` is given under uploads/ becomes a Media Library item: only the
                # bytes of a picture the library already holds there are replaced (its sizes made again).
                rel = path[len("wp-content/uploads/"):]
                if php or change["change"] != "modified" or rel not in attached:
                    self.unsupported.append({**what, "reason": "not-a-media-item"})
                    continue
            self.file_item(change, op="upload", php=php)

    def template_target(self, change: dict) -> tuple[dict | None, str | None]:
        """Where `template.files.write` would put this change: `(root, None)` when the live site's
        template door takes it; `(None, reason)` for a template's or theme's file it does not take
        (`engine-has-no-file-write`, `template-files-off`, `not-a-live-template`, `not-a-template-file`,
        `php-disabled`, `too-large`); `(None, None)` for a file of no template."""
        path, door = change["path"], self.door
        root = None
        if door and door.get("enabled"):
            root = max((r for r in door["roots"] if path.startswith(r["path"] + "/")),
                       key=lambda r: len(r["path"]), default=None)
        if root is None:
            if not path.startswith(TEMPLATE_PREFIXES[self.platform]):
                return None, None
            if door is None:
                return None, "engine-has-no-file-write"
            # A template the live site has not installed (Joomla), a theme it does not run (WordPress).
            return None, "template-files-off" if not door.get("enabled") else "not-a-live-template"
        segments = path.split("/")
        name = segments[-1]
        extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if (len(path.encode("utf-8", "surrogateescape")) > TEMPLATE_MAX_PATH or len(segments) > TEMPLATE_MAX_DEPTH
                or not all(TEMPLATE_SEGMENT.match(s) for s in segments) or name.lower() in TEMPLATE_DENIED
                or extension not in door["extensions"] or TEMPLATE_RUNNABLE_INNER.search(name)):
            return None, "not-a-template-file"
        if extension == "php":
            if not root["php"]:
                # A template's media folder is served as it is: PHP never goes there through this door.
                return None, "not-a-template-file"
            if not door["php"]:
                return None, "php-disabled"
        limit = door["maxFileBytes"]
        # Neither the new bytes nor the live file they replace (its undo copy) may pass the door's limit.
        if (change["change"] != "deleted" and change.get("size", 0) > limit) or \
                (change["change"] != "added" and change.get("baseSize", 0) > limit):
            return None, "too-large"
        return root, None

    def template_item(self, change: dict, root: dict) -> None:
        """A template's or theme's own file, through the live site's template door
        (`template.files.write`, compare-and-set on the base's blob, undone by `template.files.undo`)."""
        op = "delete" if change["change"] == "deleted" else "upload"
        self.file_item(change, op=op, php=change["path"].lower().endswith(".php"), root=root)

    def file_item(self, change: dict, op: str, php: bool = False, root: dict | None = None) -> None:
        """A file the engine writes (`media.upload`, or `template.files.write` under a template root)
        or removes (`media.delete`, `template.files.write` delete), checked by its bytes: the live file
        must still be the base's (`baseBlob`; absent for a new one)."""
        path = change["path"]
        group = "remove" if op == "delete" else ("php" if php else "files")
        self.items.append({
            "id": f"file:{path}", "kind": "file", "spec": "file", "op": op, "group": group, "title": path,
            "liveId": None, "key": None, "ident": 0, "copyKey": [path],
            # Through the template door: the root it lands in; a parent theme's file is overwritten by
            # an update of that theme, which the owner is told.
            **({"door": "template", "root": root["path"]} if root else {}),
            **({"warning": "parent-theme"} if root and root.get("kind") == "parent-theme" else {}),
            # What a setting naming this file waits for (a T4 logo the same push uploads).
            **({"creates": f"file:{path}"} if op == "upload" else {}),
            "path": path, "blob": change.get("blob"), "baseBlob": change.get("baseBlob"),
            "size": change.get("size", 0), "php": php, "change": change["change"],
            "fields": {"file": {**({"before": {"size": change.get("baseSize", 0)}} if change.get("baseBlob") else {}),
                                **({"after": {"size": change.get("size", 0)}} if op != "delete" else {})}},
            "write": {}, "expect": {}, "dependsOn": [], "seed": [],
        })

    # — settings with a door —
    def config_items(self, config: dict) -> None:
        """configuration.php / wp-config.php: Joomla's site name and description go through
        `site.identity`; every other setting that differs is named, never written."""
        file = LS.CONFIG_FILES.get(self.platform)
        names = self.config_changes(config)
        if self.platform != "joomla":
            for name in names:
                self.unsupported.append({"what": "setting", "file": file, "name": name, "reason": "no-safe-action"})
            return
        b, c = LS.joomla_settings(config.get("base") or ""), LS.joomla_settings(config.get("copy") or "")
        changed = {}
        for name in names:
            if name in SITE_IDENTITY and b is not None and c is not None:
                try:
                    before = php_literal(b.get(name)) if name in b else ""
                    after = php_literal(c.get(name)) if name in c else ""
                except Unserializable:
                    self.unsupported.append({"what": "setting", "file": file, "name": name, "reason": "unreadable"})
                    continue
                if name == "sitename_pagetitles":
                    try:
                        before, after = int(before or 0), int(after or 0)
                    except (TypeError, ValueError):
                        self.unsupported.append({"what": "setting", "file": file, "name": name, "reason": "unreadable"})
                        continue
                changed[name] = (before, after)
                continue
            self.unsupported.append({"what": "setting", "file": file, "name": name, "reason": "no-safe-action"})
        if not changed:
            return
        self.items.append({
            "id": "setting:siteIdentity", "kind": "siteIdentity", "spec": "siteIdentity", "op": "update",
            "group": "settings", "title": self.worded("globalConfiguration"), "liveId": None, "key": None, "ident": 0,
            "copyKey": [file], "path": file,
            "fields": {SITE_IDENTITY_LABELS[n]: {"before": shown(v[0]), "after": shown(v[1])} for n, v in changed.items()},
            "names": sorted(changed),
            "write": {n: v[1] for n, v in changed.items()}, "expect": {n: v[0] for n, v in changed.items()},
            "dependsOn": [], "seed": [],
        })

    def door_item(self, change: dict, whole_file: bool = False) -> bool:
        """A T4 site profile (`templates/<t>/local/etc/site/<profile>.json`), or the favicon file beside
        them: the keys `template.siteSettings` writes, as one set, compared with the base's values
        first; the file's other keys named. False when the file is not one this can read — and, when
        the template door can take the file whole (`whole_file`), when the base has no such file or
        the copy changed other keys too: then the file goes whole, nothing of it named."""
        m = DOOR_FILE.match(change["path"])
        template, profile = m.group(1), m.group(2)
        framework = change.get("framework")
        try:
            copy = json.loads(change.get("text") or "")
            base = json.loads(change["baseText"]) if change.get("baseText") else ({} if profile == FAVICON_FILE else None)
        except ValueError:
            return False
        if not isinstance(copy, dict) or (base is not None and not isinstance(base, dict)) or framework not in ("t4", "t3", "joomla"):
            return False
        if base is None:
            if whole_file:
                return False
            # A profile no file of the live site held: T4 falls back to its base theme, which this
            # copy does not hold either — no base to compare with.
            self.unsupported.append({"what": "file", "path": change["path"], "change": change["change"],
                                     "reason": "base-unknown"})
            return True
        if profile == FAVICON_FILE:
            keys = SITE_KEYS if framework == "t4" else OTHER_KEYS
        elif framework == "t4":
            keys = T4_KEYS
        else:
            return False
        changed, other = {}, []
        for key in sorted(set(base) | set(copy)):
            if base.get(key) == copy.get(key):
                continue
            value = copy.get(key, "")
            if key in keys and isinstance(value, str) and isinstance(base.get(key, ""), str):
                changed[key] = (base.get(key, ""), value)
            else:
                other.append(key)
        if other and whole_file:
            return False
        for key in other:
            self.unsupported.append({"what": "setting", "file": change["path"], "name": key, "reason": "no-safe-action"})
        if not changed:
            return True
        uploads = [i["path"] for i in self.items if i.get("op") == "upload" and i.get("path")]
        depends = sorted({f"file:{p}" for p in uploads for _b, a in changed.values() if p in a})
        by_profile = profile != FAVICON_FILE
        write = ({"profiles": {profile: {k: a for k, (_b, a) in changed.items()}}} if by_profile
                 else {"fields": {k: a for k, (_b, a) in changed.items()}})
        self.items.append({
            "id": f"templateSettings:{template}:{profile}", "kind": "templateSettings", "spec": "templateSettings",
            "op": "update", "group": "settings", "title": f"{template} › {profile}", "liveId": None,
            "key": template, "ident": 0, "copyKey": [change["path"]], "path": change["path"], "blob": change.get("blob"),
            "framework": framework, "profile": profile if by_profile else None,
            "fields": {k: {"before": shown(b), "after": shown(a)} for k, (b, a) in changed.items()},
            "write": {"template": template, **write},
            "expect": {k: b for k, (b, _a) in changed.items()},
            "dependsOn": depends, "seed": [],
        })
        return True

    def upload_variants(self, handled: set) -> set:
        """The sizes WordPress makes of a picture it is given (`name-300x200.jpg`): made again on the
        live site by `media.upload`, never sent."""
        out = set()
        for path in handled:
            stem, dot, ext = path.rpartition(".")
            pattern = re.compile(re.escape(stem) + r"-[0-9]+x[0-9]+(?:-[a-z0-9]+)?\." + re.escape(ext) + "$")
            out |= {c["path"] for c in self.files.get("changes", []) if pattern.match(c["path"])}
        return out

    def config_changes(self, config: dict) -> list[str]:
        base, copy = config.get("base"), config.get("copy")
        if base is None or copy is None or base == copy:
            return []
        if self.platform == "joomla":
            b, c = LS.joomla_settings(base), LS.joomla_settings(copy)
            if b is None or c is None:
                return ["configuration.php"]
            return sorted(n for n in set(b) | set(c) if n not in LS.JOOMLA_ENVIRONMENT_SETTINGS and b.get(n) != c.get(n))
        scanned = [WP.scan_config(t) for t in (base, copy)]
        if any(s is None for s in scanned):
            return ["wp-config.php"]
        values = [{d.name: d.value for d in s[0]} for s in scanned]
        return sorted(n for n in set(values[0]) | set(values[1])
                      if not WP.environment_constant(n) and values[0].get(n) != values[1].get(n))

    # — order: what a write needs first —
    def order(self) -> None:
        rank = {"upload": 0, "create": 1, "update": 2, "move": 3, "delete": 4}
        spec_rank = {s.name: i for i, s in enumerate(self.specs)}
        by_id = {i["id"]: i for i in self.items}
        creates = {i["creates"]: i["id"] for i in self.items if i.get("creates")}
        for item in self.items:
            # Each dependency a record this push creates (`creates`), or an item of this push named by
            # its id (a menu made under its name, `menu_of`).
            item["dependsOn"] = sorted({creates.get(d, d) for d in item["dependsOn"]
                                        if (creates.get(d) or (d if d in by_id else None)) not in (None, item["id"])})
        # Only replacement pairs change order: a confirmed trash must free the exact address
        # before the new record asks the CMS to allocate it. Other removals keep their old order.
        for item in self.items:
            if item["op"] != "create":
                continue
            values = item.get("write", {})
            slug = values.get("post_name") if self.platform == "wordpress" else values.get("alias")
            if not slug:
                continue
            for old in self.items:
                if old["op"] != "delete" or old["kind"] != item["kind"]:
                    continue
                expected = old.get("expect", {})
                if self.platform == "wordpress":
                    post_type = values.get("post_type")
                    # Hierarchical/custom post types have CMS-specific scopes. Conservative extra
                    # dependencies within one type are harmless; never couple unrelated types.
                    same_scope = post_type == self.post_type_of(old["spec"], old)
                    if post_type == "page":
                        same_scope = same_scope and values.get("post_parent", "0") == expected.get("post_parent", "0")
                    match = same_scope and slug == expected.get("post_name")
                else:
                    scope = {"article": ("catid",), "contact": ("catid",),
                             "category": ("parent_id", "extension"), "menuItem": ("parent_id", "menutype", "language")}.get(item["kind"], ())
                    match = slug == expected.get("alias") and all(values.get(k) == expected.get(k) for k in scope)
                if match:
                    item["dependsOn"] = sorted(set(item["dependsOn"]) | {old["id"]})
                    item.setdefault("replaces", []).append(old["id"])
                    # Joomla keeps aliases occupied in trash. Name the conflict before writing
                    # instead of silently allocating another URL or permanently deleting content.
                    if self.platform == "joomla":
                        item["conflict"] = {"reason": "changed-on-live", "fields": ["alias"]}
                        old["conflict"] = {"reason": "changed-on-live", "fields": ["alias"]}
        done: list[dict] = []
        placed: set[str] = set()
        seq = {i["id"]: at for at, i in enumerate(self.items)}
        # Moves in the order they were worked out: each follows the sibling placed before it.
        pending = sorted(self.items, key=lambda i: (rank[i["op"]], 0 if i["op"] == "move" else spec_rank.get(i["spec"], 99),
                                                    seq[i["id"]]))
        while pending:
            progressed = False
            rest = []
            for item in pending:
                if all(d in placed for d in item["dependsOn"]):
                    done.append(item)
                    placed.add(item["id"])
                    progressed = True
                else:
                    rest.append(item)
            if not progressed:
                # A cycle (two records naming each other): named, not written.
                for item in rest:
                    self.unsupported.append({"what": "record", "kind": item["kind"], "title": item["title"],
                                             "op": item["op"], "reason": "circular"})
                break
            pending = rest
        self.items = done
        del by_id

    def mark_kept(self, kept: list) -> None:
        """The places a Sync from live kept as the copy's although the live site changed them too
        (`sync/kept.json`, every applied sync's `kept`: Tracy wins on the copy): pushing them would write
        over the customer's change on the live site, so each such item is a conflict, shown and never
        written, until the two sides agree there (then the item is gone: nothing differs)."""
        places: dict[tuple, set] = {}
        whole_tables: set[str] = set()
        # A file, or a setting of the configuration file, both sides changed (the file merge's `kept`).
        paths: set[str] = set()
        settings: dict[str, set] = {}
        for k in kept or []:
            if k.get("kind") == "file" and isinstance(k.get("path"), str):
                paths.add(k["path"])
            elif k.get("kind") == "setting" and isinstance(k.get("path"), str) and isinstance(k.get("setting"), str):
                settings.setdefault(k["path"], set()).add(k["setting"])
        for item in self.items:
            path = item.get("path")
            if path in paths and item.get("spec") in ("file", "templateSettings", "attachment"):
                item["conflict"] = {"reason": "changed-on-both", "fields": ["file"]}
            elif item.get("spec") == "siteIdentity" and settings.get(path):
                hit = sorted(set(item.get("names", [])) & settings[path])
                if hit:
                    item["conflict"] = {"reason": "changed-on-both", "fields": [SITE_IDENTITY_LABELS[n] for n in hit]}
        # The copy's name of each row the sync named by number (`KEPT_NAMES`): the push's seeds name it so.
        names: dict[tuple, tuple] = {}
        for table, rows in (self.data.get("keptNames") or {}).items():
            pk, natural = KEPT_NAMES.get(self.platform, {}).get(table, (None, ()))
            for row in rows if pk else []:
                if all(row.get(c) is not None for c in (pk, *natural)):
                    names[(table, str(row[pk]))] = tuple(sorted((c, str(row[c])) for c in natural))
        for k in kept or []:
            table, key = k.get("table"), k.get("key")
            if not isinstance(table, str):
                continue
            bare = table[len(self.prefix):] if table.startswith(self.prefix) else table
            if k.get("kind") == "table" and not isinstance(key, dict):
                whole_tables.add(bare)
                continue
            if not isinstance(key, dict):
                continue
            ident = (bare, tuple(sorted((str(a), str(b)) for a, b in key.items())))
            places.setdefault(ident, set()).add(k.get("column") or "*")
            pk = KEPT_NAMES.get(self.platform, {}).get(bare, (None,))[0]
            if pk and list(key) == [pk] and (bare, str(key[pk])) in names:
                places.setdefault((bare, names[(bare, str(key[pk]))]), set()).add(k.get("column") or "*")
        if not places and not whole_tables:
            return
        for item in self.items:
            hits = []
            for seed in item.get("seed", []):
                ident = (seed["table"], tuple(sorted((str(a), str(b)) for a, b in seed["match"].items())))
                hit = {"*"} if seed["table"] in whole_tables else places.get(ident)
                if hit:
                    found = self.kept_fields(item, seed, hit)
                    if found is not None:
                        hits.append(found)
            if hits:
                item["conflict"] = {"reason": "changed-on-both", "fields": sorted(set().union(*hits))}

    @staticmethod
    def kept_fields(item: dict, seed: dict, hit: set) -> list[str] | None:
        """The fields of `item` a kept place of one of its seeds names, or None when it names none of
        what the item writes there. A whole row kept: every field the item writes."""
        written = set(item.get("write", {})) | set(item.get("fields", {}))
        if "*" in hit:
            return sorted(written)
        columns = set(seed.get("columns") or [])
        direct = hit & written
        if not direct and not hit & columns:
            return None
        # The active theme's mods are written whole: every mod the push would set is the clash.
        if item.get("spec") == "themeMods":
            return sorted(item.get("fields", {}))
        named = set(direct)
        for column in (hit & columns) - written:
            field = KEPT_FIELDS.get(column)
            meta = str(seed["match"].get("meta_key") or "")
            if item.get("spec") == "menuItem" and seed["table"] == "postmeta" and meta.startswith("_menu_item_"):
                field = {"menu_item_parent": "parent"}.get(meta[len("_menu_item_"):], meta[len("_menu_item_"):])
            if field in written:
                named.add(field)
        return sorted(named)

    def result(self) -> dict:
        # The template door's limits, for the writer's batches (`template.files.write`).
        door = {"templateFiles": {k: self.door[k] for k in TEMPLATE_LIMITS}} if self.door and self.door.get("enabled") else {}
        return counted({"ok": True, "platform": self.platform, "items": self.items, "unsupported": self.unsupported,
                        **({"repairs": self.repairs} if self.repairs else {}), **door})


def counted(changeset: dict) -> dict:
    """A changeset with its counts and flags worked out from its items."""
    items, unsupported = changeset["items"], changeset["unsupported"]
    counts = {op: sum(1 for i in items if i["op"] == op) for op in ("create", "update", "delete", "move", "upload")}
    for group in ("files", "settings", "php"):
        counts[group] = sum(1 for i in items if i.get("group") == group)
    counts["conflicts"] = sum(1 for i in items if i.get("conflict"))
    counts["unsupported"] = len(unsupported)
    counts["items"] = len(items)
    return {**changeset, "counts": counts, "limit": LIMIT, "overLimit": len(items) > LIMIT,
            "hasDeletes": any(i["op"] == "delete" for i in items),
            "hasPhp": any(i.get("group") == "php" for i in items)}


# ── PHP files: a lint for the live site's PHP before any is offered ─────────────────────────

def lint_command(php: str | None) -> list[str] | None:
    """The argv that lints PHP read on stdin for this PHP version: `TRACY_PHP_LINT` (a JSON argv, a
    stand-in or a host's own), else the PHP image provision runs that version's sites on, with no
    network. None when there is no image for that version."""
    given = os.environ.get("TRACY_PHP_LINT")
    if given:
        argv = json.loads(given)
        return [str(a).replace("{php}", php or "") for a in argv] if isinstance(argv, list) and argv else None
    if not php or not re.match(r"^[0-9]+\.[0-9]+", php):
        return None
    sys.path.insert(0, str(HERE.parent / "provision"))
    try:
        import php_matrix  # noqa: E402
        image = php_matrix.image_for_php(".".join(php.split(".")[:2]))
    except (ImportError, ValueError):
        return None
    return ["docker", "run", "--rm", "-i", "--network", "none", "--pull", "missing", "--entrypoint", "php", image, "-l"]


def lint(changeset: dict, repo: str, php: str | None) -> dict:
    """Each PHP file of the changeset linted (`php -l`) from the bytes the copy holds (its blob), on
    the live site's PHP: one that does not pass, or that cannot be linted, is named instead of offered."""
    argv = lint_command(php)
    keep, moved = [], []
    for item in changeset["items"]:
        if item.get("group") != "php":
            keep.append(item)
            continue
        reason = None
        if argv is None:
            reason = "php-lint-unavailable"
        else:
            try:
                data = LS.git(repo, "cat-file", "blob", item["blob"])
                done = subprocess.run(argv, input=data, capture_output=True, timeout=120)
                if done.returncode != 0:
                    reason = "php-lint-failed"
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
                reason = "php-lint-unavailable"
        if reason:
            moved.append({"what": "file", "path": item["path"], "change": item.get("change", "modified"),
                          "reason": reason, **({"php": php} if php else {})})
        else:
            item["lint"] = {"ok": True, "php": php}
            keep.append(item)
    gone = {i["id"] for i in changeset["items"]} - {i["id"] for i in keep}
    for item in keep:
        if any(d in gone for d in item.get("dependsOn", [])):
            item["dependsOn"] = [d for d in item["dependsOn"] if d not in gone]
    return counted({**changeset, "items": keep, "unsupported": changeset["unsupported"] + moved})


GROUPS = {"create": "add", "upload": "add", "update": "change", "move": "change", "delete": "remove"}


def preview_answer(changeset: dict, preview_id: str, sync: dict | None, live_read_at: str | None,
                   engine: dict | None) -> dict:
    items = []
    # Listed up to ANSWER_ITEMS, what Apply can write before what it leaves (conflicts), each in its
    # own order: a preview of 500 conflicts and one change still shows that change. Only what is
    # shown is reordered; Apply reads the changeset itself.
    listed = [i for i in changeset["items"] if not i.get("conflict")] + \
        [i for i in changeset["items"] if i.get("conflict")]
    for item in listed[:ANSWER_ITEMS]:
        group = item.get("group") or GROUPS[item["op"]]
        items.append({"id": item["id"], "kind": item["kind"], "op": item["op"], "group": group,
                      "title": item["title"], "liveId": item["liveId"], "fields": item["fields"],
                      "dependsOn": item["dependsOn"],
                      **{name: item[name] for name in ("what", "label", "subject") if name in item},
                      # A file: its name and size, never its bytes; whether it is new on the live site.
                      **({"path": item["path"], "size": item.get("size", 0), "change": item.get("change")}
                         if item.get("spec") in ("file", "attachment") else {}),
                      **({"lint": item["lint"]} if item.get("lint") else {}),
                      # A parent theme's file: an update of that theme writes over it.
                      **({"warning": item["warning"]} if item.get("warning") else {}),
                      **({"conflict": item["conflict"]} if item.get("conflict") else {})})
    # What Apply can write, by group, over the WHOLE changeset: the items above stop at ANSWER_ITEMS,
    # and 500 conflicts listed first would otherwise hide the one change after them.
    pushable = {group: 0 for group in ("add", "change", "remove", "files", "settings", "php")}
    for item in changeset["items"]:
        if not item.get("conflict"):
            group = item.get("group")
            pushable[group if group in pushable else GROUPS.get(item["op"], "change")] += 1
    nothing = not changeset["items"] and not changeset["unsupported"]
    # The Sync from live that ran first, its whole answer (tracy-web records it as a sync of its own).
    sync_summary = sync
    return {"ok": True, "state": "nothing" if nothing else "ready", "previewId": preview_id,
            "platform": changeset["platform"], "liveReadAt": live_read_at, "sync": sync_summary,
            "counts": changeset["counts"], "limit": changeset["limit"], "overLimit": changeset["overLimit"],
            "hasDeletes": changeset["hasDeletes"], "hasPhp": changeset.get("hasPhp", False),
            "items": items, "itemsTotal": len(changeset["items"]), "pushable": pushable,
            "conflictsTotal": sum(1 for i in changeset["items"] if i.get("conflict")),
            "unsupported": changeset["unsupported"][:ANSWER_UNSUPPORTED],
            "unsupportedTotal": len(changeset["unsupported"]), "engine": engine or {},
            # Remembered numbers put right for this preview (`Changeset.repair_map`), written on apply.
            **({"repairs": changeset["repairs"]} if changeset.get("repairs") else {})}


# ── after a push: the id map and what the next sync takes as base ────────────────────────────

def record(changeset: dict, result: dict, id_map_path: Path, pushed_path: Path, undo: bool) -> dict:
    """The numbers the live site gave the records the push created (`created`, `<entity>:<copy id>` →
    live id) join the id map; every written item's places join `pushed.json` for the next merge."""
    written = {w["id"] for w in result.get("written", result.get("restored", []))}
    created = result.get("created", {})
    id_map = json.loads(id_map_path.read_text()) if id_map_path.exists() else {}
    added = repaired = 0
    # The remembered numbers the changeset found under a live number the live site no longer holds
    # (`Changeset.repair_map`): filed under the live record they are, so the next Sync from live
    # brings that record's edits to the copy's record too. Knowledge, not a write: kept on an Undo.
    for fix in changeset.get("repairs", []):
        m = id_map.setdefault(fix["entity"], {})
        was, live, copy = str(int(fix["was"])), str(int(fix["live"])), int(fix["copy"])
        if live in m and int(m[live]) != copy:
            continue  # the map moved on since: what it says now stands
        if was in m and int(m[was]) == copy:
            if fix.get("wasNow") is None:
                del m[was]
            else:
                m[was] = int(fix["wasNow"])
        if m.get(live) != copy:
            m[live] = copy
            repaired += 1
    if not undo:
        for ref, live in created.items():
            entity, _, copy_id = ref.partition(":")
            if entity and copy_id.isdigit() and live is not None:
                id_map.setdefault(entity, {})[str(int(live))] = int(copy_id)
                added += 1
    pushed = json.loads(pushed_path.read_text()) if pushed_path.exists() else {"records": []}
    pushed.setdefault("records", [])
    pushed.setdefault("files", [])
    pushed.setdefault("settings", [])
    for item in changeset["items"]:
        if item["id"] not in written:
            continue
        # A file the push sent (or a door file a setting wrote): the next merge takes the live site's
        # version of it while the copy still holds what was sent; after an Undo the copy's stays.
        if item.get("path") and "blob" in item and item.get("spec") in ("file", "templateSettings"):
            pushed["files"] = [f for f in pushed["files"] if f.get("path") != item["path"]]
            pushed["files"].append({"path": item["path"], "ours": item["blob"], "side": "theirs" if undo else "ours"})
        if item.get("spec") == "siteIdentity":
            for name in item.get("names", []):
                pushed["settings"] = [x for x in pushed["settings"] if (x.get("path"), x.get("setting")) != (item["path"], name)]
                pushed["settings"].append({"path": item["path"], "setting": name, "side": "theirs" if undo else "ours"})
        for seed in item.get("seed", []):
            if undo:
                seed = {"table": seed["table"], "match": seed["match"], "rows": "theirs"}
            pushed["records"].append({**seed, "from": seed.get("from", "ours")} if "rows" not in seed else seed)
    write_private(id_map_path, id_map)
    write_private(pushed_path, pushed)
    return {"ok": True, "idMapAdded": added, "idMapRepaired": repaired, "pushed": len(pushed["records"])}


def write_private(path: Path, value) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False))
    tmp.chmod(0o600)
    tmp.replace(path)


# ── files ────────────────────────────────────────────────────────────────────────────────────

def file_changes(repo: str, base_rev: str, copy_rev: str) -> dict:
    """What the copy's sealed webroot changed against the live site's last read: path, change, blobs
    and size; and the configuration file of both sides."""
    out = LS.git(repo, "diff", "--raw", "-z", "--no-renames", "--no-abbrev", base_rev, copy_rev)
    parts = out.split(b"\0")
    changes = []
    i = 0
    while i + 1 < len(parts):
        meta, path = parts[i].decode(), parts[i + 1].decode("utf-8", "surrogateescape")
        i += 2
        if not meta.startswith(":"):
            continue
        old_mode, new_mode, old, new, status = meta[1:].split(" ")[:5]
        change = {"A": "added", "M": "modified", "D": "deleted", "T": "modified"}.get(status[0], "modified")

        def size_of(oid: str) -> int:
            try:
                return int(LS.git(repo, "cat-file", "-s", oid).strip())
            except subprocess.CalledProcessError:
                return 0
        size = size_of(new) if change != "deleted" else 0
        entry = {"path": path, "change": change, "blob": None if change == "deleted" else new,
                 "baseBlob": None if change == "added" else old, "size": size,
                 "baseSize": size_of(old) if change != "added" else 0,
                 "mode": None if change == "deleted" else new_mode, "baseMode": None if change == "added" else old_mode}
        door = DOOR_FILE.match(path)
        if door and change != "deleted":
            # A T4 site profile or the favicon file: what `template.siteSettings` would read, both sides.
            entry["text"] = LS.git(repo, "cat-file", "blob", new).decode("utf-8", "surrogateescape")
            template, profile = door.group(1), door.group(2)
            for at in ([path] + ([f"templates/{template}/etc/site/{profile}.json"] if profile != FAVICON_FILE else [])):
                try:
                    entry["baseText"] = LS.git(repo, "show", f"{base_rev}:{at}").decode("utf-8", "surrogateescape")
                    break
                except subprocess.CalledProcessError:
                    continue
            try:
                manifest = LS.git(repo, "show", f"{copy_rev}:templates/{template}/templateDetails.xml").decode(
                    "utf-8", "surrogateescape")
                entry["framework"] = "t4" if re.search(r"<t4\b", manifest) else ("t3" if re.search(r"<t3\b", manifest) else "joomla")
            except subprocess.CalledProcessError:
                entry["framework"] = None
        changes.append(entry)
    platform_config = {}
    for side, rev in (("base", base_rev), ("copy", copy_rev)):
        for name in LS.CONFIG_FILES.values():
            try:
                platform_config.setdefault(name, {})[side] = LS.git(repo, "show", f"{rev}:{name}").decode(
                    "utf-8", "surrogateescape")
            except subprocess.CalledProcessError:
                pass
    return {"changes": changes, "configs": platform_config}


# ── entry ────────────────────────────────────────────────────────────────────────────────────

def option_home(sql: LS.Sql, schema: str, prefix: str) -> str | None:
    value = WP.option_value(sql, schema, prefix, "home")
    return value.strip() if value and value.strip() else None


def run_changeset(args) -> dict:
    id_map = json.loads(Path(args.id_map).read_text()) if args.id_map and Path(args.id_map).exists() else {}
    kept = json.loads(Path(args.kept).read_text()) if args.kept and Path(args.kept).exists() else None
    files = {"changes": [], "config": None}
    if args.repo and args.base_rev and args.copy_rev:
        found = file_changes(args.repo, args.base_rev, args.copy_rev)
        files["changes"] = found["changes"]
        files["config"] = found["configs"].get(LS.CONFIG_FILES[args.platform])
    if args.from_json:
        data = json.loads(Path(args.from_json).read_text())
        homes = tuple(data["homes"]) if data.get("homes") else None
        id_map = data.get("idMap", id_map)
        if "files" in data:
            files = data["files"]
        prefix = data.get("prefix", args.prefix or "")
    else:
        client = json.loads(os.environ.get("TRACY_SYNC_SQL", "null") or "null")
        if not isinstance(client, list) or not client:
            return {"ok": False, "code": "NO_SQL_CLIENT"}
        sql = LS.Sql(client)
        try:
            homes = None
            if args.platform == "wordpress":
                live, copy = option_home(sql, args.base_schema, args.prefix), option_home(sql, args.copy_schema, args.prefix)
                homes = (live, copy) if live and copy else None
            source = SqlSource(sql, args.base_schema, args.copy_schema, args.platform, args.prefix, id_map, homes)
            data = source.materialize(kinds(args.platform, args.prefix))
            if kept:
                data["keptNames"] = source.kept_names(kept)
            if args.platform == "wordpress":
                data["attached"] = source.attached([c["path"] for c in files["changes"] if c["change"] == "modified"])
        finally:
            sql.close()
        prefix = args.prefix
    engine = None
    if args.engine and Path(args.engine).exists():
        try:
            engine = json.loads(Path(args.engine).read_text() or "null")
        except ValueError:
            engine = None
    elif args.from_json:
        engine = data.get("engine")
    built = Changeset(args.platform, prefix, data, id_map, homes, files, engine)
    answer = built.build()
    if kept is not None:
        built.mark_kept(kept)
        answer = built.result()
    answer["homes"] = list(homes) if homes else None
    return answer


def parse(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="op", required=True)
    cs = sub.add_parser("changeset")
    cs.add_argument("--platform", required=True, choices=["joomla", "wordpress"])
    cs.add_argument("--prefix", default="")
    cs.add_argument("--base-schema")
    cs.add_argument("--copy-schema")
    cs.add_argument("--id-map")
    cs.add_argument("--repo")
    cs.add_argument("--base-rev")
    cs.add_argument("--copy-rev")
    cs.add_argument("--from-json")
    cs.add_argument("--engine", help="the live engine as `live-write.mjs info` read it (its template door)")
    cs.add_argument("--kept", help="the places syncs kept as the copy's though the live site changed them (sync/kept.json)")
    an = sub.add_parser("answer")
    an.add_argument("--changeset", required=True)
    an.add_argument("--preview-id", required=True)
    an.add_argument("--sync")
    an.add_argument("--engine")
    rec = sub.add_parser("record")
    for flag in ("--changeset", "--result", "--id-map", "--pushed"):
        rec.add_argument(flag, required=True)
    rec.add_argument("--undo", action="store_true")
    li = sub.add_parser("lint")
    li.add_argument("--changeset", required=True)
    li.add_argument("--repo", required=True)
    li.add_argument("--php", default="")
    return parser.parse_args(argv)


def main(argv) -> int:
    args = parse(argv)
    try:
        if args.op == "changeset":
            answer = run_changeset(args)
        elif args.op == "lint":
            path = Path(args.changeset)
            answer = lint(json.loads(path.read_text()), args.repo, args.php or None)
            write_private(path, answer)
            answer = {"ok": True, "php": answer["counts"]["php"],
                      "refused": sum(1 for u in answer["unsupported"] if str(u.get("reason", "")).startswith("php-lint"))}
        elif args.op == "answer":
            changeset = json.loads(Path(args.changeset).read_text())
            sync = json.loads(Path(args.sync).read_text()) if args.sync and Path(args.sync).exists() else None
            engine = json.loads(Path(args.engine).read_text()) if args.engine and Path(args.engine).exists() else None
            answer = preview_answer(changeset, args.preview_id, sync, (sync or {}).get("liveReadAt"), engine)
        else:
            answer = record(json.loads(Path(args.changeset).read_text()), json.loads(Path(args.result).read_text()),
                            Path(args.id_map), Path(args.pushed), args.undo)
    except Exception as exc:  # noqa: BLE001 — every stop is answered, without a value of the site
        import traceback
        traceback.print_exc()
        print(json.dumps({"ok": False, "code": "CHANGESET_FAILED", "detail": LS.failure_line(exc)}))
        return 1
    default = lambda v: jsonable(v) if isinstance(v, Placeholder) else None  # noqa: E731
    try:
        print(json.dumps(answer, ensure_ascii=False, default=default))
    except UnicodeEncodeError:
        # A value read as bytes that are not UTF-8 (a lone surrogate): written escaped, never lost.
        print(json.dumps(answer, default=default))
    # A refusal of its own (no SQL client) is a stop like a failure: the caller reads its answer.
    return 1 if answer.get("ok") is False else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
