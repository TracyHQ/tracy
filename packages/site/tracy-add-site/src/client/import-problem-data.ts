/** Approved import case structure. Every displayed word is owned by strings.ts. */
export interface ImportProblemData {
  severity: string
  what: string
  why?: string
  fix?: string[]
  options?: boolean
  more?: { title: string; steps: string[] }
  actions?: string[]
  quiet?: boolean
  fail?: number
  field?: string
}
export const IMPORT_PROBLEMS: Record<string, ImportProblemData> = {
  'preflight.unavailable': { severity: 'warning', what: 'import_preflight_unavailable' },
  'preflight.wp_noform': { severity: 'error', what: 'import_preflight_wp_noform' },
  'legacy.claim_stands': { severity: 'error', what: 'import_error_claim_stands' },
  'legacy.import_removing': { severity: 'error', what: 'import_error_import_removing' },
  'legacy.invalid_site_key': { severity: 'error', what: 'import_error_invalid_site_key' },
  'legacy.invalid_request': { severity: 'error', what: 'import_error_invalid_request' },
  'legacy.unsupported_platform': { severity: 'error', what: 'import_error_unsupported_platform' },
  'legacy.access_check': { severity: 'error', what: 'import_error_access_check' },
  'legacy.no_access': { severity: 'error', what: 'import_error_no_access' },

  firewall: {
    severity: 'error',
    what: 'import_firewall_unknown',
    fix: ['import_problem_p19_fix_0', 'import_problem_p17_fix_1'],
    options: true
  },
  p6: {
    severity: 'error',
    what: 'import_problem_p6_what',
    fix: ['import_problem_p6_fix_0', 'import_problem_p6_fix_1'],
    options: false,
    field: 'cred'
  },
  p7: {
    severity: 'error',
    what: 'import_problem_p7_what',
    fix: ['import_problem_p7_fix_0', 'import_problem_p7_fix_1'],
    options: false,
    field: 'cred'
  },
  p8: {
    severity: 'error',
    what: 'import_problem_p8_what',
    fix: ['import_problem_p8_fix_0', 'import_problem_p8_fix_1', 'import_problem_p8_fix_2'],
    options: true,
    field: 'signin'
  },
  p9: {
    severity: 'error',
    what: 'import_problem_p9_what',
    fix: ['import_problem_p9_fix_0', 'import_problem_p9_fix_1'],
    options: true,
    field: 'signin'
  },
  p10: {
    severity: 'warning',
    what: 'import_problem_p10_what',
    why: 'import_problem_p10_why',
    fix: ['import_problem_p10_fix_0', 'import_problem_p10_fix_1'],
    options: true,
    field: 'basic'
  },
  p11: {
    severity: 'error',
    what: 'import_problem_p11_what',
    why: 'import_problem_p11_why',
    fix: ['import_problem_p11_fix_0', 'import_problem_p11_fix_1'],
    options: true,
    field: 'basic'
  },
  p12: {
    severity: 'error',
    what: 'import_problem_p12_what',
    fix: ['import_problem_p12_fix_0', 'import_problem_p12_fix_1'],
    options: false,
    field: 'url'
  },
  p13: {
    severity: 'error',
    what: 'import_problem_p13_what',
    why: 'import_problem_p13_why',
    fix: ['import_problem_p13_fix_0', 'import_problem_p13_fix_1'],
    options: true,
    field: 'signin'
  },
  p14: {
    severity: 'error',
    what: 'import_problem_p14_what',
    why: 'import_problem_p14_why',
    fix: ['import_problem_p14_fix_0', 'import_problem_p14_fix_1'],
    options: true,
    field: 'signin'
  },
  p15: {
    severity: 'error',
    what: 'import_problem_p15_what',
    why: 'import_problem_p15_why',
    fix: ['import_problem_p15_fix_0', 'import_problem_p15_fix_1'],
    options: true,
    field: 'signin'
  },
  p16: {
    severity: 'error',
    what: 'import_problem_p16_what',
    why: 'import_problem_p16_why',
    fix: [
      'import_problem_p16_fix_0',
      'import_problem_p16_fix_1',
      'import_problem_p16_fix_2',
      'import_problem_p16_fix_3'
    ],
    options: false,
    more: {
      title: 'import_problem_p16_more_title',
      steps: ['import_problem_p16_more_0', 'import_problem_p16_more_1']
    },
    field: 'signin'
  },
  p17: {
    severity: 'error',
    what: 'import_problem_p17_what',
    fix: ['import_problem_p17_fix_0', 'import_problem_p17_fix_1'],
    options: true,
    field: 'signin'
  },
  p18: {
    severity: 'error',
    what: 'import_problem_p18_what',
    why: 'import_problem_p18_why',
    fix: ['import_problem_p18_fix_0', 'import_problem_p18_fix_1'],
    options: true,
    field: 'signin'
  },
  p19: {
    severity: 'error',
    what: 'import_problem_p19_what',
    why: 'import_problem_p19_why',
    fix: ['import_problem_p19_fix_0', 'import_problem_p19_fix_1'],
    options: true,
    actions: ['import_problem_p19_action_0'],
    fail: 2
  },
  p20: {
    severity: 'error',
    what: 'import_problem_p20_what',
    fix: ['import_problem_p20_fix_0', 'import_problem_p20_fix_1', 'import_problem_p20_fix_2'],
    options: true,
    field: 'signin'
  },
  p21: {
    severity: 'error',
    what: 'import_problem_p21_what',
    why: 'import_problem_p21_why',
    fix: ['import_problem_p21_fix_0'],
    options: true,
    field: 'signin'
  },
  p22: {
    severity: 'error',
    what: 'import_problem_p22_what',
    why: 'import_problem_p22_why',
    fix: ['import_problem_p22_fix_0', 'import_problem_p22_or'],
    options: true,
    actions: ['import_problem_p22_action_0'],
    fail: 1
  },
  p23: {
    severity: 'error',
    what: 'import_problem_p23_what',
    fix: ['import_problem_p23_fix_0', 'import_problem_p23_fix_1'],
    options: true,
    actions: ['import_problem_p23_action_0'],
    fail: 1
  },
  p24: {
    severity: 'error',
    what: 'import_problem_p24_what',
    why: 'import_problem_p24_why',
    fix: ['import_problem_p24_fix_0', 'import_problem_p24_fix_1'],
    options: true,
    fail: 1
  },
  p25: {
    severity: 'error',
    what: 'import_problem_p25_what',
    fix: ['import_problem_p25_fix_0', 'import_problem_p25_fix_1'],
    options: false,
    actions: ['import_problem_p25_action_0'],
    fail: 1
  },
  p26: {
    severity: 'error',
    what: 'import_problem_p26_what',
    fix: ['import_problem_p26_fix_0', 'import_problem_p26_fix_1'],
    options: true,
    actions: ['import_problem_p26_action_0', 'import_problem_p26_action_1'],
    fail: 1
  },
  p27: {
    severity: 'error',
    what: 'import_problem_p27_what',
    fix: ['import_problem_p27_fix_0'],
    options: true,
    actions: ['import_problem_p27_action_0'],
    fail: 1
  },
  p28: {
    severity: 'error',
    what: 'import_problem_p28_what',
    why: 'import_problem_p28_why',
    fix: ['import_problem_p28_fix_0', 'import_problem_p28_fix_1'],
    options: false,
    actions: ['import_problem_p28_action_0'],
    fail: 1
  },
  p29: {
    severity: 'error',
    what: 'import_problem_p29_what',
    why: 'import_problem_p29_why',
    fix: ['import_problem_p29_fix_0', 'import_problem_p29_or'],
    options: true,
    actions: ['import_problem_p29_action_0'],
    fail: 1
  },
  p30: {
    severity: 'error',
    what: 'import_problem_p30_what',
    fix: ['import_problem_p30_fix_0', 'import_problem_p30_fix_1', 'import_problem_p30_fix_2'],
    options: false,
    field: 'token'
  },
  p31: {
    severity: 'info',
    what: 'import_problem_p31_what',
    why: 'import_problem_p31_why',
    options: false,
    actions: ['import_problem_p31_action_0']
  },
  p32: {
    severity: 'error',
    what: 'import_problem_p32_what',
    why: 'import_problem_p32_why',
    fix: ['import_problem_p32_fix_0', 'import_problem_p32_fix_1', 'import_problem_p32_fix_2'],
    options: true,
    actions: ['import_problem_p32_action_0'],
    fail: 1
  },
  p33: {
    severity: 'error',
    what: 'import_problem_p33_what',
    fix: ['import_problem_p33_fix_0', 'import_problem_p33_fix_1'],
    options: true,
    actions: ['import_problem_p33_action_0'],
    fail: 1
  },
  p34: {
    severity: 'error',
    what: 'import_problem_p34_what',
    fix: ['import_problem_p34_fix_0'],
    options: true,
    actions: ['import_problem_p34_action_0'],
    fail: 1
  },
  p35: {
    severity: 'error',
    what: 'import_problem_p35_what',
    fix: ['import_problem_p35_fix_0'],
    options: true,
    actions: ['import_problem_p35_action_0'],
    fail: 2
  },
  // The site stopped answering mid-read (#1616): a gateway saying its origin is down, or no connection.
  p55: {
    severity: 'error',
    what: 'import_problem_p55_what',
    fix: ['import_problem_p55_fix_0', 'import_problem_p55_fix_1'],
    options: false,
    actions: ['import_problem_p55_action_0'],
    fail: 2
  },
  p36: {
    severity: 'error',
    what: 'import_problem_p36_what',
    why: 'import_problem_p36_why',
    fix: ['import_problem_p36_fix_0'],
    options: true,
    actions: ['import_problem_p36_action_0'],
    fail: 3
  },
  p37: {
    severity: 'error',
    what: 'import_problem_p37_what',
    fix: ['import_problem_p37_fix_0', 'import_problem_p37_fix_1'],
    options: false,
    actions: ['import_problem_p37_action_0'],
    fail: 2
  },
  p38: {
    severity: 'error',
    what: 'import_problem_p38_what',
    why: 'import_problem_p38_why',
    fix: ['import_problem_p38_fix_0'],
    options: true,
    actions: ['import_problem_p38_action_0'],
    fail: 3
  },
  p39: {
    severity: 'error',
    what: 'import_problem_p39_what',
    why: 'import_problem_p39_why',
    fix: ['import_problem_p39_fix_0', 'import_problem_p39_fix_1'],
    options: false,
    field: 'cred'
  },
  p40: {
    severity: 'warning',
    what: 'import_problem_p40_what',
    why: 'import_problem_p40_why',
    options: true,
    actions: ['import_problem_p40_action_0'],
    quiet: true,
    fail: 4
  },
  p41: {
    severity: 'warning',
    what: 'import_problem_p41_what',
    why: 'import_problem_p41_why',
    options: false,
    actions: ['import_problem_p41_action_0'],
    quiet: true
  },
  p42: {
    severity: 'warning',
    what: 'import_problem_p42_what',
    why: 'import_problem_p42_why',
    options: false
  },
  p43: {
    severity: 'error',
    what: 'import_problem_p43_what',
    fix: ['import_problem_p43_fix_0'],
    options: true,
    actions: ['import_problem_p43_action_0'],
    fail: 4
  },
  p44: {
    severity: 'error',
    what: 'import_problem_p44_what',
    why: 'import_problem_p44_why',
    fix: ['import_problem_p44_fix_0'],
    options: true
  },
  p45: {
    severity: 'warning',
    what: 'import_problem_p45_what',
    why: 'import_problem_p45_why',
    options: false,
    actions: ['import_problem_p45_action_0']
  },
  'p45.server': {
    severity: 'error',
    what: 'import_problem_p45_server_what',
    fix: ['import_problem_p45_server_fix_0', 'import_problem_p45_server_fix_1'],
    actions: ['import_problem_p45_server_action_0', 'import_problem_p45_server_action_1']
  },
  p46: {
    severity: 'error',
    what: 'import_problem_p46_what',
    why: 'import_problem_p46_why',
    fix: ['import_problem_p46_fix_0'],
    options: true,
    more: {
      title: 'import_problem_p46_more_title',
      steps: ['import_problem_p46_more_0', 'import_problem_p46_more_1']
    },
    actions: ['import_problem_p46_action_0', 'import_problem_p46_action_1']
  },
  p47: {
    severity: 'info',
    what: 'import_problem_p47_what',
    why: 'import_problem_p47_why',
    options: false
  },
  p48: {
    severity: 'info',
    what: 'import_problem_p48_what',
    why: 'import_problem_p48_why',
    fix: ['import_problem_p48_fix_0'],
    options: true,
    actions: ['import_problem_p48_action_0'],
    quiet: true
  },
  p49: {
    severity: 'error',
    what: 'import_problem_p49_what',
    why: 'import_problem_p49_why',
    fix: ['import_problem_p49_fix_0'],
    options: true,
    actions: ['import_problem_p49_action_0']
  },
  p50: {
    severity: 'warning',
    what: 'import_problem_p50_what',
    fix: ['import_problem_p50_fix_0'],
    options: true,
    actions: ['import_problem_p50_action_0']
  },
  p51: {
    severity: 'error',
    what: 'import_problem_p51_what',
    why: 'import_problem_p51_why',
    fix: ['import_problem_p51_fix_0', 'import_problem_p51_fix_1', 'import_problem_p51_fix_2'],
    options: false,
    actions: ['import_problem_p51_action_0']
  },
  p52: {
    severity: 'info',
    what: 'import_problem_p52_what',
    why: 'import_problem_p52_why',
    fix: ['import_problem_p52_fix_1'],
    options: false,
    actions: ['import_problem_p52_action_0'],
    quiet: true
  },
  p53: {
    severity: 'warning',
    what: 'import_problem_p53_what',
    why: 'import_problem_p53_why',
    options: false,
    actions: ['import_problem_p53_action_0']
  },
  /** The recovery page found no run of the site on the host (`recoverImport` `none`). */
  p54: {
    severity: 'warning',
    what: 'import_problem_p54_what',
    why: 'import_problem_p54_why',
    options: false
  },
  /** The recovery page could not ask the host (`recoverImport` `unknown`). */
  'p54.unreachable': {
    severity: 'warning',
    what: 'import_problem_p54_unreachable_what',
    options: false
  },
  'p53.again': {
    severity: 'warning',
    what: 'import_problem_p53_what',
    why: 'import_problem_p53_again_why',
    options: false,
    actions: ['import_problem_p53_again_action_0']
  },
  'pf1.green': {
    severity: 'ok',
    what: 'import_problem_pf1_green_what',
    options: false
  },
  'pf1.mismatch': {
    severity: 'warning',
    what: 'import_problem_pf1_mismatch_what',
    options: true
  },
  'pf1.cloudflare': {
    severity: 'warning',
    what: 'import_problem_pf1_cloudflare_what',
    why: 'import_problem_pf1_cloudflare_why',
    options: true
  },
  'pf1.wordfence': {
    severity: 'error',
    what: 'import_problem_pf1_wordfence_what',
    fix: ['import_problem_pf1_wordfence_fix_0'],
    options: true
  },
  'pf1.unknown': {
    severity: 'warning',
    what: 'import_problem_pf1_unknown_what',
    fix: ['import_problem_pf1_unknown_fix_0'],
    options: true
  },
  'pf1.dns': {
    severity: 'error',
    what: 'import_problem_pf1_dns_what',
    fix: ['import_problem_pf1_dns_fix_0', 'import_problem_pf1_dns_fix_1'],
    options: false
  },
  'pf1.timeout': {
    severity: 'error',
    what: 'import_problem_pf1_timeout_what',
    fix: [
      'import_problem_pf1_timeout_fix_0',
      'import_problem_pf1_timeout_fix_1',
      'import_problem_pf1_timeout_fix_2'
    ],
    options: true
  },
  'pf1.tls': {
    severity: 'error',
    what: 'import_problem_pf1_tls_what',
    why: 'import_problem_pf1_tls_why',
    fix: ['import_problem_pf1_tls_fix_0'],
    options: true
  },
  'pf1.taken': {
    severity: 'error',
    what: 'import_problem_pf1_taken_what',
    fix: ['import_problem_pf1_taken_fix_0', 'import_problem_pf1_taken_fix_1'],
    options: true
  },
  'pf1.mine': {
    severity: 'info',
    what: 'import_problem_pf1_mine_what',
    options: false
  },
  'pf1.tracy': {
    severity: 'error',
    what: 'import_problem_pf1_tracy_what',
    fix: ['import_problem_pf1_tracy_fix_0', 'import_problem_pf1_tracy_fix_1'],
    options: true
  },
  'pf2.green': {
    severity: 'ok',
    what: 'import_problem_pf2_green_what',
    options: false
  },
  'pf2.basic': {
    severity: 'warning',
    what: 'import_problem_pf2_basic_what',
    why: 'import_problem_pf2_basic_why',
    fix: ['import_problem_pf2_basic_fix_0', 'import_problem_pf2_basic_fix_1'],
    options: true
  },
  'pf2.gate': {
    severity: 'error',
    what: 'import_problem_pf2_gate_what',
    why: 'import_problem_pf2_gate_why',
    fix: ['import_problem_pf2_gate_fix_0'],
    options: true
  },
  'pf2.unreachable': {
    severity: 'error',
    what: 'import_problem_pf2_unreachable_what',
    fix: [
      'import_problem_pf2_unreachable_fix_0',
      'import_problem_pf2_unreachable_fix_1',
      'import_problem_pf2_unreachable_fix_2'
    ],
    options: false
  },
  'pf2.noform': {
    severity: 'error',
    what: 'import_problem_pf2_noform_what',
    fix: ['import_problem_pf2_noform_fix_0', 'import_problem_pf2_noform_fix_1'],
    options: false
  }
}
