<?php
/**
 * Title: Call to action, final
 * Slug: tracy/section-cta-final
 * Categories: tracy
 * Description: Call to action, final section of the Tracy section library (packages/cms/tracy-cms-sections), as tracy-base ships it: the same blocks with every word through the theme's text domain, so a site in another language shows them in it, and both buttons leading to the Contact us page instead of #.
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section tracy-cta-final py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section tracy-cta-final py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-cta-final__box max-w-page mx-auto bg-accent text-accent-on rounded-lg py-12 px-8 text-center"} -->
<?php /* ds-keep: rounded-lg reads --wp--custom--radius--lg, which reads --ds-card-radius in theme.json */ ?><div class="wp-block-group tracy-cta-final__box max-w-page mx-auto bg-accent text-accent-on rounded-lg py-12 px-8 text-center">
<!-- wp:heading {"level":2,"className":"text-2xl text-inherit mb-3"} -->
<h2 class="wp-block-heading text-2xl text-inherit mb-3"><?php echo esc_html__( 'Start building with Tracy today', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-lead text-inherit opacity-90 mx-auto"} -->
<p class="tracy-lead text-inherit opacity-90 mx-auto"><?php echo esc_html__( 'One desk for every site you run, with a change log you can trust.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"tracy-actions justify-center"} -->
<div class="wp-block-buttons tracy-actions justify-center">
<!-- wp:button {"className":"tracy-btn tracy-btn--inverse"} -->
<div class="wp-block-button tracy-btn tracy-btn--inverse"><a class="wp-block-button__link wp-element-button" href="/resources/contact/"><?php echo esc_html__( 'Get started', 'tracy-base' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline tracy-btn tracy-btn--ghost"} -->
<div class="wp-block-button is-style-outline tracy-btn tracy-btn--ghost"><a class="wp-block-button__link wp-element-button" href="/resources/contact/"><?php echo esc_html__( 'Talk to us', 'tracy-base' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
<!-- wp:paragraph {"className":"tracy-meta tracy-cta-final__note text-inherit opacity-80 mt-4 mb-0"} -->
<p class="tracy-meta tracy-cta-final__note text-inherit opacity-80 mt-4 mb-0"><?php echo esc_html__( '2-minute setup · Cancel anytime', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
