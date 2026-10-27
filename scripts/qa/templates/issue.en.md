{{marker}}
## What

The nightly QA run `{{runId}}` checked PR #{{pr}} on the `tracy-qa` stand built from `develop` at `{{sha}}`.
For the case(s) below, the stand does not behave the way the PR description says. Two models agree:
a test-writing lane saw the test fail twice at `{{sha}}`, and a second model (`verify`) observed the
difference on its own. This says behaviour differs from the description at `{{sha}}`; it does not say
which change caused it.

- PR: #{{pr}} · author: {{author}} · merged by: {{mergedBy}}
- Stand: `{{sha}}` (manifest checked against `develop`)
{{ownerNote}}
## Cases

Tick a box once you have confirmed the case is a real defect.

{{cases}}

## How to answer

Comment one line per case (people with write access; the newest line wins):

- `daily-qa: confirmed <case id>` — the behaviour is wrong
- `daily-qa: false-positive <case id>` — the description or the test is wrong

A ticked box counts as confirmed. When you close the issue, the label `daily-qa:confirmed` or
`daily-qa:false-positive` applies to every case nobody answered. The script never edits this text;
new cases for this PR arrive as comments.
