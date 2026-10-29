# Phase 0 — Provision a customer website from a T4 quickstart

## Select from the customer input

Keep the existing intake: ask for the HTML folder or reference URL if no design input has been
supplied. Once supplied, inspect the pages, navigation, business purpose and required features.
Choose the quickstart yourself from that evidence; the customer need not know a template name.
Respect an explicit customer choice. Explain the selected product and why it fits, then continue.
The full spec-pack is still produced in Phase 2.

Start at [JoomlArt Products tags](https://github.com/JoomlArt-Products/joomlart-products/tags).
Discover the current catalog and product manifest paths from `catalog/catalog.json`; inspect the
candidate manifests, template metadata and available demos. Prefer the T4 starter with the closest
page structure and working extensions, then visual similarity. Verify Joomla/PHP compatibility.
Do not freeze a list of 30 products: the catalog changes, and the repository also contains T3
quickstarts. Confirm T4 from the candidate metadata and archive rather than the tag name alone.

## Download the actual quickstart

This is a private repository. Use authorized repository access in an operator environment; customer
agents use the entitled product download service when available. Never give customers repository
credentials. If access or the required download endpoint is unavailable, state the missing access
or endpoint and request the quickstart archive; continue design analysis while it is unavailable.

Quickstart tags use `quickstart/<product-id>/j<major>`. The installable archive is a **release asset**,
not GitHub's automatically generated Source code ZIP/tarball. Resolve the asset from the product
manifest's `amember.quickstarts[].github_release_url` and the corresponding release. For authorized
GitHub CLI access:

```bash
gh api --paginate 'repos/JoomlArt-Products/joomlart-products/releases?per_page=100' \
  --jq '.[] | {tag_name, assets: [.assets[] | {name, size, browser_download_url}]}'
gh release view "$QUICKSTART_TAG" --repo JoomlArt-Products/joomlart-products --json tagName,assets
gh release download "$QUICKSTART_TAG" --repo JoomlArt-Products/joomlart-products \
  --pattern "$QUICKSTART_ASSET" --dir "$DOWNLOAD_DIR"
```

Resolve these variables from observed metadata. Asset names vary and must not be inferred from the
product name. Validate the archive and record product, tag, resolved commit, asset name/URL,
download date and SHA-256 in the build notes. Tags are rolling; tag alone cannot reproduce a build.
Keep downloaded archives and credentials out of Git.

## Install and verify

1. Inspect the archive layout, Joomla and T4 manifests, template, installer or restoration format,
   bundled extensions and sample-data instructions. A full Joomla root and an Akeeba backup need
   different installation procedures. Find the real root even if there is a wrapper directory.
2. Provision into a new empty site directory and database using the available authorized stack.
   For local DDEV, derive PHP requirements from the selected package and use `ddev describe` for
   the actual URL. Reuse an already provisioned matching site; never overwrite an existing customer
   database or webroot just to install a starter.
3. Run that package's installer/restoration and import its supplied demo data. Retain the selected
   product template and its style/menu/module assignments. Generate per-run admin credentials and
   keep them outside committed files. Remove the installer after successful installation.
4. Verify the frontend and administrator load; `plugins/system/t4/` exists and the T4 system plugin
   is registered and enabled; the selected template is active; its demo pages, menus and required
   extensions work. Record actual Joomla, PHP, T4 and template versions, the template name and style
   IDs, and the dark-mode hook. Resolve version-specific differences before following later packets
   that were written against the bundled Joomla 6 starter.
5. Enable development settings/clear the T4 optimize cache, then capture a file and database baseline
   excluding secrets and downloaded archives. Preserve the starter's working content relationships.

Phase 0 is complete only when the chosen quickstart is running with its T4 template and demo data,
and its identity and baseline are recorded. Continue Phase 1 with that installed template, then
Phase 2 with the customer's design input and the existing Phase 3–10 flow. The input quickstart is
the starting website; Phase 10's output quickstart packages the finished customer website.

For an explicitly requested standalone template from scratch, use `provision.md` and the bundled
T4 blank instead. If no compatible product fits a customer website, explain the mismatch before
switching to that different starting point.
