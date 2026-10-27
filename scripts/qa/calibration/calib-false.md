# feat(ops): health doors answer in JSON

## What this PR does

Calibration PR of the nightly QA (not a real change). Its claims are deliberately false: no commit on `develop` implements them.

`GET /ops/healthz` now answers with JSON: the body is `{"status":"ok"}` and the content type is `application/json`.

`GET /health` answers 204 with an empty body.

## Why

Monitoring tools parse JSON more easily than plain text.
