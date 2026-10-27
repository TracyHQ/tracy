<?php
/**
 * Title: Template body: category-field-notes-from-the-on-call
 * Slug: wp-ja-kinetic/template-category-field-notes-from-the-on-call
 * Description: The body of templates/category-field-notes-from-the-on-call.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
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
<!-- wp:query-title {"type":"archive","level":1,"className":"hx-h1 hx-blogmast__title","showPrefix":false} /-->
<!-- wp:term-description {"className":"hx-blogmast__desc"} /-->
</div>
<!-- /wp:group -->
</header>
<!-- /wp:group -->
<!-- wp:group {"tagName":"nav","className":"hx-blogtopics","layout":{"type":"default"}} -->
<nav class="wp-block-group hx-blogtopics" aria-label="Browse">
<!-- wp:group {"className":"hx-container hx-pad","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"tagName":"span","className":"hx-blogtopics__lbl","layout":{"type":"default"}} -->
<span class="wp-block-group hx-blogtopics__lbl"><?php echo esc_html__( 'Browse', 'wp-ja-kinetic' ); ?></span>
<!-- /wp:group -->
<!-- wp:list {"className":"hx-blogtopics__list"} -->
<ul class="wp-block-list hx-blogtopics__list">
<!-- wp:wp-ja-kinetic/blog-topics-items /-->
</ul>
<!-- /wp:list -->
</div>
<!-- /wp:group -->
</nav>
<!-- /wp:group -->
<!-- wp:wp-ja-kinetic/field-notes-featured /-->
<!-- wp:group {"tagName":"section","className":"hx-section hx-blog-section","layout":{"type":"default"}} -->
<section class="wp-block-group hx-section hx-blog-section">
<!-- wp:group {"className":"hx-container hx-pad","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container hx-pad">
<!-- wp:group {"className":"hx-blog","layout":{"type":"default"}} -->
<div class="wp-block-group hx-blog">
<!-- wp:wp-ja-kinetic/blog-rail /-->
<!-- wp:query {"queryId":1,"query":{"perPage":6,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"hx-bloglist","layout":{"type":"default"}} -->
<div class="wp-block-query hx-bloglist">
<!-- wp:wp-ja-kinetic/blog-ledger-header /-->
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
<!-- wp:block {"metadata":{"name":"cta.blog"}} /-->
</main>
<!-- /wp:group -->
