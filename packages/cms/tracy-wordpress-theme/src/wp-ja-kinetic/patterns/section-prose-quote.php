<?php
/**
 * Title: Prose with pull quote
 * Slug: wp-ja-kinetic/section-prose-quote
 * Description: A measure-constrained prose column under a ruled header (section number, title and a meta stamp), closing with a pulled blockquote. Every spec section of type `prose-quote`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: prose, story, essay, quote, blockquote, about
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"section","className":"ja-acm acm-prose-quote style-1"} -->
<section class="wp-block-group ja-acm acm-prose-quote style-1">
<!-- wp:group {"className":"hx-section"} -->
<div class="wp-block-group hx-section">
<!-- wp:group {"className":"hx-container hx-pad"} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-prose-col"} -->
<div class="wp-block-group hx-prose-col">
<!-- wp:group {"className":"hx-prose-ruled"} -->
<div class="wp-block-group hx-prose-ruled">
<!-- wp:group {"className":"hx-prose-rule"} -->
<div class="wp-block-group hx-prose-rule"></div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-prose-rrow"} -->
<div class="wp-block-group hx-prose-rrow">
<!-- wp:group {"className":"hx-prose-rl"} -->
<div class="wp-block-group hx-prose-rl">
<!-- wp:paragraph {"className":"hx-prose-num","metadata":{"role":"content","name":"prose-quote.number"}} -->
<p class="hx-prose-num"><?php esc_html_e( '(01)', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"hx-prose-title","metadata":{"role":"content","name":"prose-quote.title"}} -->
<h2 class="wp-block-heading hx-prose-title"><?php esc_html_e( 'Our story', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-prose-meta","metadata":{"role":"content","name":"prose-quote.meta"}} -->
<p class="hx-prose-meta"><?php esc_html_e( 'EST. 2022', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-prose-body"} -->
<div class="wp-block-group hx-prose-body">
<!-- wp:paragraph {"className":"acm-prose-quote-body","metadata":{"role":"content","name":"prose-quote.body.1"}} -->
<p class="acm-prose-quote-body"><?php esc_html_e( 'Kinetic started at 3 a.m. during an incident nobody could explain. Three dashboards, two log tools and a tracing system that never agreed — and a checkout outage burning revenue by the minute.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"acm-prose-quote-body","metadata":{"role":"content","name":"prose-quote.body.2"}} -->
<p class="acm-prose-quote-body"><?php esc_html_e( 'We were tired of stitching context together by hand while customers waited. So we built the tool we wished we’d had: one pipeline where logs, metrics and traces share a schema, a timeline and a query language.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:quote {"className":"hx-prose-quote"} -->
<blockquote class="wp-block-quote hx-prose-quote">
<!-- wp:paragraph {"className":"acm-prose-quote-text","metadata":{"role":"content","name":"prose-quote.quote"}} -->
<p class="acm-prose-quote-text"><?php esc_html_e( 'Observability shouldn’t require a second mortgage or a PhD. It should just answer the question.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
</blockquote>
<!-- /wp:quote -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
