#!/usr/bin/env python3
"""Pack one backup point as the zip a person downloads (plan todo-backup-export, decision 3).

Called by `webroot-backup.sh --op export`, under the site's lock and the heavy lock, in a work
folder of its own that already holds:

    archive.tar   `git archive --format=tar <commit>` of the point's tag
    db.sql.gz     a copy of the point's dump, as the tag's trailer names it

and leaves `package.zip` there. A WordPress or Joomla package installs itself, like Duplicator or
Akeeba: the person unpacks it into an empty web folder and opens `installer.php`. It holds:

    installer.php        `export-installer.php` with this package's facts filled in: the platform, the
                         old address, the backup point, the sizes of the two big payload files (so it
                         can tell the payload is unpacked whole, then delete the uploaded ZIP). No key: it starts a new installation only
                         within three hours of the unpack, and a run belongs to the browser that
                         started it
    README.md            the installer's steps first, then the same move by hand
    index.html           a page that stops a web server from listing the folder before the install
    tracy-package-<32 hex>/   the payload, under a name nobody can guess, denied to the web by its
                         `.htaccess` on Apache; the installer finds it on disk
      .htaccess, index.html
      webroot.tar        the archive with the configuration file's database credentials replaced
                         (`export-config.py`); files and folders only — a symbolic link is left out
                         and counted, because an archive that unpacks a link can write anywhere
      db.sql.gz          the dump byte for byte, its hash checked against the tag once more
      tracy_setting.json `tracy-setting/v1`, the same file a quickstart release declares itself in
      manifest.json      what the package is and what it does NOT hold (`scope`)
      install-code.json  the PBKDF2-SHA256 hash of the six-digit install code Tracy made for this
                         export (`TRACY_EXPORT_INSTALL_CODE`), which installer.php asks for before
                         it sends the site to a database on another server. The code itself is in
                         no file of the package: every file is unpacked into the web folder, and
                         this one only in the folder the web is denied
      SHA256SUMS         every other member, in `sha256sum -c` form, run from inside the folder

An EmDash package has no installer: `app.tar`, `db.sqlite.gz`, `uploads.tar.gz`, the two JSON files,
README.md and SHA256SUMS, all at the root.

What only Tracy's proxy makes safe stays behind (`TRACY_ONLY`), because a host without that proxy
would let any caller use it: the sign-in pieces that trust Tracy's `X-Tracy-*` headers and the
Claude Cowork plugin whose token Tracy still holds (WordPress and Joomla, left out of
`webroot.tar`; the database rows stay and fail closed without their files), and on EmDash the relay
digest file in `app.tar` plus Tracy's agent user, disabled in the SQLite copy with its keys deleted.
A package where that cannot be done is refused (`TRACY_ACCESS_NOT_REMOVED`).

Hashes are of the final bytes. The two big members are stored, not deflated (a gzip and a tar of
mostly compressed media gain nothing and cost the host's CPU); ZIP64 is on, so a package over
4 GiB stays readable.

The README names the site's old address, the one a move must replace: WordPress and Joomla read it
from the packaged configuration file; an EmDash app snapshot carries no `.env`, so the caller passes
the stack's `EMDASH_SITE_URL` as `TRACY_EXPORT_SITE_URL`. Without one, the README says where to find it.

Usage (the last stdout line is the answer):
    [TRACY_EXPORT_SITE_URL=<address>] [TRACY_EXPORT_INSTALL_CODE=<6 digits>] export-package.py <work dir> <platform> <label> <point json file> <max bytes>
"""

from __future__ import annotations

import datetime
import gzip
import hashlib
import importlib.util
import io
import json
import os
import re
import secrets
import shutil
import sqlite3
import sys
import tarfile
import zipfile

# Tracy's own doors into a site, which a package must never carry: a site that left Tracy keeps no
# door that Tracy, or anyone holding what Tracy holds, can open.
#   signIn        On Tracy it signs in whoever the `x-tracy-email` header names (creating the user,
#                 an administrator when `x-tracy-role` says owner), and only Tracy's proxy, which
#                 strips a visitor's own copy of those headers, reaches the site. On any other host
#                 nothing strips them, so anyone could sign in. WordPress: the must-use plugin
#                 provision copies in. Joomla: `plg_system_tracyaccess`, from the Claude Cowork package.
#   claudeCowork  The plugin (WordPress) or component and plugins (Joomla) through which Tracy reads
#                 and writes the site, with a token kept in the database (`claude_cowork_token`, the
#                 component's params) that Tracy also holds. The dump stays byte for byte; without
#                 the code, nothing reads that token.
#   relayDigest   EmDash: the SHA-256 of the Content API relay token, which lets that token name
#                 a reader in headers (`tools/content-api/command.mjs`). Without it, those headers are
#                 refused. The tokens themselves are removed from the database (`remove_tracy_agent`).
# Joomla keeps the rows in `#__extensions` (left byte for byte); without their files they load nothing.
TRACY_ONLY = {
    "wordpress": {
        "signIn": ("wp-content/mu-plugins/tracy-access.php",),
        "claudeCowork": ("wp-content/plugins/claude-cowork/",),
    },
    "joomla": {
        "signIn": ("plugins/system/tracyaccess/",),
        "claudeCowork": (
            "components/com_claudecowork/",
            "administrator/components/com_claudecowork/",
            "plugins/system/claudecoworkapi/",
            "plugins/system/claudecoworkupdate/",
        ),
    },
    "emdash": {"relayDigest": ("tracy-content-relay.sha256",)},
}


def tracy_only(platform: str, name: str) -> str | None:
    """Which of Tracy's own pieces (`TRACY_ONLY`) the archive entry `name` (a file, or a folder
    ending in `/`) belongs to, or None for the site's own files."""
    name = name.removeprefix("./")
    for kind, paths in TRACY_ONLY.get(platform, {}).items():
        for path in paths:
            if name == path.rstrip("/") or (path.endswith("/") and name.startswith(path)):
                return kind
    return None


# EmDash: the resident agent provision creates (`provision/emdash/mint-agent-admin.cjs`), and the
# tokens Tracy holds for it: `tracy-agent` (scopes admin, mcp:tools) and the Content API relay's
# `tracy-content-read` (`register-content-token.cjs`). The packaged database gets the account
# disabled (EmDash refuses every token and session of a disabled user) and every credential of it
# deleted, so neither token, nor a sign-in link mailed to Tracy's address, opens the moved site.
# Both tokens are owned by the agent user, so they go with its credentials, selected by user id;
# never by token name, since EmDash lets any account name a token `tracy-agent`.
TRACY_AGENT_EMAIL = "tracy-agent@tracy.ai"
AGENT_CREDENTIALS = ("_emdash_api_tokens", "_emdash_oauth_tokens", "_emdash_authorization_codes",
                     "_emdash_device_codes", "auth_tokens", "auth_challenges", "credentials", "oauth_accounts")


# The history keeps no file over this size (`webroot-excludes.sh`, the `find -size +50M` lines), so
# neither can a package built from it: said in the manifest, never made up for with live files.
LARGE_FILE_BYTES = 50 * 1024 * 1024

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("export_config", os.path.join(_HERE, "export-config.py"))
export_config = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(export_config)

ENGINE = {"mysql": "mariadb", "sqlite": "sqlite"}

INSTALLER_TEMPLATE = os.path.join(_HERE, "export-installer.php")
PAYLOAD_PREFIX = "tracy-package-"

PAYLOAD_HTACCESS = b"""# Nothing in this folder is for the web: installer.php reads it from the disk.
<IfModule mod_authz_core.c>
  Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
  Order allow,deny
  Deny from all
</IfModule>
"""

EMPTY_PAGE = b"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow">
<title>Site package</title></head><body></body></html>
"""


# What a person may safely see inside backticks and single quotes in the README: a plain http(s)
# origin with an optional path. Anything else (a computed value, a quote) is treated as not found.
ADDRESS = re.compile(r"^https?://[A-Za-z0-9.-]+(?::[0-9]+)?(?:/[A-Za-z0-9._~/-]*)?$")
# Only as a statement of its own: `define(` (or the class property) opening a line, never text
# that merely looks like one inside a string or after other code.
WP_ADDRESS = re.compile(r"^[ \t]*define\s*\(\s*['\"](WP_HOME|WP_SITEURL)['\"]\s*,\s*(['\"])([^'\"]*)\2\s*\)\s*;", re.M)
JOOMLA_ADDRESS = re.compile(r"^[ \t]*public[ \t]+\$live_site[ \t]*=[ \t]*(['\"])([^'\"]*)\1[ \t]*;", re.M)


def strip_php_comments(source: str) -> tuple[str, list[tuple[int, int]]]:
    """`source` with its PHP comments (`//`, `#`, `/* */`) removed and its string literals kept, so
    a commented-out setting is never read as the live one and `'https://…'` is not cut at `//`;
    plus the (start, end) of every string literal in the result, so a match that starts inside
    one (a multi-line string holding a whole `define(…);` line) can be refused.
    A line comment keeps its newline: the `^`-anchored patterns still see line starts."""
    out = []
    strings = []
    size = 0
    i, n = 0, len(source)
    while i < n:
        c = source[i]
        if c in "'\"":
            j = i + 1
            while j < n and source[j] != c:
                j += 2 if source[j] == "\\" else 1
            literal = source[i : j + 1]
            strings.append((size, size + len(literal)))
            out.append(literal)
            size += len(literal)
            i = j + 1
        elif source.startswith("/*", i):
            end = source.find("*/", i + 2)
            i = n if end < 0 else end + 2
            out.append(" ")
            size += 1
        elif c == "#" or source.startswith("//", i):
            end = source.find("\n", i)
            i = n if end < 0 else end
        else:
            out.append(c)
            size += 1
            i += 1
    return "".join(out), strings


def clean_address(value: str | None) -> str | None:
    value = (value or "").strip().rstrip("/")
    return value if ADDRESS.match(value) else None


def old_address(platform: str, config: str) -> str | None:
    """The address the packaged site is set to, as its own configuration file states it.

    A Tracy site keeps its Tracy address there even when the customer's own domain is connected
    (`apps/tracy-web/src/bar/own-domain.js`), so this is the "old address" a move must replace —
    never the customer's domain. None when the file does not state one plainly. Comments are
    skipped; of two live defines PHP keeps the first, and so does this."""
    config, strings = strip_php_comments(config)

    def live(matches):
        return [m for m in matches if not any(a < m.start() < b for a, b in strings)]

    if platform == "wordpress":
        found: dict[str, str] = {}
        for m in live(WP_ADDRESS.finditer(config)):
            found.setdefault(m.group(1), m.group(3))
        return clean_address(found.get("WP_HOME")) or clean_address(found.get("WP_SITEURL"))
    if platform == "joomla":
        matches = live(JOOMLA_ADDRESS.finditer(config))
        return clean_address(matches[0].group(2)) if matches else None
    return None


def backup_note(scope: dict | None, platform: str) -> str:
    """The opening: what the package is, what it leaves out (as `scope` in manifest.json records
    it), and what installing it overwrites."""
    left_out = ""
    if scope is not None and scope.get("largeFilesExcludedOver"):
        megabytes = scope["largeFilesExcludedOver"] // (1024 * 1024)
        # manifest.json holds the limit and the count of links left out; it names no file and
        # does not count the large files left out, so the README claims neither.
        left_out = (f"Files over {megabytes} MB and symbolic links are not included; `manifest.json` gives\n"
                    "the size limit and says how many links were left out. ")
    elif scope is not None:
        left_out = "Symbolic links are not included; `manifest.json` says how many were left out. "
    # The installer refuses a folder or a database that is not empty; EmDash keeps its data in the
    # SQLite file inside the package, so there is no database to create.
    where = ("Install it into an empty folder." if platform == "emdash"
             else "Install it into an empty folder and an empty database.")
    return f"""This package is a copy of the site. {left_out}If the site stays on Tracy, you do not need to
do anything with it: keep it somewhere safe. Follow the steps below only to move the site to another
host.

{where} The package holds the site as it is on
Tracy, so changes made to another copy of the site (for example your original site after it was
imported into Tracy: new orders, comments, sign-ups, posts) are not in it. Putting the package in
place of that site replaces its files and database and loses those changes.
"""


def address_section(address: str | None, label: str, setting: str) -> str:
    if address:
        return f"""## The site's old address

The site in this package is set to `{address}`. That is the **old address** in the steps below.
Use it even if visitors reach the site at your own domain: the package keeps the address Tracy
gave the site ({setting}), not your domain.
"""
    return f"""## The site's old address

The **old address** in the steps below is the address Tracy gave the site: it starts with
`https://{label}.` and ends with Tracy's domain. It is not your own domain, even if visitors reach
the site there. The package does not state it, so check it before you start.
"""


DOMAIN_SECTION = """## Your own domain

Only if your own domain points at the site on Tracy now and you are moving the site away: once the
site works on the new host, change your domain's DNS records (at the company you bought the domain
from) to point at the new host. Until you do, visitors keep reaching the site on Tracy. Use your
domain as the new address in the steps above.
"""

def sign_in_section(platform: str) -> str:
    """Why the admin asks for a password on the new host, how to get one, and what became of the
    Claude Cowork connection (`TRACY_ONLY`)."""
    if platform == "wordpress":
        removed = "the must-use plugin `wp-content/mu-plugins/tracy-access.php`"
        login, cli = "`/wp-admin`", "`wp user update you@example.com --user_pass='a new password'`"
        leftover = """
## The Claude Cowork connection

On Tracy, the Claude Cowork plugin lets Tracy's agent edit the site with a key. The package leaves
out its folder `wp-content/plugins/claude-cowork/`, so nobody can use that key on the new host.
WordPress turns the plugin off by itself the first time someone opens the plugins page, because its
files are missing.
"""
    else:
        removed = "the plugin in `plugins/system/tracyaccess/`"
        login, cli = "`/administrator`", "`php cli/joomla.php user:reset-password`"
        leftover = """
The database still lists the plugin (`plg_system_tracyaccess` under **System > Manage >
Extensions**). Without its files it does nothing. You can uninstall it there; Joomla may report
that it could not remove it because its files are missing, and the entry is removed anyway.

## The Claude Cowork connection

On Tracy, the Claude Cowork component lets Tracy's agent edit the site with a key. The package
leaves out its files (`components/com_claudecowork/`,
`administrator/components/com_claudecowork/`, `plugins/system/claudecoworkapi/` and
`plugins/system/claudecoworkupdate/`), so nobody can use that key on the new host. The database
still lists the Claude Cowork package and its extensions; without their files they do nothing, and
you can uninstall them the same way.
"""
    return f"""## Signing in on the new host

On Tracy, people open the admin area without a password because Tracy signs them in. The package
leaves out the part of the site that does this:
{removed}.
On another host it would let anyone sign in.

On the new host, sign in at {login} with a user name and password. Accounts Tracy created have
a random password that nobody knows: use the login page's link for a forgotten password (the new
host must be able to send email), or run this from the web folder:
{cli}
{leftover}"""


EMDASH_ACCESS_SECTION = """## Signing in on the new host

On Tracy, Tracy's agent edits the site through its own account, named Tracy
(`tracy-agent@tracy.ai`), with access keys stored in the database. In the packaged database that
account is disabled and its keys are deleted, and the app leaves out `tracy-content-relay.sha256`,
the file that let Tracy's content reader act for the people of your site. On another host they
would let whoever holds a key into the site.

Sign in with your own account. A passkey only works at the address where it was made, so at the new
address use the sign-in link sent by email (the new host must be able to send email), then add a new
passkey.
"""


IMPORT_STEP = """3. Import `db.sql.gz` into that database, in one of these ways:
   - In phpMyAdmin or your hosting panel's database tool: select the new database, open
     **Import**, and choose `db.sql.gz`. If the tool says the file is too large, use the command
     line or ask your host to import it.
   - On the command line: `gzip -dc db.sql.gz | mysql -u USER -p DATABASE` (replace `USER` and
     `DATABASE` with your database user and database name)."""


PAYLOAD_NOTE = """This package contains `installer.php` and a folder whose name starts with `tracy-package-`. That
folder holds the site's files in `webroot.tar` and its database in `db.sql.gz`. The database
contains site and user data, including personal information. The files may contain site secrets."""


def installer_section(cms: str, admin: str, address_known: bool) -> str:
    replaced = ("The installer replaces the site's old address (below) with the new address in the\n"
                "database and in the configuration file.") if address_known else (
                "The installer replaces the site's old address with the new address in the database and in\n"
                "the configuration file.")
    return f"""## Install with the installer

1. In your hosting panel, create an empty MySQL or MariaDB database and a database user that can
   use it.
2. Unpack this ZIP into the empty web folder (the document root) of the new host: upload the ZIP
   and unpack it with the hosting panel's file manager, or unpack it on your computer and upload
   everything. Keep the `tracy-package-…` folder as it is. If you upload the ZIP itself, keep its
   name as downloaded (its random part stops others from guessing it), and open `installer.php`
   right after unpacking.
3. Right away, in a browser, open `installer.php` at the site's new address, for example
   `https://www.example.com/installer.php`. If you uploaded the ZIP itself, the installer deletes
   it from the web folder as soon as you open it; until then anyone who guesses its name can
   download the whole site, so do not leave it there. If the installer says it could not delete
   the ZIP, delete it yourself. Until the installer has run, anyone who opens its address can use
   it, so do not leave it waiting. For safety the installer starts only within three hours of the
   unpack; after that, unpack the ZIP again.
4. Enter the database host, name, user, and password, and confirm the new address. Press
   **Install**. Keep the same browser until it finishes: another browser cannot continue it.
5. When it finishes, the installer shows links to the site and its admin area ({admin}), and
   deletes itself and the package files. If it says it could not delete some files, delete them
   at once: until then anyone who finds them can download the site and its database.

If the new host's database is on another server, the installer asks for a 6-digit install code. It
is in the email Tracy sent when you downloaded this package, and in Tracy: My Sites, the … menu of
the site, Export site as ZIP. A database on the same server needs no code.

{replaced} It needs PHP 7.4 or newer with the mysqli extension, and a PHP version
that your {cms} version supports. It only installs into an empty folder and a database that has
none of the site's tables, and only at the address it is opened from.
"""


def readme_for(platform: str, address: str | None = None, label: str = "your-site",
               scope: dict | None = None) -> bytes:
    old = address or "OLD_ADDRESS"
    names = "In these steps, `https://www.example.com` stands for the site's **new address**. Use your own."
    if not address:
        names += "\n`OLD_ADDRESS` stands for the old address above."
    by_hand = """Use these steps instead of the installer if you prefer, or if it cannot run on your host. Do
not upload `installer.php`, `index.html` or the `tracy-package-…` folder to the web folder: the
files below are inside that folder."""
    if platform == "wordpress":
        text = f"""# Moving this WordPress site to another host

{backup_note(scope, "wordpress")}
{PAYLOAD_NOTE}

{installer_section("WordPress", "`/wp-admin`", bool(address))}
{address_section(address, label, "`WP_HOME` and `WP_SITEURL` in `wp-config.php`")}
## Install by hand

{by_hand}

{names}

1. Unpack `webroot.tar` into the document root (the web folder) of a PHP host that meets the
   requirements of your WordPress version. Keep the folder structure.
2. Create an empty MySQL or MariaDB database and a database user that can use it. Most hosting
   panels have a page for this.
{IMPORT_STEP}
4. Open `wp-config.php` in the web folder and change two things:
   - Replace the four `tracy-placeholder` values for `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and
     `DB_HOST` with the database name, user, password, and host from step 2.
   - Set `WP_HOME` and `WP_SITEURL` to the new address, for example
     `define('WP_HOME', 'https://www.example.com');`. These two lines win over the address saved
     in the database: if they keep the old address, the site and its admin login keep sending
     visitors back to the old address.
5. Replace the old address with the new address in the database, with a tool that understands
   WordPress data (serialization-aware). With WP-CLI, run this from the web folder:
   `wp search-replace '{old}' 'https://www.example.com' --all-tables`
   Without WP-CLI, log in to the admin area at the new address and use a search-and-replace plugin
   that supports serialized data. Do not use a plain text replace in SQL or in `db.sql.gz`: it
   breaks saved WordPress settings.
6. Open the site at the new address and check its pages and its admin area (`/wp-admin`).

{sign_in_section(platform)}
{DOMAIN_SECTION}
This package does not include a hosting account, DNS changes, mail delivery, or a guarantee that
plugins and themes work on the new host. Review the site's secrets before sharing the package.
"""
    elif platform == "joomla":
        text = f"""# Moving this Joomla site to another host

{backup_note(scope, "joomla")}
{PAYLOAD_NOTE}

{installer_section("Joomla", "`/administrator`", bool(address))}
{address_section(address, label, "`$live_site` in `configuration.php`")}
## Install by hand

{by_hand}

{names}

1. Unpack `webroot.tar` into the document root (the web folder) of a PHP host that meets the
   requirements of your Joomla version. Keep the folder structure.
2. Create an empty MySQL or MariaDB database and a database user that can use it. Most hosting
   panels have a page for this.
{IMPORT_STEP}
4. Open `configuration.php` in the web folder and change two things:
   - Replace the four `tracy-placeholder` values for `$db`, `$user`, `$password`, and `$host`
     with the database name, user, password, and host from step 2.
   - Set `$live_site` to the new address, for example
     `public $live_site = 'https://www.example.com';`.
5. Articles, menus, modules, and extension settings can hold absolute URLs that start with the old
   address `{old}`. Change them to the new address, in the administrator area or with a
   search-and-replace extension.
6. Open the site at the new address and check its pages and its administrator area
   (`/administrator`).

{sign_in_section(platform)}
{DOMAIN_SECTION}
This package does not include a hosting account, DNS changes, mail delivery, or a guarantee that
extensions and templates work on the new host. Review the site's secrets before sharing the package.
"""
    elif platform == "emdash":
        text = f"""# Moving this EmDash site to another host

{backup_note(scope, "emdash")}
This package contains the EmDash application source in `app.tar`, its SQLite database in
`db.sqlite.gz`, and uploaded files in `uploads.tar.gz`. The database contains site and user data,
including personal information. The application and database may contain site secrets.

{address_section(address, label, "the `EMDASH_SITE_URL` setting")}
## Move the site

{names}

1. Choose a Node.js host that can run this EmDash application. Tracy makes no promise that this
   package will run on a particular host or Node.js version.
2. Unpack `app.tar` into the application directory and install dependencies using the package
   manager named by its lockfile (for example, `npm ci` for `package-lock.json`).
3. Create the app's data directory and decompress `db.sqlite.gz` into `data/data.db`. From the app
   directory, run `tar -xzf uploads.tar.gz`; the archive already contains `uploads/`, so do not run
   the command from inside the `uploads/` directory.
4. In the host's environment settings, set `EMDASH_SITE_URL` to the new address (for example
   `EMDASH_SITE_URL=https://www.example.com`). The package has no environment file, so also add
   the other settings and secrets the app needs on the new host.
5. Build and start the app using its `package.json` scripts, then open it at the new address.
6. Links saved in site content that start with the old address `{old}` still point there. Change
   them to the new address in the EmDash admin.

{EMDASH_ACCESS_SECTION}
{DOMAIN_SECTION}
This package does not include a Node.js hosting account, DNS changes, or mail delivery. Review
secrets before sharing the package.
"""
    else:
        raise ValueError(f"no README for {platform}")
    return text.encode("utf-8")


# The install code's hash: slow on purpose, so the file alone does not give the code away quickly.
# PHP's `hash_pbkdf2` checks it on the new host; a few tenths of a second there per attempt.
INSTALL_CODE_ITERATIONS = 300_000


def install_code_record(code: str) -> bytes:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", code.encode("ascii"), salt, INSTALL_CODE_ITERATIONS, 32)
    return (json.dumps({"algorithm": "pbkdf2-sha256", "iterations": INSTALL_CODE_ITERATIONS,
                        "salt": salt.hex(), "hash": digest.hex()}, indent=2) + "\n").encode()


def php_literal(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def backup_time(at) -> str:
    """The point's tag time (unix seconds) as the done page shows it."""
    if not isinstance(at, int) or at <= 0:
        return ""
    return datetime.datetime.fromtimestamp(at, datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def render_installer(platform: str, address: str | None, label: str, at: str,
                     companions: dict[str, str], payload_sizes: dict[str, int]) -> bytes:
    """`export-installer.php` with this package's facts in place of its `'__TRACY_…__'` literals."""
    with open(INSTALLER_TEMPLATE, encoding="utf-8") as f:
        source = f.read()
    values = {
        "PLATFORM": platform,
        "OLD_ADDRESS": address or "",
        "LABEL": label,
        "BACKUP": at,
        "COMPANIONS": json.dumps(companions, sort_keys=True),
        "PAYLOAD_SIZES": json.dumps(payload_sizes, sort_keys=True),
    }
    for name, value in values.items():
        token = f"'__TRACY_{name}__'"
        if source.count(token) != 1:
            raise ValueError(f"export-installer.php must name {token} once")
        source = source.replace(token, php_literal(value))
    return source.encode("utf-8")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def answer(**fields) -> int:
    print(json.dumps(fields))
    return 0


def refuse(code: str, error: str) -> int:
    print(f"!! export refused: {code} ({error})", file=sys.stderr)
    return answer(ok=False, code=code, error=error)


def rewrite_archive(
    src: str, dst: str, platform: str, large_archive: str | None = None
) -> tuple[list[str], int, int, str | None, dict[str, int]]:
    """Copy the git archive into `dst` with the configuration entry replaced in place (not appended:
    a tar holding the file twice unpacks to whichever came last, depending on the tool), and
    Tracy's own pieces (`TRACY_ONLY`) left out.
    Returns the fields replaced, how many links were left out, how many large files were added,
    the site address the configuration file states (`old_address`), and how many files of each of
    Tracy's pieces were left out."""
    config = export_config.config_path(platform)
    changed = None
    address = None
    links = 0
    included_large = 0
    left_out = dict.fromkeys(TRACY_ONLY.get(platform, {}), 0)
    archived = set()
    with tarfile.open(src, "r:") as tin, tarfile.open(dst, "w:", format=tarfile.PAX_FORMAT) as tout:
        for member in tin:
            kind = tracy_only(platform, member.name + ("/" if member.isdir() else ""))
            if kind:
                left_out[kind] += 0 if member.isdir() else 1
                continue
            if member.isdir():
                tout.addfile(member)
                continue
            if not member.isfile():
                # Symbolic and hard links, devices: never part of a site's files to hand over.
                links += 1
                continue
            data = tin.extractfile(member)
            archived.add(member.name)
            if member.name == config:
                text = data.read().decode("utf-8", "surrogateescape")
                address = old_address(platform, text)
                text, changed = export_config.rewrite(platform, text)
                raw = text.encode("utf-8", "surrogateescape")
                member.size = len(raw)
                tout.addfile(member, io.BytesIO(raw))
            else:
                tout.addfile(member, data)
    if changed is None:
        raise export_config.Unsupported(f"the backup holds no {config}")
    if large_archive is not None:
        with tarfile.open(dst, "a:", format=tarfile.PAX_FORMAT) as tout:
            with tarfile.open(large_archive, "r:gz") as large:
                for member in large:
                    name = member.name.removeprefix("./")
                    if (not member.isfile() or member.size <= LARGE_FILE_BYTES or name in archived
                            or tracy_only(platform, name)):
                        continue
                    member.name = name
                    tout.addfile(member, large.extractfile(member))
                    included_large += 1
    return changed, links, included_large, address, left_out


def drop_tracy_only(path: str, platform: str) -> dict[str, int]:
    """Rewrite the tar at `path` in place without Tracy's own pieces (`TRACY_ONLY`); every other
    entry is copied as it is. Returns how many files of each piece were left out."""
    left_out = dict.fromkeys(TRACY_ONLY.get(platform, {}), 0)
    temporary = path + ".tmp"
    try:
        with tarfile.open(path, "r:") as tin, tarfile.open(temporary, "w:", format=tarfile.PAX_FORMAT) as tout:
            for member in tin:
                kind = tracy_only(platform, member.name + ("/" if member.isdir() else ""))
                if kind:
                    left_out[kind] += 0 if member.isdir() else 1
                    continue
                tout.addfile(member, tin.extractfile(member) if member.isfile() else None)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)
    return left_out


def remove_tracy_agent(sqlite_gz: str) -> dict[str, int]:
    """Disable Tracy's resident agent (`TRACY_AGENT_EMAIL`) in the packaged EmDash database and
    delete every credential it owns, rewriting `sqlite_gz` in place. A database
    this cannot change is an error: the package is then refused, never shipped with the tokens."""
    raw = sqlite_gz + ".db"
    temporary = sqlite_gz + ".tmp"
    try:
        with gzip.open(sqlite_gz, "rb") as src, open(raw, "wb") as dst:
            shutil.copyfileobj(src, dst, 1 << 20)
        db = sqlite3.connect(raw, isolation_level=None)
        try:
            # A deleted token hash is overwritten, not left behind in a free page of the file.
            db.execute("PRAGMA secure_delete = ON")
            db.execute("BEGIN IMMEDIATE")
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
            agents = [row[0] for row in db.execute("SELECT id FROM users WHERE lower(email) = ?",
                                                   (TRACY_AGENT_EMAIL,))] if "users" in tables else []
            marks = ", ".join("?" * len(agents))
            removed = 0
            for table in AGENT_CREDENTIALS:
                if table not in tables:
                    continue
                where, params = (f"user_id IN ({marks})", list(agents)) if agents else ("0", [])
                if table == "auth_tokens":
                    # A link issued before the account existed has no user id, only Tracy's address.
                    where += " OR (user_id IS NULL AND lower(email) = ?)"
                    params.append(TRACY_AGENT_EMAIL)
                removed += db.execute(f'DELETE FROM "{table}" WHERE {where}', params).rowcount
            disabled = db.execute(f"UPDATE users SET disabled = 1 WHERE id IN ({marks})", agents).rowcount if agents else 0
            db.execute("COMMIT")
        finally:
            db.close()
        with open(raw, "rb") as src, gzip.open(temporary, "wb", compresslevel=6) as dst:
            shutil.copyfileobj(src, dst, 1 << 20)
        os.replace(temporary, sqlite_gz)
    finally:
        for path in (raw, raw + "-wal", raw + "-shm", raw + "-journal", temporary):
            if os.path.exists(path):
                os.remove(path)
    return {"tracyAgentDisabled": disabled, "tracyCredentialsRemoved": removed}


def main(argv: list[str]) -> int:
    work, platform, label, point_file, max_bytes, *options = argv
    large_archive = options[0] if options else None
    max_bytes = int(max_bytes)
    if large_archive is not None and not os.path.isfile(large_archive):
        return refuse("LARGE_FILES_SNAPSHOT_MISSING", "the backup has no large-file snapshot")
    with open(point_file, encoding="utf-8") as f:
        point = json.load(f)
    database = point.get("database") or {}
    kind = (point.get("facts") or {}).get("kind")
    archive = os.path.join(work, "archive.tar")
    dump = os.path.join(work, "db.sql.gz")
    webroot = os.path.join(work, "webroot.tar")

    if platform == "emdash":
        sqlite = os.path.join(work, "db.sqlite.gz")
        uploads = os.path.join(work, "uploads.tar.gz")
        app = os.path.join(work, "app.tar")
        if not all(os.path.isfile(path) for path in (sqlite, uploads, app)):
            missing = next(os.path.basename(path) for path in (sqlite, uploads, app) if not os.path.isfile(path))
            return refuse("BACKUP_NOT_FULL", f"the EmDash package is missing {missing}")
        if os.path.getsize(sqlite) != database.get("bytes") or sha256_file(sqlite) != database.get("sha256"):
            return refuse("BACKUP_NOT_FULL", "the copied database does not match the backup")
        source_bytes = sum(os.path.getsize(path) for path in (sqlite, uploads, app))
        if source_bytes > max_bytes:
            return refuse("TOO_LARGE", f"the backup is larger than {max_bytes} bytes")
        temp_required = source_bytes + (16 * 1024 * 1024)
        free = shutil.disk_usage(work).free
        if free < temp_required:
            return refuse("INSUFFICIENT_TEMP_SPACE", f"need {temp_required} temporary bytes; {free} are free")
        # Proven against the backup above; from here the package holds the database and app without
        # Tracy's access, so their hashes below are of the changed bytes.
        try:
            agent = remove_tracy_agent(sqlite)
            left_out = drop_tracy_only(app, platform)
        except (OSError, EOFError, sqlite3.Error, tarfile.TarError) as error:
            return refuse("TRACY_ACCESS_NOT_REMOVED", f"could not remove Tracy's access: {error}")
        version = int(point["version"])
        scope = {"applicationIncluded": True, "databaseIncluded": True,
                 "uploadsIncluded": True, "linksLeftOut": 0,
                 "tracyRelayFilesLeftOut": left_out["relayDigest"], **agent}
        manifest = {"formatVersion": 1, "kind": "tracy-site-backup",
                    "site": {"label": label, "platform": platform},
                    "backup": {"version": version, "title": point.get("title"),
                               "at": point.get("at"), "commit": point.get("sha")},
                    "engine": "sqlite", "scope": scope,
                    "configChanged": {"file": None, "fields": []}}
        setting = {"schemaVersion": "tracy-setting/v1", "platform": platform, "label": label,
                   "version": f"v{version}", "install": {
                       "application": {"file": "app.tar", "sha256": sha256_file(app)},
                       "database": {"file": "db.sqlite.gz", "sha256": sha256_file(sqlite)},
                       "uploads": {"file": "uploads.tar.gz", "sha256": sha256_file(uploads)}}}
        small = {"tracy_setting.json": (json.dumps(setting, indent=2) + "\n").encode(),
                 "manifest.json": (json.dumps(manifest, indent=2) + "\n").encode(),
                 "README.md": readme_for(platform, clean_address(os.environ.get("TRACY_EXPORT_SITE_URL")), label)}
        members = [(app, "app.tar"), (sqlite, "db.sqlite.gz"), (uploads, "uploads.tar.gz")]
        sums = [f"{sha256_file(path)}  {name}" for path, name in members]
        sums += [f"{hashlib.sha256(raw).hexdigest()}  {name}" for name, raw in small.items()]
        package = os.path.join(work, "package.zip")
        with zipfile.ZipFile(package, "w", allowZip64=True) as z:
            for path, name in members:
                z.write(path, name, compress_type=zipfile.ZIP_STORED)
            for name, raw in small.items():
                z.writestr(name, raw, compress_type=zipfile.ZIP_DEFLATED)
            z.writestr("SHA256SUMS", ("\n".join(sums) + "\n").encode(), compress_type=zipfile.ZIP_DEFLATED)
        size = os.path.getsize(package)
        if size > max_bytes:
            return refuse("TOO_LARGE", f"the package is larger than {max_bytes} bytes")
        return answer(ok=True, version=version, commit=point.get("sha"), bytes=size,
                      sha256=sha256_file(package), scope=scope, configChanged=[])

    install_code = os.environ.get("TRACY_EXPORT_INSTALL_CODE", "")
    if install_code and not re.fullmatch(r"[0-9]{6}", install_code):
        # Never echoed: whatever it is, it was meant to be a secret.
        return refuse("BAD_INSTALL_CODE", "the install code is not six digits")

    # The copy, not the original, is what goes in the package: prove the copy.
    if os.path.getsize(dump) != database.get("bytes") or sha256_file(dump) != database.get("sha256"):
        return refuse("BACKUP_NOT_FULL", "the copied dump does not match the backup")
    if os.path.getsize(archive) + os.path.getsize(dump) > max_bytes:
        return refuse("TOO_LARGE", f"the backup is larger than {max_bytes} bytes")
    large_raw_bytes = 0
    if large_archive is not None:
        with tarfile.open(large_archive, "r:gz") as large:
            large_raw_bytes = sum(member.size for member in large if member.isfile())
    lower_bound = os.path.getsize(archive) + os.path.getsize(dump) + large_raw_bytes
    if lower_bound > max_bytes:
        return refuse("TOO_LARGE", f"the package exceeds the {max_bytes}-byte limit")
    # The work folder and source sidecars share the site's private filesystem. Reserve roughly two
    # package-sized copies (webroot tar plus ZIP), with 32 MiB for metadata and temporary files.
    temp_required = 2 * lower_bound + (32 * 1024 * 1024)
    free = shutil.disk_usage(work).free
    if free < temp_required:
        return refuse("INSUFFICIENT_TEMP_SPACE", f"need {temp_required} temporary bytes; {free} are free")

    try:
        changed, links, included_large, address, left_out = rewrite_archive(archive, webroot, platform, large_archive)
    except export_config.Unsupported as error:
        return refuse("UNSUPPORTED_CONFIG", f"unsupported config: {error}")
    os.remove(archive)

    version = int(point["version"])
    setting = {
        "schemaVersion": "tracy-setting/v1",
        "platform": platform,
        "label": label,
        "version": f"v{version}",
        "install": {
            "webroot": {"file": "webroot.tar", "sha256": sha256_file(webroot)},
            "database": {"file": "db.sql.gz", "sha256": sha256_file(dump)},
        },
    }
    scope = {
        "largeFilesExcludedOver": None if large_archive is not None else LARGE_FILE_BYTES,
        "largeFilesIncludedOver": LARGE_FILE_BYTES if large_archive is not None else None,
        "largeFilesIncluded": included_large,
        "linksLeftOut": links,
        "tracySignInFilesLeftOut": left_out["signIn"],
        "claudeCoworkFilesLeftOut": left_out["claudeCowork"],
    }
    manifest = {
        "formatVersion": 1,
        "kind": "tracy-site-backup",
        "site": {"label": label, "platform": platform},
        "backup": {
            "version": version,
            "title": point.get("title"),
            "at": point.get("at"),
            "commit": point.get("sha"),
        },
        "engine": ENGINE.get(kind, kind),
        "scope": scope,
        "configChanged": {"file": export_config.config_path(platform), "fields": changed},
        # At the root of the ZIP.
        "installer": {"file": "installer.php", "installCode": bool(install_code)},
    }
    payload = PAYLOAD_PREFIX + secrets.token_hex(16)
    root = {
        "README.md": readme_for(platform, address, label, scope),
        "index.html": EMPTY_PAGE,
    }
    root["installer.php"] = render_installer(
        platform, address, label, backup_time(point.get("at")),
        {name: hashlib.sha256(raw).hexdigest() for name, raw in root.items()},
        {"webroot.tar": os.path.getsize(webroot), "db.sql.gz": os.path.getsize(dump)})
    small = {
        ".htaccess": PAYLOAD_HTACCESS,
        "index.html": EMPTY_PAGE,
        "tracy_setting.json": (json.dumps(setting, indent=2) + "\n").encode(),
        "manifest.json": (json.dumps(manifest, indent=2) + "\n").encode(),
    }
    if install_code:
        small["install-code.json"] = install_code_record(install_code)
    sums = [f"{hashlib.sha256(raw).hexdigest()}  ../{name}" for name, raw in root.items()]
    sums += [f"{sha256_file(webroot)}  webroot.tar", f"{sha256_file(dump)}  db.sql.gz"]
    sums += [f"{hashlib.sha256(raw).hexdigest()}  {name}" for name, raw in small.items()]

    package = os.path.join(work, "package.zip")
    with zipfile.ZipFile(package, "w", allowZip64=True) as z:
        for name, raw in root.items():
            z.writestr(name, raw, compress_type=zipfile.ZIP_DEFLATED)
        z.write(webroot, f"{payload}/webroot.tar", compress_type=zipfile.ZIP_STORED)
        z.write(dump, f"{payload}/db.sql.gz", compress_type=zipfile.ZIP_STORED)
        for name, raw in small.items():
            z.writestr(f"{payload}/{name}", raw, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr(f"{payload}/SHA256SUMS", ("\n".join(sums) + "\n").encode(), compress_type=zipfile.ZIP_DEFLATED)
    os.remove(webroot)
    size = os.path.getsize(package)
    if size > max_bytes:
        return refuse("TOO_LARGE", f"the package is larger than {max_bytes} bytes")
    return answer(
        ok=True,
        version=version,
        commit=point.get("sha"),
        bytes=size,
        sha256=sha256_file(package),
        scope=scope,
        configChanged=changed,
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
