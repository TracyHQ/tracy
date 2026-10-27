<?php
/**
 * Title: Editor's choice
 * Slug: wp-ja-essence/editors-choice
 * Description: Three posts as a small picture, title and date, under the lead slider.
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: choice, trending
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:query {"queryId":3,"query":{"perPage":3,"pages":1,"offset":3,"postType":"post","order":"desc","orderBy":"date","inherit":false,"sticky":"ignore"},"className":"je-choice","metadata":{"name":"choice.query"}} -->
<div class="wp-block-query je-choice">
<!-- wp:post-template {"className":"je-choice__items","layout":{"type":"grid","columnCount":3}} -->
<!-- wp:group {"className":"je-mini","layout":{"type":"default"}} -->
<div class="wp-block-group je-mini">
<!-- wp:post-featured-image {"isLink":true,"className":"je-mini__img"} /-->
<!-- wp:group {"className":"je-mini__body","layout":{"type":"default"}} -->
<div class="wp-block-group je-mini__body">
<!-- wp:post-title {"level":4,"isLink":true,"className":"je-mini__title"} /-->
<!-- wp:post-date {"className":"je-meta__date"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
