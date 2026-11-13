// Which picture roles a build may generate a picture for (ticket #595, spec #577). Pure data and one lookup. Every
// picture role of the shared vocabulary (`place-content-roles/3`) is listed: a role a build may generate for, or a role
// it never generates for, with the reason. A role missing from the table is never generated (`generationOf`), and a test
// holds the table to the vocabulary, so a new picture role cannot slip through unexplained.
//
// 🔒 NEVER GENERATED: a picture of a person (it would be an invented face), a logo (the brand step owns the business's
// logo; an award or partner logo is the other entity's own mark, never drawn), the template's design values, an icon
// (icons come from the icon library, `icon-selection.mjs`), a map and a video.
import { modeOfRole, PLACE_CONTENT_ROLES_V3 } from './place-content-roles.mjs'

/** Roles a build may generate a picture for when no own photo fits (within the cap of six). */
export const GENERATED_PICTURE_ROLES = Object.freeze([
  'business.hero_image',
  'business.gallery_image',
  'offering.image',
  'event.image',
  'article.image',
  'editorial.illustration'
])

/** Roles a build never generates a picture for, with the reason a frame of the role records when it stays empty. */
export const NEVER_GENERATED_ROLES = Object.freeze({
  'person.image': 'no_generated_people',
  'quote.author_image': 'no_generated_people',
  'stat.proof_image': 'no_generated_people',
  'business.logo': 'logo_from_brand_step',
  'claim.entity_logo': 'no_own_logo',
  'editorial.design_element': 'design_value',
  'editorial.item_icon': 'icon_from_icon_library',
  'contact.map': 'map_not_generated',
  'business.video': 'no_fitting_video'
})

/** Roles whose frame shows a person. */
export const PEOPLE_ROLES = Object.freeze(
  Object.keys(NEVER_GENERATED_ROLES).filter((role) => NEVER_GENERATED_ROLES[role] === 'no_generated_people')
)
/** Roles whose frame shows a logo. */
export const LOGO_FRAME_ROLES = Object.freeze(['business.logo', 'claim.entity_logo'])

const MAY = new Set(GENERATED_PICTURE_ROLES)

/**
 * Whether a frame of this role may take a generated picture: `{may: true}`, or `{may: false, reason}`. An unknown or
 * missing role is never generated.
 * @param {string | null | undefined} role
 */
export function generationOf(role) {
  if (MAY.has(role)) return { may: true }
  return { may: false, reason: NEVER_GENERATED_ROLES[role] ?? 'role_not_generated' }
}

/** Every picture role of the vocabulary: the roles written as a picture (`modeOfRole` asset) and the editorial ones. */
export function pictureRolesOfVocabulary() {
  const editorial = ['editorial.illustration', 'editorial.design_element', 'editorial.item_icon']
  return PLACE_CONTENT_ROLES_V3.filter((role) => modeOfRole(role) === 'asset' || editorial.includes(role))
}
