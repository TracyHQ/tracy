# Browser UI

A small web app for Website Opportunities that runs in any modern browser, with no framework and no build
step. It covers:

- **Find**: search an area (with a radius) or one business by name, see each place's "needs a website"
  score and why, and save the ones worth a website.
- **My opportunities**: the places you saved, with their research status.
- **Place profile**: score reasons, research status with **Research** and **Research again**
  (the plan, why each part runs and the most it may cost, before you confirm), sources, photos and
  social page numbers.
- **Outreach preview**: the contact channels found for the place and a draft message. Nothing is sent
  from the app: each channel opens a draft in your own mail or chat app.
- **Build demo**: **Build it with Tracy** sends the place to [Tracy](https://tracy.ai) once the operator has
  connected the server (Operator, Tracy tab), then follows the build to the demo's link and expiry; the site brief
  stays below it to copy or download for any other tool.

## Why no build step

The files in `public/` are plain ES modules and CSS, served exactly as they are in the repository.
There is nothing to compile, so there is no built copy that can fall behind its source, and the app adds
no dependency to the package. The view logic that turns server answers into what the screen shows lives
in `public/view-models.js`, which has no DOM access and is tested with `node --test`.

## Serving it

`ui/index.js` exports `uiDir`, the absolute path of the folder to serve:

```js
import { uiDir } from 'website-opportunities/ui'
```

A server must:

1. Serve the files in `uiDir` as static files at `/` (`/` answers `index.html`). Use the usual content
   types: `text/html`, `text/javascript` for `.js`, `text/css`.
2. Serve the API at `/api/website-opportunities/*` on the same origin (the router in `src/route.js`).
3. If it is protected by an operator token, accept `Authorization: Bearer <OPERATOR_TOKEN>` on every
   API request and answer `401` (or `403`) without it. The app then asks for the token once and keeps
   it in `sessionStorage` for that browser tab only. Photos are read through the API with the same
   header, so the media door needs no cookie.

With Hono, for example:

```js
import { serveStatic } from '@hono/node-server/serve-static'
import { relative } from 'node:path'
import { uiDir } from 'website-opportunities/ui'

app.use('/*', serveStatic({ root: relative(process.cwd(), uiDir) }))
```

## Translating

Every word the app shows is in `public/strings.js`. Copy the map and change the values only; keys and
`{placeholders}` stay as they are.

## Tests

- `test/ui-view-models.test.mjs`: score display, status labels, sources, social numbers, the Research
  again plan, the outreach preview and the manual brief.
- `test/ui-boundary.test.mjs`: every module the page loads is a file inside `public/`, the page loads
  nothing from another host, and the text is public English.
