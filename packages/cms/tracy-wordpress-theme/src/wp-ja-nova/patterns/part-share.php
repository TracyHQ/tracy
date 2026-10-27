<?php
/**
 * Title: Share this story
 * Slug: wp-ja-nova/part-share
 * Description: The share box of a blog post (parts/share.html): its heading and the Facebook, X and Reddit links. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-nova
 * Inserter: no
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"className":"jn-share","layout":{"type":"default"}} -->
<div class="wp-block-group jn-share">
<!-- wp:heading {"level":5,"className":"jn-share__title"} -->
<h5 class="wp-block-heading jn-share__title"><?php echo esc_html__( 'Share this story', 'wp-ja-nova' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:social-links {"className":"jn-share__links is-style-logos-only","layout":{"type":"flex","orientation":"vertical"}} -->
<ul class="wp-block-social-links is-style-logos-only jn-share__links"><!-- wp:social-link {"url":"https://www.facebook.com/sharer/sharer.php","service":"facebook","label":"Facebook"} /-->
<!-- wp:social-link {"url":"https://x.com/intent/post","service":"x","label":"X"} /-->
<!-- wp:social-link {"url":"https://www.reddit.com/submit","service":"reddit","label":"Reddit"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
