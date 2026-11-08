#!/usr/bin/env bash
# Rebuild seed/ from the source stand's dump. Run from the package root.
#   SRC_WORK=<work dir> ingest/rebuild-seed.sh
# SRC_WORK holds: spec/ (from-joomla.mjs output), j6/ (joomla-dump.mjs output), webroot/ (the extracted release).
set -euo pipefail
W="${SRC_WORK:?SRC_WORK is the folder holding spec/ j6/ webroot/}"
cp "$W/spec/site-model.json" seed/site-model.json
node ingest/shape-model.mjs seed/site-model.json "$W/j6/inventory.json"
node ingest/enrich-diner.mjs seed/site-model.json "$W/j6/inventory.json"
node ingest/bind-paths.mjs seed/site-model.json
node tools/compile-seed.mjs seed/site-model.json seed --config seed/compile.config.json
node ingest/normalize-seed-dates.mjs seed/seed.json
node ingest/html-to-portable-text.mjs seed/seed.json
node ingest/build-media-map.mjs seed "$W/webroot"
node tools/validate-seed.mjs seed/seed.json
node ingest/build-inventory.mjs seed/site-model.json "$W/snapshot" "$W/spec/page-map.json" inventory
node ingest/build-route-table.mjs seed/site-model.json src/lib/page-routes.json
