<?php
/**
 * Title: Story chapter — media right
 * Slug: tracy-base/section-story-chapter-media-right
 * Description: A statement, a support line and one link beside an image on the right — the Joomla ACM block `story-chapter` in `style-1`. Below the tablet width the text comes first, then the image.
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: story, chapter, feature, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section acm-story-chapter acm-story-chapter--media-right py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section acm-story-chapter acm-story-chapter--media-right py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-grid acm-story-chapter__grid max-w-page mx-auto grid gap-12 items-center sm:grid-cols-[1fr_1.2fr]"} -->
<div class="wp-block-group tracy-grid acm-story-chapter__grid max-w-page mx-auto grid gap-12 items-center sm:grid-cols-[1fr_1.2fr]">
<!-- wp:group {"className":"acm-story-chapter__text"} -->
<div class="wp-block-group acm-story-chapter__text">
<!-- wp:heading {"level":2,"className":"text-2xl mb-3","metadata":{"role":"content","name":"story-chapter.statement"}} -->
<h2 class="wp-block-heading text-2xl mb-3"><?php esc_html_e( 'Make the first impression feel like you.', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-lead","metadata":{"role":"content","name":"story-chapter.support"}} -->
<p class="tracy-lead"><?php esc_html_e( 'We bring your message, visual identity and page structure together, so customers can understand what you do and where to go next.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"tracy-actions"} -->
<div class="wp-block-buttons tracy-actions">
<!-- wp:button {"className":"is-style-outline tracy-btn tracy-btn--ghost","metadata":{"role":"content","name":"story-chapter.link"}} -->
<div class="wp-block-button is-style-outline tracy-btn tracy-btn--ghost"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Explore our approach', 'tracy-base' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:image {"className":"acm-story-chapter__media rounded-lg overflow-hidden","sizeSlug":"large","metadata":{"role":"content","name":"story-chapter.media"}} -->
<?php /* ds-keep: rounded-lg reads --wp--custom--radius--lg, which reads --ds-card-radius in theme.json */ ?><figure class="wp-block-image size-large acm-story-chapter__media rounded-lg overflow-hidden"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'A pale field lit from the upper right', 'tracy-base' ); ?>"/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
