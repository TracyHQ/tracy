# chore(ops): document the two public read doors an uptime probe may use

## What this PR does

Calibration PR of the nightly QA (not a real change). It states two facts that hold on every stand built from `develop`.

`GET /ops/healthz` answers 200 with the plain-text body `ok`, without a sign-in.

`GET /api/ui` answers 200 with a JSON object whose `hidden` field is an array, and the response carries `cache-control: no-store`.

## Why

An uptime probe and every customer page read these two doors without a cookie, so neither may require one.
