<?php
/**
 * Title: Newsletter
 * Slug: wp-ja-essence/section-newsletter
 * Description: A blue sidebar card: a title, a line about the subscribers and the Newsletter form (email, Sign up, Terms box). The source draws an AcyMailing form; WordPress has no mailing list here, so the form is a Contact Form 7 form that mails the sign-up request to the site owner (DECISIONS D-10, D-81).
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: newsletter, subscribe
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:group {"className":"je-sec je-side je-side--news","layout":{"type":"default"}} -->
<div class="wp-block-group je-sec je-side je-side--news">
<!-- wp:heading {"level":2,"className":"je-sec__title","metadata":{"role":"content","name":"newsletter.title"}} -->
<h2 class="wp-block-heading je-sec__title"><?php echo esc_html__( 'Newsletter', 'wp-ja-essence' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"je-side__intro","metadata":{"role":"content","name":"newsletter.introtext"}} -->
<p class="je-side__intro"><?php echo esc_html__( 'Join 70,000 subscribers!', 'wp-ja-essence' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:shortcode -->
[contact-form-7 title="Newsletter" html_class="je-nl"]
<!-- /wp:shortcode -->
</div>
<!-- /wp:group -->
