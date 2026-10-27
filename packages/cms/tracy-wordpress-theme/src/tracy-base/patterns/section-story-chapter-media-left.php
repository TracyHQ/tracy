<?php
/**
 * Title: Story chapter — media left
 * Slug: tracy-base/section-story-chapter-media-left
 * Description: The story chapter flipped: the image sits on the left from the tablet width up — the Joomla ACM block `story-chapter` in `style-2`. The text still comes first in the markup, so on a phone it reads text, then image, like the source.
 * Categories: tracy-base, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: story, chapter, feature, flip, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"tagName":"section","className":"tracy-section acm-story-chapter acm-story-chapter--media-left py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop"} -->
<section class="wp-block-group tracy-section acm-story-chapter acm-story-chapter--media-left py-section-phone sm:py-section-tablet lg:py-section-desktop px-container-phone sm:px-container-tablet lg:px-container-desktop">
<!-- wp:group {"className":"tracy-grid acm-story-chapter__grid max-w-page mx-auto grid gap-12 items-center sm:grid-cols-[1fr_1.2fr]"} -->
<div class="wp-block-group tracy-grid acm-story-chapter__grid max-w-page mx-auto grid gap-12 items-center sm:grid-cols-[1fr_1.2fr]">
<!-- wp:group {"className":"acm-story-chapter__text sm:order-2"} -->
<div class="wp-block-group acm-story-chapter__text sm:order-2">
<!-- wp:heading {"level":2,"className":"text-2xl mb-3","metadata":{"role":"content","name":"story-chapter.statement"}} -->
<h2 class="wp-block-heading text-2xl mb-3"><?php esc_html_e( 'Built to stay useful after launch.', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-lead","metadata":{"role":"content","name":"story-chapter.support"}} -->
<p class="tracy-lead"><?php esc_html_e( 'Your team should be able to update a service, introduce a colleague or publish a story without rebuilding the page. Editable sections keep everyday changes manageable.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"tracy-actions"} -->
<div class="wp-block-buttons tracy-actions">
<!-- wp:button {"className":"is-style-outline tracy-btn tracy-btn--ghost","metadata":{"role":"content","name":"story-chapter.link"}} -->
<div class="wp-block-button is-style-outline tracy-btn tracy-btn--ghost"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'See the website toolkit', 'tracy-base' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:image {"className":"acm-story-chapter__media rounded-lg overflow-hidden","sizeSlug":"large","metadata":{"role":"content","name":"story-chapter.media"}} -->
<?php /* ds-keep: rounded-lg reads --wp--custom--radius--lg, which reads --ds-card-radius in theme.json */ ?><figure class="wp-block-image size-large acm-story-chapter__media rounded-lg overflow-hidden"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'A graphite field lit from the lower left', 'tracy-base' ); ?>"/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
