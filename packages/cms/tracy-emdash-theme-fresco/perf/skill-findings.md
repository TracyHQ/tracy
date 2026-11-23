# Skill findings — JA Fresco port (this run)

| ID | Where | Defect | Worked around by |
|---|---|---|---|
| F-1 | `visual-qa.mjs --source-site` | The source files of the contract are snapshot paths (`about/index.html`); the Joomla stand does not serve them (404), so every parity selector read "source not measured". A static server on `source/snapshot` is the source site. | `python3 -m http.server` on the snapshot; also rewrite `http://127.0.0.1:18080` out of the mirrored HTML or its pictures load from a stand that must stay up |
| F-2 | `readTheme` (`visual-lib.mjs`) | Returns the first theme whose value matches the attribute, so a page with the same value for both themes reads `light` in the dark variant and fails `theme-not-applied`; a one-frame source needs a state mirror (`data-theme` set from the QA hook), not two equal values. | inline script mirrors `?theme=` / storage / system dark into `data-theme` (DECISIONS D18) |
| F-3 | `visual-qa.mjs` coverage | The unclassified-element rule needs a design rule per heading class on every page; a hand-kept per-page rule list drifts. | `ingest/build-contract.mjs` lists rules once and attaches to each page every rule whose selector matches a visible element |
| F-4 | `qa-browser.mjs` image gate (D-24 again) | A `loading="lazy"` image in an auto-scrolling strip never decodes; `qa.mjs --browser` hangs until the 600 s background limit. | strip images `loading="eager"` |
| F-5 | `html-to-portable-text` (copied) | A pull quote's `<figcaption>` author line was taken for an image caption and dropped. | the converter keeps a figcaption that follows a blockquote as a quote block |
| F-6 | audit | A page whose source has no heading band (Menu, Gallery, Offer) fails `h1 count 0`. | `sr-only` h1 with the page title |
| F-7 | `from-joomla.mjs` | Section titles (`main-section`, `top-desc`, module title) and the full image paths of picture fields are not in the model (bare basenames collide across folders). | `ingest/shape-model.mjs` reads them from the module parameters and `sections.json` |
| F-8 | scan in `scripts/opensource/scan.mjs` | Fails on this machine reading a vendored zip with `tar` ("does not look like a tar archive"), unrelated to the package. | not worked around |
