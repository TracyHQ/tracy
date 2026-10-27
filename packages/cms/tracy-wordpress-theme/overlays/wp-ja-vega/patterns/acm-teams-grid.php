<?php
/**
 * Title: Team grid
 * Slug: wp-ja-vega/section-teams-grid
 * Description: A section label and headline over a grid of people (Joomla ACM `teams` style-2): a portrait, a name and a position per card, four to a row on a wide screen.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: team, people, grid, leadership, acm
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-section jv-section--rule jv-teams-grid","metadata":{"name":"teams.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-section jv-section--rule jv-teams-grid">
<!-- wp:group {"className":"jv-container","layout":{"type":"default"}} -->
<div class="wp-block-group jv-container">
<!-- wp:group {"className":"jv-head","layout":{"type":"default"}} -->
<div class="wp-block-group jv-head">
<!-- wp:heading {"level":3,"className":"jv-pill tracy-motion-reveal","metadata":{"role":"content","name":"teams.section-title"}} -->
<h3 class="wp-block-heading jv-pill tracy-motion-reveal"><?php esc_html_e( 'Our team', 'wp-ja-vega' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-main-title tracy-motion-reveal tracy-motion-delay-1","metadata":{"role":"content","name":"teams.main-section"}} -->
<p class="jv-main-title tracy-motion-reveal tracy-motion-delay-1"><?php esc_html_e( 'Meet the leadership team', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-cards jv-stagger acm-teams--cols-4","metadata":{"name":"teams.grid"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-cards jv-stagger acm-teams--cols-4">
<!-- wp:group {"className":"jv-member tracy-motion-reveal","metadata":{"name":"teams.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-member tracy-motion-reveal">
<!-- wp:image {"sizeSlug":"full","className":"jv-member__photo","metadata":{"role":"content","name":"teams.img.1"}} -->
<figure class="wp-block-image size-full jv-member__photo"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":5,"className":"jv-member__name","metadata":{"role":"content","name":"teams.title.1"}} -->
<h5 class="wp-block-heading jv-member__name"><?php esc_html_e( 'Mat Zalman', 'wp-ja-vega' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-member__role","metadata":{"role":"content","name":"teams.team-position.1"}} -->
<p class="jv-member__role"><?php esc_html_e( 'CEO', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
