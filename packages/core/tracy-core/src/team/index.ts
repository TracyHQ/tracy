/**
 * The team: one book per site, shared by My Sites (the people cluster on a row) and the Team tab.
 * A plugin imports `@tracy/core/team`, never the package root: the root also carries the legacy
 * Cowork pane and its `@tracy/i18n` catalogues, and a bundle that pulls those in ships Vietnamese
 * strings to every browser — `check-language` refuses exactly that.
 *
 * A plugin that builds JavaScript only (no CSS) imports `@tracy/core/team/face` instead: this entry
 * pulls `@tracy/ui`, whose own entry imports `tokens.css` (see `face.tsx`).
 */
export * from './roster'
export {
  addressFace,
  Face,
  FaceStack,
  NEUTRAL_FACE_COLOUR,
  type PersonFace,
  TEAM_CHANGED_EVENT
} from './face'
export {
  ChangeRoleDialog,
  PeopleCluster,
  PermissionLegend,
  RevokeDialog,
  RoleBadge,
  Roster,
  type Viewer
} from './team'
export { type InvitableSite, InviteWizard, type WizardPreset } from './wizard'
export type { Translate } from './translate'
