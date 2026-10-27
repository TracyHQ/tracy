#!/usr/bin/env python3
"""Every place a visitor of a built site can still read a quickstart's demo brand.

Why a crawl and not a grep of the archive: the demo brand reaches a page through at least five
roads -- a T4 site-settings file, Joomla's `sitename`, module content, article text, category
descriptions; on WordPress a template part owned by the database, `blogname`, page blocks -- and
a grep of any one of them says nothing about what a customer actually sees. Measured 23/09/2026
on `j-ee6vsk` (tracy-business/j6): after a seed that "succeeded", 131 distinct spots on 53 pages
still said "Northgate", the header lockup and every `<title>` among them.

Why it must measure truthfully (review of 25/09/2026, item 18): the first version capped the
crawl at 400 URLs without saying so, skipped every fetch error silently and counted the attempt
as a crawled page, so a site that was DOWN reported "0 spots" -- a green that tested nothing.
This version says how many pages it fetched and how many failed, prints the cap when it is
reached, exits 2 when nothing could be fetched, and splits the words into two corpora: identity
(name, monogram, address, phone, email, hours -- the leak the identity spec forbids, exit 1) and
demo prose (project names, towns -- reported and warned about, never failing).

Usage:
    brand-leaks.py http://<label>.tracy.test:8080/ Northgate NG "northgate-ind.ru" \
        --demo Kaluga Lipetsk --max-pages 2000 --json out.json
Positional words after the URL are identity words, the same meaning as the first version;
`--identity WORD...` says the same thing explicitly. Exit 0: no identity spot. Exit 1: identity
spots found. Exit 2: pages failed and none was fetched.
"""
import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict, deque
from urllib.parse import urljoin, urlparse

SKIP = re.compile(
    r"\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|xml|json|txt|pdf|zip|mp4|webm)(\?|$)"
    # Joomla assets and machine doors.
    r"|/(media|templates|images|administrator|plugins|components|api)/|format=feed|task=|tmpl="
    # WordPress assets and machine doors.
    r"|/(wp-admin|wp-content|wp-includes|wp-json|xmlrpc\.php|wp-login\.php)|/feed/?(\?|$)|[?&](s|replytocom|share)="
)
TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)
META = re.compile(r'<meta\b[^>]*?(?:name|property)="([^"]+)"[^>]*?content="([^"]*)"', re.I)
META_REVERSED = re.compile(r'<meta\b[^>]*?content="([^"]*)"[^>]*?(?:name|property)="([^"]+)"', re.I)
ATTR = re.compile(r'\b(alt|title|aria-label|placeholder)="([^"]*)"', re.I)
HREF = re.compile(r'\bhref="([^"]*)"', re.I)
TEXT = re.compile(r">([^<>]+)<")
CLASS = re.compile(r'class="([^"]+)"')


class Corpus:
    """The words of one corpus: a word-boundary regex, plus the digit form of every phone-like
    word, because a `tel:` target carries the number without spaces or dashes."""

    def __init__(self, words):
        self.pattern = re.compile("|".join(r"\b" + re.escape(w) + r"\b" for w in words), re.I)
        self.digits = [d for d in (re.sub(r"\D", "", w) for w in words) if len(d) >= 6]

    def search(self, text):
        return self.pattern.search(text) is not None

    def search_tel(self, target):
        digits = re.sub(r"\D", "", target)
        return self.search(target) or any(d in digits for d in self.digits)


def word_pattern(words):
    """The Corpus of the words; None when there are none."""
    return Corpus(words) if words else None


def fetch(url, timeout):
    """(body, None) for a 200 HTML page; (None, reason) otherwise. Never raises."""
    request = urllib.request.Request(url, headers={"User-Agent": "tracy-brand-leaks/2"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                return None, f"HTTP {response.status}"
            content_type = response.headers.get("Content-Type", "")
            if "html" not in content_type:
                return None, f"not HTML ({content_type.split(';')[0] or 'no content-type'})"
            if urlparse(response.geturl()).netloc != urlparse(url).netloc:
                return None, f"redirected off-origin to {response.geturl()}"
            return response.read().decode("utf-8", "replace"), None
    except urllib.error.HTTPError as error:
        return None, f"HTTP {error.code}"
    except urllib.error.URLError as error:
        return None, f"connection error: {error.reason}"
    except (TimeoutError, OSError, ValueError) as error:
        return None, f"{type(error).__name__}: {error}"


def scan(body, corpora, path, found):
    """Record every spot of every corpus on one page into found[(kind, where, text)] -> {path}."""

    def hit(where, value):
        text = html.unescape(value).strip()
        if not text:
            return
        for kind, corpus in corpora:
            matched = corpus.search_tel(text) if where == "href tel:" else corpus.search(text)
            if matched:
                found[(kind, where, text[:120])].add(path)

    for m in TITLE.finditer(body):
        hit("<title>", m.group(1))
    for m in META.finditer(body):
        hit(f"meta {m.group(1)}", m.group(2))
    for m in META_REVERSED.finditer(body):
        hit(f"meta {m.group(2)}", m.group(1))
    for m in ATTR.finditer(body):
        hit(f"attr {m.group(1).lower()}", m.group(2))
    for m in HREF.finditer(body):
        target = html.unescape(m.group(1)).strip()
        scheme = target.split(":", 1)[0].lower() if ":" in target else ""
        where = f"href {scheme}:" if scheme in ("mailto", "tel") else "href"
        hit(where, target)
    # `<title>` is reported above on its own line, so it is not a text node here as well.
    text = re.sub(r"<script.*?</script>|<style.*?</style>|<title[^>]*>.*?</title>", " ", body, flags=re.S | re.I)
    for m in TEXT.finditer(text):
        classes = CLASS.findall(text[max(0, m.start() - 1500) : m.start()])
        where = f"text .{classes[-1].split()[0]}" if classes else "text"
        hit(where, m.group(1))


def links(body, base, origin):
    """Same-origin page links of one page, as paths with query, fragment dropped, assets skipped."""
    out = []
    for m in HREF.finditer(body):
        target = html.unescape(m.group(1)).strip()
        if not target or target.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
            continue
        absolute = urljoin(base, target)
        parts = urlparse(absolute)
        if f"{parts.scheme}://{parts.netloc}" != origin:
            continue
        path = parts.path or "/"
        if parts.query:
            path += "?" + parts.query
        if SKIP.search(path):
            continue
        out.append(path)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("start", help="URL to start the crawl from; only its origin is crawled")
    parser.add_argument("words", nargs="*", help="identity words (same as --identity)")
    parser.add_argument("--identity", nargs="+", default=[], metavar="WORD", help="identity words: name, monogram, address, phone, email, hours")
    parser.add_argument("--demo", nargs="+", default=[], metavar="WORD", help="demo prose words: project names, towns; reported, never failing")
    parser.add_argument("--max-pages", type=int, default=2000, help="stop after this many page attempts and SAY so (default 2000)")
    parser.add_argument("--timeout", type=float, default=30, help="seconds per fetch (default 30)")
    parser.add_argument("--json", metavar="PATH", help="write {pages_fetched, pages_failed, cap_reached, spots} here")
    args = parser.parse_intermixed_args()

    identity = word_pattern(args.words + args.identity)
    demo = word_pattern(args.demo)
    if identity is None and demo is None:
        parser.error("give at least one identity word (positional or --identity) or --demo word")
    corpora = [(kind, pattern) for kind, pattern in (("identity", identity), ("prose", demo)) if pattern]

    start = urlparse(args.start)
    origin = f"{start.scheme}://{start.netloc}"
    first = (start.path or "/") + (f"?{start.query}" if start.query else "")
    queue, seen = deque([first]), set()
    fetched, failed = [], []
    found = defaultdict(set)
    cap_reached = False
    while queue:
        if len(fetched) + len(failed) >= args.max_pages:
            cap_reached = True
            break
        path = queue.popleft()
        if path in seen:
            continue
        seen.add(path)
        body, reason = fetch(origin + path, args.timeout)
        if body is None:
            failed.append((path, reason))
            continue
        fetched.append(path)
        scan(body, corpora, path, found)
        for link in links(body, origin + path, origin):
            if link not in seen:
                queue.append(link)

    rows = sorted(found.items(), key=lambda kv: (kv[0][0] != "identity", -len(kv[1]), kv[0]))
    identity_rows = [r for r in rows if r[0][0] == "identity"]
    prose_rows = [r for r in rows if r[0][0] == "prose"]

    print(f"{len(fetched)} pages fetched, {len(failed)} failed" + (f", {len(queue)} still queued" if queue else ""))
    if cap_reached:
        print(f"reached the page cap (--max-pages {args.max_pages}); the numbers above describe a PARTIAL crawl")
    for path, reason in failed[:20]:
        print(f"  failed | {path} | {reason}")
    if len(failed) > 20:
        print(f"  ... and {len(failed) - 20} more failed pages")
    print(f"identity spots: {len(identity_rows)} distinct; prose spots: {len(prose_rows)} distinct")
    for (kind, where, text), pages in rows:
        print(f"{len(pages):>3} pages | {kind:<8} | {where:<32} | {text} | e.g. {sorted(pages)[0]}")
    if prose_rows and not identity_rows:
        print(f"warning: {len(prose_rows)} prose spot(s) remain (demo content, not identity) -- not failing")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "start": args.start,
                    "pages_fetched": len(fetched),
                    "pages_failed": len(failed),
                    "failed": [{"url": origin + p, "reason": r} for p, r in failed],
                    "cap_reached": cap_reached,
                    "max_pages": args.max_pages,
                    "spots": [
                        {"url": origin + sorted(pages)[0], "kind": kind, "where": where, "text": text, "pages": len(pages)}
                        for (kind, where, text), pages in rows
                    ],
                },
                handle,
                ensure_ascii=False,
                indent=2,
            )
            handle.write("\n")

    if failed and not fetched:
        print("no page could be fetched: this is not a measurement", file=sys.stderr)
        sys.exit(2)
    sys.exit(1 if identity_rows else 0)


if __name__ == "__main__":
    main()
