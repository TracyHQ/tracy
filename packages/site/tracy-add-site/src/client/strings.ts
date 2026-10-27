/**
 * The display strings of `tracy-add-site`, separated from the components as DATA.
 *
 * DIVISION OF WORK (as with every other Tracy plugin):
 *   - This package OWNS the `tracy-add-site` namespace and ships the `en` copy as the base.
 *   - The `vi` copy is added by `@tracy/dsh-tracy-locale-vi` in the three-argument per-locale form.
 *   - `register` THROWS on a duplicate `(ns, locale)` — so exactly one caller per pair.
 *
 * 🔒 THE ENGLISH HERE IS CONTROLLED VOCABULARY. `vocabulary.md` §2 holds the three verbs of this flow —
 * **Add site**, **Create a new site**, **Import existing site** — and `check-language.ts` enforces
 * the banned list. Changing a string here changes product vocabulary; read `vocabulary.md` first.
 *
 * 🔒 PLATFORM NAMES ARE NOT TRANSLATED, in any language. `Joomla`, `WordPress`, `EmDash`, `Shopify`
 * are third-party proper nouns — translating them is a data-corruption bug, not an improvement
 * (`vocabulary.md` §7). That is why they are NOT in the table below: they live in
 * `platforms.ts` as data, where no translation reaches.
 */

/** The namespace this package owns. Same as the package name, for easy tracing in `--dump-config`. */
export const NS = 'tracy-add-site'

/** The translate function `ctx.locale.bind(NS)` returns. */
export type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * The English base.
 *
 * The four `error_*` keys are FOUR separate sentences, not one sentence used four times. `tracy-desk`
 * `CreateSiteForm.tsx` states the reason: *"Each refusal says its own thing… One sentence for all
 * four would leave a person guessing."* Folding them makes people guess where they went wrong.
 */
export const en: Record<string, string> = {
  // Create site: approved step checklist and guidance for retained client distinctions.
  create_details_complete: 'Site details complete',
  create_title_running: 'Creating your site',
  create_title_failed: 'Site setup incomplete',
  create_title_ready: 'Your site is ready',
  create_title_created: 'Your site has been created',
  create_resolve_title: 'How to resolve',
  create_technical: 'Technical details',
  create_copy_details: 'Copy details',
  create_support: 'Contact support',
  create_review_details: 'Review site details',
  create_step_cowork_joomla: 'Connecting your Joomla site',
  create_step_cowork_wordpress: 'Connecting your WordPress site',
  create_step_cowork: 'Connecting your site',
  create_step_agent: 'Setting up site access for Tracy',
  create_workspace_step: 'Preparing Tracy for editing',
  create_start_workspace: 'Try starting Tracy again',
  create_retry_design: 'Apply design system',
  create_my_sites: 'Open My Sites',
  create_reload_page: 'Reload page',
  create_status_reload: 'This page could not submit your request.',
  create_fix_reload: 'Reload this page, then press Create site again.',
  create_status_request: 'Tracy could not accept these site details.',
  create_fix_request: 'Review your site details. Contact support if this keeps happening.',
  create_status_account: 'Tracy could not confirm your account here.',
  create_fix_account: 'Review your site details or contact support to continue.',
  create_status_poll_signed_out: 'Your session has ended. Your site may still be in progress.',
  create_fix_poll_signed_out: 'Sign in again, then open My Sites to check your site.',
  create_headline_slow: 'This is taking longer than usual.',
  create_status_slow: 'You can leave this page; your new site will appear in My Sites when it is ready.',
  create_status_redirect_failed: 'Tracy could not open the page to continue adding your site.',
  create_fix_redirect_failed: 'Review your site details and try again, or contact support.',
  create_status_failed: 'Tracy could not finish setting up your site.',
  create_fix_failed: 'Check My Sites before trying again. Contact support if setup remains incomplete.',
  create_status_unreachable: 'Tracy cannot check progress right now. Your site may still be building.',
  create_fix_unreachable:
    'Check My Sites before creating another site. You can also wait here for an update.',
  create_status_workspace: 'Tracy could not confirm it is ready to edit your site.',
  create_fix_workspace: 'Try starting Tracy again. You do not need to create another site.',
  create_status_content: 'Some of your text or pictures may be missing.',
  create_fix_content: 'Start editing and tell Tracy what still needs to change.',
  create_status_address: 'Tracy could not confirm the site address.',
  create_fix_address: 'Contact support to check the site address.',
  create_status_submitting: 'Tracy is sending your request. Please wait for confirmation.',
  create_status_starting_post: 'Your site is created. Tracy is preparing to edit it.',
  create_status_starting: 'Your site is created. Tracy is starting so you can edit it.',
  create_status_ready: 'You can start editing it with Tracy now.',
  create_status_design_running: 'Tracy is applying your selected design system.',
  create_headline_accepted: 'Request accepted',
  create_headline_queued: 'Request queued',
  create_status_accepted: 'Waiting for the first progress update.',
  create_status_unknown: 'The latest update is not available yet. Tracy is checking again.',
  create_status_queued: 'Tracy will start setting up your site automatically.',
  create_status_running: 'Tracy is setting up your site. This page updates on its own.',
  create_status_gone: 'Tracy can no longer check progress for this site.',
  create_fix_gone:
    'Check My Sites to see whether you can open the site. Contact support if it is missing or inaccessible.',
  create_status_shape: 'This site name cannot be used.',
  create_fix_shape: 'Use 6 to 30 letters, numbers or hyphens, starting and ending with a letter or number.',
  create_status_reserved: 'That site name is reserved.',
  create_fix_reserved: 'Choose another site name.',
  create_status_looks_imported: 'That name is reserved for imported sites.',
  create_fix_looks_imported: 'Choose another site name.',
  create_status_taken: 'That site address is already in use.',
  create_fix_taken: 'Choose another site name. Check My Sites if the existing site belongs to you.',
  create_status_signed_out: 'Your session has ended.',
  create_fix_signed_out: 'Sign in again, then return here and press Create site.',
  create_status_pending: 'Your site request is still being processed.',
  create_fix_pending:
    'Check My Sites before submitting again. If the site is missing, wait a moment before pressing Create site again.',
  create_status_updating: 'Tracy is being updated.',
  create_fix_updating:
    'Check My Sites first. If the site is missing, wait a few minutes before trying again.',
  create_status_conflict: 'A request for this site already exists with different details.',
  create_fix_conflict:
    'Check My Sites for the site you requested. Choose another site name only if you want a separate site.',
  create_status_elsewhere: 'Tracy is taking you to the right place to finish adding your site.',
  create_fix_elsewhere: 'Wait for Tracy to redirect you, then continue there.',
  create_status_platform: 'This platform is not available for creating a site.',
  create_fix_platform: 'Go back and choose an available platform.',
  create_status_template: 'The selected template cannot be used to create this site.',
  create_fix_template: 'Go back and choose another template.',
  create_status_systems_off: 'Design systems are not available right now.',
  create_fix_systems_off: "Go back and choose Template default to keep the template's appearance.",
  create_status_system_locked: 'The selected template is not ready for this design system.',
  create_fix_system_locked: 'Go back and choose another design system or Template default.',
  create_status_system: 'The selected design system is no longer available.',
  create_fix_system: 'Go back and choose another design system or Template default.',
  create_status_capacity: 'Tracy is opening the page where you can continue adding your site.',
  create_fix_capacity: 'Wait for Tracy to redirect you, then continue adding your site there.',
  create_status_unconfirmed: 'Tracy cannot tell whether your site was created.',
  create_fix_unconfirmed:
    'Check My Sites. If your site is not there, try again. Contact support if this keeps happening.',
  create_status_design: 'Tracy could not confirm the design system was applied.',
  create_fix_design: 'Open your site to check its appearance, then try Apply design system if needed.',
  create_status_design_unavailable: 'The selected design system is no longer available.',
  create_fix_design_unavailable: 'Start editing and choose another design system from Design.',
  create_status_design_incompatible: 'This template does not support the selected design system.',
  create_fix_design_incompatible: "Start editing with the template's appearance.",
  create_status_design_locked: 'The template is not ready for the selected design system.',
  create_fix_design_locked: 'Start editing. Contact support before applying the design system again.',
  create_status_design_theme: 'Its current theme does not support the selected design system.',
  create_fix_design_theme: 'Start editing. Contact support before applying the design system again.',
  create_status_design_imported: 'The design system could not be applied to this imported site.',
  create_fix_design_imported: "Start editing with your site's current appearance.",
  create_status_design_read: 'Tracy could not check whether your site supports the design system.',
  create_fix_design_read: 'Try Apply design system again. Contact support if the check keeps failing.',
  create_status_design_write: 'The design system update could not be confirmed.',
  create_fix_design_write: 'Open your site to check its appearance before applying the design system again.',
  create_status_design_busy: 'Other changes prevented the design system update.',
  create_fix_design_busy: 'Wait for other changes to finish, then try Apply design system again.',
  create_status_design_gone: 'Tracy could not find the site for the design system update.',
  create_fix_design_gone: 'Check My Sites before trying again. Contact support if the site is missing.',

  create_title_checking: 'Checking your site',

  create_title_starting: 'Preparing Tracy for editing',

  create_title_unconfirmed: 'Site status unknown',
  create_title_redirect: 'One moment',
  create_title_redirect_failed: 'Continue adding your site',
  create_change_name: 'Change site name',
  create_change_template: 'Choose another template',
  create_change_platform: 'Choose another platform',
  create_change_system: 'Change design system',
  create_back_details: 'Review site details',
  sign_in_new_tab_aria: 'Sign in again (opens in a new tab)',
  create_title_request: 'Your site was not created',

  create_open_site: 'View your site',
  create_open_site_aria: 'View your site (opens in a new tab)',
  create_start_editing: 'Start editing',

  create_title_attention: 'Site update needs attention',
  create_design_step: 'Design system: {name}',
  create_workspace_unconfirmed: 'Editing readiness not confirmed',

  create_step_webroot: 'Downloading site files',
  create_step_platform: 'Setting up your site',
  create_step_baseline: 'Preparing site change history',
  create_step_writing: 'Preparing your text and pictures',
  create_step_address: 'Setting up the site address',
  create_status_design_queued: 'Waiting to apply your selected design system.',

  start_filter_search: 'Search, e.g. JA Impact',
  start_filter_count_all: 'Showing all {total} designs',
  start_filter_count: 'Showing {shown} of {total} designs',
  start_filter_empty: 'No designs match',
  start_preview_prev: 'Previous starting design',
  start_preview_next: 'Next starting design',
  start_preview_frame: '{name} live demo',
  start_preview_unavailable: 'A preview is not available for this design. You can still select it.',
  customize_lead:
    "What you enter here is what your customers will read. Anything you skip keeps the template's text.",
  customize_answered: '{n} of {total} answered',
  customize_group_business: 'Your business',
  customize_group_business_note: 'Tracy writes your pages from this',
  customize_group_language_tone: 'Language and tone',
  customize_name_placeholder: 'e.g. Acme Dental',
  customize_about_placeholder:
    'e.g. We help families in Dubai keep healthy smiles with gentle, modern dentistry.',
  customize_tone_hint: 'How Tracy writes your text',
  customize_group_brand: 'Brand',
  customize_group_brand_note: 'Optional, add later any time',
  customize_group_pages: 'Pages',
  customize_group_more: 'More',
  customize_pages_kept: '{kept} of {total} kept',
  customize_keep_all: 'Keep all',
  customize_logo_rule: 'PNG, transparent, 500px or more',
  customize_favicon: 'Favicon',
  customize_favicon_rule: 'PNG, square, 512px or more',
  customize_rewrite: 'Rewrite',
  customize_upload: 'Upload',
  wizard_review_live: 'Live in a few minutes after you press Create site.',
  wizard_review_not_set: 'Not set',
  wizard_review_pages: '{kept} of {total} pages',
  wizard_review_business: 'Your business',
  wizard_review_system_note: 'colours and fonts',
  wizard_steps: 'Add site steps',
  wizard_steps_done: 'All steps completed',
  wizard_step_position: 'Step {n} of {total}',
  wizard_adding: 'Adding',
  wizard_platform: 'Platform',
  wizard_design: 'Starting design',
  wizard_address: 'Site address',
  wizard_site_address: 'Site address',
  wizard_customize: 'Customize your site',
  wizard_system: 'Design system',
  wizard_access: 'Access method',
  wizard_signin: 'Sign in details',
  wizard_review: 'Review',
  wizard_source_title: 'Do you want to create a new site, or bring in a site you already run?',
  wizard_source_desc: 'Choose where you want to start.',
  wizard_platform_desc: 'Choose the platform your site runs on.',
  wizard_platform_title: 'Choose a platform',
  wizard_design_title: 'Choose a starting design',
  wizard_address_title: 'Pick your site address',
  wizard_design_desc: 'Your site starts from this design. You can change everything later.',
  wizard_address_desc: 'Tracy hosts your site here. You can connect your own domain later.',
  wizard_review_title: 'Ready to create your site',
  wizard_review_desc: 'Check your choices. You can change any of them now, or later in chat.',
  wizard_customize_skipped: 'Skipped, template text',
  wizard_customize_count: '{answered} of {total} answered, all optional',
  wizard_system_default: 'Template default',
  wizard_back: 'Back',
  wizard_continue: 'Continue',
  wizard_skip: 'Skip',
  wizard_edit: 'Change',
  wizard_edit_step: 'Change {step}',
  import_address_title: 'Which site are you bringing over?',
  import_address_description: 'Enter the address of the site you already run.',
  import_platform_title: 'Confirm the platform',
  import_platform_description: 'Choose the platform your site runs on.',
  import_access_title: 'How can Tracy read this site?',
  import_access_description: 'Choose how to connect to your existing site.',
  import_details_title: 'Sign in details',
  import_details_admin_description: 'Tracy signs in once and never keeps your password.',
  import_details_manual_description:
    'Install Claude Cowork in your admin, then copy the code from its settings.',
  import_review_title: 'Check and start the import',
  import_review_description: 'Tracy reads {domain} and makes a copy you can edit.',
  import_detected: 'Detected',
  import_code_pasted: 'Code pasted',
  import_preflight_online: 'Site is online',
  import_preflight_secure: 'Secure connection',
  import_preflight_firewall: 'Not blocked by a firewall',
  import_preflight_platform: 'Runs {platform}',
  import_preflight_ownership: 'Not in another Tracy account',
  import_preflight_admin_online: 'Admin page is online',
  import_preflight_admin_form: '{platform} sign-in page found',
  import_preflight_admin_unlocked: 'Admin area not locked',
  import_preflight_mismatch: 'This looks like a {detected} site, not {platform}.',
  import_preflight_unavailable: 'Tracy could not check this address right now.',
  import_preflight_wp_noform: 'There is no WordPress sign-in page at this address.',
  import_preflight_switch: 'Switch to {platform}',
  import_preflight_retry: 'Check again',
  import_preflight_keep: 'Continue with {platform}',
  import_open_my_sites: 'Open My Sites',
  import_wp_activate:
    'Go to <a data-import-link="wp-plugins">Plugins › Installed Plugins</a>, find Claude Cowork and activate it.',
  import_wp_install:
    'Install Claude Cowork in <a data-import-link="wp-install">Plugins › Add New</a> to see the reason for the failure.',

  import_upgrade_unknown: 'Your site has an older version of Claude Cowork.',
  import_php_unknown: 'Your site runs a PHP version that is too old for Claude Cowork.',
  import_php_change:
    'Many hosts let you change it yourself in the control panel, for example Select PHP Version in cPanel.',
  import_php_host: 'Otherwise, ask your hosting provider to upgrade PHP.',
  import_upload_raise: 'Ask your hosting provider to raise the upload limit.',
  import_upload_unknown: 'The Claude Cowork package is larger than this site accepts in one upload.',
  import_firewall_unknown: 'A firewall is blocking Tracy.',
  import_credentials_joomla_check:
    'Check the details by signing in at <a data-import-link="admin">{domain}/administrator</a> in your browser.',
  import_credentials_joomla_reset:
    'Forgot the password? Ask another Super User to reset it in <a data-import-link="joomla-users">Users › Manage</a>.',
  // Approved import problem copy. Rich text is limited to links, bold and code.
  import_resolve_title: 'How to resolve',
  import_copy_details: 'Copy details',
  import_use_account: 'Use another account',
  import_restart: 'Start again',
  import_retry: 'Try again',
  import_load_again: 'Load it again',
  import_retry_now: 'Retry now',
  import_setup_again: 'Set it up again',
  import_follow: 'Follow it',
  import_password_again: 'Enter the password again',
  import_problem_p6_what: 'The username or password is not correct.',
  import_problem_p6_fix_0:
    'Check the details by signing in at <a data-import-link="admin">{domain}/wp-admin</a> in your browser. Your email address works as the username too.',
  import_problem_p6_fix_1:
    'Forgot the password? <a data-import-link="reset">Reset it on your site\'s sign-in page</a>.',
  import_problem_p7_what: 'Joomla does not accept an email address here.',
  import_problem_p7_fix_0: 'Enter your Joomla username instead, for example admin.',
  import_problem_p7_fix_1:
    'Not sure of the username? Another Super User can find it in <a data-import-link="joomla-users">Users › Manage</a>.',
  import_problem_p8_what: '{domain} refused the sign-in without saying why.',
  import_problem_p8_fix_0:
    'Sign in at <a data-import-link="admin">{domain}/administrator</a> in your browser with the same details, to make sure they work.',
  import_problem_p8_fix_1: 'Use an account in the <b>Super Users</b> group.',
  import_problem_p8_fix_2:
    'If the account asks for a code from your phone, choose <a data-import-link="manual"><b>I will install it myself</b></a> above.',
  import_problem_p9_what: 'This account cannot open the Joomla administrator.',
  import_problem_p9_fix_0: 'Sign in with an account in the <b>Super Users</b> group.',
  import_problem_p9_fix_1:
    'To check an account: <a data-import-link="joomla-users">Users › Manage</a>, open it, then the Assigned User Groups tab.',
  import_problem_p10_what: 'This admin page asks for a server password first.',
  import_problem_p10_why: 'Your browser shows it as a pop-up before the sign-in page.',
  import_problem_p10_fix_0: 'Enter the server username and password in the two boxes above.',
  import_problem_p10_fix_1: 'Do not have them? Your hosting provider or developer does.',
  import_problem_p11_what: 'The server username or password is not correct.',
  import_problem_p11_why: 'This is the pop-up password, not your {platform} account.',
  import_problem_p11_fix_0: 'Check it with your hosting provider or developer.',
  import_problem_p11_fix_1: 'Enter it again in the two boxes above.',
  import_problem_p12_what: 'There is no Joomla sign-in page at this address.',
  import_problem_p12_fix_0:
    'Open <a data-import-link="default-admin">{domain}/administrator</a> in your browser to find the Joomla sign-in page.',
  import_problem_p12_fix_1:
    'If your site hides it behind a secret word, add that part (for example /administrator/?mysecret).',
  import_problem_p13_what: 'This account uses two-step sign-in.',
  import_problem_p13_why: 'Tracy cannot enter the code from your phone or app.',
  import_problem_p13_fix_0:
    'Choose <a data-import-link="manual"><b>I will install it myself</b></a> above. It takes about two minutes and does not need your password.',
  import_problem_p13_fix_1: 'Sign in with another Super User account that does not use two-step sign-in.',
  import_problem_p14_what: 'The sign-in page shows a captcha.',
  import_problem_p14_why: 'Tracy cannot solve it.',
  import_problem_p14_fix_0:
    'Choose <a data-import-link="manual"><b>I will install it myself</b></a> above. It takes about two minutes.',
  import_problem_p14_fix_1:
    'Turn off the captcha for the admin sign-in while you import, then turn it back on.',
  import_problem_p15_what: '{domain} has paused sign-ins for now.',
  import_problem_p15_why:
    'This happens after several wrong passwords. Trying again too soon can make the pause longer.',
  import_problem_p15_fix_0:
    'Choose <a data-import-link="manual"><b>I will install it myself</b></a> above. It does not need to sign in, so you can carry on now.',
  import_problem_p15_fix_1:
    'Wait until the site lets you in again, check the password in your browser, then try again.',
  import_problem_p16_what: 'Cloudflare is blocking Tracy.',
  import_problem_p16_why: 'Cloudflare treats Tracy as a bot. Pause these settings during the import:',
  import_problem_p16_fix_0:
    'In <a data-import-link="cloudflare">your Cloudflare dashboard</a>, go to Security › Settings › Bot traffic and turn off <b>Bot Fight Mode</b>.',
  import_problem_p16_fix_1: "On the site's Overview page, turn off <b>Under Attack Mode</b> if it is on.",
  import_problem_p16_fix_2:
    'In Security › Security rules, pause rules whose action is <b>Challenge</b> or <b>Block</b>.',
  import_problem_p16_fix_3: 'Turn these settings back on after the import finishes.',
  import_problem_p16_more_title: 'Keep protection on instead (paid plans)',
  import_problem_p16_more_0:
    'Add a custom rule that skips security when the user agent contains <code>Tracy/1.0</code>.',
  import_problem_p16_more_1:
    'On the Free plan this rule does not skip Bot Fight Mode, so step 1 is still needed.',
  import_problem_p17_what: 'Wordfence is blocking Tracy.',
  import_problem_p17_fix_0:
    'Ask whoever manages Wordfence (often your developer or hosting provider) to allow requests whose user agent contains <code>Tracy/1.0</code>.',
  import_problem_p17_fix_1:
    'Choose <a data-import-link="manual"><b>I will install it myself</b></a> above to keep your protection on.',
  import_problem_p18_what: 'A security extension locks this admin area.',
  import_problem_p18_why: 'Tracy cannot sign in through it (for example RSFirewall Protected Area).',
  import_problem_p18_fix_0:
    'Choose <a data-import-link="manual"><b>I will install it myself</b></a> above to keep your protection on.',
  import_problem_p18_fix_1: 'If your admin address uses a secret word, add it to the admin address.',
  import_problem_p19_what: 'Your hosting provider stopped Tracy partway through.',
  import_problem_p19_why: 'Hosts do this when one visitor makes many requests in a short time.',
  import_problem_p19_fix_0:
    'Ask your hosting provider to allow requests whose user agent contains <code>Tracy/1.0</code>, so it does not happen again.',
  import_problem_p19_fix_1: 'Wait a few hours before starting again.',
  import_problem_p19_action_0: 'Start again',
  import_problem_p20_what: 'Tracy could not reach {domain}.',
  import_problem_p20_fix_0: 'Open <a data-import-link="admin">{domain}/administrator</a> in your browser.',
  import_problem_p20_fix_1: 'If it does not load, check the address or ask your hosting provider for help.',
  import_problem_p20_fix_2:
    'If it loads for you, your hosting provider may block visitors from other countries. Ask them to allow requests whose user agent contains <code>Tracy/1.0</code>.',
  import_problem_p21_what: 'The security certificate of {domain} is not valid.',
  import_problem_p21_why: 'Tracy did not send your password, to keep it safe.',
  import_problem_p21_fix_0:
    'Ask your hosting provider to renew or fix the SSL certificate. Most hosts do this for free.',
  import_problem_p22_what: 'This account cannot install extensions.',
  import_problem_p22_why:
    '{username} can sign in, but Joomla only lets <b>Super Users</b> install extensions.',
  import_problem_p22_fix_0:
    'In <a data-import-link="joomla-users">Users › Manage</a>, open the account and check that Super Users is selected in Assigned User Groups.',
  import_problem_p22_or:
    'Ask a Super User to install Claude Cowork for you, then choose <a data-import-link="manual"><b>I will install it myself</b></a> and paste its access token.',
  import_problem_p22_action_0: 'Use another account',
  import_problem_p23_what: 'WordPress does not let this account install plugins.',
  import_problem_p23_fix_0:
    'Check the account\'s role in <a data-import-link="wp-users">Users › All Users</a>. It must be <b>Administrator</b>. If it is not, sign in with an Administrator.',
  import_problem_p23_fix_1:
    'If it is already an Administrator, your site has plugin installs turned off on purpose. Ask your hosting provider or developer to install Claude Cowork for you, then choose <a data-import-link="manual"><b>I will install it myself</b></a> and paste its access token.',
  import_problem_p23_action_0: 'Use another account',
  import_problem_p24_what: 'WordPress asks for FTP details to install plugins.',
  import_problem_p24_why: 'WordPress cannot write to its own folder on the server.',
  import_problem_p24_fix_0: 'Ask your hosting provider to let WordPress install plugins directly.',
  import_problem_p24_fix_1:
    'Choose <a data-import-link="manual"><b>I will install it myself</b></a> to download Claude Cowork. Unzip it and upload the folder to <code>wp-content/plugins</code> with your hosting file manager. Activate it in <a data-import-link="wp-plugins">Plugins › Installed Plugins</a>, then paste its access token in Tracy.',
  import_problem_p25_what: '{domain} did not accept the Claude Cowork install.',
  import_problem_p25_fix_0:
    'Install Claude Cowork in <a data-import-link="joomla-install">System › Install › Extensions</a> to see the reason for the failure.',
  import_problem_p25_fix_1:
    'If you need help, <a data-import-link="discord">ask us on Discord</a> and include that error.',
  import_problem_p25_action_0: 'Install it myself instead',
  import_problem_p26_what: 'The install did not finish, and Joomla did not say why.',
  import_problem_p26_fix_0:
    'Ask your hosting provider to check the server error log for what stopped the install.',
  import_problem_p26_fix_1:
    'Install it yourself in <a data-import-link="joomla-install">System › Install › Extensions</a>, where Joomla may show the error.',
  import_problem_p26_action_0: 'Install it myself instead',
  import_problem_p26_action_1: 'Try again',
  import_problem_p27_what: 'Claude Cowork is installed but switched off.',
  import_problem_p27_fix_0:
    'Go to <a data-import-link="joomla-manage">System › Manage › Extensions</a>, search for Claude Cowork and click its status icon to enable it.',
  import_problem_p27_action_0: 'Try again',
  import_problem_p28_what: 'Tracy could not connect to Claude Cowork.',
  import_problem_p28_why: 'The connection may be temporarily unavailable.',
  import_problem_p28_fix_0: 'If it happens again, check that no security extension blocks Claude Cowork.',
  import_problem_p28_fix_1: 'If it still fails, uninstall Claude Cowork and install it again.',
  import_problem_p28_action_0: 'Try again',
  import_problem_p29_what: 'Your site has Claude Cowork {installed}.',
  import_problem_p29_why: 'Tracy needs version {required} or newer.',
  import_problem_p29_fix_0:
    '<a data-import-link="wp-plugins">Go to Plugins in your WordPress admin</a> and click <b>Update now</b> under Claude Cowork.',
  import_joomla_update:
    'Go to <a data-import-link="joomla-update">System › Update › Extensions</a> in your Joomla admin and update Claude Cowork.',
  import_problem_p29_or:
    'Choose <a data-import-link="manual"><b>I will install it myself</b></a> to download the new version and upload it over the old one.',
  import_problem_p29_action_0: 'Try again',
  import_problem_p30_what: 'Tracy could not connect with that access token.',
  import_problem_p30_fix_0: 'Check that Claude Cowork is installed and switched on.',
  import_problem_p30_fix_1:
    'Copy the token again with its Copy button in <a data-import-link="joomla-cowork">Components › Tracy Claude Cowork</a>.',
  import_wp_token_settings:
    'Copy the token again with its Copy button in <a data-import-link="wp-settings">Settings › Claude Cowork</a>.',
  import_problem_p30_fix_2: 'Make sure the token comes from {domain}, the site in step 1.',
  import_problem_p31_what: 'The Claude Cowork download is not available right now.',
  import_problem_p31_why: 'Your site is not affected. Wait a minute before trying again.',
  import_problem_p31_action_0: 'Load it again',
  import_problem_p32_what: '{domain} runs PHP {php}, which is too old.',
  import_problem_p32_why: 'Claude Cowork needs PHP {minimum} or newer.',
  import_problem_p32_fix_0:
    'Many hosts let you change it yourself in the control panel, for example Select PHP Version in cPanel.',
  import_problem_p32_fix_1: 'Otherwise, ask your hosting provider to upgrade PHP to {minimum} or newer.',
  import_problem_p32_fix_2: 'After the change, check that your site still works.',
  import_problem_p32_action_0: 'Try again',
  import_problem_p33_what: '{domain} accepts uploads up to {limit} MB. Claude Cowork is {package} MB.',
  import_problem_p33_fix_0:
    'In Joomla, use <a data-import-link="joomla-install">Install from URL</a>, then choose <a data-import-link="manual"><b>I will install it myself</b></a> and paste the token. This avoids the upload limit.',
  import_problem_p33_fix_1:
    'Ask your hosting provider to raise the upload limit to at least {uploadMinimum} MB.',
  import_problem_p33_action_0: 'Try again',
  import_problem_p34_what: '{domain} ran out of memory while installing Claude Cowork.',
  import_problem_p34_fix_0: 'Ask your hosting provider to raise the PHP memory limit.',
  import_problem_p34_action_0: 'Try again',
  import_problem_p35_what: '{domain} ran out of memory or time while Tracy was copying it.',
  import_problem_p35_fix_0: 'Ask your hosting provider to raise the PHP memory and time limits.',
  import_problem_p35_action_0: 'Start again',
  import_problem_p55_what: '{domain} stopped answering while Tracy was copying it.',
  import_problem_p55_fix_0:
    '<a data-import-link="site">Open the site in your browser</a> to check that it is online.',
  import_problem_p55_fix_1: 'Once it loads again, start again.',
  import_problem_p55_action_0: 'Start again',
  import_problem_p36_what: 'This site is too large for one import.',
  import_problem_p36_why: 'Tracy support can move it for you.',
  import_problem_p36_fix_0:
    '<a data-import-link="discord">Ask us on Discord</a> and include the import details.',
  import_problem_p36_action_0: 'Copy details',
  import_problem_p37_what: 'Tracy lost its connection to {domain} while copying it.',
  import_problem_p37_fix_0:
    '<a data-import-link="site">Open the site in your browser</a> to check that it loads.',
  import_problem_p37_fix_1:
    'If it stops at the same step again, ask your hosting provider to check the server error log.',
  import_problem_p37_action_0: 'Start again',
  import_problem_p38_what: 'Tracy could not save the copy.',
  import_problem_p38_why: 'Wait a few minutes before starting again.',
  import_problem_p38_fix_0: 'If it keeps happening, <a data-import-link="discord">ask us on Discord</a>.',
  import_problem_p38_action_0: 'Start again',
  import_problem_p39_what: 'The import stopped because Tracy restarted.',
  import_problem_p39_why:
    "This was on Tracy's side. Tracy clears your password after each try, so it needs it again.",
  import_problem_p39_fix_0: 'Enter the password again.',
  import_problem_p39_fix_1: 'Press <b>Start import</b>. Tracy copies your site again from the beginning.',
  import_problem_p40_what: 'Tracy is updating.',
  import_problem_p40_why:
    'Your site is copied and saved. Tracy tries again by itself every minute, and you can leave this page.',
  import_problem_p40_action_0: 'Retry now',
  import_problem_p41_what: 'Tracy cannot confirm that the import started.',
  import_problem_p41_why:
    'It may still be starting. If nothing shows after 2 minutes, you can safely start again.',
  import_problem_p41_action_0: 'Start again',
  import_problem_p42_what: 'Tracy has not heard from the import for {minutes} minutes.',
  import_problem_p42_why: 'It may still be running. This page keeps checking by itself.',
  import_problem_p43_what: 'Your site is copied, but Tracy could not set it up yet.',
  import_problem_p43_fix_0: 'If it keeps happening, <a data-import-link="discord">ask us on Discord</a>.',
  import_problem_p43_action_0: 'Set it up again',
  import_problem_p44_what: 'You have been signed out of Tracy.',
  import_problem_p44_why: 'What you typed is kept.',
  import_problem_p44_fix_0:
    '<a data-import-link="login">Sign in again in a new tab</a>, then return here to continue.',
  import_problem_p45_what: 'Your internet connection dropped.',
  import_problem_p45_why: 'Check that your device is connected to the internet.',
  import_problem_p45_action_0: 'Try again',
  import_problem_p45_server_what: "Something went wrong on Tracy's side.",
  import_problem_p45_server_fix_0: 'Wait a few minutes before trying again.',
  import_problem_p45_server_fix_1:
    'If it keeps happening, <a data-import-link="discord">ask us on Discord</a> and include the error details.',
  import_problem_p45_server_action_0: 'Try again',
  import_problem_p45_server_action_1: 'Copy details',
  import_problem_p46_what: 'Tracy could not finish setting up {domain}.',
  import_problem_p46_why: 'Your original site keeps working as before.',
  import_problem_p46_fix_0:
    'If it fails again, <a data-import-link="discord">ask us on Discord</a> and include the error details.',
  import_problem_p46_more_title: 'Technical details',
  import_problem_p46_more_0: 'restore: mysql import exited 1',
  import_problem_p46_more_1: 'ERROR 1067 (42000) at line 2214',
  import_problem_p46_action_0: 'Try again',
  import_problem_p46_action_1: 'Copy details',
  import_problem_p47_what: 'Tracy cannot reach this build right now.',
  import_problem_p47_why: 'It may still be running. This page keeps checking (last checked {checked}).',
  import_problem_p48_what: 'This site is no longer available.',
  import_problem_p48_why: 'It was deleted, or you no longer have access to it.',
  import_problem_p48_fix_0: 'Ask the owner of the workspace for access.',
  import_problem_p48_action_0: 'Import it again',
  import_problem_p49_what: 'Your site is copied, but Tracy could not start working on it.',
  import_problem_p49_why:
    "This is on Tracy's side, and your copy of the site is safe. Trying again usually fixes it.",
  import_problem_p49_fix_0: 'If it fails again, <a data-import-link="discord">ask us on Discord</a>.',
  import_problem_p49_action_0: 'Try again',
  import_problem_p50_what: 'Your site is ready, but its preview address is missing.',
  import_problem_p50_fix_0:
    'If the address does not appear, <a data-import-link="discord">ask us on Discord</a>.',
  import_problem_p50_action_0: 'Open the workspace',
  import_problem_p51_what: 'Tracy could not open the preview of your site.',
  import_problem_p51_why: 'Your site is fine. Only the preview tab did not open.',
  import_problem_p51_fix_0: 'Try the button again.',
  import_problem_p51_fix_1: 'If nothing opens, check that your browser is not blocking pop-ups for Tracy.',
  import_problem_p51_fix_2: 'Still nothing? <a data-import-link="discord">Ask us on Discord</a>.',
  import_problem_p51_action_0: 'Open your site in a new tab',
  import_problem_p52_what: 'An import of {domain} is still running.',
  import_problem_p52_why:
    'Closing the page did not stop it. Tracy keeps copying your site in the background.',
  import_problem_p52_fix_0: 'Press <b>Follow it</b> to see how far it has got.',
  import_problem_p52_fix_1: 'Do not start a second import of the same site while this one runs.',
  import_problem_p52_action_0: 'Follow it',
  import_problem_p53_what: 'The import was interrupted when Tracy restarted.',
  import_problem_p53_why:
    'The parts of your site already sent are kept. Continue picks up where it stopped, without your password.',
  import_problem_p53_action_0: 'Continue',
  import_problem_p53_again_why:
    'The parts of your site already sent are kept. To continue, Tracy needs your sign-in details again.',
  import_problem_p53_again_action_0: 'Enter them again',
  /** The import recovery page (`?import=`): the host keeps no run of this site to pick up. */
  import_problem_p54_what: 'Tracy has no record of the import of {domain}.',
  import_problem_p54_why: 'Its progress was not kept, so there is nothing to retry or continue here.',
  /** The import recovery page could not ask Tracy what became of the import. */
  import_problem_p54_unreachable_what: 'Tracy could not look up the import of {domain}.',
  /** The recovery page's Remove (`DELETE /api/sites/:key/import`): asks first, inline. */
  import_remove: 'Remove this import',
  import_remove_confirm:
    'Remove the import of {domain}? What Tracy copied so far is removed. Nothing changes on your live site.',
  import_remove_yes: 'Remove',
  import_remove_no: 'Keep it',
  /** A read of the site is still going on Tracy's side: nothing was removed. */
  import_remove_running: 'Tracy is still copying {domain}. Try again once the import stops.',
  /** Tracy could not confirm that no read is going, or was busy: nothing was removed. */
  import_remove_later:
    'Tracy could not remove the import right now. Nothing was removed. Try again in a few minutes.',
  import_removed_title: 'The import of {domain} was removed.',
  /** A start, retry or Continue refused because a Remove of this import is under way. */
  import_error_import_removing: 'This import is being removed. Try again in a few minutes.',
  import_problem_pf1_green_what: 'Tracy can reach {domain}.',
  import_problem_pf1_mismatch_what: 'This looks like a WordPress site, not Joomla.',
  import_problem_pf1_cloudflare_what: 'Cloudflare protects this site.',
  import_problem_pf1_cloudflare_why: 'If it blocks the import, Tracy will show you which settings to change.',
  import_problem_pf1_wordfence_what: "Wordfence blocked Tracy's check.",
  import_problem_pf1_wordfence_fix_0:
    'Ask whoever manages Wordfence (often your developer or hosting provider) to allow requests whose user agent contains <code>Tracy/1.0</code>.',
  import_problem_pf1_unknown_what: 'Tracy could not tell which platform this site runs.',
  import_problem_pf1_unknown_fix_0: 'Check that <b>{platform}</b> is the right choice above, then continue.',
  import_problem_pf1_dns_what: 'There is no website at {domain}.',
  import_problem_pf1_dns_fix_0: 'Check the spelling of the address.',
  import_problem_pf1_dns_fix_1:
    '<a data-import-link="site">Open the address in your browser</a> to make sure it loads.',
  import_problem_pf1_timeout_what: 'Tracy could not open {domain}.',
  import_problem_pf1_timeout_fix_0: '<a data-import-link="site">Open {domain} in your browser</a>.',
  import_problem_pf1_timeout_fix_1:
    'If it does not load, check the address or ask your hosting provider for help.',
  import_problem_pf1_timeout_fix_2:
    'If it loads for you, your hosting provider may block visitors from other countries. Ask them to allow requests whose user agent contains <code>Tracy/1.0</code>.',
  import_problem_pf1_tls_what: 'The security certificate of {domain} is not valid.',
  import_problem_pf1_tls_why:
    'Tracy does not connect to a site whose certificate is broken, to keep your details safe.',
  import_problem_pf1_tls_fix_0:
    'Ask your hosting provider to renew or fix the SSL certificate. Most hosts do this for free.',
  import_problem_pf1_taken_what: 'This address is already imported by another Tracy account.',
  import_problem_pf1_taken_fix_0:
    'If the site is yours, <a data-import-link="join">request to join it</a>. Its owners get your request and decide.',
  import_problem_pf1_taken_fix_1:
    'Not sure who owns it? <a data-import-link="discord">Ask us on Discord</a>.',
  import_problem_pf1_mine_what: 'Already in your Tracy account',
  import_problem_pf1_tracy_what: 'This address is already a Tracy site.',
  import_problem_pf1_tracy_fix_0:
    'To work on it, open it from <a data-import-link="my-sites"><b>My Sites</b></a>.',
  import_problem_pf1_tracy_fix_1:
    'To start a fresh site, choose <a data-import-link="create"><b>Create a new site</b></a> above.',
  import_problem_pf2_green_what: 'The admin page is ready.',
  import_problem_pf2_basic_what: 'This admin page asks for a server password first.',
  import_problem_pf2_basic_why: 'Your browser shows it as a pop-up before the sign-in page.',
  import_problem_pf2_basic_fix_0: 'Enter the server username and password in the two boxes below.',
  import_problem_pf2_basic_fix_1: 'Do not have them? Your hosting provider or developer does.',
  import_problem_pf2_gate_what: 'A security extension locks this admin area.',
  import_problem_pf2_gate_why: 'Installing Claude Cowork yourself keeps your protection on.',
  import_problem_pf2_gate_fix_0: 'If your admin address uses a secret word, add it to the address above.',
  import_problem_pf2_unreachable_what: 'The admin page did not answer.',
  import_problem_pf2_unreachable_fix_0:
    'Open <a data-import-link="admin">{domain}/administrator</a> in your browser.',
  import_problem_pf2_unreachable_fix_1:
    'If it does not load, check the admin address above, or wait until the site is back.',
  import_problem_pf2_unreachable_fix_2:
    'If it loads for you, your hosting provider may block visitors from other countries. Ask them to allow requests whose user agent contains <code>Tracy/1.0</code>.',
  import_problem_pf2_noform_what: 'There is no Joomla sign-in page at this address.',
  import_problem_pf2_noform_fix_0:
    'Open <a data-import-link="default-admin">{domain}/administrator</a> in your browser to find the Joomla sign-in page.',
  import_problem_pf2_noform_fix_1:
    'If your site hides it behind a secret word, add that part (for example /administrator/?mysecret).',
  tab_title: 'Add site',

  origin_create: 'Create a new site',
  origin_create_desc: 'Start from a ready-made site. Tracy hosts it and has it ready in a few minutes.',
  // ── Import branch: step 1 ─────────────────────────────────────────────────────────────────────
  import_step1_title: 'Which site are you bringing over?',
  import_platform_label: 'Platform',
  import_address_label: 'Site address',
  import_address_hint: 'The address of the site you want Tracy to work on.',
  import_next: 'Continue',
  import_platform_mismatch:
    'This site looks like it runs {detected}. You can carry on. Tracy is only saying what it sees.',

  // ── Import branch: step 2, two equal ways ─────────────────────────────────────────────────────
  import_step2_title: 'Tracy needs to read this site',
  import_way_admin: 'Give Tracy admin access',
  import_way_admin_desc: 'Tracy signs in once, installs Claude Cowork, and never keeps your password.',
  import_way_manual: 'I will install it myself',
  import_way_manual_desc: 'Install Claude Cowork on your site, then paste the access token it shows you.',
  import_admin_url: 'Admin address',
  import_username: 'Username',
  import_password: 'Password',
  import_basic_auth: 'This admin page asks for a second password first',
  import_basic_user: 'Server username',
  import_basic_pass: 'Server password',
  import_manual_download: 'Download Claude Cowork {version}',
  import_manual_release: 'Open the release page',
  import_manual_url_hint: 'Or paste this address into Install from URL:',
  import_manual_steps:
    'Install it in your own admin, open its settings, and copy the access token shown there.',
  import_token_label: 'Access token from your site',
  import_start: 'Start import',
  import_back: 'Back',

  // ── Import branch: console ────────────────────────────────────────────────────────────────────
  import_progress_title: 'Bringing {domain} over',
  import_step_signing_in: 'Signing in to your site',
  import_step_installing_joomla: 'Installing the Claude Cowork component',
  import_step_installing_wordpress: 'Installing the Claude Cowork plugin',
  import_step_reading_content: 'Copying your content',
  import_step_reading_files: 'Packing up your files',
  import_step_handing_over: 'Handing it to Tracy',
  import_detail_tables: '{count} tables copied',
  import_detail_files: '{count} files packed',
  import_detail_sent: '{sent} MB sent',
  import_detail_sent_of: '{sent} of about {total} MB sent',
  import_detail_left: 'about {minutes} min left',
  import_detail_part: 'Sending part {part} ({elapsed})',

  // ── Import branch: four SEPARATE refusals when sign-in fails ─────────────────────────────────
  import_error_invalid_credential: 'That username and password did not work on this site.',
  // Joomla's backend signs in with the username only; WordPress also takes the email address.
  import_error_invalid_credential_joomla:
    'That username and password did not work. Joomla needs the username, not the email address.',
  import_error_signin_unclear:
    'The site refused the sign-in without saying why. Check the password, use a Super User account, and turn off two-factor sign-in.',
  import_error_no_backend_access: 'That account cannot open the admin area. Try one with full access.',
  import_error_mfa_required:
    'This site asks for a second factor, which Tracy cannot answer. Install Claude Cowork yourself instead (the other option above).',
  import_error_captcha_required:
    'This sign-in page asks for a captcha, which Tracy cannot solve. Install Claude Cowork yourself instead (the other option above).',
  import_error_login_locked_out:
    'This site has paused sign-ins after too many attempts. Wait until it lets you in again, or install Claude Cowork yourself (the other option above).',
  import_error_blocked_by_firewall:
    'A firewall in front of this site blocked Tracy. Allow Tracy in the firewall, or install Claude Cowork yourself (the other option above).',
  // Cloudflare challenges every door of the site, the engine's included, so installing Claude
  // Cowork by hand does not get past it: the sentence says what to switch off instead.
  import_error_blocked_by_cloudflare:
    'Cloudflare in front of this site blocked Tracy. In your Cloudflare dashboard, turn off Bot Fight Mode, Under Attack Mode and any rule that challenges or blocks visitors, then start the import again. Turn them back on once the import is done.',
  import_cloudflare_how: 'How to do it',
  import_cloudflare_step_bots:
    'Open your site in the Cloudflare dashboard, go to Security › Settings, filter by Bot traffic and turn off Bot Fight Mode.',
  import_cloudflare_step_under_attack:
    "If Under Attack Mode is on, turn it off in Quick Actions on the site's Overview page.",
  import_cloudflare_step_rules:
    'In Security › Security rules, turn off custom rules whose action is a challenge or Block.',
  import_cloudflare_skip_rule:
    'To let Tracy through for good instead, add a custom rule that skips security for requests whose user agent contains Tracy/1.0. A skip rule does not bypass Bot Fight Mode on the Free plan.',
  import_error_fs_credentials_required:
    'This site asks for FTP details before it installs a plugin, which Tracy cannot give. Install Claude Cowork yourself, then paste its code (the other option above).',
  import_error_upgrade_failed:
    'The site kept an older Claude Cowork. Update it in Extensions (Joomla) or Plugins (WordPress), then try again.',
  import_error_site_resource_limit:
    'The site ran out of server resources while Tracy was reading it. Ask your host to raise the PHP memory or time limit, then try again.',
  import_error_site_offline:
    'The site stopped answering while Tracy was reading it. Check that it is online, then try again.',
  import_error_unreachable: 'Tracy could not reach that admin address. Check it and try again.',
  import_error_blocked_by_host:
    "The site's host blocked Tracy partway through, likely a rate limit. Try again in a few hours, or contact Tracy support.",
  import_error_basic_auth_required:
    'This admin page is behind a second password. Add it above and try again.',
  import_error_basic_auth_invalid: 'That server username and password were refused.',
  import_error_admin_gate:
    'A security extension or firewall (such as RSFirewall or Admin Tools) blocks the admin area. Turn it off during the import, or install Claude Cowork yourself.',
  import_error_admin_form_not_found:
    'Tracy found no Joomla sign-in form at that address. Check it (include any secret key after it), or install Claude Cowork yourself.',
  import_error_tls_invalid:
    'The security certificate of that address is not valid, so Tracy did not send your password to it. Fix the certificate, or type the address with http:// if your site only works without https.',
  import_error_php_too_old:
    'This site runs a PHP version that is too old for Claude Cowork. Ask your host to upgrade PHP, then start the import again.',
  import_error_php_versions: 'The site runs PHP {php}; Claude Cowork needs PHP {minimum} or newer.',
  import_error_php_minimum: 'Claude Cowork needs PHP {minimum} or newer.',
  import_error_installs_disabled:
    'This site does not allow installing plugins. Install Claude Cowork yourself instead.',
  import_error_install_failed:
    'The site refused to install Claude Cowork. Install it yourself instead (the other option above).',
  import_error_install_forbidden:
    'This account is not allowed to install extensions. Sign in with a Super User account and try again, or install Claude Cowork yourself instead.',
  import_error_install_memory:
    'The site ran out of PHP memory while installing Claude Cowork. Ask your hosting provider to raise the PHP memory limit (memory_limit), then try again.',
  import_error_install_unexplained:
    'The site did not install Claude Cowork, and it did not say why. Ask your hosting provider to check the server error log for what stopped the install, then try again.',
  import_error_install_contract:
    "Claude Cowork is installed on your site but cannot start: it is missing the files for your site's template. Contact Tracy support so we can send them.",
  import_error_upload_too_large:
    'The Claude Cowork package is larger than this site accepts in one upload. Ask your host to raise the upload size limits, then try again.',
  import_error_upload_sizes: 'The package is {package} MB; the site accepts {limit} MB.',
  import_error_activate_failed:
    'Claude Cowork was installed but could not be switched on. Enable it in Extensions (Joomla) or Plugins (WordPress), then try again.',
  import_error_configure_failed:
    'Claude Cowork was installed but did not respond. Try again, or reinstall it.',
  import_error_credentials_required: 'Fill in the admin details, or paste the code from your site.',
  import_error_cowork_not_answering:
    'Claude Cowork is not answering on this site. Check it is installed and switched on, or sign in with the admin details so Tracy installs it.',
  import_error_call_failed: 'The site stopped answering while Tracy was reading it. Try again.',
  import_error_store_refused: 'Tracy read your site but could not store the copy. Try again in a moment.',
  import_error_too_many_parts: 'This site is too large for one import. Contact Tracy support.',
  import_error_run_lost: 'Tracy restarted while reading your site, so the import stopped. Start it again.',
  /**
   * The address is already on the account and this wizard did not put it there: it starts no read.
   * That is all a 200 from the claim door says — a site built on Tracy answers the same as a row an
   * import left behind — so this names no origin and never suggests deleting the site.
   */
  import_error_claim_stands:
    'An import of this site may already be running. Wait a moment and try again, or look for it in <a data-import-link="my-sites">My Sites</a>.',
  import_error_manifest: 'Tracy could not fetch the Claude Cowork package. Try again in a moment.',
  import_error_claim_taken: 'That address already belongs to someone else on Tracy.',
  import_error_host_updating: 'Tracy is updating right now. Try again in a few minutes.',
  import_error_already_provisioned: 'This site is already set up on Tracy. Open it from My Sites.',
  import_error_invalid_site_key:
    'That address is part of Tracy, so there is nothing to import. Use Create a new site instead.',
  // Refusals that used to fall to the generic line below (#796); each says what to do next.
  import_error_signed_out: 'You have been signed out. Sign in again, then start the import once more.',
  import_error_access_check: 'Tracy could not check your access just now. Try again in a moment.',
  import_error_no_access:
    'Tracy could not open this site for your account. Check that you are signed in with the address that holds it.',
  import_error_invalid_request:
    'Some details are missing or not valid. Check the site address and the fields above, then try again.',
  import_error_unsupported_platform:
    'Tracy cannot import that kind of site yet. Choose Joomla or WordPress above.',
  import_error_other: 'Something went wrong. Try again, or contact Tracy support if it keeps happening.',
  /** The read is in the store; only the fleet handover failed. Retry that step, not the read. */
  import_handover_failed: 'Your site was read and stored. Only the handover to Tracy failed.',
  import_retry_handover: 'Try the handover again',
  import_unconfirmed:
    'Tracy did not get a clear answer when it started this import, so it may already be running. Check its status to carry on from here.',
  import_unconfirmed_still:
    'Tracy could not find the import yet. That does not mean it stopped. Check again in a moment.',
  import_check_status: 'Check status',

  /** The handover succeeded; the copy is now building in the background (shown in a site workspace). */
  import_handed_over_title: '{domain} is on its way into Tracy',
  // The row is already in My Sites — it appeared the moment the build started — so this points there
  // to follow progress, rather than promising a row that will "appear when ready".
  import_handed_over_note: 'Tracy is building your copy now. You can follow its progress in My Sites.',
  import_handed_over_another: 'Import another site',

  origin_import: 'Import existing site',
  // Import edits a copy, not the site the customer runs (the "own copy" of `ready_agent_title`).
  // "for you to edit" states where the work lands without claiming the source is never touched —
  // importing can still install or upgrade an extension on it.
  origin_import_desc: 'Connect a site you already run. Tracy creates a copy for you to edit.',

  // ── Build from my business (`from-business.tsx`) ───────────────────────────────────────────
  own_title: 'Build it from my business',
  own_desc:
    'Find your business or paste its link. Tracy reads what is public about it, picks a template and builds the whole site.',
  own_placeholder: 'Business name and city',
  own_find: 'Search',
  own_link: 'Build from this link',
  own_pick: 'Pick your business',
  own_none: 'No business found. Check the name and city, or paste its website or Google Maps link.',
  own_build: 'Build my site',
  own_research:
    'Tracy is reading what is public about {name}: its website, photos and reviews. This takes about ten minutes.',
  own_progress_website: 'Now reading its website',
  own_progress_source: 'Now reading {source}',
  own_progress_photos: 'Photos saved: {done} of {total}',
  own_progress_minutes: '{minutes} min so far',
  own_opening: 'Opening the chat where Tracy builds your site…',
  // While the chat waits for the research of the business's logo (`followBusiness`).
  own_logo: 'Looking for your logo…',
  own_failed: 'Tracy could not build a site from this business. Try again, or paste its website.',
  own_limit: 'You have started all of today’s sites. Come back tomorrow.',
  own_rate: 'Too many searches this hour. Wait a little, or paste the website.',
  own_search_off: 'Search is not available here. Paste the website or Google Maps link instead.',
  own_bad_link: 'This link cannot be read. Check it, or search by name and city.',
  own_back: 'Back',
  own_choose_title: 'Tracy suggests a template for {name}',
  own_choose_line: '{template} on {cms}',
  own_choose_none: 'Pick the template for your site.',
  own_use: 'Use this template',
  own_other: 'Choose another template',
  own_demo: 'See this template’s demo',
  own_reason_food: 'Made for restaurants, cafes and bars.',
  own_reason_trade: 'Made for this kind of business.',
  own_reason_business: 'A template for any business.',
  own_reason_nearest: 'The closest template on offer.',
  // The switch above the field: search by name, or paste the business's links (`@tracy/wo-views/link-rows`).
  own_mode_search: 'Search by name',
  own_mode_links: 'Paste its links',
  // Links mode: `own_links_<key>` for each `LinkRowsKey` of the shared rows ("." and "-" become "_").
  own_links_label: 'Links of your business',
  own_links_placeholder_google: 'Google Maps link',
  own_links_placeholder_social: 'Instagram, Facebook or TikTok',
  own_links_placeholder_website: 'Website, or a listing such as magicpin',
  own_links_placeholder_another: 'Another link',
  own_links_add: 'Add another link',
  own_links_remove: 'Remove this link',
  own_links_status_google: 'Read from Google',
  own_links_status_listing: 'This page only',
  own_links_status_social: 'Profile and posts',
  own_links_status_website: 'Whole website',
  own_links_reason_invalid: 'Not a link',
  own_links_reason_duplicate: 'Same as another link',
  own_links_reason_not_public: 'Left out: not a public page',
  own_links_reason_limit: 'Left out: up to 5 links',
  own_links_reason_one_google: 'Left out: one Google place per business',
  own_links_reason_one_website: 'Left out: one website per business',
  own_links_reason_unresolvable: 'Left out: Google could not read this link',
  own_links_reason_blocked: 'Left out: not a public page',
  own_links_hint_empty: 'Paste any links you have. One is enough; more links give a fuller site.',
  own_links_summary_one:
    'One link is enough to start. Add more links of the same business for a fuller site.',
  own_links_summary_one_extra:
    'One link is enough to start ({extra}). Add more links of the same business for a fuller site.',
  own_links_summary_many: '{count} links of one business. Tracy researches them together. One site is built.',
  own_links_summary_many_extra:
    '{count} links of one business ({extra}). Tracy researches them together. One site is built.',
  own_links_summary_none: 'None of these links can be read. Check them, or search by name.',
  own_links_extra_left_out: '{count} left out',
  own_links_extra_twice: '{count} pasted twice, used once',
  // The button with several usable links (one link says `own_link`).
  own_links_many: 'Build from these links',
  // Above "Pick your business" when the places come from an ambiguous Google link.
  own_pick_note: 'This Google link matches more than one place.',
  // The research line once links were sent: `{sources}` lists them ("Google, magicpin and Instagram").
  own_research_links:
    'Tracy is reading what is public about {name}: {sources}. This takes about ten minutes.',
  // The business's own website in `{sources}`; the other sources are brand names.
  own_source_website: 'its website',

  // ── Branch fork: card #3 ────────────────────────────────────────────────────────────────────
  origin_fork: 'Fork a site from a URL',
  origin_fork_desc: 'Start from the look of a site you like, with your own words and pictures.',
  fork_url_label: 'Site to start from',
  fork_url_hint: 'Tracy takes the look from this site. The words and pictures will be yours.',
  /** Each refusal reason is its own sentence — one shared sentence leaves people guessing. */
  fork_url_refused_shape: 'That does not look like a site address. Paste something like example.com.',
  fork_url_refused_local: 'That address only works inside a private network. Use a public site instead.',
  fork_url_refused_tracy: 'That is a Tracy lane. Pick a site outside Tracy to take inspiration from.',

  platform_label: 'Platform',
  start_from: 'Starts from {name} on {platform}',
  start_not_on:
    '{name} has no {platform} version, so this site will not start from it. Choose another platform to use it.',
  start_from_hint: 'You can change everything later.',
  /** The template card's hover pill and accessible name: opens Design inspiration. */
  change_design: 'Change design',
  pick_start_design: 'Pick a design to start from',
  name_label: 'Site address',
  name_hint: 'Your site will be live at {domain}',
  name_placeholder: 'your-brand',

  error_shape: 'Use 6 to 30 letters, numbers or hyphens, starting and ending with a letter or number.',
  error_reserved: 'That name is kept for Tracy itself. Please pick another.',
  error_looks_imported: 'That ending is reserved for imported sites. Please pick another.',
  error_taken: 'That domain is already taken. Choose another site address.',
  error_host_updating: 'Tracy is updating right now. Press Create site again in a few minutes.',
  /** The session ended while the wizard stood open (#796); shown with the sign-in link below. */
  error_signed_out: 'You have been signed out. Sign in again, then press Create site once more.',
  /** An earlier press of the same button is still being answered. */
  error_pending: 'Tracy is still starting this site. Wait a moment, then press Create site again.',
  /** The link beside a "session has ended" line. It opens a new tab, so nothing typed here is lost. */
  /** Pressing again cannot change these two, so each names the thing to change instead. */
  error_unsupported:
    'Tracy cannot build a site from that choice. Choose another platform or template, then press Create site again.',
  error_conflict:
    'Tracy already has a request for this site with different details. Look in My Sites for it, or change the site address to start a new one.',
  /** Shard beta: the person's sites are kept on another Tracy server; the wizard goes there right after this line. */
  error_elsewhere: 'Your sites are kept on another Tracy server. Taking you there to add this site…',
  sign_in_new_tab: 'Sign in again',

  submit: 'Create site',
  submitting: 'Starting…',

  // Customize your site: inline questions and their status messages.
  // The questions and their options are the questionnaire's, in the person's language (`GET /api/sites/questions`);
  // only the frame around them is written here. Every question is optional (Akemi, 07/10/2026).
  sheet_title: 'Customize your site',
  sheet_optional: 'Optional',
  card_count: 'Answer {total} questions',
  // Line 3 of the card (wording chosen by Akemi, 07/10/2026), until something is answered: then the answers' summary.
  sheet_desc: 'Receive a site tailored for your business.',
  sheet_answered: '{answered} of {total} answered',
  sheet_open: 'Open',
  sheet_edit: 'Edit',
  // The sheet's footer: '{count}' is drawn in bold as sheet_status_count ("2 of 7").
  sheet_status_line: '{count} answered · all optional',
  sheet_status_count: '{answered} of {total}',
  sheet_done: 'Done',
  sheet_close: 'Close',
  sheet_loading: 'Loading questions',
  // Inline failure keeps retry available without blocking site creation.
  sheet_failed: 'The questions could not load.',
  /** No text model can write the answers into the site (#1403 item 7): said before Create, not after the build. */
  sheet_unwritable: 'Tracy cannot write answers into a new site right now.',
  sheet_unwritable_detail:
    "This site is built with the template's own text. You can change it later in chat.",
  sheet_retry: 'Try again',
  // After a change of template or platform: the answers the new questions still ask for are kept. Said in the sheet.
  sheet_kept: 'Answers kept for this design: {count}.',
  sheet_dropped: 'Answers that no longer apply: {count}.',
  // ── The pages Customize your site and Pick a design system open in the tab (add-site-page.tsx, option C, Akemi
  // 14/10/2026): the link back above the card, and the muted line under the Customize your site title.
  page_back: 'Back to Add site',
  page_desc: 'Every question is optional. Tracy uses sensible defaults for anything you leave blank.',
  // The summary chips on the Customize your site card once something is answered ("6 pages", "Warm tone").
  summary_page_one: '1 page',
  summary_pages: '{count} pages',
  summary_tone: '{label} tone',
  // A short line beside each Tone option on the page; the option names come from the questionnaire.
  tone_desc_plain: 'Clear and direct',
  tone_desc_warm: 'Friendly and personal',
  tone_desc_bold: 'Confident and assertive',
  // ── "Design system" (design-system-card.tsx): the card under Customize your site and the sheet it opens (U1 A, U7 A,
  // Akemi 12/10/2026). The system names and descriptions are the library's, never translated here.
  ds_title: 'Pick a design system',
  ds_default: 'Template default',
  ds_choices: 'Choose from {count} different styles',
  /** Line 2 of the Design system card once a system is picked, like "1 of 5 answered" on Customize your site. */
  ds_picked: '{name} selected',
  ds_default_desc: 'The look your template came with.',
  // Line 3 of the card, under the pick.
  ds_desc: 'Set the colours and fonts of your site.',
  // The sample letters drawn on a system that has no picture, in that system's font.
  ds_swatch: 'Aa',
  ds_unsupported: "Not available for {template} yet. The site keeps the template's own look.",
  ds_loading: 'Loading design systems',
  ds_failed: 'The design systems could not load.',
  ds_retry: 'Try again',
  ds_sheet_title: 'Choose a design system',
  ds_sheet_count: '{count} design systems · for {template}',
  ds_selected: 'Selected',
  // The preview popup a system card opens (design-system-preview.tsx): the picked template's live demo wearing the system.
  ds_preview_on: 'On the {template} demo',
  ds_preview_frame: '{name} on {template}',
  ds_preview_loading: 'Loading the preview',
  ds_preview_unavailable:
    'A preview is not available for {template} on {platform} yet. You can still pick this design system.',
  ds_preview_failed: 'The preview could not load.',
  /** Under a shown preview: the page is shown without its scripts (sandboxed), so some effects are missing. */
  ds_preview_static_note: 'The preview may not show every effect on the page.',
  ds_preview_use: 'Use {name}',
  ds_preview_position: '{index} of {total}',
  ds_preview_prev: 'Previous design system',
  ds_preview_next: 'Next design system',
  // The pill a system card shows on hover and keyboard focus (the Design templates gallery's card), and the popup's
  // Desktop | Mobile switch (the gallery popup's), in the gallery's words.
  ds_open_preview: 'Open preview',
  ds_device: 'Device',
  ds_desktop: 'Desktop',
  ds_mobile: 'Mobile',
  // The popup's Light | Dark switch, for a template with two modes (the gallery popup's words).
  ds_theme: 'Theme',
  ds_light: 'Light',
  ds_dark: 'Dark',
  // After the build: the pick is written to the new site before the workspace opens.
  ds_applying: 'Applying {name}',
  ds_apply_failed:
    "{name} could not be applied to your site. The site keeps the template's own look; try again, or open the workspace and apply it from Design later.",
  ds_apply_retry: 'Try again',
  // The sheet's toolbar (design-system-filter.tsx), a port of the Design inspiration gallery's bar: search, the
  // Categories menu and the count line under it, in the gallery's words.
  ds_filter_search: 'Search, e.g. {name}',
  ds_filter_search_plain: 'Search design systems',
  ds_filter_categories: 'Categories',
  ds_filter_count_all: 'Showing all {total} design systems',
  ds_filter_count: 'Showing {shown} of {total} design systems',
  ds_filter_clear: 'Clear',
  ds_filter_empty: 'No design systems match',
  // The Theme menu beside Categories: the Refero catalogue's look of each system (design-system-filter.mjs).
  ds_filter_theme: 'Theme',
  ds_theme_light: 'Light',
  ds_theme_dark: 'Dark',
  ds_theme_mixed: 'Mixed',
  // The Categories list: the Refero catalogue's industries (design-system-filter.mjs).
  ds_industry_saas: 'SaaS',
  ds_industry_agency: 'Agency',
  ds_industry_ecommerce: 'E-commerce',
  ds_industry_ai: 'AI',
  ds_industry_design: 'Design',
  ds_industry_devtools: 'Dev tools',
  ds_industry_fintech: 'Fintech',
  ds_industry_productivity: 'Productivity',
  ds_industry_media: 'Media',
  ds_industry_crypto: 'Crypto',
  ds_industry_other: 'Other',
  // The logo and favicon tiles (brand-tiles.tsx, approved canvas 07/10/2026). The tile previews the picture on a fixed
  // white or near-black ground; empty, it shows the business name as text.
  brand_tile_light: 'Light theme',
  brand_tile_dark: 'Dark theme',
  brand_tile_single: 'Logo',
  brand_upload: 'Upload PNG',
  brand_replace: 'Replace',
  brand_remove: 'Remove',
  brand_uploading: 'Uploading…',
  brand_your_business: 'Your business',
  brand_logo_file: 'PNG, transparent background, at least 500px, up to 8 MB.',
  brand_logo_empty: 'Shows your name as text until you add a logo.',
  brand_favicon_file: 'PNG, square, at least 512×512 px, up to 8 MB.',
  brand_favicon_empty: "Keeps the template's icon until you add one.",
  brand_favicon_alt: 'Your favicon',
  brand_tab_preview: 'Browser tab preview',
  // Pictures the customer already sent in the creation screen's chat (chat-logo.mjs): offered under the logo tiles.
  brand_chat_title: 'From your chat',
  brand_chat_use: 'Use {file} as the logo',
  brand_chat_not_png: 'The pictures you sent in the chat are not PNG files, so they cannot be the logo.',
  // A file that was not added: '{file} was not added.' then the reason, the file name in bold.
  brand_not_added: '{file} was not added.',
  brand_png_only: 'PNG only.',
  brand_unreadable: 'This file could not be read. Try another PNG.',
  brand_too_large: 'This file is {size}. Use a PNG up to 8 MB.',
  brand_logo_small:
    'This logo is {width} × {height} px. Use one at least 500 px on its long side so it stays sharp.',
  brand_favicon_square: 'The favicon must be square. This one is {width} × {height} px.',
  brand_favicon_small: 'Use at least 512 × 512 px. This one is {width} × {height} px.',
  brand_upload_failed: 'This file could not be uploaded. Try again in a moment.',
  // Warnings: the file is kept (U6).
  brand_blend_light: 'Part of this logo blends into light backgrounds. Use a dark or coloured version.',
  brand_blend_dark: 'Part of this logo blends into dark backgrounds. Use a white or light version.',
  brand_white_box:
    'This PNG has a solid white background, so it shows as a white box on dark areas. Use a version with a transparent background.',
  brief_language_placeholder: 'Choose a language...',
  // The Site language select (language-select.tsx): said in its list when nothing matches what was typed.
  lang_no_match: 'No language matches.',
  // Pages (sheet-chips.tsx): the locked home page's tooltip, and the line for a template that ships no page list.
  pages_home_locked: 'Your site always has a home page.',
  pages_all_kept: 'Every page of this design is kept.',
  // "Start with" chips above the business description (U8): each label inserts the words of its _text key.
  start_with: 'Start with:',
  start_make: 'What you make',
  start_make_text: 'We make ',
  start_who: 'Who it is for',
  start_who_text: 'Our customers are ',
  start_where: 'Where you are',
  start_where_text: 'We are based in ',
  start_different: 'What makes you different',
  start_different_text: 'What makes us different is ',
  // AI rewrite under each long-text question (`rewrite.mjs` → POST /api/sites/brief/rewrite).
  brief_rewrite: 'AI rewrite',
  brief_rewriting: 'Rewriting…',
  brief_rewrite_undo: 'Undo',
  brief_rewrite_unavailable: 'AI rewrite is not switched on here yet.',
  brief_rewrite_limit: 'That is enough rewrites for now. Try again in a little while.',
  brief_rewrite_failed: 'Tracy could not rewrite that. Your text is unchanged.',
  // The shared ask form's own words (`ASK_FORM_KEYS` of `@tracy/site-build-core`) that the sheet has no `brief_*`
  // key for: a choice's typed answer and the Recommended tag, which the sheet puts on a question its set flags required.
  // Same English as the `tracy-ask-form` namespace.
  ask_other: 'Other',
  ask_other_placeholder: 'Or type your own answer',
  ask_recommended: 'Recommended',
  // The language picker the sheet draws when a questionnaire offers a long list (`LanguageBox`, shared with the Build form).
  'lang.add': 'Add another…',
  'lang.change': 'Choose another…',
  'lang.detected': 'Looks like your text is in',
  'lang.more': '+{count} more',
  'lang.none': 'No match.',
  'lang.remove': 'Remove {language}',

  // ── Progress console ─────────────────────────────────────────────────────────
  progress_title: 'Building {domain}',
  progress_queued: 'Waiting for a machine…',
  progress_running: 'Building your site…',
  progress_failed: 'The build stopped.',
  progress_retry: 'Try again',
  progress_start: 'Getting a machine ready…',
  // The job door has not answered for two minutes (`build-watch.mjs`): the build may still be running.
  progress_unreachable:
    'Tracy cannot reach this build right now. It may still be running; this page keeps checking.',
  // The build on screen is gone (403/404): the site was deleted, or this person lost access to it.
  build_gone:
    'The site that was being built is no longer there: it was deleted, or you no longer have access to it.',

  /**
   * The steps the console narrates. They are NOT a to-do list: a step that shows up is a
   * step the fleet has really started (`steps.mjs`).
   *
   * `step_cowork_*` is the ONLY step whose noun changes by platform — Joomla installs a *component*,
   * WordPress installs a *plugin*. A shared label taught customers the wrong vocabulary once
   * (2026-08-11), and wrong in an expensive way: people go looking for that thing in their own
   * admin, under the name that admin uses.
   */
  step_webroot: 'Fetching the files',
  step_quickstart: 'Installing the starting site',
  step_database: 'Setting up the database',
  step_platform: 'Installing the platform',
  step_cowork: 'Installing Claude Cowork',
  step_cowork_joomla: 'Installing the Claude Cowork component',
  step_cowork_wordpress: 'Installing the Claude Cowork plugin',
  step_agent: 'Preparing the agent',
  step_baseline: 'Recording a starting point',
  step_address: 'Publishing the address',
  // The Customize answers being written into the new site (`steps.mjs`, tracy-web `brief-build.js` STAGE).
  step_writing: 'Writing your text and pictures',
  step_placing: 'Placing your text and pictures on the site',

  // ── Handover ────────────────────────────────────────────────────────────────
  /**
   * Handover: say the ADDRESS, and follow with a sentence people can act on right away.
   *
   * The old version only had "Your site is ready" — true, but it left the user on a screen that
   * suggested nothing. This sentence carries both things they need next: where the site is, and where to talk to it.
   *
   * "My Sites" names exactly the tab showing on screen. Pointing people at a name that exists
   * nowhere is the cheapest way to make them spend a minute searching.
   */
  ready_title: 'Your {url} is ready.',
  /** The wizard starts the agent itself now (04/09); these are the last step and the handover. */
  step_agent_start: 'Starting the agent',
  ready_agent_title: 'Your {url} is ready. Tracy has its own copy to work on, and the agent is up.',
  ready_agent_note: 'Your copy is at {url}. The agent takes about a minute to start.',
  ready_open_workspace: 'Open the workspace',
  agent_failed: 'The agent could not start. Your copy is safe. Try starting it again.',
  // The Customize answers did not all go in (the run failed or ran out of time part-way): said on the ready screen,
  // which then stays, as it does for a design system that could not be put on.
  ready_brief_failed:
    "Tracy could not finish writing your answers into the site, so some pages may still show the template's own words. Tell Tracy in the chat what to change.",
  agent_retry: 'Start the agent',
  /** Say WHERE it opens, not only the action: a real tab is what lets the site recognise the viewer. */
  ready_open: 'Open your site in a new tab',
  ready_no_url: 'The build finished, but the fleet did not report an address.',

  /**
   * No sentence matches the refusal, or no readable answer came back. The machine code is never
   * shown (#796). The site may or may not have been started — a lost answer can follow a site that
   * was made — so the line claims neither and sends the reader to look before pressing again.
   */
  error_other:
    'Tracy could not confirm that the build started. Look in My Sites for the site before you press Create site again.'
}
