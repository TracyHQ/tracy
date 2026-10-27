# @lexingtonthemes/astro-image-inspector

Astro Dev Toolbar app that lets you **inspect images on hover** during local development: see actual size, render size, loading mode, and common warnings (upscaled, oversized source, missing dimensions).

Only runs when `astro dev` is running; it does not appear in production builds.

## Install

```bash
npm install @lexingtonthemes/astro-image-inspector --save-dev
```

## Setup

In `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import imageInspector from '@lexingtonthemes/astro-image-inspector';

export default defineConfig({
  integrations: [
    imageInspector(),
  ],
});
```

## Usage

1. Run `astro dev`.
2. Hover near the bottom of the page to show the Dev Toolbar.
3. Click the **Image Inspector** icon to turn inspection on.
4. Hover over any `<img>` on the page to see:
   - **natural** – intrinsic width×height
   - **rendered** – displayed width×height
   - **loading** – `lazy` / `eager` / `auto`
   - **warnings** – e.g. Upscaled, Possibly oversized source, No width/height

The inspector draws a highlight around the hovered image and shows a small info panel (bottom-left by default).

## Config

| Option            | Default            | Description                                              |
| ----------------- | ------------------ | -------------------------------------------------------- |
| `enabled`         | `true`             | Enable the Image Inspector app.                         |
| `appName`         | `"Image Inspector"`| Label in the dev toolbar.                               |
| `showWarningsOnly`| `false`            | *(Reserved)* Only show panel when there are warnings.    |
| `warnOnUpscale`   | `true`             | *(Reserved)* Warn when image is rendered larger than source. |
| `warnOnOversized` | `true`             | *(Reserved)* Warn when source is much larger than render size. |

Example:

```js
imageInspector({
  enabled: true,
  appName: 'Images',
}),
```

## Warnings

- **Upscaled** – Rendered size is larger than the image’s natural size.
- **Possibly oversized source** – Natural dimensions are more than 2× the rendered size (good candidate for resizing).
- **No width/height** – Missing `width`/`height` attributes (can affect layout and LCP).

## Publishing (maintainers)

This package is published under the [@lexingtonthemes](https://www.npmjs.com/settings/lexingtonthemes/packages) npm organization.

```bash
npm run build
npm publish
```

Ensure you are logged in (`npm login`) and have access to the `lexingtonthemes` org.

## License

MIT © [Lexington Themes](https://lexingtonthemes.com/)
