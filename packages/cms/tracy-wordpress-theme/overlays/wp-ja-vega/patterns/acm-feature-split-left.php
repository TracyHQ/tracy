<?php
/**
 * Title: Feature with picture on the left
 * Slug: wp-ja-vega/section-feature-split-left
 * Description: A picture beside a block of copy (Joomla ACM `features-intro` style-2, `align-media` left): an eyebrow, a heading, a lead, a two-column list of points — each an icon or a figure, a title and an optional line — and a button. The picture and the copy enter from opposite sides.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: feature, split, media, picture, list, acm
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-section jv-split jv-split--media-left","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-section jv-split jv-split--media-left">
<!-- wp:group {"className":"jv-container","layout":{"type":"default"}} -->
<div class="wp-block-group jv-container">
<!-- wp:group {"className":"jv-head","layout":{"type":"default"}} -->
<div class="wp-block-group jv-head">
<!-- wp:heading {"level":3,"className":"jv-pill tracy-motion-reveal","metadata":{"role":"content","name":"features-intro.section-title"}} -->
<h3 class="wp-block-heading jv-pill tracy-motion-reveal"><?php esc_html_e( 'What we use', 'wp-ja-vega' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-main-title tracy-motion-reveal tracy-motion-delay-1","metadata":{"role":"content","name":"features-intro.main-section"}} -->
<p class="jv-main-title tracy-motion-reveal tracy-motion-delay-1"><?php esc_html_e( 'Strategic technology partnerships', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-split__row","layout":{"type":"default"}} -->
<div class="wp-block-group jv-split__row">
<!-- wp:image {"sizeSlug":"full","className":"jv-split__media tracy-motion-reveal tracy-motion-reveal--fade-right","metadata":{"role":"content","name":"features-intro.intro-img"}} -->
<figure class="wp-block-image size-full jv-split__media tracy-motion-reveal tracy-motion-reveal--fade-right"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jv-split__copy tracy-motion-reveal tracy-motion-reveal--fade-left","layout":{"type":"default"}} -->
<div class="wp-block-group jv-split__copy tracy-motion-reveal tracy-motion-reveal--fade-left">
<!-- wp:paragraph {"className":"jv-eyebrow","metadata":{"role":"content","name":"features-intro.info-sub"}} -->
<p class="jv-eyebrow"><?php esc_html_e( 'Technology', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"jv-split__title","metadata":{"role":"content","name":"features-intro.info-title"}} -->
<h3 class="wp-block-heading jv-split__title"><?php esc_html_e( 'Cutting-edge technology', 'wp-ja-vega' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-lead","metadata":{"role":"content","name":"features-intro.info-desc"}} -->
<p class="jv-lead"><?php esc_html_e( 'Two lines about the approach.', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"jv-points","metadata":{"name":"features-intro.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-points">
<!-- wp:group {"className":"jv-point","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-point">
<!-- wp:image {"sizeSlug":"full","className":"jv-point__icon","metadata":{"role":"content","name":"features-intro.intro.1"}} -->
<figure class="wp-block-image size-full jv-point__icon"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"jv-point__figure","metadata":{"role":"content","name":"features-intro.intro-text.1"}} -->
<p class="jv-point__figure"><?php esc_html_e( '64+', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":5,"className":"jv-point__title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h5 class="wp-block-heading jv-point__title"><?php esc_html_e( 'High performance', 'wp-ja-vega' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-point__desc","metadata":{"role":"content","name":"features-intro.desc.1"}} -->
<p class="jv-point__desc"><?php esc_html_e( 'One line about the point.', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"jv-actions"} -->
<div class="wp-block-buttons jv-actions">
<!-- wp:button {"className":"jv-btn jv-btn--primary jv-btn--arrow","metadata":{"role":"content","name":"features-intro.button"}} -->
<div class="wp-block-button jv-btn jv-btn--primary jv-btn--arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Learn more', 'wp-ja-vega' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
