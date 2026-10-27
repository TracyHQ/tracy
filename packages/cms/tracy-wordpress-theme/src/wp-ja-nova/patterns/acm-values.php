<?php
/**
 * Title: Values
 * Slug: wp-ja-nova/section-values
 * Description: A heading with a coloured word beside a paragraph, then numbered values in a row, each number in its own colour (Joomla ACM features-intro style-4). A number's colour is its cta-<colour> class.
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: values, numbered, about, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-values","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-values">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-values__top","layout":{"type":"default"}} -->
<div class="wp-block-group jn-values__top">
<!-- wp:heading {"className":"jn-values__title","metadata":{"role":"content","name":"features-intro.ft-title"}} -->
<h2 class="wp-block-heading jn-values__title"><?php esc_html_e( 'Our values are part of everything we create', 'wp-ja-nova' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-values__lead","metadata":{"role":"content","name":"features-intro.content-featured"}} -->
<p class="jn-values__lead"><?php esc_html_e( 'A paragraph about what the company believes.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-values__grid acm-features-intro--cols-4","metadata":{"name":"features-intro.grid"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-values__grid acm-features-intro--cols-4">
<!-- wp:group {"className":"jn-value","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-value">
<!-- wp:paragraph {"className":"jn-value__number cta-green","metadata":{"role":"content","name":"features-intro.number.1"}} -->
<p class="jn-value__number cta-green">01</p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"jn-value__body","layout":{"type":"default"}} -->
<div class="wp-block-group jn-value__body">
<!-- wp:paragraph {"className":"jn-value__title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<p class="jn-value__title"><?php esc_html_e( 'A value', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jn-value__desc","metadata":{"role":"content","name":"features-intro.description.1"}} -->
<p class="jn-value__desc"><?php esc_html_e( 'One line about it.', 'wp-ja-nova' ); ?></p>
<!-- /wp:paragraph -->
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
