// R26. A kept social row links a profile its icon can draw: the row's own network, or one the template's icon family
// declares or evidences (lib/template-kit/icon-classes.js). Before this rule it was a judgement item ("social rows: icon
// fits the network") that no script checked, so a plan could keep a Twitter row linked to the TikTok profile on a kit
// with no TikTok icon; the copy check then failed it (W03) and no copy fix round could, since only the plan can hide the
// row (Central Padel on the local stand, 12/11/2026: two copy fix rounds, 155 s, the failure still standing).
import { socialIconTargets } from '../../lib/template-kit/social-icon-targets.js'

export function checkR26({ R, plan, kit, brief }) {
  const r = R.r26
  for (const [field, row] of socialIconTargets({ plan, kit, brief })) {
    if (row.network === row.target || row.expected) {
      r.ok()
      continue
    }
    r.fail(
      field,
      `this social row's icon draws ${row.network} but the row links the ${row.target} profile, and the template has no ${row.target} icon: hide the row (its link and its icon) or link it to a ${row.network} profile of the brief`,
      'plan'
    )
  }
}
