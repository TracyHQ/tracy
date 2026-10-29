/**
 * The packing rules of a content map's link targets and videos (spec TracyHQ/tracy#189 round 9, class C): each one a
 * declaration the brief engine needs to give a button a job or to take a play control off, measured wrong on a real build.
 *
 *   link target role   a slot whose demo value is a link target (`#`, a site route, an address, `mailto:`, `tel:`) is
 *                      declared as a link (a url role), never as a label, heading or paragraph: the build writes words into
 *                      a label, and a button's target written as words (or left at `#`) leads nowhere
 *   video names video  a video slot's demo value names its video (an id or a link): the build hides the play control of a
 *                      video the business has none for by that id, so a slot without one leaves a play button that opens
 *                      an empty frame
 *
 * Rules read slot roles and samples only, never a template's name or module id. They join `LINT_RULES`
 * (`content-map-lint.js`); how to fix each is in the quickstart-contract skill's declaration rules.
 */

const list = (v) => (Array.isArray(v) ? v : [])

/** A demo value that is only a link target. */
const LINK_TARGET =
  /^(?:#|javascript:\s*(?:void\(0\))?;?|index\.php\?\S*|https?:\/\/\S+|mailto:\S+|tel:\S+|\/[\w./?=&%-]*)$/i
/** Roles that hold a link: a url role, a map embed, a video. */
const LINK_ROLE = /(?:url|_link|\.map|\.video)$/
/** A YouTube or Vimeo id, or a link that names one video. */
const VIDEO_NAMED =
  /^[\w-]{6,}$|youtu\.be\/[\w-]{6,}|youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)[\w-]{6,}|vimeo\.com\/(?:video\/)?\d+|\.(?:mp4|webm|mov)(?:[?#]|$)/i

/** @type {import('./content-map-lint.js').LintRule[]} */
export const LINK_RULES = [
  {
    id: 'link-target-wrong-role',
    severity: 'error',
    checks: "a slot whose demo value is a link target is declared as a link, not as the button's words",
    fix: 'Give the slot type "url" and a url role (editorial.navigation_url, contact.cta_url, offering.cta_url) with its action. A link target declared as a label is written as words or left at "#", and the button leads nowhere (two buttons of an offering page did).',
    find: ({ slots }) =>
      list(slots)
        .filter((s) => s?.type !== 'image' && typeof s?.role === 'string' && !LINK_ROLE.test(s.role))
        .filter((s) => typeof s.sample === 'string' && LINK_TARGET.test(s.sample.trim()))
        .map((s) => ({ key: String(s.key), note: `link target "${s.sample.trim()}" declared as ${s.role}` }))
  },
  {
    id: 'video-slot-names-no-video',
    severity: 'error',
    checks: "a video slot's demo value names its video, so the build can take its play control off",
    fix: 'Capture the video id or link the play control opens as the slot sample. The build hides a play control by the demo video it names when the business has no video for it; with none named, the button stays and opens an empty frame.',
    find: ({ slots }) =>
      list(slots)
        .filter((s) => s?.role === 'business.video')
        .filter((s) => !VIDEO_NAMED.test(String(s.sample ?? '').trim()))
        .map((s) => ({
          key: String(s.key),
          note: `video slot sample "${String(s.sample ?? '')}" names no video`
        }))
  }
]
