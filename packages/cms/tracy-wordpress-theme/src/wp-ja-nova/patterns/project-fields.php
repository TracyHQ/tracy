<?php
/**
 * Title: Project fields
 * Slug: wp-ja-nova/project-fields
 * Description: The fields row of a project post (templates/single-project.html): client, services, date and the live link, each read from the post's own fields. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-nova
 * Inserter: no
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"className":"jn-project__fields","layout":{"type":"default"}} -->
<div class="wp-block-group jn-project__fields">
<!-- wp:group {"className":"jn-project__field","layout":{"type":"default"}} -->
<div class="wp-block-group jn-project__field">
<!-- wp:heading {"level":5,"className":"jn-project__label"} -->
<h5 class="wp-block-heading jn-project__label"><?php echo esc_html__( 'Client', 'wp-ja-nova' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-project__value","metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"prj-client"}}}}} -->
<p class="jn-project__value"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-project__field","layout":{"type":"default"}} -->
<div class="wp-block-group jn-project__field">
<!-- wp:heading {"level":5,"className":"jn-project__label"} -->
<h5 class="wp-block-heading jn-project__label"><?php echo esc_html__( 'Services', 'wp-ja-nova' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-project__value","metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"prj-services"}}}}} -->
<p class="jn-project__value"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-project__field","layout":{"type":"default"}} -->
<div class="wp-block-group jn-project__field">
<!-- wp:heading {"level":5,"className":"jn-project__label"} -->
<h5 class="wp-block-heading jn-project__label"><?php echo esc_html__( 'Date', 'wp-ja-nova' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jn-project__value","metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"prj-date"}}}}} -->
<p class="jn-project__value"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jn-project__field","layout":{"type":"default"}} -->
<div class="wp-block-group jn-project__field">
<!-- wp:heading {"level":5,"className":"jn-project__label"} -->
<h5 class="wp-block-heading jn-project__label"><?php echo esc_html__( 'Completed', 'wp-ja-nova' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:buttons {"className":"jn-project__action"} -->
<div class="wp-block-buttons jn-project__action"><!-- wp:button {"className":"tracy-btn tracy-btn--primary","metadata":{"bindings":{"url":{"source":"core/post-meta","args":{"key":"prj-completed"}}}}} -->
<div class="wp-block-button tracy-btn tracy-btn--primary"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php echo esc_html__( 'See live', 'wp-ja-nova' ); ?></a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
