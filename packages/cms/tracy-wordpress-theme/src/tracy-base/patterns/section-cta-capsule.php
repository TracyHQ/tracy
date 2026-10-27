<?php
/**
 * Title: CTA capsule
 * Slug: tracy-base/section-cta-capsule
 * Description: A statement, a support line, one primary button and one secondary link in a tinted capsule — the Joomla ACM block `cta-capsule`. The statement is a paragraph, not a heading, as in the source.
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: cta, call to action, capsule, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section acm-cta-capsule pb-section-phone sm:pb-section-tablet lg:pb-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section acm-cta-capsule pb-section-phone sm:pb-section-tablet lg:pb-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"acm-cta-capsule__box max-w-page mx-auto flex flex-wrap items-center justify-between gap-6 p-8 rounded-lg border border-accent/40 bg-accent/10"} -->
<?php /* ds-keep: rounded-lg reads --wp--custom--radius--lg, which reads --ds-card-radius in theme.json */ ?><div class="wp-block-group acm-cta-capsule__box max-w-page mx-auto flex flex-wrap items-center justify-between gap-6 p-8 rounded-lg border border-accent/40 bg-accent/10">
<!-- wp:group {"className":"acm-cta-capsule__copy max-w-[62ch]"} -->
<div class="wp-block-group acm-cta-capsule__copy max-w-[62ch]">
<!-- wp:paragraph {"className":"acm-cta-capsule__statement font-display text-xl leading-tight mb-1","metadata":{"role":"content","name":"cta-capsule.statement"}} -->
<p class="acm-cta-capsule__statement font-display text-xl leading-tight mb-1"><?php esc_html_e( 'Tell us what your next website needs to do.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-cta-capsule__support text-fg-2 mb-0","metadata":{"role":"content","name":"cta-capsule.support"}} -->
<p class="acm-cta-capsule__support text-fg-2 mb-0"><?php esc_html_e( 'Bring the idea, the existing site or the question you have not answered yet. Start with a conversation.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"tracy-actions"} -->
<div class="wp-block-buttons tracy-actions">
<!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"role":"content","name":"cta-capsule.btn"}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Start a conversation', 'tracy-base' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline tracy-btn tracy-btn--ghost","metadata":{"role":"content","name":"cta-capsule.link"}} -->
<div class="wp-block-button is-style-outline tracy-btn tracy-btn--ghost"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Explore our services', 'tracy-base' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
