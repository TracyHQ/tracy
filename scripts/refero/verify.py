"""Verify snapshot completeness, file hashes, source parsing and rendered export parity."""

import gzip
import json
from pathlib import Path

from crawl import ROOT, Page, digest, save_json


def main():
    catalog = json.loads((ROOT / "catalog.json").read_text())
    snapshot = json.loads((ROOT / "snapshot.json").read_text())
    completeness = json.loads((ROOT / "source/completeness.json").read_text())
    identifiers = set(completeness["ids"])
    catalog_ids = {row["id"] for row in catalog["systems"]}
    assert not completeness["failures"], "Capture failures remain"
    assert not completeness["unprocessed"], "Unprocessed styles remain"
    assert len(catalog_ids) == len(catalog["systems"]) == catalog["count"], "Catalog has duplicates or count drift"
    assert catalog_ids == identifiers, "Catalog does not cover discovery"
    assert snapshot["count"] == snapshot["discoveredCount"] == len(identifiers), "Snapshot count drift"
    assert digest((ROOT / "catalog.json").read_bytes()) == snapshot["catalogSha256"], "Catalog hash drift"
    assert digest((ROOT / "source/exporter/refero-export.chunk.js").read_bytes()) == snapshot["exporterSha256"], "Exporter hash drift"
    file_count = 0
    byte_count = 0
    themes = {}
    component_html_count = 0
    for index, identifier in enumerate(sorted(identifiers), 1):
        directory = ROOT / "systems" / identifier
        manifest = json.loads((directory / "manifest.json").read_text())
        assert manifest["id"] == identifier and manifest["status"] == "complete"
        files = {item["path"]: item for item in manifest["files"]}
        required = {"DESIGN.md", "tokens.css", "tailwind-v4.css", "design-tokens.json", "design-system.json", "source/result.json", "source/page.html.gz", "source/react-flight.txt.gz"}
        required.update("exports/compact/" + filename for filename in ("DESIGN.md", "tokens.css", "tailwind-v4.css", "design-tokens.json"))
        assert required <= set(files), (identifier, "Required file missing")
        assert any(name.startswith("assets/screenshot.") for name in files), (identifier, "Screenshot missing")
        for name, item in files.items():
            target = directory / name
            assert target.resolve().is_relative_to(directory.resolve()), "Manifest path escapes style"
            data = target.read_bytes()
            assert digest(data) == item["sha256"] and len(data) == item["bytes"], (identifier, name, "Hash/size drift")
            file_count += 1
            byte_count += len(data)
            if name.endswith(".json"):
                json.loads(data)
        html = gzip.decompress((directory / "source/page.html.gz").read_bytes())
        http = json.loads((directory / "source/http.json").read_text())
        assert digest(html) == http["sha256"], (identifier, "HTTP capture hash drift")
        page = Page(html)
        assert page.field("styleId") == identifier, (identifier, "Captured page identifies a different style")
        result = json.loads((directory / "source/result.json").read_text())
        assert page.field("result") == result, (identifier, "Serialized source drift")
        assert json.loads((directory / "design-system.json").read_text()) == result["designSystem"]
        assert (directory / "DESIGN.md").read_text() in page.pre, (identifier, "Export parity drift")
        screenshot_http = json.loads((directory / "source/screenshot-http.json").read_text())
        assert screenshot_http["contentType"].startswith("image/"), (identifier, "Screenshot is not an image")
        screenshot_name = next(name for name in files if name.startswith("assets/screenshot."))
        assert files[screenshot_name]["sha256"] == screenshot_http["sha256"], (identifier, "Screenshot HTTP hash drift")
        theme = result["designSystem"].get("theme", "unknown")
        themes[theme] = themes.get(theme, 0) + 1
        component_html_count += sum(bool(component.get("html")) for component in result["designSystem"].get("components", []))
        if index % 200 == 0:
            print(f"Verified {index}/{len(identifiers)}", flush=True)
    report = {"status": "PASS", "styles": len(identifiers), "filesHashed": file_count, "bytesHashed": byte_count, "themes": themes, "componentsWithHtmlField": component_html_count, "checks": ["discovery/catalog/snapshot counts and UUID sets", "all manifest file SHA-256 and byte counts", "all JSON files parse", "original HTTP capture hash", "React Flight source resolves to stored result", "design-system JSON equals source result", "extended DESIGN.md equals public rendered export", "required exports and screenshot present"]}
    save_json(ROOT / "source/verification.json", report)
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
