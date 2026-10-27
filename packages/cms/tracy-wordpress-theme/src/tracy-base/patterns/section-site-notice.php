<?php
/**
 * Title: Site notice
 * Slug: tracy-base/section-site-notice
 * Description: One line of small print stating the site is a demo — the Joomla ACM block `site-notice`. The `tracy-site-notice` class is the anchor the content audit looks for; keep it.
 * Categories: tracy-base, tracy
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: notice, demo, footer, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"className":"acm-site-notice px-container-phone sm:px-container-tablet lg:px-container-desktop py-4"} -->
<div class="wp-block-group acm-site-notice px-container-phone sm:px-container-tablet lg:px-container-desktop py-4">
<!-- wp:paragraph {"className":"tracy-site-notice tracy-meta max-w-page mx-auto mb-0","metadata":{"role":"content","name":"site-notice.notice"}} -->
<p class="tracy-site-notice tracy-meta max-w-page mx-auto mb-0"><?php esc_html_e( 'Tracy Base is a studio demo. Company details, team profiles and prices are illustrative, not an offer from Tracy.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
