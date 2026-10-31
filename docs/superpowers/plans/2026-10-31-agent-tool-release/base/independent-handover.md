# Independent handover: Tracy Base 0.5.7 reader candidate

Date: 2026-10-31. Reviewer: independent acceptance agent `/root/accept_base_candidate`.
Result: **Partial functional acceptance; G8/P8 acceptance remains incomplete.** Package integrity, independent runtime smoke, complete routing audit and actual admin UI publish/revert passed. Documentation gate failed, shipped admin acceptance helpers failed against the built UI, and a frozen-lock clean install was not run.

## Isolation and artifact identity

I received the skill, candidate source ZIP, matching scrubbed state archive and documents inside the ZIP. I did not use git, tasks, another agent's test results, or the sibling release verification files as acceptance evidence. The mandatory skill, qa-and-packaging and release-regressions references were read.

- Source ZIP: `/tmp/tracy-tool-release/base/release/tracy-base-emdash-quickstart-0.5.7.zip`; SHA-256 `076c959b0e055eeae2133d3f72ab9f7c58c2f28f3092e8521e32f127c916006e`.
- State: `tracy-base-emdash-state-0.5.7.tar.gz`; SHA-256 `31ef8740a8e762d50dedd0cbdb6c4fb10bb51c12071fe0e0f993ce2b38330d52`.
- Distribution artifactHash: `sha256:c1d84caef3781932597e14a5680528407414fdb15e393db85d0920906b1bfebd`; 308 files, verifier reported no errors. ContractHash: `sha256:6db50259173d21957d6673e0cb8f61cf43eacf283df2f1a24156860d9ff9b1e9`.
- Extraction/evidence: `/tmp/tracy-base-independent-20261031/`; source was first verified before runtime state/build output were added.
- Owned temporary container: `tracy-base-independent-20261031`, built candidate under `/app`, direct host origin `http://127.0.0.1:45371`, container port 4321. Runtime data existed only in this container and extracted fixture.
- Cached dependency image: `tracy/tracy-business-emdash:1.7.23-tools`, digest `sha256:96711fec9d763d8daaacee6da83770668335a16ee20a19d01b9fb31e790fbe54`.

Docker VM initially had 2.3GB free; host about 10GB. No image build, dependency installation or global cleanup was performed. All pre-existing containers were left untouched. Candidate source replaced the cached image's entire application directory except node_modules in the owned container. Therefore this runtime used cached dependencies: EmDash 1.1.0 and **Astro 7.2.8 rather than the candidate's pinned 7.0.0**. It is independent runtime evidence with a disclosed dependency substitution, not proof of a clean frozen-lock install or candidate Dockerfile build.

## Actual checks and results

1. `node tools/distribution.mjs verify .`: **PASS**, 308 files, no errors. ZIP has no runtime data, uploads, node_modules, tokens or live environment file; `.env.example` is intentionally included. Root Dockerfile, entrypoint, lockfile, seed/media, AGENTS and all eight authored guides plus generated inventory are present.
2. `node tools/generate-docs.mjs --check`: **FAIL**, `Missing or stale: docs/generated/inventory.json`. Stored inventory version is 0.5.6; package version is 0.5.7. Stored fingerprints for `package.json` and `template.config.json` are stale. No docs were edited to conceal this.
3. Candidate `astro build` with Content API enabled, executed directly through cached Astro binary in owned container: **PASS**. Log: `final-build.log`. Warnings include large chunks, deprecated plugin capability names and Node experimental SQLite. Initial attempt with symlinked node_modules at another application path failed Astro compile metadata resolution; rebuilding at native `/app` resolved that fixture-path issue.
4. Restore of supplied snapshot into a new owned fixture and ordinary home request: **PASS**, HTTP 200. This is quickstart snapshot startup, not seed-only installation.
5. `node tools/audit.mjs http://127.0.0.1:45371 ... --config template.config.json`: **PASS**, crawl complete, 81/81 pages OK, 28 assets, zero broken assets, zero findings. All eight declared unknown-path probes returned 404. Evidence: `audit/audit.json` and associated output.
6. `node tools/shoot.mjs ... --paths /,/services,/blog/how-to-write-like-hemingway --viewports 1440,390 --themes light,dark ...`: **PASS**, all 12 cells, HTTP 200, correct themes, no reported overflow/image/console/hydration findings; 4/4 islands hydrated. Evidence: `shots/shots.json`, JPEGs. These are smoke cells; they do not replace the full contract/visual matrix.
7. Built-admin authentication: SMTP configured using shipped `configure-smtp.mjs` against an owned local SMTP sink. The sink provided the Mailpit-compatible read endpoints consumed by the helper. **Real email-link delivery and admin authentication passed** using independent Playwright after the visible Continue confirmation step. Chromium/Playwright were locally available (Playwright 1.63.0); no browser installation occurred. Evidence: `admin-login.png`.
8. Shipped `admin-session.mjs`: **FAIL**, valid link arrives at `/_emdash/admin/login/magic-link`, whose page says “Continue to finish signing in.” The helper never clicks Continue and times out waiting to leave `/login`. This was separately established after correcting the test sink's MIME decoding/SMTP dot unstuffing; those earlier sink faults were fixture issues.
9. Shipped `admin-roundtrip.mjs`: **FAIL** after opening the real editor, changing/saving hero_title and confirming draft text absent publicly. It waits for `menuitem /^publish changes now$/`; the actual built UI presents a confirmation dialog with a “Publish changes” button. Evidence: `admin-roundtrip.json`, `editor-inspect.png`.
10. Independent Playwright completed the actual **admin UI edit → Save → Publish changes dialog → public changed → UI revert → Save → Publish changes dialog → original restored**: **PASS**. Original `home.hero_title` was “A better website starts with your business.” The saved draft did not leak publicly. Evidence: `manual-ui-roundtrip.json` (all three explicit public assertions true). No API write substituted for this UI acceptance.
11. Content API: anonymous `/content.json` rejected with `CONTENT_UNAUTHENTICATED`. Fresh authenticated GET initially returned 501 `CONTENT_ADAPTER_UNSUPPORTED` on the documented basic startup. After the reader README's offline `identity-sqlite.mjs init data/data.db`, plus a new runtime process supplied with private encryption key and canonical site URL, authenticated GET returned **200**, schema/site/provenance/snapshot/pagination/completeness envelope and 30 contents. Evidence: `authenticated-content.json`. The second reader-only server ran inside the same owned fixture on internal port 4322. This proves an authenticated reader listing; it does not certify relay authority, continuation budgets or every read shape.
12. Snapshot scrub inspection: credentials, auth_tokens, API tokens, OAuth tokens and audit logs were all empty. One enabled resident admin user remained (`the resident Tracy agent account`, role 50). Source ZIP itself has no DB. This differs from `docs/install.md`'s statement that the snapshot omits the machine's agent user; the fixture minted its own new PAT, and no prior credential was reused.

## Where the handover documents fall short

- Generated inventory is demonstrably stale (0.5.6 identity/fingerprints in a 0.5.7 package). The required read-only docs gate fails.
- Main install commands omit Content API identity initialization, encryption key and canonical site URL. Reader README explains these, but a maintainer following `docs/install.md` gets a working storefront and authenticated reader 501. The runbook should connect mandatory reader provisioning to normal quickstart startup.
- Built-admin helper and docs do not cover the real email-link Continue confirmation. The automated admin roundtrip also expects a publish menu that differs from the actual confirmation dialog. The docs promise executable tools that do not complete unaided.
- Snapshot scrub documentation says the resident machine agent user is absent; the archive retains that enabled user. Credentials are absent, but the stated guarantee should match the artifact.
- README links source/build history and known content gaps into unshipped `tasks/emdash-tracy-base/...`. A maintainer receiving only the package cannot inspect those decisions/gaps. The package should carry actionable gap/decision guidance rather than depending on absent repository history.

## Pending and unclaimed

Frozen-lock dependency installation, actual Dockerfile image build, seed-only clean install, full contract browser matrix, Fast Gate/four-tier full visual QA/source parity, negative fixture suite, restart/backup/restore recovery, forms submission/mail delivery, other locales, private proxy/vanity access, publication and production deliverability were **not run**. No pass is claimed for them. No source design was supplied for parity review. The system font is the declared platform-dependent design choice; comprehensive glyph audit was not run.

The independent gate should not be marked fully passed solely from this report while its documentation failure and unrun clean-install requirement remain unresolved. This report records successful functional checks and concrete handover failures separately.

## Cleanup

The owned container (including its two server processes, minted PAT, private key and runtime data) was stopped and removed. The SMTP sink was stopped. Browser session-state credential file was deleted. Existing containers/processes were not changed. Evidence and the original extracted candidate fixture remain under `/tmp/tracy-base-independent-20261031/` for review; nothing was published.
