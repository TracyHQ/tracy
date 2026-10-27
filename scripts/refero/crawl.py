"""Capture the complete publicly discoverable Refero Styles snapshot, with resumable writes."""

import argparse
import concurrent.futures
import gzip
import hashlib
import json
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / "vendor/tracy/refero"
BASE = "https://styles.refero.design"
UUID = r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"
STYLE_LINK = re.compile(r"/style/(" + UUID + r")")
DECODER = json.JSONDecoder()
LOG_LOCK = threading.Lock()


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def save_json(path, value):
    save(path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())


def save_gzip(path, data):
    save(path, gzip.compress(data, mtime=0))


class Limiter:
    def __init__(self, rate):
        self.lock = threading.Lock()
        self.next = 0
        self.interval = 1 / rate

    def wait(self):
        with self.lock:
            target = max(time.monotonic(), self.next)
            self.next = target + self.interval
        time.sleep(max(0, target - time.monotonic()))


class Client:
    def __init__(self, rate):
        self.limiter = Limiter(rate)

    def fetch(self, url):
        for attempt in range(4):
            self.limiter.wait()
            request = urllib.request.Request(url, headers={"User-Agent": "Tracy-Refero-Snapshot/1.0 (user-authorized archive)"})
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    body = response.read()
                    return body, {"url": url, "finalUrl": response.url, "status": response.status, "fetchedAt": now(), "sha256": digest(body), "bytes": len(body), "contentType": response.headers.get("Content-Type"), "etag": response.headers.get("ETag")}
            except urllib.error.HTTPError as error:
                if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise
                retry = error.headers.get("Retry-After", "")
                time.sleep(min(60, int(retry) if retry.isdigit() else 2 ** (attempt + 1)))
            except (OSError, TimeoutError):
                if attempt == 3:
                    raise
                time.sleep(2 ** (attempt + 1))


class Page(HTMLParser):
    def __init__(self, body):
        super().__init__(convert_charrefs=True)
        self.in_script = False
        self.in_pre = False
        self.pre = []
        self.frames = []
        self.meta = {}
        self.links = []
        self.feed(body.decode())
        self.rsc = "".join(self.frames)
        self.records = self.read_records(self.rsc)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script":
            self.in_script = True
        if tag == "pre":
            self.in_pre = True
            self.pre.append("")
        if tag == "meta":
            self.meta[attrs.get("property", attrs.get("name", ""))] = attrs.get("content", "")
        if tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script = False
        if tag == "pre":
            self.in_pre = False

    def handle_data(self, data):
        if self.in_pre:
            self.pre[-1] += data
        if self.in_script:
            for match in re.finditer(r"self\.__next_f\.push\(", data):
                frame = DECODER.raw_decode(data[match.end():])[0]
                if frame[0] == 1 and isinstance(frame[1], str):
                    self.frames.append(frame[1])

    @staticmethod
    def read_records(text):
        data = text.encode()
        position = 0
        records = {}
        while position < len(data):
            match = re.match(rb"([0-9a-f]+):", data[position:])
            if not match:
                position += 1
                continue
            key = match[1].decode()
            position += match.end()
            text_header = re.match(rb"T([0-9a-f]+),", data[position:])
            if text_header:
                position += text_header.end()
                size = int(text_header[1], 16)
                records[key] = data[position:position + size].decode()
                position += size
            else:
                end = data.find(b"\n", position)
                if end < 0:
                    end = len(data)
                try:
                    records[key] = json.loads(data[position:end])
                except (ValueError, UnicodeDecodeError):
                    pass
                position = end + 1
        return records

    def resolve(self, value, trail=()):
        if isinstance(value, dict):
            return {key: self.resolve(item, trail) for key, item in value.items()}
        if isinstance(value, list):
            return [self.resolve(item, trail) for item in value]
        if isinstance(value, str) and re.fullmatch(r"\$[0-9a-f]+", value):
            key = value[1:]
            if key not in self.records or key in trail:
                raise ValueError(f"Unresolved RSC reference: {value}")
            return self.resolve(self.records[key], trail + (key,))
        return value

    def field(self, name):
        marker = json.dumps(name) + ":"
        position = self.rsc.find(marker)
        if position < 0:
            return None
        return self.resolve(DECODER.raw_decode(self.rsc[position + len(marker):])[0])


def log(row):
    with LOG_LOCK:
        with (ROOT / "source/crawl-log.jsonl").open("a") as output:
            output.write(json.dumps(row, ensure_ascii=False) + "\n")


def capture(client, identifier):
    directory = ROOT / "systems" / identifier
    existing = directory / "manifest.json"
    if existing.exists():
        manifest = json.loads(existing.read_text())
        if manifest.get("status") == "complete" and all((directory / item["path"]).is_file() for item in manifest["files"]):
            return manifest
    try:
        body, provenance = client.fetch(BASE + "/style/" + identifier)
        page = Page(body)
        result = page.field("result")
        if not isinstance(result, dict) or not result.get("designSystem"):
            raise ValueError("Missing public serialized style result")
        save_gzip(directory / "source/page.html.gz", body)
        save_gzip(directory / "source/react-flight.txt.gz", page.rsc.encode())
        save_json(directory / "source/result.json", result)
        save_json(directory / "source/http.json", provenance)
        save_json(directory / "design-system.json", result["designSystem"])
        process = subprocess.run(["node", str(REPO / "scripts/refero/export.mjs"), str(directory / "source/result.json"), str(directory), str(ROOT / "source/exporter/refero-export.chunk.js")], capture_output=True, text=True, timeout=20)
        if process.returncode:
            raise ValueError("Export formatter failed: " + process.stderr[-600:])
        displayed = next((text for text in page.pre if "Style Reference" in text), None)
        generated = (directory / "DESIGN.md").read_text()
        if displayed is None or displayed != generated:
            raise ValueError("Extended DESIGN.md differs from public rendered export")
        media = {key: page.field(key) for key in ("screenshotUrl", "previewVideoUrl", "previewVideoPosterUrl", "previewVideoDetailUrl", "previewVideoDetailPosterUrl")}
        screenshot_url = media.get("screenshotUrl") or page.meta.get("og:image")
        if screenshot_url:
            if urllib.parse.urlparse(screenshot_url).hostname != "images.refero.design":
                raise ValueError("Unexpected screenshot host")
            screenshot, screenshot_http = client.fetch(screenshot_url)
            extension = Path(urllib.parse.urlparse(screenshot_url).path).suffix or ".jpg"
            screenshot_file = "assets/screenshot" + extension
            save(directory / screenshot_file, screenshot)
            save_json(directory / "source/screenshot-http.json", screenshot_http)
        files = [{"path": str(file.relative_to(directory)), "sha256": digest(file.read_bytes()), "bytes": file.stat().st_size} for file in sorted(directory.rglob("*")) if file.is_file() and file.name != "manifest.json" and not file.name.endswith(".tmp")]
        manifest = {"schemaVersion": "tracy-refero-snapshot-style/v1", "id": identifier, "status": "complete", "name": result["meta"].get("siteName"), "url": BASE + "/style/" + identifier, "sourceWebsite": result["meta"].get("url"), "extractedAt": result["meta"].get("extractedAt"), "capturedAt": provenance["fetchedAt"], "theme": result["designSystem"].get("theme"), "industry": result["designSystem"].get("industry"), "description": result["designSystem"].get("northStar"), "media": media, "files": files, "exportParity": "exact", "linkedStyles": sorted(set(STYLE_LINK.findall(body.decode())))}
        save_json(existing, manifest)
        log({"id": identifier, "status": "complete", "at": now(), "pageSha256": provenance["sha256"]})
        return manifest
    except Exception as error:
        failed = {"id": identifier, "status": "failed", "at": now(), "error": str(error)}
        log(failed)
        return failed


def discover(client):
    directory = ROOT / "source/discovery"
    directory.mkdir(parents=True, exist_ok=True)
    ids = set()
    sitemap_ids = set()
    observations = []
    collections = []
    for name, url in [("robots.txt", BASE + "/robots.txt"), ("sitemap.xml", BASE + "/sitemap.xml"), ("styles.xml", BASE + "/sitemaps/styles.xml"), ("collections.xml", BASE + "/sitemaps/collections.xml")]:
        body, provenance = client.fetch(url)
        save(directory / name, body)
        observations.append(provenance)
        ids.update(STYLE_LINK.findall(body.decode()))
        if name == "styles.xml":
            sitemap_ids = set(STYLE_LINK.findall(body.decode()))
        if name == "collections.xml":
            ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            collections = [item.findtext("s:loc", namespaces=ns) for item in ET.fromstring(body).findall("s:url", ns)]
    for index, url in enumerate(list(dict.fromkeys(collections + [BASE + "/?sort=popular", BASE + "/?sort=newest"]))):
        body, provenance = client.fetch(url)
        save_gzip(directory / f"collection-{index:03}.html.gz", body)
        ids.update(STYLE_LINK.findall(body.decode()))
        observations.append(provenance)
    result = {"discoveredAt": now(), "sitemapCount": len(sitemap_ids), "count": len(ids), "ids": sorted(ids), "observations": observations, "galleryApi": {"url": BASE + "/api/styles?sort=newest", "observedStatus": 403, "used": False}, "scope": "All style UUIDs in public sitemaps, collection pages and linked style pages; private or unlisted records cannot be enumerated through the denied gallery API."}
    save_json(directory / "index.json", result)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--rate", type=float, default=4)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--reuse-discovery", action="store_true")
    args = parser.parse_args()
    if args.workers < 1 or args.rate <= 0:
        parser.error("workers and rate must be positive")
    started = now()
    client = Client(args.rate)
    discovery_file = ROOT / "source/discovery/index.json"
    discovery = json.loads(discovery_file.read_text()) if args.reuse_discovery and discovery_file.exists() else discover(client)
    ids = set(discovery["ids"])
    pending = sorted(ids)[:args.limit] if args.limit else sorted(ids)
    results = {}
    print(f"Discovery: {len(ids)} UUIDs ({discovery['sitemapCount']} in sitemap)", flush=True)
    while pending:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {executor.submit(capture, client, identifier): identifier for identifier in pending}
            for future in concurrent.futures.as_completed(futures):
                identifier = futures[future]
                result = future.result()
                results[identifier] = result
                if result["status"] != "complete":
                    print(f"FAIL {identifier}: {result['error']}", flush=True)
                if len(results) % 25 == 0 or result["status"] != "complete":
                    print(f"Progress {len(results)}/{len(ids)}: {sum(row['status'] == 'complete' for row in results.values())} complete", flush=True)
                save_json(ROOT / "source/progress.json", {"startedAt": started, "updatedAt": now(), "discovered": len(ids), "processed": len(results), "complete": sum(row["status"] == "complete" for row in results.values()), "failed": [row for row in results.values() if row["status"] != "complete"]})
        linked = {linked for row in results.values() for linked in row.get("linkedStyles", [])}
        pending = sorted(linked - ids) if not args.limit else []
        ids.update(linked)
    successes = sorted([row for row in results.values() if row["status"] == "complete"], key=lambda row: row["id"])
    failures = [row for row in results.values() if row["status"] != "complete"]
    catalog = {"schemaVersion": "tracy-refero-catalog/v1", "count": len(successes), "systems": [{key: row.get(key) for key in ("id", "name", "url", "sourceWebsite", "theme", "industry", "description", "extractedAt", "capturedAt")} for row in successes]}
    save_json(ROOT / "catalog.json", catalog)
    report = {"startedAt": started, "finishedAt": now(), "discovered": len(ids), "processed": len(results), "complete": len(successes), "failures": failures, "unprocessed": sorted(ids - set(results)), "ids": sorted(ids), "parityChecked": len(successes), "scope": discovery["scope"], "mediaPolicy": "Screenshot stored locally; preview videos and alternative poster URLs preserved as source references, not downloaded."}
    save_json(ROOT / "source/completeness.json", report)
    save_json(ROOT / "snapshot.json", {"schemaVersion": "tracy-refero-snapshot/v1", "status": "complete-public-discovery" if not failures and not report["unprocessed"] else "partial", "startedAt": started, "finishedAt": report["finishedAt"], "source": BASE, "authorization": {"basis": "User reports separate license agreement and authorizes full acquisition and local vendor storage", "confirmedDate": "2026-10-08", "agreementTextStored": False}, "count": len(successes), "discoveredCount": len(ids), "catalogSha256": digest((ROOT / "catalog.json").read_bytes()), "exporterSha256": digest((ROOT / "source/exporter/refero-export.chunk.js").read_bytes()), "scope": discovery["scope"]})
    print(json.dumps({"complete": len(successes), "failed": len(failures), "unprocessed": len(report["unprocessed"])}), flush=True)


if __name__ == "__main__":
    main()
