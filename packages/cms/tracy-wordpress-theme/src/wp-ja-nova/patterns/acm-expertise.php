<?php
/**
 * Title: Expertise
 * Slug: wp-ja-nova/section-expertise
 * Description: A section title, then boxes of expertise in a staggered grid, each with a coloured dot, a small label, a title, a line and a list (Joomla ACM features-intro style-6). A box's width is its acm-features-intro--cols-<n> class (of 12), its dot colour its cta-<colour> class.
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: expertise, skills, list, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-expertise","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-expertise">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-sec__head","layout":{"type":"default"}} -->
<div class="wp-block-group jn-sec__head">
<!-- wp:heading {"className":"jn-sec__title","metadata":{"role":"content","name":"features-intro.main-section"}} -->
<h2 class="wp-block-heading jn-sec__title"><?php esc_html_e( 'A section title', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-expertise__grid","layout":{"type":"default"}} -->
<div class="wp-block-group jn-expertise__grid">
<!-- wp:group {"className":"jn-expertise__item acm-features-intro--cols-5","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-expertise__item acm-features-intro--cols-5">
<!-- wp:group {"className":"jn-expertise__box","layout":{"type":"default"}} -->
<div class="wp-block-group jn-expertise__box">
<!-- wp:paragraph {"className":"jn-expertise__label cta-purple","metadata":{"role":"content","name":"features-intro.sub-title.1"}} -->
<p class="jn-expertise__label cta-purple"><?php esc_html_e( 'Team', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"jn-expertise__title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h3 class="wp-block-heading jn-expertise__title"><?php esc_html_e( 'An expertise', 'wp-ja-nova' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-expertise__desc","metadata":{"role":"content","name":"features-intro.description.1"}} -->
<p class="jn-expertise__desc"><?php esc_html_e( 'One line about it.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:list {"className":"jn-expertise__list","metadata":{"role":"content","name":"features-intro.list-features.1"}} -->
<ul class="wp-block-list jn-expertise__list"><!-- wp:list-item -->
<li><?php esc_html_e( 'A skill', 'wp-ja-nova' ); ?></li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->
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
