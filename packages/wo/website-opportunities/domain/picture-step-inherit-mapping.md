# Pictures step: rules inherited from the step chain

The build chat's pictures step (`picture-step.mjs` and the files it calls, `apps/tracy-web/src/step-chain-draft-*`)
copies the step chain's picture rules instead of writing new ones (#575, pictures gap audit). Each row names the step
chain's code, the build chat's copy, and what the new model forced to change. Only the frames differ by design: the
build chat reads them from the template kit (`block-store.json`, the blank site contract), not from a demo site.

| Rule | Step chain source | Build chat copy | Changed, and why |
|---|---|---|---|
| A photo with lettering or a watermark never fills a frame | `apps/tracy-web/src/site-pictures/photo-shortlist.js:16` `letteringOf`, `:42` `photoRefusal` | `picture-fit.mjs` `letteringOf`, `refusalOf` (`lettering`) | also reads the build labelling's `burnedInText` |
| A photo of another business never fills a frame | `photo-shortlist.js:27` `otherBusinessOf`, `:42` | `picture-fit.mjs` `refusalOf` (`other_business`) | none |
| A label that leaves lettering or another business undecided refuses the photo (P09) | `photo-shortlist.js:42` | `picture-fit.mjs` `refusalOf` (`label_unknown`) | judged only once a photo is labelled (`labelledBy`): the plan counts photos before labelling |
| A blurry photo never fills a frame | `photo-shortlist.js:34` `blurryOf` | `picture-fit.mjs` `refusalOf` (`blurry`) | no measured sharpness yet at placement: the vision opinion decides, as the step chain does when no measurement exists |
| A graphic never fills a photo frame | `photo-shortlist.js:42` | `picture-fit.mjs` `refusalOf` | none |
| A low quality photo only in a small frame | `photo-shortlist.js:97`, `picture-check/rules-files.js:88` `SMALL_FRAME_MAX` | `picture-fit.mjs` `lowQualityOut`, `SMALL_FRAME_MAX` | a frame with no declared size counts as large |
| The three photo risk questions asked of the vision model | `apps/tracy-web/src/lib/picture-vision.js:147-149` (prompt p6) | `picture-labelling-prompt.md`, answers required by `picture-labelling.mjs` | same wording; the answer is a required true or false |
| Research labels are reused, not asked again | `lib/picture-vision.js` labels kept on the brief assets (`brief-schema.json`) | `picture-research-labels.mjs` (`researchLabelsOf`, `withResearchLabels`) | joined back by the manifest address, as the needs profile keeps no labels |
| Text over a video refuses it from a video frame | `photo-shortlist.js:16` `letteringOf` | `needs-research-media.mjs` `videoLabelsOf` | the video records now carry it; the needs profile never reads video |
| An event's or a post's picture is never drawn | `site-pictures/picture-check/inputs-index.js:140` `documentaryFrame`, `ladder-rungs.js:64` `rungsFor` (#548) | `picture-roles.mjs` (`documentary_not_drawn`) | decided by the frame's role (`event.image`, `article.image`): the build chat has no planner wish naming its facts |
