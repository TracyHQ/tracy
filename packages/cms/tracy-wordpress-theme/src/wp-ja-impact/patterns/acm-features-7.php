<?php
/**
 * Title: Features video
 * Slug: wp-ja-impact/acm-features-7
 * Description: A half-width video picture with a pulsing play button that opens the video in a dialog, beside a panel with a headline, a lead, the newsletter form and the follow-us links (Joomla ACM `features` style-7 of JA Impact).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: features, video, play, newsletter, follow, acm
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm acm-features style-7","metadata":{"name":"features.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm acm-features style-7">
<!-- wp:group {"className":"feature-item align-left","metadata":{"name":"features.item"},"layout":{"type":"default"}} -->
<div class="wp-block-group feature-item align-left">
<!-- wp:group {"className":"feature-image","layout":{"type":"default"}} -->
<div class="wp-block-group feature-image">
<!-- wp:group {"className":"video-intro","layout":{"type":"default"}} -->
<div class="wp-block-group video-intro">
<!-- wp:image {"sizeSlug":"full","className":"video-bg","metadata":{"role":"content","name":"features.ft-video"}} -->
<figure class="wp-block-image size-full video-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"video-play","layout":{"type":"default"}} -->
<div class="wp-block-group video-play">
<!-- wp:group {"className":"video-main","layout":{"type":"default"}} -->
<div class="wp-block-group video-main">
<!-- wp:group {"className":"waves-block","layout":{"type":"default"}} -->
<div class="wp-block-group waves-block">
<!-- wp:group {"className":"waves wave-1","layout":{"type":"default"}} -->
<div class="wp-block-group waves wave-1"></div>
<!-- /wp:group -->
<!-- wp:group {"className":"waves wave-2","layout":{"type":"default"}} -->
<div class="wp-block-group waves wave-2"></div>
<!-- /wp:group -->
<!-- wp:group {"className":"waves wave-3","layout":{"type":"default"}} -->
<div class="wp-block-group waves wave-3"></div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"video-btn-wrap","layout":{"type":"flex"}} -->
<div class="wp-block-buttons video-btn-wrap">
<!-- wp:button {"className":"video-btn","metadata":{"role":"content","name":"features.video-url"}} -->
<div class="wp-block-button video-btn"><a class="wp-block-button__link wp-element-button" href="https://www.youtube.com/watch?v=" target="_blank" rel="noopener"><?php esc_html_e( 'Play video', 'wp-ja-impact' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"feature-info","metadata":{"name":"features.panel"},"layout":{"type":"default"}} -->
<div class="wp-block-group feature-info">
<!-- wp:group {"className":"feature-content","layout":{"type":"default"}} -->
<div class="wp-block-group feature-content">
<!-- wp:heading {"level":2,"className":"section-title","metadata":{"role":"content","name":"features.feature-title"}} -->
<h2 class="wp-block-heading section-title"><?php esc_html_e( 'A section headline', 'wp-ja-impact' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"mod-desc lead","metadata":{"role":"content","name":"features.feature-desc"}} -->
<p class="mod-desc lead"><?php esc_html_e( 'A lead of two or three lines.', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acymailing","metadata":{"name":"features.newsletter"},"layout":{"type":"default"}} -->
<div class="wp-block-group acymailing">
<!-- wp:shortcode -->
[contact-form-7 title="Newsletter"]
<!-- /wp:shortcode -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"social","metadata":{"name":"features.follow"},"layout":{"type":"default"}} -->
<div class="wp-block-group social">
<!-- wp:heading {"level":4,"className":"title","metadata":{"role":"content","name":"features.follow-title"}} -->
<h4 class="wp-block-heading title"><?php esc_html_e( 'Follow us', 'wp-ja-impact' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:social-links {"className":"jim-follow is-style-logos-only","metadata":{"role":"content","name":"features.follow-links"}} -->
<ul class="wp-block-social-links jim-follow is-style-logos-only"><!-- wp:social-link {"url":"#","service":"facebook","label":"Facebook"} /-->
<!-- wp:social-link {"url":"#","service":"twitter","label":"Twitter"} /-->
<!-- wp:social-link {"url":"#","service":"tiktok","label":"TikTok"} /-->
<!-- wp:social-link {"url":"#","service":"pinterest","label":"Pinterest"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
