<?php
/**
 * Title: Service cards
 * Slug: wp-ja-vega/section-features
 * Description: A section label and headline over a grid of cards (Joomla ACM `features-intro` style-1): an icon, a title, a description and a "Learn more" link per card, each card entering after the one before.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: features, services, cards, grid, what we do, acm
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-section jv-features","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-section jv-features">
<!-- wp:group {"className":"jv-container","layout":{"type":"default"}} -->
<div class="wp-block-group jv-container">
<!-- wp:group {"className":"jv-head","layout":{"type":"default"}} -->
<div class="wp-block-group jv-head">
<!-- wp:heading {"level":3,"className":"jv-pill tracy-motion-reveal","metadata":{"role":"content","name":"features-intro.section-title"}} -->
<h3 class="wp-block-heading jv-pill tracy-motion-reveal"><?php esc_html_e( 'What we do', 'wp-ja-vega' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-main-title tracy-motion-reveal tracy-motion-delay-1","metadata":{"role":"content","name":"features-intro.main-section"}} -->
<p class="jv-main-title tracy-motion-reveal tracy-motion-delay-1"><?php esc_html_e( 'Simplifying IT for a complex world.', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-cards jv-stagger acm-features-intro--cols-3","metadata":{"name":"features-intro.grid"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-cards jv-stagger acm-features-intro--cols-3">
<!-- wp:group {"className":"jv-card tracy-motion-reveal","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-card tracy-motion-reveal">
<!-- wp:image {"sizeSlug":"full","className":"jv-card__icon","metadata":{"role":"content","name":"features-intro.img-icon.1"}} -->
<figure class="wp-block-image size-full jv-card__icon"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":4,"className":"jv-card__title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h4 class="wp-block-heading jv-card__title"><?php esc_html_e( 'IT consultancy', 'wp-ja-vega' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-card__desc","metadata":{"role":"content","name":"features-intro.description.1"}} -->
<p class="jv-card__desc"><?php esc_html_e( 'Two or three lines about the service.', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jv-card__link","metadata":{"role":"content","name":"features-intro.link-title.1"}} -->
<p class="jv-card__link"><a href="#"><?php esc_html_e( 'Learn more', 'wp-ja-vega' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
