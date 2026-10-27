<?php
/**
 * Title: KineticQL split
 * Slug: wp-ja-kinetic/section-kineticql-split
 * Description: Two-column split: eyebrow, heading, intro, a tick list and a button on the left; a framed code-panel image on the right, one per art direction, revealed by CSS. Every spec section of type `kineticql-split`.
 * Categories: wp-ja-kinetic, tracy
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: split, two column, code panel, checklist, query
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"className":"ja-acm acm-kineticql-split style-1"} -->
<div class="wp-block-group ja-acm acm-kineticql-split style-1">
<!-- wp:group {"tagName":"section","className":"hx-section hx-split-section"} -->
<section class="wp-block-group hx-section hx-split-section">
<!-- wp:group {"className":"hx-container"} -->
<div class="wp-block-group hx-container">
<!-- wp:group {"className":"hx-split"} -->
<div class="wp-block-group hx-split">
<!-- wp:group {"className":"acm-split-copy"} -->
<div class="wp-block-group acm-split-copy">
<!-- wp:paragraph {"className":"acm-split-eyebrow","metadata":{"role":"content","name":"kineticql-split.eyebrow"}} -->
<p class="acm-split-eyebrow"><?php esc_html_e( '// query, don\'t click', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"acm-split-title","metadata":{"role":"content","name":"kineticql-split.title"}} -->
<h2 class="wp-block-heading acm-split-title"><?php esc_html_e( 'Ask your telemetry anything', 'wp-ja-kinetic' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"acm-split-sub","metadata":{"role":"content","name":"kineticql-split.sub"}} -->
<p class="acm-split-sub"><?php esc_html_e( 'KineticQL turns dashboards into a query language. No more clicking through twelve panels to answer one question.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:list {"className":"acm-split-checks"} -->
<ul class="wp-block-list acm-split-checks">
<!-- wp:list-item {"className":"acm-kineticql-bullet","metadata":{"role":"content","name":"kineticql-split.bullet-text.1"}} -->
<li class="acm-kineticql-bullet"><?php esc_html_e( 'Join logs to traces in one expression', 'wp-ja-kinetic' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item {"className":"acm-kineticql-bullet","metadata":{"role":"content","name":"kineticql-split.bullet-text.2"}} -->
<li class="acm-kineticql-bullet"><?php esc_html_e( 'Save and share queries as alerts', 'wp-ja-kinetic' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item {"className":"acm-kineticql-bullet","metadata":{"role":"content","name":"kineticql-split.bullet-text.3"}} -->
<li class="acm-kineticql-bullet"><?php esc_html_e( 'Sub-second over 13 months of data', 'wp-ja-kinetic' ); ?></li>
<!-- /wp:list-item -->
<!-- wp:list-item {"className":"acm-kineticql-bullet","metadata":{"role":"content","name":"kineticql-split.bullet-text.4"}} -->
<li class="acm-kineticql-bullet"><?php esc_html_e( 'Versioned, reviewable, in git', 'wp-ja-kinetic' ); ?></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button {"className":"acm-split-cta","metadata":{"role":"content","name":"kineticql-split.cta_label"}} -->
<div class="wp-block-button acm-split-cta"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( '/pages/kineticql' ); ?>"><?php esc_html_e( 'Read the KineticQL docs', 'wp-ja-kinetic' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-split-panelcol"} -->
<div class="wp-block-group acm-split-panelcol">
<!-- wp:image {"className":"hx-panelimg is-terminal","sizeSlug":"large","metadata":{"role":"content","name":"kineticql-split.image_terminal"}} -->
<figure class="wp-block-image size-large hx-panelimg is-terminal"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/kineticql-code-panel-terminal.webp' ) ); ?>" alt="<?php esc_attr_e( 'Ask your telemetry anything', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:image {"className":"hx-panelimg is-blueprint","sizeSlug":"large","metadata":{"role":"content","name":"kineticql-split.image_blueprint"}} -->
<figure class="wp-block-image size-large hx-panelimg is-blueprint"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/kineticql-code-panel-blueprint.webp' ) ); ?>" alt="<?php esc_attr_e( 'Ask your telemetry anything', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
<!-- wp:image {"className":"hx-panelimg is-signal","sizeSlug":"large","metadata":{"role":"content","name":"kineticql-split.image_signal"}} -->
<figure class="wp-block-image size-large hx-panelimg is-signal"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/kineticql-code-panel-signal.webp' ) ); ?>" alt="<?php esc_attr_e( 'Ask your telemetry anything', 'wp-ja-kinetic' ); ?>"/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
