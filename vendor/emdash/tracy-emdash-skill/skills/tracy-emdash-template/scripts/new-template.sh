#!/usr/bin/env bash
# Start a new EmDash template package from this skill's kit: the generic tools, the regression
# tests (with their own DE/FR fixture) and a template.config.json skeleton to fill in. Design-
# specific files (seed builder, forms, views) are NOT copied -- write them for the new design
# following references/.
#   scripts/new-template.sh <target-dir> [package-name] [template-id]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:?target dir}"; NAME="${2:-@tracy/emdash-theme-new}"; ID="${3:-tracy-new}"
mkdir -p "$DEST/tools" "$DEST/tests" "$DEST/seed" "$DEST/src/styles" "$DEST/src/components/ui" "$DEST/src/lib"
# Recursive: tools/content-api/ is a directory, and `cp dir/*` without -R stops the script on it.
cp -R "$HERE"/tools/. "$DEST/tools/"
# The provenance stamps Tracy's comment picker reads (src/lib/stamps.ts) and the components that
# print them: kit-owned, byte for byte (check-kit-sync.mjs). The views that call them are the
# template's own. A middleware that keeps a stamped page out of shared caches is a starter the
# author may extend, so it is placed only when the template has none.
cp -R "$HERE"/src/. "$DEST/src/"
[ -e "$DEST/src/middleware.ts" ] || cp "$HERE/../assets/src-starter/middleware.ts" "$DEST/src/middleware.ts"
cp -R "$HERE"/tests/. "$DEST/tests/"
mkdir -p "$DEST/docs"
# Authored documentation belongs to the template agent; never overwrite existing guidance.
for FILE in "$HERE/../assets/package-docs/AGENTS.md" "$HERE/../assets/package-docs/docs/"*.md; do
  REL="${FILE#"$HERE/../assets/package-docs/"}"
  if [ ! -e "$DEST/$REL" ] && [ ! -L "$DEST/$REL" ]; then
    cp "$FILE" "$DEST/$REL"
  fi
done
chmod +x "$DEST"/tools/*.sh
# The fleet builds the packed template into an image (tracy-host: `docker build` on app.new/), so
# the package ships its own Dockerfile and the entrypoint it names. Labels start from the template
# id; version and CMS are re-stamped at release. Never overwrite one the author already tuned.
if [ ! -e "$DEST/Dockerfile" ]; then
  sed -e "s/__TEMPLATE_ID__/$ID/" -e "s/__TEMPLATE_VERSION__/0.1.0/" -e "s/__CMS_VERSION__/1.1.0/" \
    "$HERE/Dockerfile.template" > "$DEST/Dockerfile"
fi
node -e '
const fs=require("fs");
const out={id:process.argv[3],label:"New template",version:"0.1.0",locales:["en"],defaultLocale:"en",site:{title:"Site title",tagline:""},contentOrder:[],forms:{file:"tools/forms.json",bindings:[]},mail:{fromEmail:"",fromName:""},audit:{indexable:["^/(?!search)(?!404$).*"],noindex:["^/search"],notFound:["^/404$"],canonicalQuery:["page"],unknownProbes:[]}};
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,"\t")+"\n");' "$HERE/template.config.example.json" "$DEST/template.config.json" "$ID"
# the config points at tools/forms.json; start it empty so `seed-apply forms` has something to read
[ -f "$DEST/tools/forms.json" ] || printf '{ "forms": [] }\n' > "$DEST/tools/forms.json"
# A template that cannot put a customer's own words in hands every customer the demo brand. That
# was shippable until 19/09/2026: the kit carried no personalize tool and never asked for these two
# files, so tracy-saas went out without them and its customers answered a questionnaire whose
# answers had nowhere to go. Starters, not finished maps -- the author fills them in for this
# design, and tools/release.mjs refuses a package that still holds the placeholders.
# Tracy's Content API (tools/content-api) reads seed/content-api-map.json: one row per collection
# of seed/site-model.json. Every template answers it (tools/content-api-gate.mjs, run by release).
for SEED in questions.json personalize.json content-api-map.json; do
  [ -e "$DEST/seed/$SEED" ] || cp "$HERE/../assets/seed-starter/$SEED" "$DEST/seed/$SEED"
done
cat > "$DEST/pnpm-workspace.yaml" <<'Y'
# Marker: this template is a standalone pnpm project (its own lockfile).
packages: []
allowBuilds:
  better-sqlite3: true
  esbuild: true
  sharp: true
  "@parcel/watcher": true
Y
cat > "$DEST/.gitignore" <<'G'
node_modules/
dist/
.astro/
data/
uploads/
.emdash/types.ts
.env
.env.*
!.env.example
*.token
evidence/
backups/
G
echo "kit copied to $DEST (package $NAME, template id $ID; pin versions per references/runtime.md)"
echo "next: template.config.json (identity, locales, form bindings, audit policy, qa.theme hook) · package.json · astro.config.mjs · src/styles/{tokens,global}.css · components.json · seed/ · tools/build-seed.mjs"
echo "personalize: seed/questions.json (what the customer is asked) and seed/personalize.json (where their answers land) ship as placeholders -- fill both, and list them with tools/personalize.mjs in distribution.include; release.mjs refuses a package that still holds the placeholders"
echo "contract: node tools/qa-contract.mjs init <design-folder> qa.contract.json --config template.config.json, then author pages/rules/interactions (references/qa-contract.md)"
echo "content api + stamps: add contentApi (tools/content-api/integration.mjs) to astro.config.mjs behind process.env.TRACY_CONTENT_API_SCALARS === '1' (the Dockerfile turns it on), fill seed/content-api-map.json, stamp each view with stampFor() from src/lib/stamps.ts and render <PageOwner>; check: node tools/content-api-gate.mjs"
echo "tests: \`node --test tests/*.test.mjs\` runs the kit's regression tests against a mock EmDash API"
echo "docs: complete DOCS_REQUIRED markers, then node tools/generate-docs.mjs; release gate: node tools/generate-docs.mjs --check"
echo "acceptance: node tools/qa.mjs --contract qa.contract.json --source <design-folder> --site <origin> --out evidence/qa-1 --browser; package: node tools/distribution.mjs pack qa.contract.json <new-dir>"
