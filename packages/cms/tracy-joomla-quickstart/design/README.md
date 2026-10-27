# Design contract for the working Editorial demo

The folder was `tracy-apple/` until 26/10/2026 and was renamed for a brand-neutral name. The
contract ids inside it (`tracy-apple-design`, `tracy-apple-studio`), the release slug
`tracy-apple/j6` and the od-design-system id `apple` are published identifiers and keep their
spelling.

`tracy-editorial/design-contract.json` pins the accepted Style Guide, expected CSS tokens, typography
roles, header gutter/height, component dimensions and required page/viewport/theme coverage.
The source version records the SHA-256 of the actual `/templates/tracy/css/styles/apple.css` read
from port 8212. Scope: 152 public route/query URLs plus six artifact URLs with `{mode}` selection,
158 page entries × four variants = 632 cases. This is a target contract, not an assertion that
all those cases already conform. It is separate from both the site-content profile and the
published quickstart presentation lock.

The T4 skill's [design-contract reference](../../../../vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/references/design-contract.md)
describes the required workflow and executable schema. Do not regenerate expected styles from a
page that has drifted. Change site CSS/role mapping, or document an intentional design decision.
Style-guide specimen labels stay 40px on mobile; actual section titles use 28px. Their separate
roles avoid treating every h2 as the same thing.

## Measured pilot, 2026-09-12

Home and Style Guide were measured in Chrome on the running `t4-skill-j6-web-1` container,
bound to `/site/t4-skill-j6/.webroot` inside Docker Desktop. Four variants per page:
1440×900 and 390×844, real light/dark toggle, read-only computed styles. The probe found no
unclassified elements within the configured coverage. One Home capture reported fonts not ready;
it was replaced by a fresh capture after loading. No site CSS or content was changed in this turn.

`pilot-observations.json` contains the measured property values and every matching element count.
Repeated CSS objects were deduplicated during transport, then expanded; `path` is the rule ID and
zero-based match index. It identifies the nth visible element matching the contract selector, not
an original DOM CSS path. No expected values were used to fill missing measurements.
`pilot-report.json`: 8/8 cases, 336 element/rule measurements, 1,152 properties/tokens, zero findings.
Elements can be measured by more than one role, so 336 is not a count of unique DOM nodes.

From the repo root:

```bash
node vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/design-contract.mjs pilot packages/cms/tracy-joomla-quickstart/design/tracy-editorial/design-contract.json packages/cms/tracy-joomla-quickstart/design/tracy-editorial/pilot-observations.json
```

The full `audit` command must reject these eight pilot observations as incomplete. It needs all
632 cases. The earlier typography-only crawl is not evidence for this new, broader design audit.
Remaining work for each consuming task: map any uncovered component/paragraph role, measure the
full agreed matrix and review screenshots/interactions. Current paragraph coverage includes the
specified lead/body/section descriptions; it is not an audit of every paragraph style on the site.

Marketing artifacts retain their existing source styles today. Their target rows require site
palette/type roles and an observed `data-bs-theme` signal; they are not grandfathered in as passing.
The marketing migration must wire the signal, map token aliases, and declare any intended
poster/slide exceptions with a real decision reference. Test every slide/state in addition to the
settled-page probe. The Wrapper's external iframe is outside site styling; its shell is in scope.
The account profile row records the public redirect to Sign in, not a private-profile acceptance.

The contract is an agent/build gate. It does not intercept arbitrary shell/CMS writes or replace
the existing Claude Cowork plugin's structural permissions. Preserve the contract/hash and both pilot/full
reports in future spec-packs and checkpoints; a pilot pass is never a full-site pass.
