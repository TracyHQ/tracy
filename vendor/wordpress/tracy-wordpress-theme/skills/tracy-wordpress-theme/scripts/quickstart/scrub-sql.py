#!/usr/bin/env python3
"""Scrub a WordPress SQL dump in place: blank every user's password and activation key, drop
login-session rows and transient rows.

Transients are dropped here, not on the stand: WordPress writes some of them again on every
bootstrap (the theme's pattern cache, the core block CSS list, doing_cron) — the prune audit's own
wp-cli calls recreate them — so the stand never holds zero, and only the dump can be made to.

Text-level and exact, because an appended `UPDATE … SET user_pass=''` leaves the hash sitting in
the INSERT above it — the file still ships it, and secret-scan.sh rightly refuses. The INSERT
statements are parsed with a small tokenizer (quoted values with backslash escapes, NULL, numbers;
values may span lines — post_content does), so a row is rewritten by column name, never by regex
over the whole line.

Usage: scrub-sql.py --file <dump.sql> --prefix <tr_> [--keep-passwords]
Exit 0 on success (prints what changed), 1 when the users table was not found, 2 on usage.
"""
import argparse
import sys

SESSION_KEYS = {'session_tokens'}
TRANSIENT_PREFIXES = ('_transient_', '_site_transient_')


def parse_tuple(s, i):
    """Parses `( v, v, … )` at s[i] (which must be '('), returns (values, end_index_after_paren)."""
    assert s[i] == '('
    i += 1
    values = []
    while True:
        while s[i] in ' \t\r\n':
            i += 1
        if s[i] == "'":
            j = i + 1
            buf = []
            while True:
                c = s[j]
                if c == '\\':
                    buf.append(s[j:j + 2])
                    j += 2
                elif c == "'":
                    if s[j + 1] == "'":
                        buf.append("''")
                        j += 2
                    else:
                        break
                else:
                    buf.append(c)
                    j += 1
            values.append(("'", ''.join(buf)))
            i = j + 1
        else:
            j = i
            while s[j] not in ',)':
                j += 1
            values.append((None, s[i:j].strip()))
            i = j
        while s[i] in ' \t\r\n':
            i += 1
        if s[i] == ',':
            i += 1
            continue
        if s[i] == ')':
            return values, i + 1
        raise ValueError(f'unexpected {s[i]!r} at {i}')


def render_tuple(values):
    return '(' + ', '.join(f"'{v}'" if q else v for q, v in values) + ')'


def rewrite_inserts(text, table, fn):
    """Applies fn(columns, values) -> values|None to every row of INSERT INTO `table`; None drops the row."""
    head = f'INSERT INTO `{table}` ('
    out = []
    pos = 0
    seen = 0
    while True:
        k = text.find(head, pos)
        if k < 0:
            out.append(text[pos:])
            break
        seen += 1
        out.append(text[pos:k])
        close = text.index(')', k)
        columns = [c.strip().strip('`') for c in text[k + len(head):close].split(',')]
        v = text.index('VALUES', close) + len('VALUES')
        i = v
        rows = []
        while True:
            while text[i] in ' \t\r\n':
                i += 1
            values, i = parse_tuple(text, i)
            kept = fn(columns, values)
            if kept is not None:
                rows.append(render_tuple(kept))
            while text[i] in ' \t\r\n':
                i += 1
            if text[i] == ',':
                i += 1
                continue
            if text[i] == ';':
                i += 1
                break
            raise ValueError(f'unexpected {text[i]!r} after a row of {table}')
        if rows:
            out.append(text[k:v] + ' \n' + ',\n'.join(rows) + ';')
        pos = i
    return ''.join(out), seen


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--file', required=True)
    p.add_argument('--prefix', required=True)
    p.add_argument('--keep-passwords', action='store_true')
    a = p.parse_args()
    with open(a.file, encoding='utf-8', errors='surrogateescape') as h:
        text = h.read()
    changed = {'passwords': 0, 'sessions': 0, 'transients': 0}

    def users(columns, values):
        if a.keep_passwords:
            return values
        values = list(values)
        for col in ('user_pass', 'user_activation_key'):
            if col in columns:
                idx = columns.index(col)
                if values[idx] != ("'", ''):
                    changed['passwords'] += 1
                values[idx] = ("'", '')
        return values

    def usermeta(columns, values):
        if 'meta_key' in columns and values[columns.index('meta_key')][1] in SESSION_KEYS:
            changed['sessions'] += 1
            return None
        return values

    def options(columns, values):
        if 'option_name' in columns and values[columns.index('option_name')][1].startswith(TRANSIENT_PREFIXES):
            changed['transients'] += 1
            return None
        return values

    text, n = rewrite_inserts(text, f'{a.prefix}users', users)
    if n == 0:
        print(f'no INSERT INTO `{a.prefix}users` in {a.file}', file=sys.stderr)
        return 1
    text, _ = rewrite_inserts(text, f'{a.prefix}usermeta', usermeta)
    text, _ = rewrite_inserts(text, f'{a.prefix}options', options)
    with open(a.file, 'w', encoding='utf-8', errors='surrogateescape') as h:
        h.write(text)
    print(f"scrub: {changed['passwords']} password/activation values blanked, {changed['sessions']} session rows dropped, {changed['transients']} transient rows dropped")
    return 0


if __name__ == '__main__':
    sys.exit(main())
