<?php
/**
 * Title: Template body: index
 * Slug: wp-ja-kinetic/template-index
 * Description: The body of templates/index.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"main","className":"hx-content","layout":{"type":"default"}} -->
<main class="wp-block-group hx-content">
<!-- wp:group {"tagName":"header","className":"hx-blogmast hx-grid-bg","layout":{"type":"default"}} -->
<header class="wp-block-group hx-blogmast hx-grid-bg">
<!-- wp:group {"className":"hx-container hx-pad","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:paragraph {"className":"hx-eyebrow"} -->
<p class="hx-eyebrow"><?php echo esc_html__( 'Blog', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1,"className":"hx-h1 hx-blogmast__title"} -->
<h1 class="wp-block-heading hx-h1 hx-blogmast__title"><?php echo esc_html__( 'Blog', 'wp-ja-kinetic' ); ?></h1>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
</header>
<!-- /wp:group -->
<!-- wp:group {"tagName":"section","className":"hx-section hx-blog-section","layout":{"type":"default"}} -->
<section class="wp-block-group hx-section hx-blog-section">
<!-- wp:group {"className":"hx-container hx-pad","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-blog hx-blog--norail","layout":{"type":"default"}} -->
<div class="wp-block-group hx-blog hx-blog--norail">
<!-- wp:query {"queryId":1,"query":{"perPage":10,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"hx-bloglist","layout":{"type":"default"}} -->
<div class="wp-block-query hx-bloglist">
<!-- wp:post-template {"layout":{"type":"default"}} -->
<!-- wp:group {"className":"hx-blogrow","layout":{"type":"default"}} -->
<div class="wp-block-group hx-blogrow">
<!-- wp:group {"className":"hx-blogdate","layout":{"type":"default"}} -->
<div class="wp-block-group hx-blogdate">
<!-- wp:post-date {"format":"d","className":"hx-blogdate__d"} /-->
<!-- wp:post-date {"format":"M","className":"hx-blogdate__m"} /-->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-blogmain","layout":{"type":"default"}} -->
<div class="wp-block-group hx-blogmain">
<!-- wp:wp-ja-kinetic/post-topic-eyebrow /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"hx-blogtitle"} /-->
<!-- wp:post-excerpt {"className":"hx-blogexcerpt"} /-->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"hx-blogmeta","layout":{"type":"default"}} -->
<div class="wp-block-group hx-blogmeta">
<!-- wp:post-author-name {"className":"hx-blogauthor"} /-->
<!-- wp:post-date {"className":"hx-blogdatetxt"} /-->
<!-- wp:wp-ja-kinetic/post-readtime /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"hx-muted hx-blog-empty"} -->
<p class="hx-muted hx-blog-empty"><?php echo esc_html__( 'No articles found.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
<!-- wp:group {"className":"hx-blog-pagination pagination-wrap","layout":{"type":"flex"}} -->
<div class="wp-block-group hx-blog-pagination pagination-wrap">
<!-- wp:wp-ja-kinetic/kinetic-pagination /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
</main>
<!-- /wp:group -->
