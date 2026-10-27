#!/usr/bin/env python3
"""Every place a visitor of a built site can still read a quickstart's demo brand — on any CMS.

Why a crawl and not a grep of the archive: the demo brand reaches a page through many roads — a
template's settings, the CMS's site name, module or block content, entry text, a menu label —
and a grep of any one of them says nothing about what a customer actually sees. Measured
23/09/2026 on `j-ee6vsk` (Joomla tracy-business): after a seed that "succeeded", 131 distinct
spots on 53 pages still said "Northgate", the header lockup and every `<title>` among them.

🔒 A CRAWL THAT CANNOT READ A PAGE HAS NOT PROVED THE PAGE CLEAN. The first version skipped any
page that did not answer 200 and stopped at 400 URLs, so "0 spots" could mean "0 pages read".
Now a page that answers anything but 200 (after redirects) is RED and named, and when the site
publishes a sitemap every URL in it is crawled: coverage below 100 % is RED. The ceiling grows with
the sitemap instead of cutting it.

Usage:
    brand-leaks.py <start-url> [--identity <file.json>] [--require-sitemap] [--max N] [word …]
      --identity   words to look for, from `words` (and, for a Joomla identity file, every plain
                   `replace[].from`) — the demo brand AND the rest of the demo's identity: its
                   domain, its hotline, its address
      --require-sitemap  no sitemap at the site's /sitemap.xml is itself RED (EmDash always has one)
Prints one line per distinct spot (how many pages, where on the page, the text), one line per page
that did not answer 200, and a coverage line; exits 1 when any of the three is wrong.
"""
import html
import json
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict, deque
from urllib.parse import quote, unquote, urlparse

args = sys.argv[1:]
if not args or args[0].startswith("-"):
    sys.exit(__doc__)
start = args.pop(0)
words, identity, require_sitemap, ceiling = [], None, False, None
while args:
    a = args.pop(0)
    if a == "--identity":
        identity = args.pop(0)
    elif a == "--require-sitemap":
        require_sitemap = True
    elif a == "--max":
        ceiling = int(args.pop(0))
    else:
        words.append(a)
if identity:
    with open(identity, encoding="utf-8") as f:
        doc = json.load(f)
    words += [w for w in doc.get("words", []) if isinstance(w, str) and w]
    # A Joomla identity file lists its demo phrases as `replace[].from`; the ones that are markup
    # (`aria-hidden="true">NG</span>`) are not words a visitor reads, so only plain text is taken.
    words += [
        r["from"]
        for r in doc.get("replace", [])
        if isinstance(r, dict) and isinstance(r.get("from"), str) and not re.search(r"[<>\"=]", r["from"])
    ]
words = sorted(set(words), key=len, reverse=True)
if not words:
    sys.exit("no words to look for: name them, or pass --identity")

origin = "{0.scheme}://{0.netloc}".format(urlparse(start))
# A word boundary only where the phrase starts or ends with a word character: `\b+7` never matches.
def pattern(w):
    lead = r"(?<!\w)" if re.match(r"\w", w) else ""
    tail = r"(?!\w)" if re.search(r"\w$", w) else ""
    return lead + re.escape(w) + tail
brand = re.compile("|".join(pattern(w) for w in words), re.I)
href = re.compile(r'href="((?:' + re.escape(origin) + r')?/[^"#]*)"')
skip = re.compile(
    r"\.(css|js|png|jpe?g|svg|webp|avif|gif|ico|woff2?|xml|json|txt|pdf|zip)(\?|$)"
    r"|/(media|templates|images|administrator|plugins|components|api|wp-admin|wp-json|wp-content)/"
    r"|/_emdash/|/_astro/|/_image|/cdn-cgi/|format=feed|task=|tmpl=|\?_preview"
)


def fetch(url):
    """(status, final URL, body) — urllib follows redirects; an HTTP error still has a status."""
    # A link as the page wrote it may carry raw non-ASCII or a space (`/vi/projects/sector/sản xuất`);
    # it is percent-encoded once here, after undoing any encoding it already had.
    url = quote(unquote(url), safe=":/?&=#%+,;@!$'()*~-._")
    # A browser's User-Agent: behind Cloudflare, Python's default one is answered 403 on every page
    # (measured 25/09/2026 on cowork.tracy.site's sites), which this crawl would report as a broken site.
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (tracy brand-leaks crawl)"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.geturl(), response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, url, ""
    except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError) as e:
        return 0, url, str(e)


def sitemap_urls(url, depth=0):
    status, _, body = fetch(url)
    if status != 200 or depth > 2:
        return None if depth == 0 else []
    locs = [html.unescape(x).strip() for x in re.findall(r"<loc>(.*?)</loc>", body, re.S)]
    if "<sitemapindex" in body:
        out = []
        for child in locs:
            out += sitemap_urls(child, depth + 1) or []
        return out
    return locs


def path_of(url):
    p = urlparse(url)
    return (p.path or "/") + (f"?{p.query}" if p.query else "")


listed = sitemap_urls(origin + "/sitemap.xml")
listed_paths = sorted({path_of(u) for u in (listed or []) if u.startswith(origin)})
limit = ceiling or max(400, 2 * len(listed_paths) + 100)

seen, queue = set(), deque([path_of(start)] + listed_paths)
found = defaultdict(set)
broken = {}
while queue and len(seen) < limit:
    path = queue.popleft().replace(origin, "")
    if path in seen:
        continue
    seen.add(path)
    status, final, body = fetch(origin + path)
    # A page NAMED 404 (a template's own "not found" showcase, linked from its kit menu) answers
    # 404 by design; every other non-200 is a page this crawl could not read.
    if status == 404 and urlparse(path).path.rstrip("/").split("/")[-1] == "404":
        continue
    if status != 200:
        broken[path] = status or body[:80]
        continue
    if not final.startswith(origin):
        continue
    for m in re.finditer(r"<title>(.*?)</title>", body, re.S):
        if brand.search(m.group(1)):
            found[("<title>", html.unescape(m.group(1)).strip()[:120])].add(path)
    for m in re.finditer(r'<meta[^>]+(?:name|property)="([^"]+)"[^>]+content="([^"]*)"', body):
        if brand.search(m.group(2)):
            found[(f"meta {m.group(1)}", html.unescape(m.group(2))[:120])].add(path)
    for m in re.finditer(r'(alt|title|aria-label|placeholder)="([^"]*)"', body):
        if brand.search(m.group(2)):
            found[(f"attr {m.group(1)}", html.unescape(m.group(2))[:120])].add(path)
    for m in re.finditer(r'href="(mailto:|tel:)([^"]*)"', body):
        if brand.search(m.group(2)):
            found[(f"link {m.group(1)}", html.unescape(m.group(2))[:120])].add(path)
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", body, flags=re.S)
    for m in re.finditer(r">([^<>]+)<", text):
        if brand.search(m.group(1)):
            classes = re.findall(r'class="([^"]+)"', text[max(0, m.start() - 1500) : m.start()])
            where = f"text .{classes[-1].split()[0]}" if classes else "text"
            found[(where, html.unescape(m.group(1)).strip()[:120])].add(path)
    for link in href.findall(body):
        if not skip.search(link):
            queue.append(link)

rows = sorted(found.items(), key=lambda kv: (-len(kv[1]), kv[0]))
if listed is None:
    coverage = None
    coverage_line = "sitemap: none at /sitemap.xml" + (" (required)" if require_sitemap else "")
else:
    read = [p for p in listed_paths if p in seen]
    coverage = 100.0 if not listed_paths else 100.0 * len(read) / len(listed_paths)
    coverage_line = f"sitemap: {len(read)}/{len(listed_paths)} crawled (coverage {coverage:.0f}%)"
print(f"pages crawled: {len(seen)}; {coverage_line}; not 200: {len(broken)}; distinct spots: {len(rows)}")
for path, status in sorted(broken.items()):
    print(f"  HTTP {status} | {path}")
for (where, text), pages in rows:
    print(f"{len(pages):>3} pages | {where:<32} | {text} | e.g. {sorted(pages)[0]}")
red = bool(rows) or bool(broken) or (coverage is not None and coverage < 100) or (coverage is None and require_sitemap)
print("RESULT:", "RED" if red else f"GREEN · coverage {'n/a' if coverage is None else f'{coverage:.0f}%'} · 0 leaks")
sys.exit(1 if red else 0)
