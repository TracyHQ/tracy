#!/usr/bin/env python3
"""Rewrites a customer's wp-config.php to point at this stack's database and address.

The customer's own file is edited rather than a fresh one rendered from a template, for the same
reason the Joomla side does it: a site's wp-config.php carries things nothing else knows — the
table prefix, the authentication salts that keep existing sessions valid, and whatever a plugin
or a host put in there over the years. Rendering a clean file loses all of it silently.

Only three things are changed, and all three are things about WHERE the site now runs:

  * the four database constants, which must name this stack rather than the customer's host
  * the address, which is pinned so the copy cannot redirect visitors to the original site
  * the table prefix, but only when the file COMPUTES it (or states a wrong one) — see
    `replace_table_prefix`

Everything else is passed through byte for byte, line endings included.
"""

from __future__ import annotations

import argparse
import re
import sys

DB_CONSTANTS = ("DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST")


def php_string(value: str) -> str:
    """A single-quoted PHP literal. Only the two characters that can end or escape it matter."""
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def replace_define(source: str, name: str, value: str) -> tuple[str, bool]:
    """Rewrites `define('NAME', …)` in place, keeping the line where the customer had it."""
    pattern = re.compile(
        r"(define\s*\(\s*['\"]" + re.escape(name) + r"['\"]\s*,\s*).*?(\s*\)\s*;)",
        re.DOTALL,
    )
    rewritten, count = pattern.subn(lambda m: m.group(1) + php_string(value) + m.group(2), source, count=1)
    return rewritten, count > 0


VALID_PREFIX = re.compile(r"^[A-Za-z0-9_]+$")
PREFIX_LITERAL = re.compile(r"(['\"])([A-Za-z0-9_]+)\1")
IDENTIFIER = re.compile(r"[A-Za-z0-9_\x80-\uffff]")


class UnreadablePrefix(ValueError):
    """wp-config.php's table prefix cannot be stated: an assignment with no end, or a computed one
    with no database answer to replace it by."""


def _skip_string(source: str, i: int) -> int:
    """Index just past the PHP string literal opening at `source[i]` (a quote)."""
    quote = source[i]
    i += 1
    while i < len(source):
        if source[i] == "\\":
            i += 2
            continue
        if source[i] == quote:
            return i + 1
        i += 1
    return i


def _skip_comment(source: str, i: int) -> int | None:
    """Index just past the comment opening at `source[i]`, or None when none opens there."""
    if source.startswith("/*", i):
        end = source.find("*/", i + 2)
        return len(source) if end < 0 else end + 2
    if source[i] == "#" or source.startswith("//", i):
        # A PHP line comment also ends at `?>`; wp-config has no reason to close its tag inside one.
        end = source.find("\n", i)
        return len(source) if end < 0 else end
    return None


def table_prefix_assignments(source: str) -> list[tuple[int, int]]:
    """Spans of the EXPRESSION in every live `$table_prefix = <expression>;` statement.

    PHP-aware only as far as this needs: comments (`//`, `#`, `/* … */`) and quoted strings are
    stepped over, so `/*\\n$table_prefix = 'old_';\\n*/` or a salt that happens to contain the
    text are never taken for the assignment, and the expression runs to the first `;` outside
    strings, comments and brackets — so the official image's call split over several lines is
    still one expression. An assignment with no terminating `;` raises UnreadablePrefix.
    """
    spans = []
    name = "$table_prefix"
    i = 0
    while i < len(source):
        skipped = _skip_comment(source, i)
        if skipped is not None:
            i = skipped
            continue
        ch = source[i]
        if ch in "'\"":
            i = _skip_string(source, i)
            continue
        if not source.startswith(name, i) or (
            i + len(name) < len(source) and IDENTIFIER.match(source[i + len(name)])
        ):
            i += 1
            continue
        j = i + len(name)
        while j < len(source) and source[j] in " \t\r\n":
            j += 1
        # `=` alone: `==`/`===` compare and `.=` never reaches here (the `.` comes first).
        if j >= len(source) or source[j] != "=" or source.startswith("==", j):
            i = j
            continue
        j += 1
        while j < len(source) and source[j] in " \t\r\n":
            j += 1
        start = j
        depth = 0
        while j < len(source):
            skipped = _skip_comment(source, j)
            if skipped is not None:
                j = skipped
                continue
            c = source[j]
            if c in "'\"":
                j = _skip_string(source, j)
                continue
            if c in "([{":
                depth += 1
            elif c in ")]}":
                depth -= 1
            elif c == ";" and depth <= 0:
                break
            j += 1
        if j >= len(source):
            raise UnreadablePrefix("`$table_prefix =` has no terminating `;`")
        end = j
        while end > start and source[end - 1] in " \t\r\n":
            end -= 1
        spans.append((start, end))
        i = j + 1
    return spans


def replace_table_prefix(source: str, prefix: str) -> tuple[str, int, int]:
    """States the real table prefix as a literal wherever the file computes or misstates it.

    The official WordPress image writes `$table_prefix = getenv_docker('WORDPRESS_TABLE_PREFIX',
    'wp_');` — the prefix lives in the container's environment, not in the file. A copy is run by
    a web container with NO `WORDPRESS_*` environment (clone sites carry their own config), so that
    expression falls back to `wp_`, finds no tables, and WordPress serves its installer on every
    page (#264). `prefix` is the answer of `tracy_wp_table_prefix`, read from the imported
    database, so the file is made to say what the database holds.

    Only the expression is replaced; the whitespace around it and everything else in the file keep
    their bytes, and a literal that already names `prefix` is left byte-identical.

    An empty `prefix` means the database gave no answer: literals are then left as they are (the
    file's own statement is all there is), but a COMPUTED assignment raises UnreadablePrefix —
    writing a guess into the file would make a wrong answer permanent, and leaving the expression
    would let the web container compute `wp_`, both behind a green job.

    Returns the text, the number of assignments found, and the number rewritten.
    """
    spans = table_prefix_assignments(source)
    pieces = []
    last = 0
    rewritten = 0
    for start, end in spans:
        literal = PREFIX_LITERAL.fullmatch(source[start:end])
        if not prefix:
            if not literal:
                raise UnreadablePrefix(
                    "the database named no table prefix, and wp-config.php computes it ("
                    + source[start:end]
                    + ") — the copy's web container has no environment to compute it from"
                )
            continue
        if literal and literal.group(2) == prefix:
            continue
        pieces.append(source[last:start])
        pieces.append(php_string(prefix))
        last = end
        rewritten += 1
    pieces.append(source[last:])
    return "".join(pieces), len(spans), rewritten


def stated_prefix(source: str) -> str:
    """The prefix the file states as a quoted literal in its first LIVE assignment, else "".

    `tracy_wp_table_prefix`'s fallback when the database names no options table. It reads through
    the same scanner as the rewrite, so a commented-out `// $table_prefix = 'old_';` above the real
    line is not taken for the answer — which a line-based grep did, and then wrote into the copy.
    A computed assignment states nothing and yields "", never its expression's default.
    """
    try:
        spans = table_prefix_assignments(source)
    except UnreadablePrefix:
        return ""
    if not spans:
        return ""
    literal = PREFIX_LITERAL.fullmatch(source[spans[0][0] : spans[0][1]])
    return literal.group(2) if literal else ""


def main() -> int:
    if sys.argv[1:2] == ["--read-prefix"]:
        # `render_wp_config.py --read-prefix FILE` prints `stated_prefix` of FILE (possibly empty).
        if len(sys.argv) != 3:
            print("usage: render_wp_config.py --read-prefix WP_CONFIG", file=sys.stderr)
            return 2
        with open(sys.argv[2], encoding="utf-8", errors="surrogateescape", newline="") as handle:
            print(stated_prefix(handle.read()))
        return 0

    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--db-host", required=True)
    parser.add_argument("--db-user", required=True)
    parser.add_argument("--db-password", required=True)
    parser.add_argument("--db-name", required=True)
    parser.add_argument("--site-url", required=True)
    # Empty when the database did not answer (`tracy_wp_table_prefix --confirmed`): see
    # `replace_table_prefix` for what that still allows.
    parser.add_argument("--table-prefix", required=True)
    args = parser.parse_args()

    if args.table_prefix and not VALID_PREFIX.match(args.table_prefix):
        # WordPress itself refuses any other character, so a prefix outside this set is a wrong
        # answer from the database read, not a site to write into the file.
        print(f"refusing table prefix {args.table_prefix!r}: not [A-Za-z0-9_]+", file=sys.stderr)
        return 1

    # newline="" on both ends: a CRLF wp-config comes back out CRLF, not silently converted.
    with open(args.source, encoding="utf-8", errors="surrogateescape", newline="") as handle:
        source = handle.read()

    wanted = {
        "DB_NAME": args.db_name,
        "DB_USER": args.db_user,
        "DB_PASSWORD": args.db_password,
        "DB_HOST": args.db_host,
    }
    missing = []
    for name in DB_CONSTANTS:
        source, found = replace_define(source, name, wanted[name])
        if not found:
            missing.append(name)

    if missing:
        # A wp-config.php that defines its database somewhere else entirely — some hosts include
        # a separate file, and some managed platforms inject the constants from the environment.
        # Appending our own would be a second definition, and PHP keeps the FIRST, so the site
        # would still try to reach the customer's database from inside this container.
        print(
            "wp-config.php does not define " + ", ".join(missing) + " directly — "
            "the database is configured somewhere this cannot reach.",
            file=sys.stderr,
        )
        return 1

    # The address is pinned rather than left to the database. Both are read by WordPress, and
    # the constant wins — which is what stops a copy from bouncing a visitor to the original site
    # in the window between the database being imported and its URLs being rewritten.
    #
    # Inserted before the line WordPress itself marks as the end of the editable region, so it
    # lands ahead of `wp-settings.php` and after everything the customer wrote.
    for name in ("WP_HOME", "WP_SITEURL"):
        source, found = replace_define(source, name, args.site_url)
        if not found:
            block = f"define('{name}', {php_string(args.site_url)});\n"
            anchor = re.search(r"^.*That's all, stop editing.*$", source, re.MULTILINE)
            if anchor:
                source = source[: anchor.start()] + block + source[anchor.start() :]
            else:
                # No marker: put it immediately after the opening tag, which is still ahead of
                # every require in the file.
                source = re.sub(r"(<\?php\s*\n)", r"\1" + block, source, count=1)

    try:
        source, found, rewritten = replace_table_prefix(source, args.table_prefix)
    except UnreadablePrefix as error:
        print(f"cannot state the table prefix in wp-config.php: {error}", file=sys.stderr)
        return 1
    if not found:
        # Some hosts set it in an included file. Appending one here could override theirs with a
        # value this script cannot check against that file, so the file is left as it is.
        print(
            "wp-config.php has no `$table_prefix = …;` line of its own — left as it is; the site "
            f"must resolve to {args.table_prefix or 'its tables'!r} on its own.",
            file=sys.stderr,
        )
    elif rewritten:
        print(f"==> table prefix stated as {args.table_prefix!r} in wp-config.php")

    with open(args.out, "w", encoding="utf-8", errors="surrogateescape", newline="") as handle:
        handle.write(source)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
