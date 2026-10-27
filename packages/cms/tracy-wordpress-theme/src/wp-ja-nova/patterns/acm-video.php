<?php
/**
 * Title: Video picture
 * Slug: wp-ja-nova/section-video
 * Description: A wide picture with a round play button in its centre that opens the video in a dialog (Joomla ACM features-intro style-5).
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: video, picture, play, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-video-intro","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-video-intro">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-video-intro__frame","layout":{"type":"default"}} -->
<div class="wp-block-group jn-video-intro__frame">
<!-- wp:image {"sizeSlug":"full","className":"jn-video-intro__picture","metadata":{"role":"content","name":"features-intro.image"}} -->
<figure class="wp-block-image size-full jn-video-intro__picture"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"jn-play","metadata":{"role":"content","name":"features-intro.video"}} -->
<p class="jn-play"><a class="jn-play__button" href="https://www.youtube.com/watch?v=LwfbKP0fRgg"><?php esc_html_e( 'Play the video', 'wp-ja-nova' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
