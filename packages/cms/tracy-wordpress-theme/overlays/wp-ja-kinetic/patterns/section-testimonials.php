<?php
/**
 * Title: Testimonials
 * Slug: wp-ja-kinetic/section-testimonials
 * Description: A banded quote wall: a featured pull-quote card on the left and a narrow column of smaller quote cards on the right, each with an author avatar, name and role. Every spec section of type `testimonials`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: testimonials, quotes, social proof, customers, reviews
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"section","className":"ja-acm acm-testimonials style-1"} -->
<section class="wp-block-group ja-acm acm-testimonials style-1">
<!-- wp:group {"className":"hx-section"} -->
<div class="wp-block-group hx-section">
<!-- wp:group {"className":"hx-container hx-pad"} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-testi-inner"} -->
<div class="wp-block-group hx-testi-inner">
<!-- wp:group {"className":"hx-testi-rule"} -->
<div class="wp-block-group hx-testi-rule"></div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-testi-head"} -->
<div class="wp-block-group hx-testi-head">
<!-- wp:paragraph {"className":"hx-eyebrow","metadata":{"role":"content","name":"testimonials.eyebrow"}} -->
<p class="hx-eyebrow"><?php esc_html_e( '(04) / FROM THE ON-CALL', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"hx-h2","metadata":{"role":"content","name":"testimonials.title"}} -->
<h2 class="wp-block-heading hx-h2"><?php esc_html_e( 'Loved by engineers who carry the pager', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-testi-sub","metadata":{"role":"content","name":"testimonials.sub"}} -->
<p class="hx-testi-sub"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-testi-row"} -->
<div class="wp-block-group hx-testi-row">
<!-- wp:group {"className":"hx-card hx-testi-hero","metadata":{"name":"testimonials.item.1"}} -->
<div class="wp-block-group hx-card hx-testi-hero">
<!-- wp:paragraph {"className":"hx-testi-q","metadata":{"role":"content","name":"testimonials.quote.1"}} -->
<p class="hx-testi-q"><?php esc_html_e( 'We cut mean-time-to-resolution from 40 minutes to under 6. Kinetic is the first tab open during an incident.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-testi-author hx-testi-author--lg"} -->
<div class="wp-block-group hx-testi-author hx-testi-author--lg">
<!-- wp:image {"className":"hx-testi-avatar","metadata":{"role":"content","name":"testimonials.avatar.1"}} -->
<figure class="wp-block-image hx-testi-avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Priya Raman', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hx-testi-id"} -->
<div class="wp-block-group hx-testi-id">
<!-- wp:paragraph {"className":"hx-testi-name","metadata":{"role":"content","name":"testimonials.name.1"}} -->
<p class="hx-testi-name"><?php esc_html_e( 'Priya Raman', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-testi-meta","metadata":{"role":"content","name":"testimonials.role.1"}} -->
<p class="hx-testi-meta"><?php esc_html_e( 'Staff SRE, Northwind', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card hx-testi-small","metadata":{"name":"testimonials.item.2"}} -->
<div class="wp-block-group hx-card hx-testi-small">
<!-- wp:paragraph {"className":"hx-testi-q","metadata":{"role":"content","name":"testimonials.quote.2"}} -->
<p class="hx-testi-q"><?php esc_html_e( '"One query language for everything killed three separate dashboards. Onboarding new on-call took an afternoon."', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-testi-author hx-testi-author--sm"} -->
<div class="wp-block-group hx-testi-author hx-testi-author--sm">
<!-- wp:image {"className":"hx-testi-avatar","metadata":{"role":"content","name":"testimonials.avatar.2"}} -->
<figure class="wp-block-image hx-testi-avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Marcus Lee', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hx-testi-id"} -->
<div class="wp-block-group hx-testi-id">
<!-- wp:paragraph {"className":"hx-testi-name","metadata":{"role":"content","name":"testimonials.name.2"}} -->
<p class="hx-testi-name"><?php esc_html_e( 'Marcus Lee', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-testi-meta","metadata":{"role":"content","name":"testimonials.role.2"}} -->
<p class="hx-testi-meta"><?php esc_html_e( 'Eng Lead, Quanta', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-card hx-testi-small","metadata":{"name":"testimonials.item.3"}} -->
<div class="wp-block-group hx-card hx-testi-small">
<!-- wp:paragraph {"className":"hx-testi-q","metadata":{"role":"content","name":"testimonials.quote.3"}} -->
<p class="hx-testi-q"><?php esc_html_e( '"The bill dropped 60% after we moved off our legacy APM, and queries got faster. Rare to get both."', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"hx-testi-author hx-testi-author--sm"} -->
<div class="wp-block-group hx-testi-author hx-testi-author--sm">
<!-- wp:image {"className":"hx-testi-avatar","metadata":{"role":"content","name":"testimonials.avatar.3"}} -->
<figure class="wp-block-image hx-testi-avatar"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt="<?php esc_attr_e( 'Sofia Alvarez', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"hx-testi-id"} -->
<div class="wp-block-group hx-testi-id">
<!-- wp:paragraph {"className":"hx-testi-name","metadata":{"role":"content","name":"testimonials.name.3"}} -->
<p class="hx-testi-name"><?php esc_html_e( 'Sofia Alvarez', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"hx-testi-meta","metadata":{"role":"content","name":"testimonials.role.3"}} -->
<p class="hx-testi-meta"><?php esc_html_e( 'Platform Eng, Orbital', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
