<?php
/**
 * Title: Testimonials with figures
 * Slug: wp-ja-vega/section-testimonials
 * Description: A section label and headline over quote cards (Joomla ACM `testimonials` style-1): the quote, the author's picture, name and position, and a figure with its caption under a rule; an optional rating-strip picture and button under the cards.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: testimonials, quotes, reviews, customers, acm
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-section jv-testimonials","metadata":{"name":"testimonials.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-section jv-testimonials">
<!-- wp:image {"sizeSlug":"full","className":"jv-bg jv-bg--wave","metadata":{"role":"content","name":"testimonials.section-bg"}} -->
<figure class="wp-block-image size-full jv-bg jv-bg--wave"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jv-container","layout":{"type":"default"}} -->
<div class="wp-block-group jv-container">
<!-- wp:group {"className":"jv-head","layout":{"type":"default"}} -->
<div class="wp-block-group jv-head">
<!-- wp:heading {"level":3,"className":"jv-pill tracy-motion-reveal","metadata":{"role":"content","name":"testimonials.section-title"}} -->
<h3 class="wp-block-heading jv-pill tracy-motion-reveal"><?php esc_html_e( 'Testimonials', 'wp-ja-vega' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-main-title tracy-motion-reveal tracy-motion-delay-1","metadata":{"role":"content","name":"testimonials.main-section"}} -->
<p class="jv-main-title tracy-motion-reveal tracy-motion-delay-1"><?php esc_html_e( 'Real customer experiences', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-cards jv-stagger acm-testimonials--cols-3","metadata":{"name":"testimonials.grid"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-cards jv-stagger acm-testimonials--cols-3">
<!-- wp:group {"className":"jv-quote tracy-motion-reveal","metadata":{"name":"testimonials.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-quote tracy-motion-reveal">
<!-- wp:paragraph {"className":"jv-lead jv-quote__text","metadata":{"role":"content","name":"testimonials.description.1"}} -->
<p class="jv-lead jv-quote__text"><?php esc_html_e( 'A short quote from a customer.', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"jv-quote__author","layout":{"type":"default"}} -->
<div class="wp-block-group jv-quote__author">
<!-- wp:image {"sizeSlug":"full","className":"jv-quote__avatar","metadata":{"role":"content","name":"testimonials.avatar.1"}} -->
<figure class="wp-block-image size-full jv-quote__avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"jv-quote__who","layout":{"type":"default"}} -->
<div class="wp-block-group jv-quote__who">
<!-- wp:heading {"level":5,"className":"jv-quote__name","metadata":{"role":"content","name":"testimonials.author-name.1"}} -->
<h5 class="wp-block-heading jv-quote__name"><?php esc_html_e( 'Customer name', 'wp-ja-vega' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-quote__role","metadata":{"role":"content","name":"testimonials.author-position.1"}} -->
<p class="jv-quote__role"><?php esc_html_e( 'Position', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-quote__figure","layout":{"type":"default"}} -->
<div class="wp-block-group jv-quote__figure">
<!-- wp:paragraph {"className":"jv-quote__number","metadata":{"role":"content","name":"testimonials.statics-number.1"}} -->
<p class="jv-quote__number"><?php esc_html_e( '100%', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jv-quote__caption","metadata":{"role":"content","name":"testimonials.statics-desc.1"}} -->
<p class="jv-quote__caption"><?php esc_html_e( 'Client satisfaction rate', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:image {"sizeSlug":"full","className":"jv-vote-brand tracy-motion-reveal","metadata":{"role":"content","name":"testimonials.vote-brand"}} -->
<figure class="wp-block-image size-full jv-vote-brand tracy-motion-reveal"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:buttons {"className":"jv-actions jv-actions--center"} -->
<div class="wp-block-buttons jv-actions jv-actions--center">
<!-- wp:button {"className":"jv-btn jv-btn--primary jv-btn--arrow tracy-motion-reveal","metadata":{"role":"content","name":"testimonials.title-btn"}} -->
<div class="wp-block-button jv-btn jv-btn--primary jv-btn--arrow tracy-motion-reveal"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Read all testimonials', 'wp-ja-vega' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
